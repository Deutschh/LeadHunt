class AuthServiceError extends Error {
  constructor(status, code, publicMessage) {
    super(publicMessage);
    this.name = "AuthServiceError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

const INVALID_CODE_ERROR = Object.freeze({
  status: 400,
  code: "INVALID_OR_EXPIRED_CODE",
  publicMessage: "Código inválido ou expirado.",
});

async function withTransaction(db, operation) {
  const client = await db.connect();
  let transactionOpen = false;

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '15s'");

    const result = await operation(client);

    await client.query("COMMIT");
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK").catch(() => {});
    }

    throw error;
  } finally {
    client.release();
  }
}

function createAuthService({
  db,
  cryptoService,
  emailService,
  config,
  logger = console,
}) {
  async function createChallenge(client, userId) {
    const openChallengeResult = await client.query(
      `
      /* auth:find-open-challenge */
      SELECT
        id,
        sent_at > NOW() - ($2 * INTERVAL '1 second') AS cooldown_active
      FROM email_verification_codes
      WHERE user_id = $1
        AND consumed_at IS NULL
        AND invalidated_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [userId, config.resendCooldownSeconds],
    );

    const challengeCountResult = await client.query(
      `
      /* auth:count-recent-challenges */
      SELECT COUNT(*)::INTEGER AS challenge_count
      FROM email_verification_codes
      WHERE user_id = $1
        AND created_at >= NOW() - INTERVAL '1 hour'
      `,
      [userId],
    );

    const challengeCount = challengeCountResult.rows[0].challenge_count;
    const openChallenge = openChallengeResult.rows[0] || null;

    if (
      (openChallenge && openChallenge.cooldown_active) ||
      challengeCount >= config.maxChallengesPerHour
    ) {
      return null;
    }

    if (openChallenge) {
      await client.query(
        `
        /* auth:invalidate-previous-challenge */
        UPDATE email_verification_codes
        SET invalidated_at = NOW()
        WHERE id = $1
          AND user_id = $2
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
        `,
        [openChallenge.id, userId],
      );
    }

    const sequenceResult = await client.query(
      `
      /* auth:reserve-challenge-id */
      SELECT nextval(
        pg_get_serial_sequence('public.email_verification_codes', 'id')
      ) AS id
      `,
    );
    const challengeId = sequenceResult.rows[0].id;
    const code = cryptoService.generateOtp();
    const digest = cryptoService.createOtpDigest({
      userId,
      challengeId,
      code,
    });

    await client.query(
      `
      /* auth:insert-challenge */
      INSERT INTO email_verification_codes (
        id,
        user_id,
        code_digest,
        expires_at,
        max_attempts
      )
      VALUES (
        $1,
        $2,
        $3,
        NOW() + ($4 * INTERVAL '1 minute'),
        $5
      )
      `,
      [
        challengeId,
        userId,
        digest,
        config.otpExpiresInMinutes,
        config.otpMaxAttempts,
      ],
    );

    return { id: challengeId, userId, code };
  }

  async function invalidateFailedDelivery(challenge) {
    try {
      await db.query(
        `
        /* auth:invalidate-failed-delivery */
        UPDATE email_verification_codes
        SET invalidated_at = NOW()
        WHERE id = $1
          AND user_id = $2
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
        `,
        [challenge.id, challenge.userId],
      );
    } catch (_error) {
      logger.error("AUTH_EMAIL_CHALLENGE_INVALIDATION_FAILED");
    }
  }

  async function deliverChallenge({ challenge, email }) {
    if (!challenge) {
      return;
    }

    try {
      await emailService.sendVerificationEmail({
        to: email,
        code: challenge.code,
        expiresInMinutes: config.otpExpiresInMinutes,
        idempotencyKey: `email-verification-${challenge.id}`,
      });
    } catch (_error) {
      logger.error("AUTH_VERIFICATION_EMAIL_DELIVERY_FAILED");
      await invalidateFailedDelivery(challenge);
    }
  }

  async function register({
    name,
    email,
    password,
    termsVersion,
    privacyPolicyVersion,
  }) {
    const passwordHash = await cryptoService.hashPassword(password);

    const delivery = await withTransaction(db, async (client) => {
      const insertUserResult = await client.query(
        `
        /* auth:insert-user */
        INSERT INTO users (
          name,
          email,
          password_hash,
          terms_accepted_at,
          terms_version,
          privacy_policy_accepted_at,
          privacy_policy_version
        )
        VALUES ($1, $2, $3, NOW(), $4, NOW(), $5)
        ON CONFLICT (LOWER(email)) DO NOTHING
        RETURNING id, email, email_verified_at
        `,
        [name, email, passwordHash, termsVersion, privacyPolicyVersion],
      );

      let user = insertUserResult.rows[0] || null;

      if (!user) {
        const existingUserResult = await client.query(
          `
          /* auth:lock-existing-user */
          SELECT id, email, email_verified_at
          FROM users
          WHERE LOWER(email) = $1
          FOR UPDATE
          `,
          [email],
        );
        user = existingUserResult.rows[0] || null;
      }

      if (!user || user.email_verified_at !== null) {
        return null;
      }

      const challenge = await createChallenge(client, user.id);
      return challenge ? { challenge, email: user.email } : null;
    });

    if (delivery) {
      await deliverChallenge(delivery);
    }
  }

  async function resend({ email }) {
    const delivery = await withTransaction(db, async (client) => {
      const userResult = await client.query(
        `
        /* auth:lock-user-for-resend */
        SELECT id, email, email_verified_at
        FROM users
        WHERE LOWER(email) = $1
        FOR UPDATE
        `,
        [email],
      );
      const user = userResult.rows[0] || null;

      if (!user || user.email_verified_at !== null) {
        return null;
      }

      const challenge = await createChallenge(client, user.id);
      return challenge ? { challenge, email: user.email } : null;
    });

    if (delivery) {
      await deliverChallenge(delivery);
    }
  }

  async function loadVerifiedWorkspace(client, userId) {
    const membershipResult = await client.query(
      `
      /* auth:load-verified-workspace */
      SELECT
        wm.workspace_id,
        wm.role,
        w.account_status,
        profile.workspace_id AS commercial_profile_workspace_id
      FROM workspace_members AS wm
      INNER JOIN workspaces AS w
        ON w.id = wm.workspace_id
      LEFT JOIN workspace_commercial_profiles AS profile
        ON profile.workspace_id = w.id
      WHERE wm.user_id = $1
      `,
      [userId],
    );

    if (
      membershipResult.rowCount !== 1 ||
      membershipResult.rows[0].role !== "owner" ||
      membershipResult.rows[0].commercial_profile_workspace_id === null
    ) {
      throw new AuthServiceError(
        409,
        "AUTH_STATE_CONFLICT",
        "O estado da conta está inconsistente. Contate o suporte.",
      );
    }

    return membershipResult.rows[0].account_status;
  }

  async function verifyAlreadyVerifiedUser(client, user, code) {
    const challengeResult = await client.query(
      `
      /* auth:find-consumed-challenge */
      SELECT id, code_digest
      FROM email_verification_codes
      WHERE user_id = $1
        AND consumed_at IS NOT NULL
        AND consumed_at >= NOW() - ($2 * INTERVAL '1 minute')
      ORDER BY consumed_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [user.id, config.verificationRetryWindowMinutes],
    );
    const challenge = challengeResult.rows[0] || null;

    if (
      !challenge ||
      !cryptoService.matchesOtp({
        userId: user.id,
        challengeId: challenge.id,
        code,
        digest: challenge.code_digest,
      })
    ) {
      return { error: INVALID_CODE_ERROR };
    }

    return {
      accountStatus: await loadVerifiedWorkspace(client, user.id),
      usedDevelopmentBypass: false,
    };
  }

  async function verifyUnverifiedUser(client, user, code) {
    const challengeResult = await client.query(
      `
      /* auth:lock-open-challenge-for-verify */
      SELECT
        id,
        code_digest,
        attempt_count,
        max_attempts,
        expires_at <= NOW() AS expired
      FROM email_verification_codes
      WHERE user_id = $1
        AND consumed_at IS NULL
        AND invalidated_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [user.id],
    );
    const challenge = challengeResult.rows[0] || null;

    if (!challenge) {
      return { error: INVALID_CODE_ERROR };
    }

    if (challenge.expired || challenge.attempt_count >= challenge.max_attempts) {
      await client.query(
        `
        /* auth:invalidate-unusable-challenge */
        UPDATE email_verification_codes
        SET invalidated_at = NOW()
        WHERE id = $1
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
        `,
        [challenge.id],
      );
      return { error: INVALID_CODE_ERROR };
    }

    const usedDevelopmentBypass =
      cryptoService.isDevelopmentBypassCode(code);
    const codeMatches =
      usedDevelopmentBypass ||
      cryptoService.matchesOtp({
        userId: user.id,
        challengeId: challenge.id,
        code,
        digest: challenge.code_digest,
      });

    if (!codeMatches) {
      await client.query(
        `
        /* auth:record-failed-attempt */
        UPDATE email_verification_codes
        SET
          attempt_count = attempt_count + 1,
          last_attempt_at = NOW(),
          invalidated_at = CASE
            WHEN attempt_count + 1 >= max_attempts THEN NOW()
            ELSE NULL
          END
        WHERE id = $1
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
        `,
        [challenge.id],
      );
      return { error: INVALID_CODE_ERROR };
    }

    const existingMembershipResult = await client.query(
      `
      /* auth:check-existing-membership */
      SELECT workspace_id
      FROM workspace_members
      WHERE user_id = $1
      FOR UPDATE
      `,
      [user.id],
    );

    if (existingMembershipResult.rowCount !== 0) {
      throw new AuthServiceError(
        409,
        "AUTH_STATE_CONFLICT",
        "O estado da conta está inconsistente. Contate o suporte.",
      );
    }

    const updateUserResult = await client.query(
      `
      /* auth:verify-user-email */
      UPDATE users
      SET email_verified_at = NOW(), updated_at = NOW()
      WHERE id = $1
        AND email_verified_at IS NULL
      RETURNING id
      `,
      [user.id],
    );

    if (updateUserResult.rowCount !== 1) {
      throw new AuthServiceError(
        409,
        "AUTH_STATE_CONFLICT",
        "O estado da conta está inconsistente. Contate o suporte.",
      );
    }

    const acceptedCodeDigest = cryptoService.createOtpDigest({
      userId: user.id,
      challengeId: challenge.id,
      code,
    });
    const consumeChallengeResult = await client.query(
      `
      /* auth:consume-challenge */
      UPDATE email_verification_codes
      SET
        code_digest = $2,
        attempt_count = attempt_count + 1,
        last_attempt_at = NOW(),
        consumed_at = NOW()
      WHERE id = $1
        AND consumed_at IS NULL
        AND invalidated_at IS NULL
      RETURNING id
      `,
      [challenge.id, acceptedCodeDigest],
    );

    if (consumeChallengeResult.rowCount !== 1) {
      throw new AuthServiceError(
        409,
        "AUTH_STATE_CONFLICT",
        "O estado da conta está inconsistente. Contate o suporte.",
      );
    }

    const workspaceResult = await client.query(
      `
      /* auth:create-workspace */
      INSERT INTO workspaces (slug, name)
      VALUES ($1, $2)
      RETURNING id, account_status
      `,
      [cryptoService.generateWorkspaceSlug(), user.name],
    );
    const workspace = workspaceResult.rows[0];

    if (!workspace || workspace.account_status !== "pending") {
      throw new AuthServiceError(
        409,
        "AUTH_STATE_CONFLICT",
        "O estado da conta está inconsistente. Contate o suporte.",
      );
    }

    await client.query(
      `
      /* auth:create-owner-membership */
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES ($1, $2, 'owner')
      `,
      [workspace.id, user.id],
    );

    await client.query(
      `
      /* auth:create-commercial-profile */
      INSERT INTO workspace_commercial_profiles (workspace_id)
      VALUES ($1)
      `,
      [workspace.id],
    );

    return {
      accountStatus: workspace.account_status,
      usedDevelopmentBypass,
    };
  }

  async function verify({ email, code }) {
    const outcome = await withTransaction(db, async (client) => {
      const userResult = await client.query(
        `
        /* auth:lock-user-for-verify */
        SELECT id, name, email_verified_at
        FROM users
        WHERE LOWER(email) = $1
        FOR UPDATE
        `,
        [email],
      );
      const user = userResult.rows[0] || null;

      if (!user) {
        return { error: INVALID_CODE_ERROR };
      }

      if (user.email_verified_at !== null) {
        return verifyAlreadyVerifiedUser(client, user, code);
      }

      return verifyUnverifiedUser(client, user, code);
    });

    if (outcome.error) {
      throw new AuthServiceError(
        outcome.error.status,
        outcome.error.code,
        outcome.error.publicMessage,
      );
    }

    if (outcome.usedDevelopmentBypass) {
      logger.warn("AUTH_DEV_EMAIL_BYPASS_USED");
    }

    return { accountStatus: outcome.accountStatus };
  }

  return Object.freeze({ register, resend, verify });
}

module.exports = {
  AuthServiceError,
  createAuthService,
  withTransaction,
};
