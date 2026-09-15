const {
  AdminWorkspaceReleaseChannelRepositoryError,
  ERROR_REASONS,
} = require("../repositories/adminWorkspaceReleaseChannelRepository");
const {
  AdminWorkspaceAuthorizationError,
} = require("./adminWorkspaceStatusService");
const {
  AdminWorkspaceNotFoundError,
} = require("./adminWorkspaceService");

const MAX_POSTGRES_BIGINT = 9223372036854775807n;
const RELEASE_CHANNELS = new Set(["internal", "canary", "beta", "stable"]);

class AdminWorkspaceReleaseChannelConflictError extends Error {
  constructor() {
    super("O canal foi alterado por outra operação.");
    this.name = "AdminWorkspaceReleaseChannelConflictError";
  }
}

function invalidRepositoryResult() {
  return new TypeError("Resultado administrativo de canal inválido.");
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
    !RELEASE_CHANNELS.has(result.releaseChannel) ||
    typeof result.changed !== "boolean"
  ) {
    throw invalidRepositoryResult();
  }

  return {
    workspace: {
      workspaceId: result.workspaceId,
      releaseChannel: result.releaseChannel,
    },
  };
}

function translateRepositoryError(error) {
  if (!(error instanceof AdminWorkspaceReleaseChannelRepositoryError)) {
    throw error;
  }
  if (error.reason === ERROR_REASONS.ADMIN_DENIED) {
    throw new AdminWorkspaceAuthorizationError();
  }
  if (error.reason === ERROR_REASONS.WORKSPACE_NOT_FOUND) {
    throw new AdminWorkspaceNotFoundError();
  }
  if (error.reason === ERROR_REASONS.CONFLICT) {
    throw new AdminWorkspaceReleaseChannelConflictError();
  }
  throw invalidRepositoryResult();
}

function createAdminWorkspaceReleaseChannelService({ repository }) {
  if (!repository || typeof repository.updateReleaseChannel !== "function") {
    throw new TypeError("Repository administrativo de canal é obrigatório.");
  }

  return Object.freeze({
    async updateReleaseChannel(input) {
      try {
        return mapWorkspace(await repository.updateReleaseChannel(input));
      } catch (error) {
        return translateRepositoryError(error);
      }
    },
  });
}

module.exports = {
  AdminWorkspaceReleaseChannelConflictError,
  createAdminWorkspaceReleaseChannelService,
};
