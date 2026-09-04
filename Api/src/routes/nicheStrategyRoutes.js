const express = require("express");
const {
  NicheStrategyNotFoundError,
} = require("../services/nicheStrategyService");
const {
  validateNicheStrategyId,
  validateNicheStrategyPayload,
} = require("../validation/nicheStrategyValidation");

const INSUFFICIENT_ROLE_RESPONSE = Object.freeze({
  error: "Você não tem permissão para alterar estratégias de nicho.",
  code: "INSUFFICIENT_WORKSPACE_ROLE",
});
const NOT_FOUND_RESPONSE = Object.freeze({
  error: "Estratégia de nicho não encontrada.",
  code: "NOT_FOUND",
});
const INTERNAL_ERROR_RESPONSE = Object.freeze({
  error: "Erro interno ao processar estratégias de nicho.",
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

function createNicheStrategyRouter({ service, logger = console }) {
  if (
    !service ||
    typeof service.listByWorkspaceId !== "function" ||
    typeof service.upsertByWorkspaceId !== "function" ||
    typeof service.deleteByIdAndWorkspaceId !== "function"
  ) {
    throw new TypeError("Service de estratégias de nicho é obrigatório.");
  }

  const router = express.Router();

  router.get("/", async (req, res) => {
    try {
      const strategies = await service.listByWorkspaceId(req.workspaceId);
      return res.status(200).json(strategies);
    } catch (_error) {
      logger.error("NICHE_STRATEGY_GET_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }
  });

  router.post("/", async (req, res) => {
    if (req.membership.role !== "owner") {
      return res.status(403).json(INSUFFICIENT_ROLE_RESPONSE);
    }

    const validation = validateNicheStrategyPayload(req.body);
    if (validation.error) return sendValidationError(res, validation);

    try {
      const strategy = await service.upsertByWorkspaceId(
        req.workspaceId,
        validation.value,
      );
      return res.status(200).json(strategy);
    } catch (_error) {
      logger.error("NICHE_STRATEGY_POST_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }
  });

  router.delete("/:id", async (req, res) => {
    if (req.membership.role !== "owner") {
      return res.status(403).json(INSUFFICIENT_ROLE_RESPONSE);
    }

    const validation = validateNicheStrategyId(req.params.id);
    if (validation.error) return sendValidationError(res, validation);

    try {
      await service.deleteByIdAndWorkspaceId(
        validation.value,
        req.workspaceId,
      );
      return res.status(200).json({
        message: "Estratégia de nicho removida com sucesso.",
      });
    } catch (error) {
      if (error instanceof NicheStrategyNotFoundError) {
        return res.status(404).json(NOT_FOUND_RESPONSE);
      }
      logger.error("NICHE_STRATEGY_DELETE_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }
  });

  return router;
}

module.exports = {
  createNicheStrategyRouter,
};
