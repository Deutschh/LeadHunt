const { AccountServiceError } = require("./accountService");

function createAccountPasswordService({ db, cryptoService }) {
  if (!db || typeof db.connect !== "function") {
    throw new TypeError("db transacional é obrigatório.");
  }
  if (
    !cryptoService ||
    typeof cryptoService.hashPassword !== "function" ||
    typeof cryptoService.verifyPassword !== "function"
  ) {
    throw new TypeError("cryptoService é obrigatório.");
  }

  async function changePassword({ userId, currentPassword, newPassword }) {
    const passwordHash = await cryptoService.hashPassword(newPassword);
    const client = await db.connect();

    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '30s'");

      const lockedUser = await client.query(
        `/* account-password:lock-user */
         SELECT id, password_hash
         FROM public.users
         WHERE id = $1
         FOR UPDATE`,
        [userId],
      );

      if (lockedUser.rowCount === 0) {
        throw new AccountServiceError(
          401,
          "INVALID_ACCESS_TOKEN",
          "Token de acesso inválido ou expirado.",
        );
      }
      if (
        lockedUser.rowCount !== 1 ||
        typeof lockedUser.rows[0]?.password_hash !== "string"
      ) {
        throw new Error("ACCOUNT_PASSWORD_USER_STATE_INVALID");
      }

      const passwordMatches = await cryptoService.verifyPassword(
        currentPassword,
        lockedUser.rows[0].password_hash,
      );
      if (!passwordMatches) {
        throw new AccountServiceError(
          400,
          "CURRENT_PASSWORD_INVALID",
          "A senha atual está incorreta.",
        );
      }

      const activeRefreshTokens = await client.query(
        `/* account-password:lock-refresh-tokens */
         SELECT id
         FROM public.refresh_tokens
         WHERE user_id = $1
           AND revoked_at IS NULL
         ORDER BY id
         FOR UPDATE`,
        [userId],
      );

      const updated = await client.query(
        `/* account-password:update-password-and-version */
         UPDATE public.users
         SET password_hash = $2,
             auth_version = auth_version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, auth_version`,
        [userId, passwordHash],
      );
      if (updated.rowCount !== 1) {
        throw new Error("ACCOUNT_PASSWORD_UPDATE_FAILED");
      }

      const revoked = await client.query(
        `/* account-password:revoke-refresh-tokens */
         UPDATE public.refresh_tokens
         SET revoked_at = CURRENT_TIMESTAMP,
             revocation_reason = 'password_change'
         WHERE user_id = $1
           AND revoked_at IS NULL
         RETURNING id`,
        [userId],
      );
      if (revoked.rowCount !== activeRefreshTokens.rowCount) {
        throw new Error("ACCOUNT_PASSWORD_REFRESH_REVOCATION_FAILED");
      }

      await client.query("COMMIT");
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

  return Object.freeze({ changePassword });
}

module.exports = { createAccountPasswordService };
