const ADMIN_ACCESS_DENIED_RESPONSE = Object.freeze({
  error: "Acesso administrativo não autorizado.",
  code: "ADMIN_ACCESS_DENIED",
});

const INTERNAL_ERROR_RESPONSE = Object.freeze({
  error: "Erro interno ao verificar acesso administrativo.",
  code: "INTERNAL_ERROR",
});

function isValidUserId(value) {
  return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

function createRequireAdmin({ db, logger = console }) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("Banco de dados administrativo é obrigatório.");
  }

  return async function requireAdmin(req, res, next) {
    const userId = req?.user?.id;

    if (!isValidUserId(userId)) {
      logger.error("ADMIN_AUTH_CONTEXT_INVALID");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }

    let result;
    try {
      result = await db.query(
        `/* admin-access:resolve */
         SELECT is_admin
         FROM public.users
         WHERE id = $1`,
        [userId],
      );
    } catch (_error) {
      logger.error("ADMIN_ACCESS_LOOKUP_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }

    if (
      !result ||
      !Array.isArray(result.rows) ||
      !Number.isInteger(result.rowCount) ||
      result.rowCount !== result.rows.length ||
      result.rowCount > 1 ||
      (result.rowCount === 1 &&
        typeof result.rows[0]?.is_admin !== "boolean")
    ) {
      logger.error("ADMIN_ACCESS_RESULT_INVALID");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }

    if (result.rowCount === 0 || result.rows[0].is_admin !== true) {
      return res.status(403).json(ADMIN_ACCESS_DENIED_RESPONSE);
    }

    return next();
  };
}

module.exports = {
  ADMIN_ACCESS_DENIED_RESPONSE,
  createRequireAdmin,
};
