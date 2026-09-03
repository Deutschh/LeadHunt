const express = require("express");
const {
  CommercialProfileStateError,
} = require("../services/commercialProfileService");
const {
  validateCommercialProfilePatch,
} = require("../validation/commercialProfileValidation");

const STATE_CONFLICT_RESPONSE = Object.freeze({
  error: "O perfil comercial deste workspace está indisponível.",
  code: "COMMERCIAL_PROFILE_STATE_CONFLICT",
});

const INSUFFICIENT_ROLE_RESPONSE = Object.freeze({
  error: "Você não tem permissão para alterar o perfil comercial.",
  code: "INSUFFICIENT_WORKSPACE_ROLE",
});

const INTERNAL_ERROR_RESPONSE = Object.freeze({
  error: "Erro interno ao processar o perfil comercial.",
  code: "INTERNAL_ERROR",
});

function createCommercialProfileRouter({ service, logger = console }) {
  if (
    !service ||
    typeof service.getByWorkspaceId !== "function" ||
    typeof service.updateByWorkspaceId !== "function"
  ) {
    throw new TypeError("Service de perfil comercial é obrigatório.");
  }

  const router = express.Router();

  router.get("/", async (req, res) => {
    try {
      const profile = await service.getByWorkspaceId(req.workspaceId);
      return res.status(200).json(profile);
    } catch (error) {
      if (error instanceof CommercialProfileStateError) {
        return res.status(409).json(STATE_CONFLICT_RESPONSE);
      }
      logger.error("COMMERCIAL_PROFILE_GET_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }
  });

  router.patch("/", async (req, res) => {
    if (req.membership.role !== "owner") {
      return res.status(403).json(INSUFFICIENT_ROLE_RESPONSE);
    }

    const validation = validateCommercialProfilePatch(req.body);
    if (validation.error) {
      const { status, code, message, fieldErrors } = validation.error;
      return res.status(status).json({
        error: message,
        code,
        ...(fieldErrors ? { fieldErrors } : {}),
      });
    }

    try {
      const profile = await service.updateByWorkspaceId(
        req.workspaceId,
        validation.value,
      );
      return res.status(200).json(profile);
    } catch (error) {
      if (error instanceof CommercialProfileStateError) {
        return res.status(409).json(STATE_CONFLICT_RESPONSE);
      }
      logger.error("COMMERCIAL_PROFILE_PATCH_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }
  });

  return router;
}

module.exports = {
  createCommercialProfileRouter,
};
