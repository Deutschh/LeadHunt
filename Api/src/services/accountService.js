class AccountServiceError extends Error {
  constructor(status, code, publicMessage) {
    super(code);
    this.name = "AccountServiceError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

function createAccountService({ db }) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("db é obrigatório.");
  }

  async function updateProfile({ userId, name }) {
    const result = await db.query(
      `/* account:update-profile */
       UPDATE public.users
       SET name = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING name, email`,
      [userId, name],
    );

    if (result.rowCount === 0) {
      throw new AccountServiceError(
        401,
        "INVALID_ACCESS_TOKEN",
        "Token de acesso inválido ou expirado.",
      );
    }

    const row = result.rowCount === 1 ? result.rows[0] : null;
    if (
      !row ||
      typeof row.name !== "string" ||
      typeof row.email !== "string"
    ) {
      throw new Error("ACCOUNT_PROFILE_UPDATE_FAILED");
    }

    return Object.freeze({ name: row.name, email: row.email });
  }

  return Object.freeze({ updateProfile });
}

module.exports = {
  AccountServiceError,
  createAccountService,
};
