const {
  AdminWorkspaceMaxProfilesRepositoryError,
  ERROR_REASONS,
} = require("../repositories/adminWorkspaceMaxProfilesRepository");
const {
  AdminWorkspaceAuthorizationError,
} = require("./adminWorkspaceStatusService");
const {
  AdminWorkspaceNotFoundError,
} = require("./adminWorkspaceService");

const MAX_POSTGRES_BIGINT = 9223372036854775807n;

class AdminWorkspaceMaxProfilesConflictError extends Error {
  constructor() {
    super("O limite de perfis foi alterado por outra operação.");
    this.name = "AdminWorkspaceMaxProfilesConflictError";
  }
}

class AdminWorkspaceMaxProfilesValidationError extends Error {
  constructor() {
    super("O limite é inferior ao mínimo do workspace.");
    this.name = "AdminWorkspaceMaxProfilesValidationError";
  }
}

function invalidRepositoryResult() {
  return new TypeError("Resultado administrativo de perfis inválido.");
}

function isPositiveBigintString(value) {
  return (
    typeof value === "string" &&
    /^[1-9]\d*$/u.test(value) &&
    value.length <= 19 &&
    BigInt(value) <= MAX_POSTGRES_BIGINT
  );
}

function mapWorkspace(result) {
  if (
    !result ||
    !isPositiveBigintString(result.workspaceId) ||
    !Number.isInteger(result.minProfiles) ||
    result.minProfiles < 2 ||
    result.minProfiles > 32767 ||
    !Number.isInteger(result.maxProfiles) ||
    result.maxProfiles < result.minProfiles ||
    result.maxProfiles > 32767 ||
    typeof result.changed !== "boolean"
  ) {
    throw invalidRepositoryResult();
  }

  return {
    workspace: {
      workspaceId: result.workspaceId,
      minProfiles: result.minProfiles,
      maxProfiles: result.maxProfiles,
    },
  };
}

function translateRepositoryError(error) {
  if (!(error instanceof AdminWorkspaceMaxProfilesRepositoryError)) throw error;
  if (error.reason === ERROR_REASONS.ADMIN_DENIED) {
    throw new AdminWorkspaceAuthorizationError();
  }
  if (error.reason === ERROR_REASONS.WORKSPACE_NOT_FOUND) {
    throw new AdminWorkspaceNotFoundError();
  }
  if (error.reason === ERROR_REASONS.CONFLICT) {
    throw new AdminWorkspaceMaxProfilesConflictError();
  }
  if (error.reason === ERROR_REASONS.BELOW_MINIMUM) {
    throw new AdminWorkspaceMaxProfilesValidationError();
  }
  throw invalidRepositoryResult();
}

function createAdminWorkspaceMaxProfilesService({ repository }) {
  if (!repository || typeof repository.updateMaxProfiles !== "function") {
    throw new TypeError("Repository administrativo de perfis é obrigatório.");
  }

  return Object.freeze({
    async updateMaxProfiles(input) {
      try {
        return mapWorkspace(await repository.updateMaxProfiles(input));
      } catch (error) {
        return translateRepositoryError(error);
      }
    },
  });
}

module.exports = {
  AdminWorkspaceMaxProfilesConflictError,
  AdminWorkspaceMaxProfilesValidationError,
  createAdminWorkspaceMaxProfilesService,
};
