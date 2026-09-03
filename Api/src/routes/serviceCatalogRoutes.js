const express = require("express");
const {
  ServiceKeyConflictError,
  ServiceNotFoundError,
} = require("../services/serviceCatalogService");
const {
  validateActiveFilter,
  validateServiceCreate,
  validateServiceId,
  validateServicePatch,
} = require("../validation/serviceCatalogValidation");

const INSUFFICIENT_ROLE_RESPONSE = Object.freeze({
  error: "Você não tem permissão para alterar o catálogo.",
  code: "INSUFFICIENT_WORKSPACE_ROLE",
});
const NOT_FOUND_RESPONSE = Object.freeze({
  error: "Serviço não encontrado.",
  code: "NOT_FOUND",
});
const SERVICE_KEY_CONFLICT_RESPONSE = Object.freeze({
  error: "Não foi possível criar o serviço no momento.",
  code: "SERVICE_KEY_CONFLICT",
});
const INTERNAL_ERROR_RESPONSE = Object.freeze({
  error: "Erro interno ao processar o catálogo.",
  code: "INTERNAL_ERROR",
});

function sendValidationError(res, validation) {
  const { status, code, message, fieldErrors } = validation.error;
  return res.status(status).json({
    error: message,
    code,
    ...(fieldErrors ? { fieldErrors } : {}),
  });
}

function createServiceCatalogRouter({ service, logger = console }) {
  if (
    !service ||
    typeof service.listByWorkspaceId !== "function" ||
    typeof service.createByWorkspaceId !== "function" ||
    typeof service.updateByIdAndWorkspaceId !== "function"
  ) {
    throw new TypeError("Service de catálogo é obrigatório.");
  }

  const router = express.Router();

  router.get("/", async (req, res) => {
    const filter = validateActiveFilter(req.query.active);
    if (filter.error) return sendValidationError(res, filter);

    try {
      const services = await service.listByWorkspaceId(req.workspaceId, {
        active: filter.value,
      });
      return res.status(200).json({ services });
    } catch (_error) {
      logger.error("SERVICE_CATALOG_GET_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }
  });

  router.post("/", async (req, res) => {
    if (req.membership.role !== "owner") {
      return res.status(403).json(INSUFFICIENT_ROLE_RESPONSE);
    }
    const validation = validateServiceCreate(req.body);
    if (validation.error) return sendValidationError(res, validation);

    try {
      const created = await service.createByWorkspaceId(
        req.workspaceId,
        validation.value,
      );
      return res.status(201).json(created);
    } catch (error) {
      if (error instanceof ServiceKeyConflictError) {
        return res.status(409).json(SERVICE_KEY_CONFLICT_RESPONSE);
      }
      logger.error("SERVICE_CATALOG_POST_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }
  });

  router.patch("/:serviceId", async (req, res) => {
    if (req.membership.role !== "owner") {
      return res.status(403).json(INSUFFICIENT_ROLE_RESPONSE);
    }
    const idValidation = validateServiceId(req.params.serviceId);
    if (idValidation.error) return sendValidationError(res, idValidation);
    const patchValidation = validateServicePatch(req.body);
    if (patchValidation.error) return sendValidationError(res, patchValidation);

    try {
      const updated = await service.updateByIdAndWorkspaceId(
        idValidation.value,
        req.workspaceId,
        patchValidation.value,
      );
      return res.status(200).json(updated);
    } catch (error) {
      if (error instanceof ServiceNotFoundError) {
        return res.status(404).json(NOT_FOUND_RESPONSE);
      }
      logger.error("SERVICE_CATALOG_PATCH_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }
  });

  return router;
}

module.exports = {
  createServiceCatalogRouter,
};
