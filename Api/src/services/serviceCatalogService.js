const crypto = require("node:crypto");

const SERVICE_KEY_CONSTRAINT =
  "velaris_services_workspace_service_key_key";
const MAX_SERVICE_KEY_ATTEMPTS = 3;

class ServiceNotFoundError extends Error {
  constructor() {
    super("Serviço não encontrado.");
    this.name = "ServiceNotFoundError";
  }
}

class ServiceKeyConflictError extends Error {
  constructor() {
    super("Não foi possível gerar a identificação interna do serviço.");
    this.name = "ServiceKeyConflictError";
  }
}

function mapPersistedService(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new TypeError("Serviço persistido inválido.");
  }
  const service = {
    id: row.id,
    name: row.service_name,
    type: row.service_type,
    problemCategory: row.problem_category,
    description: row.description,
    howItWorks: row.how_it_works,
    problemsSolved: row.problems_solved,
    targetNiches: row.target_niches,
    isActive: row.is_active,
    displayOrder: row.display_order,
  };
  if (
    !Number.isInteger(service.id) ||
    typeof service.name !== "string" ||
    !["universal", "nichado"].includes(service.type) ||
    typeof service.problemCategory !== "string" ||
    typeof service.description !== "string" ||
    typeof service.howItWorks !== "string" ||
    !Array.isArray(service.problemsSolved) ||
    service.problemsSolved.some((item) => typeof item !== "string") ||
    !Array.isArray(service.targetNiches) ||
    service.targetNiches.some((item) => typeof item !== "string") ||
    typeof service.isActive !== "boolean" ||
    !Number.isInteger(service.displayOrder) ||
    service.displayOrder < 0
  ) {
    throw new TypeError("Serviço persistido inválido.");
  }
  return service;
}

function isServiceKeyCollision(error) {
  return (
    error?.code === "23505" && error.constraint === SERVICE_KEY_CONSTRAINT
  );
}

function createServiceCatalogService({
  repository,
  keyFactory = () => `svc_${crypto.randomUUID().replaceAll("-", "")}`,
}) {
  if (
    !repository ||
    typeof repository.findAllByWorkspaceId !== "function" ||
    typeof repository.createByWorkspaceId !== "function" ||
    typeof repository.updateByIdAndWorkspaceId !== "function"
  ) {
    throw new TypeError("Repository de catálogo é obrigatório.");
  }
  if (typeof keyFactory !== "function") {
    throw new TypeError("Gerador de service key inválido.");
  }

  return Object.freeze({
    async listByWorkspaceId(workspaceId, options) {
      const rows = await repository.findAllByWorkspaceId(workspaceId, options);
      return rows.map(mapPersistedService);
    },

    async createByWorkspaceId(workspaceId, data) {
      for (let attempt = 0; attempt < MAX_SERVICE_KEY_ATTEMPTS; attempt += 1) {
        try {
          const row = await repository.createByWorkspaceId(
            workspaceId,
            keyFactory(),
            data,
          );
          return mapPersistedService(row);
        } catch (error) {
          if (!isServiceKeyCollision(error)) throw error;
          if (attempt === MAX_SERVICE_KEY_ATTEMPTS - 1) {
            throw new ServiceKeyConflictError();
          }
        }
      }
      throw new ServiceKeyConflictError();
    },

    async updateByIdAndWorkspaceId(serviceId, workspaceId, patch) {
      const row = await repository.updateByIdAndWorkspaceId(
        serviceId,
        workspaceId,
        patch,
      );
      if (!row) throw new ServiceNotFoundError();
      return mapPersistedService(row);
    },
  });
}

module.exports = {
  MAX_SERVICE_KEY_ATTEMPTS,
  SERVICE_KEY_CONSTRAINT,
  ServiceKeyConflictError,
  ServiceNotFoundError,
  createServiceCatalogService,
  isServiceKeyCollision,
  mapPersistedService,
};
