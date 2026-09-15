const express = require("express");
const {
  ADMIN_ACCESS_DENIED_RESPONSE,
} = require("../middleware/requireAdmin");
const {
  AdminWorkspaceNotFoundError,
} = require("../services/adminWorkspaceService");
const {
  AdminWorkspaceAuthorizationError,
  AdminWorkspaceStatusConflictError,
} = require("../services/adminWorkspaceStatusService");
const {
  AdminWorkspaceMaxProfilesConflictError,
  AdminWorkspaceMaxProfilesValidationError,
} = require("../services/adminWorkspaceMaxProfilesService");
const {
  validateEmptyQuery,
  validateWorkspaceAuditQuery,
  validateWorkspaceId,
  validateWorkspaceListQuery,
} = require("../validation/adminWorkspaceValidation");
const {
  validateAdminWorkspaceStatusBody,
} = require("../validation/adminWorkspaceStatusValidation");
const {
  validateAdminWorkspaceMaxProfilesBody,
} = require("../validation/adminWorkspaceMaxProfilesValidation");

const NOT_FOUND_RESPONSE = Object.freeze({
  error: "Workspace não encontrado.",
  code: "NOT_FOUND",
});
const INTERNAL_ERROR_RESPONSE = Object.freeze({
  error: "Erro interno ao consultar workspaces administrativos.",
  code: "INTERNAL_ERROR",
});
const STATUS_CONFLICT_RESPONSE = Object.freeze({
  error: "O status atual do workspace não permite esta ação.",
  code: "ADMIN_WORKSPACE_STATUS_CONFLICT",
});
const STATUS_INTERNAL_ERROR_RESPONSE = Object.freeze({
  error: "Erro interno ao alterar o status administrativo do workspace.",
  code: "INTERNAL_ERROR",
});
const MAX_PROFILES_CONFLICT_RESPONSE = Object.freeze({
  error: "O limite de perfis foi alterado por outra operação.",
  code: "ADMIN_WORKSPACE_MAX_PROFILES_CONFLICT",
});
const MAX_PROFILES_INTERNAL_ERROR_RESPONSE = Object.freeze({
  error: "Erro interno ao alterar o limite de perfis do workspace.",
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

function createAdminRouter({
  workspaceService,
  workspaceStatusService,
  workspaceMaxProfilesService,
  logger = console,
} = {}) {
  if (
    !workspaceService ||
    typeof workspaceService.listWorkspaces !== "function" ||
    typeof workspaceService.getWorkspaceDetails !== "function" ||
    typeof workspaceService.listWorkspaceAudit !== "function"
  ) {
    throw new TypeError("Service administrativo de workspaces é obrigatório.");
  }
  if (
    !workspaceStatusService ||
    typeof workspaceStatusService.activateWorkspace !== "function" ||
    typeof workspaceStatusService.suspendWorkspace !== "function" ||
    typeof workspaceStatusService.reactivateWorkspace !== "function"
  ) {
    throw new TypeError("Service de status administrativo é obrigatório.");
  }
  if (
    !workspaceMaxProfilesService ||
    typeof workspaceMaxProfilesService.updateMaxProfiles !== "function"
  ) {
    throw new TypeError("Service administrativo de perfis é obrigatório.");
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

  function createStatusHandler(serviceMethod, failureLog) {
    return async (req, res) => {
      const idValidation = validateWorkspaceId(req.params.workspaceId);
      if (idValidation.error) return sendValidationError(res, idValidation);
      const queryValidation = validateEmptyQuery(req.query);
      if (queryValidation.error) return sendValidationError(res, queryValidation);
      const bodyValidation = validateAdminWorkspaceStatusBody(req.body);
      if (bodyValidation.error) return sendValidationError(res, bodyValidation);

      try {
        const result = await serviceMethod({
          actorUserId: req.user.id,
          workspaceId: idValidation.value,
          reason: bodyValidation.value.reason,
        });
        return res.status(200).json(result);
      } catch (error) {
        if (error instanceof AdminWorkspaceAuthorizationError) {
          return res.status(403).json(ADMIN_ACCESS_DENIED_RESPONSE);
        }
        if (error instanceof AdminWorkspaceNotFoundError) {
          return res.status(404).json(NOT_FOUND_RESPONSE);
        }
        if (error instanceof AdminWorkspaceStatusConflictError) {
          return res.status(409).json(STATUS_CONFLICT_RESPONSE);
        }
        logger.error(failureLog);
        return res.status(500).json(STATUS_INTERNAL_ERROR_RESPONSE);
      }
    };
  }

  router.post(
    "/workspaces/:workspaceId/activate",
    createStatusHandler(
      (input) => workspaceStatusService.activateWorkspace(input),
      "ADMIN_WORKSPACE_ACTIVATE_FAILED",
    ),
  );
  router.post(
    "/workspaces/:workspaceId/suspend",
    createStatusHandler(
      (input) => workspaceStatusService.suspendWorkspace(input),
      "ADMIN_WORKSPACE_SUSPEND_FAILED",
    ),
  );
  router.post(
    "/workspaces/:workspaceId/reactivate",
    createStatusHandler(
      (input) => workspaceStatusService.reactivateWorkspace(input),
      "ADMIN_WORKSPACE_REACTIVATE_FAILED",
    ),
  );

  router.patch("/workspaces/:workspaceId/max-profiles", async (req, res) => {
    const idValidation = validateWorkspaceId(req.params.workspaceId);
    if (idValidation.error) return sendValidationError(res, idValidation);
    const queryValidation = validateEmptyQuery(req.query);
    if (queryValidation.error) return sendValidationError(res, queryValidation);
    const bodyValidation = validateAdminWorkspaceMaxProfilesBody(req.body);
    if (bodyValidation.error) return sendValidationError(res, bodyValidation);

    try {
      const result = await workspaceMaxProfilesService.updateMaxProfiles({
        actorUserId: req.user.id,
        workspaceId: idValidation.value,
        maxProfiles: bodyValidation.value.maxProfiles,
        expectedMaxProfiles: bodyValidation.value.expectedMaxProfiles,
        reason: bodyValidation.value.reason,
      });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof AdminWorkspaceAuthorizationError) {
        return res.status(403).json(ADMIN_ACCESS_DENIED_RESPONSE);
      }
      if (error instanceof AdminWorkspaceNotFoundError) {
        return res.status(404).json(NOT_FOUND_RESPONSE);
      }
      if (error instanceof AdminWorkspaceMaxProfilesValidationError) {
        return sendValidationError(res, {
          error: {
            status: 400,
            code: "VALIDATION_ERROR",
            message: "Revise os dados da ação administrativa.",
            fieldErrors: {
              maxProfiles: "must_be_at_least_workspace_min_profiles",
            },
          },
        });
      }
      if (error instanceof AdminWorkspaceMaxProfilesConflictError) {
        return res.status(409).json(MAX_PROFILES_CONFLICT_RESPONSE);
      }
      logger.error("ADMIN_WORKSPACE_MAX_PROFILES_UPDATE_FAILED");
      return res.status(500).json(MAX_PROFILES_INTERNAL_ERROR_RESPONSE);
    }
  });

  return router;
}

module.exports = {
  INTERNAL_ERROR_RESPONSE,
  MAX_PROFILES_CONFLICT_RESPONSE,
  MAX_PROFILES_INTERNAL_ERROR_RESPONSE,
  NOT_FOUND_RESPONSE,
  STATUS_CONFLICT_RESPONSE,
  STATUS_INTERNAL_ERROR_RESPONSE,
  createAdminRouter,
  setAdminNoStore,
};
