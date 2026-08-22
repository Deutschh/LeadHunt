const {
  isTransientDatabaseError,
} = require("./authIdentityService");

class PasswordRecoveryError extends Error {
  constructor(status, code, publicMessage) {
    super(code);
    this.name = "PasswordRecoveryError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

class PasswordRecoveryUnavailableError extends Error {
  constructor() {
    super("AUTH_TEMPORARILY_UNAVAILABLE");
    this.name = "PasswordRecoveryUnavailableError";
  }
}

function invalidResetToken() {
  return new PasswordRecoveryError(
    400,
    "INVALID_RESET_TOKEN",
    "Token de recuperação inválido ou expirado.",
  );
}

function createPasswordRecoveryService({
  db,
  cryptoService,
  emailService,
  config,
  logger = console,
}) {
  async function begin(client) {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
  }

  async function withTransaction(operation) {
    const client = await db.connect();
    try {
      await begin(client);
      const result = await operation(client);
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

  async function databaseOperation(operation) {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof PasswordRecoveryError ||
        error instanceof PasswordRecoveryUnavailableError
      ) {
        throw error;
      }

      if (isTransientDatabaseError(error)) {
        throw new PasswordRecoveryUnavailableError();
      }

      throw error;
    }
  }

  async function invalidateFailedDelivery(token) {
    try {
      await databaseOperation(() =>
        withTransaction(async (client) => {
          const userResult = await client.query(
            `/* auth-password:lock-failed-delivery-user */
             SELECT id
             FROM public.users
             WHERE id = $1
             FOR UPDATE`,
            [token.userId],
          );

          if (userResult.rowCount !== 1) {
            return;
          }

          const tokenResult = await client.query(
            `/* auth-password:lock-failed-delivery-token */
             SELECT id, consumed_at, invalidated_at
             FROM public.password_reset_tokens
             WHERE id = $1
               AND user_id = $2
             FOR UPDATE`,
            [token.id, token.userId],
          );
          const current = tokenResult.rows[0] || null;

          if (
            !current ||
            current.consumed_at !== null ||
            current.invalidated_at !== null
          ) {
            return;
          }

          const invalidated = await client.query(
            `/* auth-password:invalidate-failed-delivery-token */
             UPDATE public.password_reset_tokens
             SET invalidated_at = NOW()
             WHERE id = $1
               AND user_id = $2
               AND consumed_at IS NULL
               AND invalidated_at IS NULL
             RETURNING id`,
            [token.id, token.userId],
          );

          if (invalidated.rowCount !== 1) {
            throw new Error("AUTH_PASSWORD_RESET_INVALIDATION_FAILED");
          }
        }),
      );
    } catch (_error) {
      logger.error("AUTH_PASSWORD_RESET_TOKEN_INVALIDATION_FAILED");
    }
  }

  async function forgot({ email }) {
    const plaintextToken = cryptoService.generatePasswordResetToken();
    const digest = cryptoService.createPasswordResetTokenDigest(
      plaintextToken,
    );

    const delivery = await databaseOperation(() =>
      withTransaction(async (client) => {
        const userResult = await client.query(
          `/* auth-password:lock-forgot-user */
           SELECT id, email, email_verified_at
           FROM public.users
           WHERE LOWER(email) = $1
           FOR UPDATE`,
          [email],
        );
        const user = userResult.rows[0] || null;

        if (!user || user.email_verified_at === null) {
          return null;
        }

        const openTokenResult = await client.query(
          `/* auth-password:lock-open-reset-token */
           SELECT id
           FROM public.password_reset_tokens
           WHERE user_id = $1
             AND consumed_at IS NULL
             AND invalidated_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [user.id],
        );
        const openToken = openTokenResult.rows[0] || null;

        if (openToken) {
          const invalidated = await client.query(
            `/* auth-password:invalidate-previous-reset-token */
             UPDATE public.password_reset_tokens
             SET invalidated_at = NOW()
             WHERE id = $1
               AND user_id = $2
               AND consumed_at IS NULL
               AND invalidated_at IS NULL
             RETURNING id`,
            [openToken.id, user.id],
          );

          if (invalidated.rowCount !== 1) {
            throw new Error("AUTH_PASSWORD_RESET_REPLACEMENT_FAILED");
          }
        }

        const inserted = await client.query(
          `/* auth-password:insert-reset-token */
           INSERT INTO public.password_reset_tokens (
             user_id,
             token_digest,
             expires_at
           )
           VALUES (
             $1,
             $2,
             NOW() + ($3 * INTERVAL '1 minute')
           )
           RETURNING id, expires_at`,
          [user.id, digest, config.passwordResetTtlMinutes],
        );

        if (inserted.rowCount !== 1) {
          throw new Error("AUTH_PASSWORD_RESET_INSERT_FAILED");
        }

        return {
          email: user.email,
          plaintextToken,
          token: { id: inserted.rows[0].id, userId: user.id },
        };
      }),
    );

    if (!delivery) {
      return;
    }

    try {
      await emailService.sendPasswordResetEmail({
        to: delivery.email,
        token: delivery.plaintextToken,
        expiresInMinutes: config.passwordResetTtlMinutes,
        idempotencyKey: `password-reset-${delivery.token.id}`,
      });
    } catch (_error) {
      logger.error("AUTH_PASSWORD_RESET_EMAIL_DELIVERY_FAILED");
      await invalidateFailedDelivery(delivery.token);
    }
  }

  async function reset({ token, password }) {
    const digest = cryptoService.createPasswordResetTokenDigest(token);
    const candidateResult = await databaseOperation(() =>
      db.query(
        `/* auth-password:find-reset-owner */
         SELECT user_id
         FROM public.password_reset_tokens
         WHERE token_digest = $1`,
        [digest],
      ),
    );

    if (candidateResult.rowCount !== 1) {
      throw invalidResetToken();
    }

    const passwordHash = await cryptoService.hashPassword(password);

    await databaseOperation(() =>
      withTransaction(async (client) => {
        const userResult = await client.query(
          `/* auth-password:lock-reset-user */
           SELECT id, email_verified_at
           FROM public.users
           WHERE id = $1
           FOR UPDATE`,
          [candidateResult.rows[0].user_id],
        );
        const user = userResult.rows[0] || null;

        if (!user || user.email_verified_at === null) {
          throw invalidResetToken();
        }

        const tokenResult = await client.query(
          `/* auth-password:lock-reset-token */
           SELECT
             id,
             user_id,
             consumed_at,
             invalidated_at,
             expires_at <= NOW() AS expired
           FROM public.password_reset_tokens
           WHERE token_digest = $1
             AND user_id = $2
           FOR UPDATE`,
          [digest, user.id],
        );
        const resetToken = tokenResult.rows[0] || null;

        if (
          !resetToken ||
          resetToken.consumed_at !== null ||
          resetToken.invalidated_at !== null ||
          resetToken.expired
        ) {
          throw invalidResetToken();
        }

        const activeRefreshTokens = await client.query(
          `/* auth-password:lock-user-refresh-tokens */
           SELECT id
           FROM public.refresh_tokens
           WHERE user_id = $1
             AND revoked_at IS NULL
           ORDER BY id
           FOR UPDATE`,
          [user.id],
        );

        const updatedUser = await client.query(
          `/* auth-password:update-password-and-version */
           UPDATE public.users
           SET password_hash = $2,
               auth_version = auth_version + 1,
               updated_at = NOW()
           WHERE id = $1
           RETURNING id, auth_version`,
          [user.id, passwordHash],
        );

        if (updatedUser.rowCount !== 1) {
          throw new Error("AUTH_PASSWORD_UPDATE_FAILED");
        }

        const consumed = await client.query(
          `/* auth-password:consume-reset-token */
           UPDATE public.password_reset_tokens
           SET consumed_at = NOW()
           WHERE id = $1
             AND user_id = $2
             AND consumed_at IS NULL
             AND invalidated_at IS NULL
             AND expires_at > NOW()
           RETURNING id`,
          [resetToken.id, user.id],
        );

        if (consumed.rowCount !== 1) {
          throw invalidResetToken();
        }

        const revoked = await client.query(
          `/* auth-password:revoke-user-refresh-tokens */
           UPDATE public.refresh_tokens
           SET revoked_at = NOW(),
               revocation_reason = 'password_reset'
           WHERE user_id = $1
             AND revoked_at IS NULL
           RETURNING id`,
          [user.id],
        );

        if (revoked.rowCount !== activeRefreshTokens.rowCount) {
          throw new Error("AUTH_PASSWORD_REFRESH_REVOCATION_FAILED");
        }
      }),
    );
  }

  return Object.freeze({ forgot, reset });
}

module.exports = {
  PasswordRecoveryError,
  PasswordRecoveryUnavailableError,
  createPasswordRecoveryService,
};
