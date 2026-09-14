const express = require("express");
const {
  AdminWorkspaceNotFoundError,
} = require("../services/adminWorkspaceService");
const {
  validateEmptyQuery,
  validateWorkspaceAuditQuery,
  validateWorkspaceId,
  validateWorkspaceListQuery,
} = require("../validation/adminWorkspaceValidation");

const NOT_FOUND_RESPONSE = Object.freeze({
  error: "Workspace não encontrado.",
  code: "NOT_FOUND",
});
const INTERNAL_ERROR_RESPONSE = Object.freeze({
  error: "Erro interno ao consultar workspaces administrativos.",
  code: "INTERNAL_ERROR",
});

function setAdminNoStore(_req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

function sendValidationError(res, validation) {
  const { status, code, message, fieldErrors } = validation.error;
  return res.status(status).json({
    error: message,
    code,
    ...(fieldErrors ? { fieldErrors } : {}),
  });
}

function createAdminRouter({ workspaceService, logger = console } = {}) {
  if (
    !workspaceService ||
    typeof workspaceService.listWorkspaces !== "function" ||
    typeof workspaceService.getWorkspaceDetails !== "function" ||
    typeof workspaceService.listWorkspaceAudit !== "function"
  ) {
    throw new TypeError("Service administrativo de workspaces é obrigatório.");
  }

  const router = express.Router();

  router.get("/me", (_req, res) => {
    return res.status(200).json({ admin: true });
  });

  router.get("/workspaces", async (req, res) => {
    const validation = validateWorkspaceListQuery(req.query);
    if (validation.error) return sendValidationError(res, validation);

    try {
      const result = await workspaceService.listWorkspaces(validation.value);
      return res.status(200).json(result);
    } catch (_error) {
      logger.error("ADMIN_WORKSPACES_LIST_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }
  });

  router.get("/workspaces/:workspaceId/audit", async (req, res) => {
    const idValidation = validateWorkspaceId(req.params.workspaceId);
    if (idValidation.error) return sendValidationError(res, idValidation);
    const queryValidation = validateWorkspaceAuditQuery(req.query);
    if (queryValidation.error) return sendValidationError(res, queryValidation);

    try {
      const result = await workspaceService.listWorkspaceAudit(
        idValidation.value,
        queryValidation.value,
      );
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof AdminWorkspaceNotFoundError) {
        return res.status(404).json(NOT_FOUND_RESPONSE);
      }
      logger.error("ADMIN_WORKSPACE_AUDIT_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }
  });

  router.get("/workspaces/:workspaceId", async (req, res) => {
    const idValidation = validateWorkspaceId(req.params.workspaceId);
    if (idValidation.error) return sendValidationError(res, idValidation);
    const queryValidation = validateEmptyQuery(req.query);
    if (queryValidation.error) return sendValidationError(res, queryValidation);

    try {
      const result = await workspaceService.getWorkspaceDetails(
        idValidation.value,
      );
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof AdminWorkspaceNotFoundError) {
        return res.status(404).json(NOT_FOUND_RESPONSE);
      }
      logger.error("ADMIN_WORKSPACE_DETAILS_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }
  });

  return router;
}

module.exports = {
  INTERNAL_ERROR_RESPONSE,
  NOT_FOUND_RESPONSE,
  createAdminRouter,
  setAdminNoStore,
};
