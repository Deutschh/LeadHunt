const express = require("express");
const router = express.Router();
const db = require("../database/db");

/**
 * Converte uma categoria em uma chave estável para rankings.
 *
 * Exemplo:
 * "Clínica de Estética" -> "clinica_de_estetica"
 */
function normalizeNicheKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "geral";
}

/**
 * Verifica se o lead já respondeu.
 *
 * Utilizamos vários campos porque os leads antigos podem ter
 * sido atualizados por versões diferentes do pipeline.
 */
function hasLeadResponded(lead) {
  const respondedStatuses = [
    "responded",
    "interested",
    "negotiation",
    "closed",
  ];

  const respondedStages = [
    "responded",
    "interested",
    "preview_sent",
    "negotiation",
    "closed",
  ];

  return Boolean(
    lead.responded_at ||
    lead.last_reply_at ||
    respondedStatuses.includes(lead.status) ||
    respondedStages.includes(lead.pipeline_stage),
  );
}

/**
 * Verifica se uma oportunidade já avançou além da seleção.
 */
function hasOpportunityProgress(opportunity) {
  return (
    Number(opportunity.interest_score || 0) > 0 ||
    Number(opportunity.preview_score || 0) > 0 ||
    Number(opportunity.price_score || 0) > 0 ||
    Number(opportunity.closed_score || 0) > 0
  );
}

/**
 * GET /api/service-opportunities/services
 *
 * Retorna o catálogo ativo de serviços da Velaris.
 */
