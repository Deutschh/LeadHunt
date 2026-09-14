const {
  AdminWorkspaceStatusRepositoryError,
  ERROR_REASONS,
  ISO_TIMESTAMP_PATTERN,
} = require("../repositories/adminWorkspaceStatusRepository");
const {
  AdminWorkspaceNotFoundError,
} = require("./adminWorkspaceService");

const MAX_POSTGRES_BIGINT = 9223372036854775807n;

class AdminWorkspaceAuthorizationError extends Error {
  constructor() {
    super("Acesso administrativo não autorizado.");
    this.name = "AdminWorkspaceAuthorizationError";
  }
}

class AdminWorkspaceStatusConflictError extends Error {
  constructor() {
    super("Transição de status administrativo inválida.");
    this.name = "AdminWorkspaceStatusConflictError";
  }
}

function invalidRepositoryResult() {
  return new TypeError("Resultado administrativo persistido inválido.");
}

function mapActivatedAt(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    throw invalidRepositoryResult();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw invalidRepositoryResult();
  return parsed.toISOString();
}

function mapWorkspace(result) {
  if (
    !result ||
    typeof result.workspaceId !== "string" ||
    !/^[1-9]\d*$/u.test(result.workspaceId) ||
    result.workspaceId.length > 19 ||
    BigInt(result.workspaceId) > MAX_POSTGRES_BIGINT ||
    !["active", "suspended"].includes(result.accountStatus)
  ) {
    throw invalidRepositoryResult();
  }
  return {
    workspace: {
      workspaceId: result.workspaceId,
      accountStatus: result.accountStatus,
      activatedAt: mapActivatedAt(result.activatedAtIso),
    },
  };
}

function translateRepositoryError(error) {
  if (!(error instanceof AdminWorkspaceStatusRepositoryError)) throw error;
  if (error.reason === ERROR_REASONS.ADMIN_DENIED) {
    throw new AdminWorkspaceAuthorizationError();
  }
  if (error.reason === ERROR_REASONS.WORKSPACE_NOT_FOUND) {
    throw new AdminWorkspaceNotFoundError();
  }
  if (error.reason === ERROR_REASONS.STATUS_CONFLICT) {
    throw new AdminWorkspaceStatusConflictError();
  }
  throw invalidRepositoryResult();
}

function createAdminWorkspaceStatusService({ repository }) {
  if (
    !repository ||
    typeof repository.activateWorkspace !== "function" ||
    typeof repository.suspendWorkspace !== "function" ||
    typeof repository.reactivateWorkspace !== "function"
  ) {
    throw new TypeError("Repository de status administrativo é obrigatório.");
  }

  async function execute(method, input) {
    try {
      return mapWorkspace(await repository[method](input));
    } catch (error) {
      return translateRepositoryError(error);
    }
  }

  return Object.freeze({
    activateWorkspace: (input) => execute("activateWorkspace", input),
    suspendWorkspace: (input) => execute("suspendWorkspace", input),
    reactivateWorkspace: (input) => execute("reactivateWorkspace", input),
  });
}

module.exports = {
  AdminWorkspaceAuthorizationError,
  AdminWorkspaceStatusConflictError,
  createAdminWorkspaceStatusService,
};
