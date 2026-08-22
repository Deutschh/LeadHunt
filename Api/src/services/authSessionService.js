const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

class AuthSessionError extends Error {
  constructor(status, code, publicMessage, options = {}) {
    super(code);
    this.name = "AuthSessionError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
    this.clearRefreshCookie = options.clearRefreshCookie === true;
  }
}

function invalidCredentials() {
  return new AuthSessionError(
    401,
    "INVALID_CREDENTIALS",
    "E-mail ou senha inválidos.",
  );
}

function invalidSession() {
  return new AuthSessionError(
    401,
    "INVALID_SESSION",
    "Sessão inválida ou expirada.",
    { clearRefreshCookie: true },
  );
}

function stateConflict() {
  return new AuthSessionError(
    409,
    "AUTH_STATE_CONFLICT",
    "Não foi possível iniciar a sessão desta conta.",
  );
}

function createAuthSessionService({
  db,
  cryptoService,
  accessTokenService,
  config,
  logger = console,
  clock = () => new Date(),
}) {
  async function begin(client) {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
  }

  async function withTransaction(callback) {
    const client = await db.connect();
    try {
      await begin(client);
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (_rollbackError) {
        // Preserve the original failure without exposing database details.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function hasCoherentWorkspace(client, userId) {
    const result = await client.query(
      `/* auth-session:load-user-workspace */
       SELECT wm.workspace_id
       FROM public.workspace_members AS wm
       INNER JOIN public.workspaces AS w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       FOR SHARE OF wm, w`,
      [userId],
    );

    return result.rowCount === 1;
  }

  function buildNewRefreshSession(user, familyId = null, expiresAt = null) {
    const token = cryptoService.generateRefreshToken();
    const digest = cryptoService.createRefreshTokenDigest(token);
    const issuedAt = clock();
    const absoluteExpiry = expiresAt
      ? new Date(expiresAt)
      : new Date(
          issuedAt.getTime() + config.refreshTokenTtlSeconds * 1000,
        );

    return {
      token,
      digest,
      familyId: familyId || cryptoService.generateRefreshFamilyId(),
      expiresAt: absoluteExpiry,
      authVersion: user.auth_version,
    };
  }

  async function insertRefreshToken(client, userId, session) {
    const result = await client.query(
      `/* auth-session:insert-refresh-token */
       INSERT INTO public.refresh_tokens (
         user_id,
         token_digest,
         family_id,
         expires_at,
         auth_version_at_issue
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, expires_at`,
      [
        userId,
        session.digest,
        session.familyId,
        session.expiresAt,
        session.authVersion,
      ],
    );

    if (result.rowCount !== 1) {
      throw new Error("AUTH_REFRESH_INSERT_FAILED");
    }

    return result.rows[0];
  }

  async function login({ email, password }) {
    const lookup = await db.query(
      `/* auth-session:find-login-user */
       SELECT id, password_hash, email_verified_at
       FROM public.users
       WHERE LOWER(email) = $1`,
      [email],
    );
    const candidate = lookup.rowCount === 1 ? lookup.rows[0] : null;
    const passwordHash = candidate
      ? candidate.password_hash
      : cryptoService.dummyPasswordHash;

    let passwordMatches = false;
    try {
      passwordMatches = await cryptoService.verifyPassword(
        password,
        passwordHash,
      );
    } catch (_error) {
      if (candidate) {
        await cryptoService.verifyPassword(
          password,
          cryptoService.dummyPasswordHash,
        );
      }
      passwordMatches = false;
    }

    if (!candidate || !passwordMatches || !candidate.email_verified_at) {
      throw invalidCredentials();
    }

    return withTransaction(async (client) => {
      const locked = await client.query(
        `/* auth-session:lock-login-user */
         SELECT id, password_hash, email_verified_at, auth_version
         FROM public.users
         WHERE id = $1
         FOR UPDATE`,
        [candidate.id],
      );

      if (
        locked.rowCount !== 1 ||
        locked.rows[0].password_hash !== candidate.password_hash ||
        !locked.rows[0].email_verified_at
      ) {
        throw invalidCredentials();
      }

      const user = locked.rows[0];
      if (!(await hasCoherentWorkspace(client, user.id))) {
        throw stateConflict();
      }

      const refreshSession = buildNewRefreshSession(user);
      const inserted = await insertRefreshToken(
        client,
        user.id,
        refreshSession,
      );

      const updated = await client.query(
        `/* auth-session:update-last-login */
         UPDATE public.users
         SET last_login_at = NOW()
         WHERE id = $1
         RETURNING id`,
        [user.id],
      );

      if (updated.rowCount !== 1) {
        throw new Error("AUTH_LAST_LOGIN_UPDATE_FAILED");
      }

      return {
        accessToken: accessTokenService.issue({
          userId: user.id,
          authVersion: user.auth_version,
        }),
        refreshToken: refreshSession.token,
        refreshExpiresAt: inserted.expires_at,
      };
    });
  }

  async function revokeFamily(client, familyId, reason) {
    await client.query(
      `/* auth-session:revoke-refresh-family */
       UPDATE public.refresh_tokens
       SET revoked_at = COALESCE(revoked_at, NOW()),
           revocation_reason = COALESCE(revocation_reason, $2)
       WHERE family_id = $1
         AND revoked_at IS NULL`,
      [familyId, reason],
    );
  }

  async function refresh(token) {
    if (!REFRESH_TOKEN_PATTERN.test(token)) {
      throw invalidSession();
    }

    const digest = cryptoService.createRefreshTokenDigest(token);
    const outcome = await withTransaction(async (client) => {
      const ownerLookup = await client.query(
        `/* auth-session:find-refresh-owner */
         SELECT user_id
         FROM public.refresh_tokens
         WHERE token_digest = $1`,
        [digest],
      );

      if (ownerLookup.rowCount !== 1) {
        return { invalid: true };
      }

      const lockedUser = await client.query(
        `/* auth-session:lock-refresh-user */
         SELECT id, auth_version, email_verified_at
         FROM public.users
         WHERE id = $1
         FOR UPDATE`,
        [ownerLookup.rows[0].user_id],
      );

      if (lockedUser.rowCount !== 1) {
        return { invalid: true };
      }

      const lookup = await client.query(
        `/* auth-session:lock-refresh-token */
         SELECT
           id,
           user_id,
           family_id,
           expires_at,
           revoked_at,
           revocation_reason,
           replaced_by_token_id,
           auth_version_at_issue
         FROM public.refresh_tokens
         WHERE token_digest = $1
           AND user_id = $2
         FOR UPDATE`,
        [digest, lockedUser.rows[0].id],
      );

      if (lookup.rowCount !== 1) {
        return { invalid: true };
      }

      const row = lookup.rows[0];
      const user = lockedUser.rows[0];
      if (
        row.revoked_at &&
        (row.revocation_reason === "rotated" || row.replaced_by_token_id)
      ) {
        await revokeFamily(client, row.family_id, "replay_detected");
        return { invalid: true, replay: true };
      }

      if (row.revoked_at) {
        return { invalid: true };
      }

      if (new Date(row.expires_at).getTime() <= clock().getTime()) {
        await revokeFamily(client, row.family_id, "expired");
        return { invalid: true };
      }

      if (
        row.auth_version_at_issue !== user.auth_version ||
        !user.email_verified_at
      ) {
        await revokeFamily(client, row.family_id, "auth_version_changed");
        return { invalid: true };
      }

      if (!(await hasCoherentWorkspace(client, row.user_id))) {
        await revokeFamily(client, row.family_id, "auth_state_conflict");
        return { invalid: true };
      }

      const successor = buildNewRefreshSession(
        user,
        row.family_id,
        row.expires_at,
      );

      const rotated = await client.query(
        `/* auth-session:rotate-current-token */
         UPDATE public.refresh_tokens
         SET last_used_at = NOW(),
             revoked_at = NOW(),
             revocation_reason = 'rotated'
         WHERE id = $1
           AND revoked_at IS NULL
         RETURNING id`,
        [row.id],
      );

      if (rotated.rowCount !== 1) {
        return { invalid: true };
      }

      const inserted = await insertRefreshToken(
        client,
        row.user_id,
        successor,
      );
      const linked = await client.query(
        `/* auth-session:link-refresh-replacement */
         UPDATE public.refresh_tokens
         SET replaced_by_token_id = $2
         WHERE id = $1
           AND revocation_reason = 'rotated'
         RETURNING id`,
        [row.id, inserted.id],
      );

      if (linked.rowCount !== 1) {
        throw new Error("AUTH_REFRESH_LINK_FAILED");
      }

      return {
        accessToken: accessTokenService.issue({
          userId: row.user_id,
          authVersion: user.auth_version,
        }),
        refreshToken: successor.token,
        refreshExpiresAt: inserted.expires_at,
      };
    });

    if (outcome.invalid) {
      if (outcome.replay) {
        logger.warn("AUTH_REFRESH_REPLAY_DETECTED");
      }
      throw invalidSession();
    }

    return outcome;
  }

  async function logout(token) {
    if (!token || !REFRESH_TOKEN_PATTERN.test(token)) {
      return;
    }

    const digest = cryptoService.createRefreshTokenDigest(token);
    await withTransaction(async (client) => {
      const ownerLookup = await client.query(
        `/* auth-session:find-logout-owner */
         SELECT user_id
         FROM public.refresh_tokens
         WHERE token_digest = $1`,
        [digest],
      );

      if (ownerLookup.rowCount !== 1) {
        return;
      }

      const lockedUser = await client.query(
        `/* auth-session:lock-logout-user */
         SELECT id
         FROM public.users
         WHERE id = $1
         FOR UPDATE`,
        [ownerLookup.rows[0].user_id],
      );

      if (lockedUser.rowCount !== 1) {
        return;
      }

      const lookup = await client.query(
        `/* auth-session:lock-logout-token */
         SELECT id, family_id
         FROM public.refresh_tokens
         WHERE token_digest = $1
           AND user_id = $2
         FOR UPDATE`,
        [digest, lockedUser.rows[0].id],
      );

      if (lookup.rowCount === 1) {
        await revokeFamily(client, lookup.rows[0].family_id, "logout");
      }
    });
  }

  return Object.freeze({ login, logout, refresh });
}

module.exports = {
  AuthSessionError,
  REFRESH_TOKEN_PATTERN,
  createAuthSessionService,
};
