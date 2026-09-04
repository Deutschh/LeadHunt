const express = require("express");
const {
  CommercialProfileStateError,
} = require("../services/commercialProfileService");

const INTERNAL_ERROR_RESPONSE = Object.freeze({
  error: "Erro na geração inteligente.",
  code: "INTERNAL_ERROR",
});

const PROFILE_CONFLICT_RESPONSE = Object.freeze({
  error: "O perfil comercial deste workspace está indisponível.",
  code: "COMMERCIAL_PROFILE_STATE_CONFLICT",
});

function createLeadMessageRouter({
  repository,
  commercialAiContextService,
  aiService,
  batchIdFactory = () => `gen_${Date.now()}`,
  logger = console,
}) {
  if (
    !repository ||
    typeof repository.findEligibleByWorkspaceId !== "function" ||
    typeof repository.isAiEnabledByWorkspaceId !== "function" ||
    typeof repository.updateGeneratedMessageByIdAndWorkspaceId !==
      "function" ||
    typeof repository.findLatestBatchIdByWorkspaceId !== "function" ||
    typeof repository.findByBatchIdAndWorkspaceId !== "function" ||
    !commercialAiContextService ||
    typeof commercialAiContextService.prepareBatchContext !== "function" ||
    !aiService ||
    typeof aiService.generateLeadMessage !== "function"
  ) {
    throw new TypeError("Dependências da geração comercial são obrigatórias.");
  }

  const router = express.Router();

  router.post("/", async (req, res) => {
    const workspaceId = req.workspaceId;
    const {
      limit = 10,
      minRating = 0,
      status = "pending",
      category,
      categories = [],
      random = false,
    } = req.body || {};
    const selectedCategories = Array.isArray(categories)
      ? categories.filter(Boolean)
      : [];
    const batchId = batchIdFactory();

    try {
      const leads = await repository.findEligibleByWorkspaceId(workspaceId, {
        limit: Number(limit),
        minRating,
        status,
        category,
        categories: selectedCategories,
        random: random === true,
      });

      if (leads.length === 0) {
        return res.json({
          success: false,
          batch_id: batchId,
          count: 0,
          message: "Nenhum lead encontrado com esses critérios.",
          generated_leads: [],
        });
      }

      const [aiEnabled, batchContext] = await Promise.all([
        repository.isAiEnabledByWorkspaceId(workspaceId),
        commercialAiContextService.prepareBatchContext(workspaceId, leads),
      ]);
      const generatedLeads = [];

      for (const lead of leads) {
        try {
          const generated = await aiService.generateLeadMessage({
            context: batchContext.forLead(lead),
            aiEnabled,
          });
          const updated =
            await repository.updateGeneratedMessageByIdAndWorkspaceId(
              lead.id,
              workspaceId,
              batchId,
              generated,
            );

          if (!updated) {
            logger.error?.("COMMERCIAL_AI_LEAD_UPDATE_NOT_FOUND", {
              leadId: lead.id,
            });
            continue;
          }
          generatedLeads.push(updated);
        } catch (_error) {
          logger.error?.("COMMERCIAL_AI_LEAD_GENERATION_FAILED", {
            leadId: lead.id,
          });
        }
      }

      return res.json({
        success: true,
        batch_id: batchId,
        count: generatedLeads.length,
        message: `${generatedLeads.length} mensagens neutras geradas com sucesso!`,
        generated_leads: generatedLeads,
      });
    } catch (error) {
      if (error instanceof CommercialProfileStateError) {
        return res.status(409).json(PROFILE_CONFLICT_RESPONSE);
      }
      logger.error?.("COMMERCIAL_AI_BATCH_FAILED");
      return res.status(500).json(INTERNAL_ERROR_RESPONSE);
    }
  });

  router.get("/last", async (req, res) => {
    const workspaceId = req.workspaceId;
    try {
      const batchId =
        await repository.findLatestBatchIdByWorkspaceId(workspaceId);
      if (!batchId) {
        return res.json({
          success: true,
          batch_id: null,
          count: 0,
          leads: [],
        });
      }

      const leads = await repository.findByBatchIdAndWorkspaceId(
        batchId,
        workspaceId,
      );
      return res.json({
        success: true,
        batch_id: batchId,
        count: leads.length,
        leads,
      });
    } catch (_error) {
      logger.error?.("COMMERCIAL_AI_LAST_BATCH_FAILED");
      return res
        .status(500)
        .json({ error: "Erro ao buscar última geração." });
    }
  });

  return router;
}

module.exports = {
  createLeadMessageRouter,
};
