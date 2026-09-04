const {
  normalizeNicheNameForLookup,
  validateNicheStrategyPayload,
} = require("../validation/nicheStrategyValidation");

class NicheStrategyNotFoundError extends Error {
  constructor() {
    super("Estratégia de nicho não encontrada.");
    this.name = "NicheStrategyNotFoundError";
  }
}

function assertWorkspaceId(workspaceId) {
  if (typeof workspaceId !== "string" || !/^[1-9]\d*$/u.test(workspaceId)) {
    throw new TypeError("workspaceId interno inválido.");
  }
}

function mapPersistedNicheStrategy(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new TypeError("Estratégia de nicho persistida inválida.");
  }

  const validation = validateNicheStrategyPayload({
    nicheName: row.niche_name,
    hook: row.hook,
    callToAction: row.call_to_action,
  });
  if (
    !Number.isInteger(row.id) ||
    validation.error ||
    validation.value.nicheName !== row.niche_name ||
    validation.value.hook !== row.hook ||
    validation.value.callToAction !== row.call_to_action
  ) {
    throw new TypeError("Estratégia de nicho persistida inválida.");
  }

  return { id: row.id, ...validation.value };
}

function createNicheStrategyService({ repository }) {
  if (
    !repository ||
    typeof repository.findAllByWorkspaceId !== "function" ||
    typeof repository.upsertByWorkspaceId !== "function" ||
    typeof repository.deleteByIdAndWorkspaceId !== "function" ||
    typeof repository.findByWorkspaceIdAndNicheName !== "function"
  ) {
    throw new TypeError("Repository de estratégias de nicho é obrigatório.");
  }

  return Object.freeze({
    async listByWorkspaceId(workspaceId) {
      const rows = await repository.findAllByWorkspaceId(workspaceId);
      return rows.map(mapPersistedNicheStrategy);
    },

    async upsertByWorkspaceId(workspaceId, data) {
      const row = await repository.upsertByWorkspaceId(workspaceId, data);
      return mapPersistedNicheStrategy(row);
    },

    async deleteByIdAndWorkspaceId(id, workspaceId) {
      const row = await repository.deleteByIdAndWorkspaceId(id, workspaceId);
      if (!row) throw new NicheStrategyNotFoundError();
    },

    async resolveWorkspaceNicheStrategy(workspaceId, nicheName) {
      assertWorkspaceId(workspaceId);
      const validation = normalizeNicheNameForLookup(nicheName);
      if (validation.error) return null;

      const row = await repository.findByWorkspaceIdAndNicheName(
        workspaceId,
        validation.value,
      );
      return row ? mapPersistedNicheStrategy(row) : null;
    },
  });
}

module.exports = {
  NicheStrategyNotFoundError,
  createNicheStrategyService,
  mapPersistedNicheStrategy,
};