router.get("/services", async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
        service_key,
        service_name,
        service_type,
        problem_category,
        description,
        how_it_works,
        problems_solved,
        target_niches,
        is_active,
        display_order,
        created_at,
        updated_at
      FROM velaris_services
      WHERE is_active = TRUE
      ORDER BY display_order ASC, service_name ASC
    `);

    return res.json({
      success: true,
      count: result.rowCount,
      services: result.rows,
    });
  } catch (error) {
    console.error("Erro ao carregar catálogo de serviços:", error);

    return res.status(500).json({
      success: false,
      error: "Erro ao carregar o catálogo de serviços.",
    });
  }
});

/**
 * GET /api/service-opportunities/leads/:leadId/current
 *
 * Retorna a oportunidade ativa atual de determinado lead.
 *
 * Caso o lead ainda não tenha serviço selecionado,
 * retorna opportunity: null.
 */
router.get("/leads/:leadId/current", async (req, res) => {
  const leadId = Number(req.params.leadId);

  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({
      success: false,
      error: "ID do lead inválido.",
    });
  }

  try {
    const leadResult = await db.query(
      `
      SELECT
        id,
        name,
        status,
        pipeline_stage,
        responded_at,
        last_reply_at,
        lead_category,
        niche,
        lead_city
      FROM leads
      WHERE id = $1
      LIMIT 1
      `,
      [leadId],
    );

    if (leadResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Lead não encontrado.",
      });
    }

    const lead = leadResult.rows[0];

    const opportunityResult = await db.query(
      `
      SELECT
        opportunity.id,
        opportunity.lead_id,
        opportunity.service_id,
        opportunity.lead_category,
        opportunity.niche_key,
        opportunity.analysis_notes,
        opportunity.perceived_goal,
        opportunity.pain_points,
        opportunity.negotiation_guide,
        opportunity.guide_generated_at,

        opportunity.selected_score,
        opportunity.interest_score,
        opportunity.preview_score,
        opportunity.price_score,
        opportunity.closed_score,
        opportunity.total_score,

        opportunity.is_active,
        opportunity.selected_at,
        opportunity.interest_marked_at,
        opportunity.preview_marked_at,
        opportunity.price_marked_at,
        opportunity.closed_marked_at,
        opportunity.created_at,
        opportunity.updated_at,

        service.service_key,
        service.service_name,
        service.service_type,
        service.problem_category,
        service.description,
        service.how_it_works,
        service.problems_solved,
        service.target_niches,
        service.display_order

      FROM lead_service_opportunities opportunity

      INNER JOIN velaris_services service
        ON service.id = opportunity.service_id

      WHERE opportunity.lead_id = $1
        AND opportunity.is_active = TRUE

      LIMIT 1
      `,
      [leadId],
    );

    return res.json({
      success: true,

      lead: {
        id: lead.id,
        name: lead.name,
        status: lead.status,
        pipeline_stage: lead.pipeline_stage,
        lead_category: lead.lead_category,
        niche: lead.niche,
        lead_city: lead.lead_city,
        has_responded: hasLeadResponded(lead),
      },

      opportunity:
        opportunityResult.rowCount > 0 ? opportunityResult.rows[0] : null,
    });
  } catch (error) {
    console.error("Erro ao buscar oportunidade atual:", error);

    return res.status(500).json({
      success: false,
      error: "Erro ao buscar a oportunidade atual do lead.",
    });
  }
});

/**
 * POST /api/service-opportunities/leads/:leadId/select
 *
 * Seleciona ou troca o serviço em negociação.
 *
 * Body:
 * {
 *   "service_id": 5,
 *   "confirm_reset": false
 * }
 *
 * Também é permitido:
 * {
 *   "service_key": "scheduling",
 *   "confirm_reset": false
 * }
 */
router.post("/leads/:leadId/select", async (req, res) => {
  const leadId = Number(req.params.leadId);

  const { service_id, service_key, confirm_reset = false } = req.body;

  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({
      success: false,
      error: "ID do lead inválido.",
    });
  }

  if (!service_id && !service_key) {
    return res.status(400).json({
      success: false,
      error: "Informe service_id ou service_key.",
    });
  }

  if (
    service_id !== undefined &&
    (!Number.isInteger(Number(service_id)) || Number(service_id) <= 0)
  ) {
    return res.status(400).json({
      success: false,
      error: "service_id inválido.",
    });
  }

  if (service_key !== undefined && typeof service_key !== "string") {
    return res.status(400).json({
      success: false,
      error: "service_key inválido.",
    });
  }

  try {
    /*
     * 1. Buscar o lead.
     */
    const leadResult = await db.query(
      `
      SELECT
        id,
        name,
        status,
        pipeline_stage,
        responded_at,
        last_reply_at,
        lead_category,
        niche,
        lead_city
      FROM leads
      WHERE id = $1
      LIMIT 1
      `,
      [leadId],
    );

    if (leadResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Lead não encontrado.",
      });
    }

    const lead = leadResult.rows[0];

    /*
     * 2. Impedir seleção antes da resposta.
     */
    if (!hasLeadResponded(lead)) {
      return res.status(409).json({
        success: false,
        code: "LEAD_HAS_NOT_RESPONDED",
        error: "O serviço só pode ser selecionado depois que o lead responder.",
      });
    }

    /*
     * 3. Buscar o serviço informado.
     */
    let serviceResult;

    if (service_id) {
      serviceResult = await db.query(
        `
        SELECT *
        FROM velaris_services
        WHERE id = $1
          AND is_active = TRUE
        LIMIT 1
        `,
        [Number(service_id)],
      );
    } else {
      serviceResult = await db.query(
        `
        SELECT *
        FROM velaris_services
        WHERE service_key = $1
          AND is_active = TRUE
        LIMIT 1
        `,
        [service_key.trim()],
      );
    }

    if (serviceResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Serviço ativo não encontrado.",
      });
    }

    const selectedService = serviceResult.rows[0];

    /*
     * 4. Buscar oportunidade ativa existente.
     */
    const currentOpportunityResult = await db.query(
      `
      SELECT *
      FROM lead_service_opportunities
      WHERE lead_id = $1
        AND is_active = TRUE
      LIMIT 1
      `,
      [leadId],
    );

    const leadCategory = lead.lead_category || lead.niche || "Geral";

    const nicheKey = normalizeNicheKey(leadCategory);

    /*
     * 5. Criar uma oportunidade nova.
     */
    if (currentOpportunityResult.rowCount === 0) {
      const insertResult = await db.query(
        `
        INSERT INTO lead_service_opportunities (
          lead_id,
          service_id,
          lead_category,
          niche_key,
          selected_score,
          interest_score,
          preview_score,
          price_score,
          closed_score,
          is_active
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          1,
          0,
          0,
          0,
          0,
          TRUE
        )
        RETURNING *
        `,
        [leadId, selectedService.id, leadCategory, nicheKey],
      );

      return res.status(201).json({
        success: true,
        action: "created",
        message: "Serviço selecionado com sucesso.",
        service: selectedService,
        opportunity: insertResult.rows[0],
      });
    }

    const currentOpportunity = currentOpportunityResult.rows[0];

    /*
     * 6. Selecionar o mesmo serviço novamente não altera dados.
     */
    if (Number(currentOpportunity.service_id) === Number(selectedService.id)) {
      return res.json({
        success: true,
        action: "unchanged",
        message: "Este serviço já está selecionado para o lead.",
        service: selectedService,
        opportunity: currentOpportunity,
      });
    }

    const opportunityHasProgress = hasOpportunityProgress(currentOpportunity);

    /*
     * 7. Se a negociação avançou, exigir confirmação.
     */
    if (opportunityHasProgress && confirm_reset !== true) {
      const currentServiceResult = await db.query(
        `
        SELECT
          id,
          service_key,
          service_name,
          problem_category
        FROM velaris_services
        WHERE id = $1
        LIMIT 1
        `,
        [currentOpportunity.service_id],
      );

      return res.status(409).json({
        success: false,
        code: "SERVICE_CHANGE_REQUIRES_CONFIRMATION",
        requires_confirmation: true,

        error:
          "A oportunidade já possui progresso. A troca apagará a análise, o guia e a pontuação atual.",

        current_service: currentServiceResult.rows[0] || null,

        requested_service: {
          id: selectedService.id,
          service_key: selectedService.service_key,
          service_name: selectedService.service_name,
          problem_category: selectedService.problem_category,
        },

        current_progress: {
          selected_score: currentOpportunity.selected_score,
          interest_score: currentOpportunity.interest_score,
          preview_score: currentOpportunity.preview_score,
          price_score: currentOpportunity.price_score,
          closed_score: currentOpportunity.closed_score,
          total_score: currentOpportunity.total_score,
        },
      });
    }

    /*
     * 8. Trocar serviço e reiniciar os dados da oportunidade.
     *
     * Mesmo sem progresso, a análise e o guia são removidos porque
     * foram criados para o serviço anterior.
     */
    const updateResult = await db.query(
      `
      UPDATE lead_service_opportunities
      SET
        service_id = $2,
        lead_category = $3,
        niche_key = $4,

        analysis_notes = NULL,
        perceived_goal = NULL,
        pain_points = '[]'::jsonb,

        negotiation_guide = NULL,
        guide_generated_at = NULL,

        selected_score = 1,
        interest_score = 0,
        preview_score = 0,
        price_score = 0,
        closed_score = 0,

        selected_at = NOW(),
        interest_marked_at = NULL,
        preview_marked_at = NULL,
        price_marked_at = NULL,
        closed_marked_at = NULL

      WHERE id = $1
      RETURNING *
      `,
      [currentOpportunity.id, selectedService.id, leadCategory, nicheKey],
    );

    return res.json({
      success: true,
      action: "changed",
      progress_was_reset: opportunityHasProgress,
      message: opportunityHasProgress
        ? "Serviço alterado e progresso reiniciado."
        : "Serviço alterado com sucesso.",
      service: selectedService,
      opportunity: updateResult.rows[0],
    });
  } catch (error) {
    /*
     * O índice único parcial também protege contra duas
     * oportunidades ativas criadas simultaneamente.
     */
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Este lead já possui uma oportunidade ativa.",
      });
    }

    console.error("Erro ao selecionar serviço:", error);

    return res.status(500).json({
      success: false,
      error: "Erro ao selecionar o serviço para o lead.",
    });
  }
});

module.exports = router;
