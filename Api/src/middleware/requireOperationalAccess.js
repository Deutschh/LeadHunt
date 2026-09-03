const VALID_ACCOUNT_STATUSES = new Set([
  "pending",
  "active",
  "suspended",
]);
const VALID_MEMBERSHIP_ROLES = new Set(["owner", "member"]);

const INTERNAL_ERROR_RESPONSE = Object.freeze({
  error: "Erro interno de autorização.",
  code: "INTERNAL_ERROR",
});

const ACCOUNT_PENDING_RESPONSE = Object.freeze({
  error: "Sua conta ainda está aguardando ativação.",
  code: "ACCOUNT_PENDING",
});

const ACCOUNT_SUSPENDED_RESPONSE = Object.freeze({
  error: "Esta conta está suspensa.",
  code: "ACCOUNT_SUSPENDED",
});

const ACCOUNT_INACTIVE_RESPONSE = Object.freeze({
  error: "Esta conta está indisponível no momento.",
  code: "ACCOUNT_INACTIVE",
});

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidId(value) {
  return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

function hasValidAuthenticatedContext(req) {
  if (
    !isRecord(req?.user) ||
    !isRecord(req?.membership) ||
    !isRecord(req?.workspace)
  ) {
    return false;
  }

  if (
    !isValidId(req.user.id) ||
    !isValidId(req.membership.userId) ||
    req.user.id !== req.membership.userId
  ) {
    return false;
  }

  if (
    !isValidId(req.workspaceId) ||
    !isValidId(req.membership.workspaceId) ||
    !isValidId(req.workspace.id) ||
    req.workspaceId !== req.membership.workspaceId ||
    req.workspaceId !== req.workspace.id
  ) {
    return false;
  }

  return (
    VALID_ACCOUNT_STATUSES.has(req.workspace.accountStatus) &&
    VALID_MEMBERSHIP_ROLES.has(req.membership.role) &&
    typeof req.workspace.isActive === "boolean"
  );
}

function createRequireOperationalAccess({ logger = console } = {}) {
  return function requireOperationalAccess(req, res, next) {
    if (!hasValidAuthenticatedContext(req)) {
      logger.error("AUTH_OPERATIONAL_CONTEXT_INVALID");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }

    if (req.workspace.isActive === false) {
      return res.status(403).json(ACCOUNT_INACTIVE_RESPONSE);
    }

    if (req.workspace.accountStatus === "pending") {
      return res.status(403).json(ACCOUNT_PENDING_RESPONSE);
    }

    if (req.workspace.accountStatus === "suspended") {
      return res.status(403).json(ACCOUNT_SUSPENDED_RESPONSE);
    }

    if (
      req.workspace.accountStatus === "active" &&
      req.workspace.isActive === true
    ) {
      return next();
    }

    logger.error("AUTH_OPERATIONAL_CONTEXT_INVALID");
    return res.status(500).json(INTERNAL_ERROR_RESPONSE);
  };
}

module.exports = {
  createRequireOperationalAccess,
};
