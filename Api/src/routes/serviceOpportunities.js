const express = require("express");
const router = express.Router();
const db = require("../database/db");
const {
  generateNegotiationGuide,
} = require("../services/negotiationGuideService");
const { createLeadEvent } = require("../services/eventService");

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
    "qualified",
    "interested",
    "negotiation",
    "closed",
  ];

  const respondedStages = [
    "responded",
    "qualified",
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

const ALLOWED_ANALYSIS_PAIN_POINTS = [
  "Organização",
  "Credibilidade",
  "Aquisição de clientes",
  "Atendimento",
  "Processos internos",
  "Visibilidade local",
  "Conversão",
  "Agilidade",
  "Prospecção",
  "Outro",
];

function normalizeTextField(value, maxLength) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().slice(0, maxLength);
}

function normalizePainPoints(painPoints) {
  if (!Array.isArray(painPoints)) {
    return [];
  }

  return [
    ...new Set(
      painPoints.map((item) => String(item || "").trim()).filter(Boolean),
    ),
  ];
}

const PROGRESS_EVENTS = {
  interest: {
    opportunityField: "interest_score",
    points: 1,
    leadEventType: "interest_confirmed",
    activityDescription: "Interesse confirmado no serviço em negociação.",
  },

  preview: {
    opportunityField: "preview_score",
    points: 1,
    leadEventType: "preview_sent",
    activityDescription: "Preview ou demonstração apresentado ao lead.",
  },

  price: {
    opportunityField: "price_score",
    points: 1,
    leadEventType: "price_requested",
    activityDescription: "Lead avançou para conversa sobre preço.",
  },

  closed: {
    opportunityField: "closed_score",
    points: 4,
    leadEventType: "deal_closed",
    activityDescription: "Negócio fechado e atribuído ao serviço selecionado.",
  },
};

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
        analysis_notes = NULL,
        perceived_goal = NULL,
        pain_points = '[]'::jsonb,
        analysis_updated_at = NULL,

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

/**
 * GET /api/service-opportunities/leads/:leadId/recommendations
 *
 * Retorna o ranking de serviços para o nicho do lead.
 *
 * Regras:
 * - disponível somente depois que o lead responder;
 * - calcula o score médio por nicho e serviço;
 * - retorna os três primeiros;
 * - retorna também todos os serviços ativos;
 * - quando não há histórico, usa display_order.
 */
router.get("/leads/:leadId/recommendations", async (req, res) => {
  const leadId = Number(req.params.leadId);

  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({
      success: false,
      error: "ID do lead inválido.",
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
        lead_city,
        has_website,
        rating,
        reviews_count
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

    const leadCategory = lead.lead_category || lead.niche || "Geral";

    const nicheKey = normalizeNicheKey(leadCategory);

    const hasResponded = hasLeadResponded(lead);

    /*
     * 2. Não apresentar recomendações antes da resposta.
     *
     * Retornamos status 200 para facilitar o uso no frontend.
     */
    if (!hasResponded) {
      return res.json({
        success: true,
        available: false,
        code: "LEAD_HAS_NOT_RESPONDED",
        message: "As recomendações estarão disponíveis após o lead responder.",

        lead: {
          id: lead.id,
          name: lead.name,
          lead_category: leadCategory,
          niche_key: nicheKey,
          has_responded: false,
        },

        top_recommendations: [],
        all_services: [],
      });
    }

    /*
     * 3. Buscar o serviço atualmente selecionado,
     * caso exista.
     */
    const currentOpportunityResult = await db.query(
      `
      SELECT
        id,
        service_id
      FROM lead_service_opportunities
      WHERE lead_id = $1
        AND is_active = TRUE
      LIMIT 1
      `,
      [leadId],
    );

    const selectedServiceId =
      currentOpportunityResult.rows[0]?.service_id || null;

    /*
     * 4. Calcular o ranking.
     *
     * score médio =
     * soma de total_score
     * ÷ quantidade de oportunidades
     */
    const rankingResult = await db.query(
      `
      WITH service_stats AS (
        SELECT
          service_id,

          COUNT(*)::integer AS times_selected,

          COALESCE(
            SUM(total_score),
            0
          )::integer AS total_points,

          ROUND(
            AVG(total_score)::numeric,
            2
          ) AS average_score

        FROM lead_service_opportunities

        WHERE niche_key = $1

        GROUP BY service_id
      )

      SELECT
        service.id,
        service.service_key,
        service.service_name,
        service.service_type,
        service.problem_category,
        service.description,
        service.how_it_works,
        service.problems_solved,
        service.target_niches,
        service.display_order,

        COALESCE(
          stats.times_selected,
          0
        )::integer AS times_selected,

        COALESCE(
          stats.total_points,
          0
        )::integer AS total_points,

        COALESCE(
          stats.average_score,
          0
        ) AS average_score

      FROM velaris_services service

      LEFT JOIN service_stats stats
        ON stats.service_id = service.id

      WHERE service.is_active = TRUE

      ORDER BY
        CASE
          WHEN COALESCE(stats.times_selected, 0) = 0
          THEN 1
          ELSE 0
        END ASC,

        COALESCE(stats.average_score, 0) DESC,

        COALESCE(stats.times_selected, 0) DESC,

        service.display_order ASC,

        service.service_name ASC
      `,
      [nicheKey],
    );

    /*
     * 5. Preparar os dados para o frontend.
     */
    const recommendations = rankingResult.rows.map((service, index) => {
      const timesSelected = Number(service.times_selected || 0);

      const totalPoints = Number(service.total_points || 0);

      const averageScore = Number(service.average_score || 0);

      let sampleStatus = "Sem histórico";

      if (timesSelected >= 10) {
        sampleStatus = "Histórico relevante";
      } else if (timesSelected >= 5) {
        sampleStatus = "Histórico inicial";
      } else if (timesSelected >= 1) {
        sampleStatus = "Amostra pequena";
      }

      return {
        rank: index + 1,

        id: service.id,
        service_id: service.id,
        service_key: service.service_key,
        service_name: service.service_name,
        service_type: service.service_type,
        problem_category: service.problem_category,

        description: service.description,
        how_it_works: service.how_it_works,
        problems_solved: service.problems_solved || [],
        target_niches: service.target_niches || [],

        display_order: service.display_order,

        times_selected: timesSelected,
        total_points: totalPoints,
        average_score: averageScore,

        has_history: timesSelected > 0,
        sample_status: sampleStatus,

        is_selected:
          selectedServiceId !== null &&
          Number(selectedServiceId) === Number(service.id),
      };
    });

    return res.json({
      success: true,
      available: true,

      lead: {
        id: lead.id,
        name: lead.name,
        lead_category: leadCategory,
        niche_key: nicheKey,
        lead_city: lead.lead_city,
        has_website: lead.has_website,
        rating: Number(lead.rating || 0),
        reviews_count: Number(lead.reviews_count || 0),
        has_responded: true,
      },

      ranking_summary: {
        total_services: recommendations.length,

        services_with_history: recommendations.filter(
          (service) => service.has_history,
        ).length,

        selected_service_id: selectedServiceId
          ? Number(selectedServiceId)
          : null,
      },

      top_recommendations: recommendations.slice(0, 3),

      all_services: recommendations,
    });
  } catch (error) {
    console.error("Erro ao calcular recomendações de serviços:", error);

    return res.status(500).json({
      success: false,
      error: "Erro ao calcular as recomendações de serviços.",
    });
  }
});

/**
 * PATCH /api/service-opportunities/leads/:leadId/analysis
 *
 * Salva a análise humana da oportunidade ativa.
 *
 * Campos:
 * - analysis_notes
 * - perceived_goal
 * - pain_points
 */
router.patch("/leads/:leadId/analysis", async (req, res) => {
  const leadId = Number(req.params.leadId);

  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({
      success: false,
      code: "INVALID_LEAD_ID",
      error: "ID do lead inválido.",
    });
  }

  const body = req.body || {};

  const hasAnalysisNotes = Object.prototype.hasOwnProperty.call(
    body,
    "analysis_notes",
  );

  const hasPerceivedGoal = Object.prototype.hasOwnProperty.call(
    body,
    "perceived_goal",
  );

  const hasPainPoints = Object.prototype.hasOwnProperty.call(
    body,
    "pain_points",
  );

  if (!hasAnalysisNotes && !hasPerceivedGoal && !hasPainPoints) {
    return res.status(400).json({
      success: false,
      code: "NO_ANALYSIS_FIELDS",
      error: "Envie ao menos um campo da análise para atualizar.",
    });
  }

  if (hasPainPoints && !Array.isArray(body.pain_points)) {
    return res.status(400).json({
      success: false,
      code: "INVALID_PAIN_POINTS",
      error: "pain_points deve ser uma lista.",
    });
  }

  const analysisNotes = normalizeTextField(body.analysis_notes, 5000);

  const perceivedGoal = normalizeTextField(body.perceived_goal, 2000);

  const painPoints = normalizePainPoints(body.pain_points);

  if (painPoints.length > 10) {
    return res.status(400).json({
      success: false,
      code: "TOO_MANY_PAIN_POINTS",
      error: "Selecione no máximo 10 dores principais.",
    });
  }

  const invalidPainPoints = painPoints.filter(
    (painPoint) => !ALLOWED_ANALYSIS_PAIN_POINTS.includes(painPoint),
  );

  if (invalidPainPoints.length > 0) {
    return res.status(400).json({
      success: false,
      code: "UNKNOWN_PAIN_POINTS",
      error: "Uma ou mais dores selecionadas são inválidas.",
      invalid_pain_points: invalidPainPoints,
      allowed_pain_points: ALLOWED_ANALYSIS_PAIN_POINTS,
    });
  }

  try {
    const result = await db.query(
      `
  UPDATE lead_service_opportunities
  SET
    analysis_notes =
      CASE
        WHEN $2::boolean = TRUE
        THEN $3
        ELSE analysis_notes
      END,

    perceived_goal =
      CASE
        WHEN $4::boolean = TRUE
        THEN $5
        ELSE perceived_goal
      END,

    pain_points =
      CASE
        WHEN $6::boolean = TRUE
        THEN $7::jsonb
        ELSE pain_points
      END,

    analysis_updated_at = NOW()

  WHERE lead_id = $1
    AND is_active = TRUE

  RETURNING *
  `,
      [
        leadId,
        hasAnalysisNotes,
        analysisNotes,
        hasPerceivedGoal,
        perceivedGoal,
        hasPainPoints,
        JSON.stringify(painPoints),
      ],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        code: "ACTIVE_OPPORTUNITY_NOT_FOUND",
        error: "Este lead não possui um serviço ativo em negociação.",
      });
    }

    const opportunity = result.rows[0];

    const serviceResult = await db.query(
      `
      SELECT
        id,
        service_key,
        service_name,
        service_type,
        problem_category,
        description,
        how_it_works,
        problems_solved,
        target_niches
      FROM velaris_services
      WHERE id = $1
      LIMIT 1
      `,
      [opportunity.service_id],
    );

    const service = serviceResult.rows[0] || null;

    const hasGuide = Boolean(opportunity.negotiation_guide);

    const guideIsOutdated = Boolean(
      hasGuide &&
      opportunity.guide_generated_at &&
      opportunity.analysis_updated_at &&
      new Date(opportunity.analysis_updated_at).getTime() >
        new Date(opportunity.guide_generated_at).getTime(),
    );

    return res.json({
      success: true,
      message: "Análise comercial salva com sucesso.",

      analysis: {
        analysis_notes: opportunity.analysis_notes || "",
        perceived_goal: opportunity.perceived_goal || "",
        pain_points: opportunity.pain_points || [],
      },

      guide_status: {
        has_guide: hasGuide,
        is_outdated: guideIsOutdated,
        generated_at: opportunity.guide_generated_at || null,
      },

      service,

      opportunity,
    });
  } catch (error) {
    console.error("Erro ao salvar análise comercial:", error);

    return res.status(500).json({
      success: false,
      error: "Erro ao salvar a análise comercial.",
    });
  }
});

/**
 * POST /api/service-opportunities/leads/:leadId/guide
 *
 * Gera ou regenera o guia de negociação
 * da oportunidade ativa.
 */
router.post("/leads/:leadId/guide", async (req, res) => {
  const leadId = Number(req.params.leadId);

  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({
      success: false,
      code: "INVALID_LEAD_ID",
      error: "ID do lead inválido.",
    });
  }

  try {
    const contextResult = await db.query(
      `
          SELECT
            l.id AS lead_id,
            l.name AS lead_name,
            l.lead_category,
            l.niche,
            l.lead_city,
            l.rating,
            l.reviews_count,
            l.has_website,
            l.status AS lead_status,
            l.pipeline_stage,
            l.preview_sent,
            l.price_requested,
            l.market_observation,
            l.internal_notes,
            l.custom_message,
            l.ai_message_suggestion,
            l.responded_at,
            l.last_reply_at,

            opportunity.id
              AS opportunity_id,

            opportunity.service_id,
            opportunity.analysis_notes,
            opportunity.perceived_goal,
            opportunity.pain_points,
            opportunity.negotiation_guide,
            opportunity.guide_generated_at,
            opportunity.analysis_notes,
            opportunity.perceived_goal,
            opportunity.pain_points,
            opportunity.negotiation_guide,
            opportunity.guide_generated_at,
            opportunity.analysis_updated_at,
            opportunity.interest_score,
            opportunity.preview_score,
            opportunity.price_score,
            opportunity.closed_score,
            opportunity.total_score,

            service.service_key,
            service.service_name,
            service.service_type,
            service.problem_category,
            service.description
              AS service_description,
            service.how_it_works,
            service.problems_solved,
            service.target_niches

          FROM leads l

          INNER JOIN
            lead_service_opportunities
              opportunity
            ON opportunity.lead_id = l.id
           AND opportunity.is_active = TRUE

          INNER JOIN
            velaris_services service
            ON service.id =
              opportunity.service_id

          WHERE l.id = $1
          LIMIT 1
          `,
      [leadId],
    );

    if (contextResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        code: "ACTIVE_OPPORTUNITY_NOT_FOUND",

        error: "Este lead não possui um serviço ativo em negociação.",
      });
    }

    const row = contextResult.rows[0];

    const painPoints = Array.isArray(row.pain_points) ? row.pain_points : [];

    const hasAnalysis = Boolean(
      String(row.analysis_notes || "").trim() ||
      String(row.perceived_goal || "").trim() ||
      painPoints.length > 0,
    );

    if (!hasAnalysis) {
      return res.status(400).json({
        success: false,
        code: "ANALYSIS_REQUIRED",

        error: "Preencha e salve a análise comercial antes de gerar o guia.",
      });
    }

    const activitiesResult = await db.query(
      `
          SELECT
            type,
            description,
            created_at
          FROM lead_activities
          WHERE lead_id = $1
          ORDER BY created_at DESC
          LIMIT 20
          `,
      [leadId],
    );

    const hadPreviousGuide = Boolean(row.negotiation_guide);

    const context = {
      lead: {
        id: row.lead_id,
        name: row.lead_name,

        category: row.lead_category || row.niche || "Não informado",

        city: row.lead_city || "Não informada",

        google_rating: row.rating ?? null,

        google_reviews: row.reviews_count ?? null,

        has_website: row.has_website ?? null,

        status: row.lead_status,

        pipeline_stage: row.pipeline_stage,

        has_responded: Boolean(row.responded_at || row.last_reply_at),

        preview_sent: Boolean(row.preview_sent),

        price_requested: Boolean(row.price_requested),
      },

      selected_service: {
        id: row.service_id,
        key: row.service_key,
        name: row.service_name,

        type: row.service_type,

        problem_category: row.problem_category,

        description: row.service_description,

        how_it_works: row.how_it_works,

        problems_solved: row.problems_solved || [],

        target_niches: row.target_niches || [],
      },

      human_analysis: {
        analysis_notes: row.analysis_notes || "",

        perceived_goal: row.perceived_goal || "",

        pain_points: painPoints,
      },

      commercial_context: {
        market_observation: row.market_observation || "",

        internal_notes: row.internal_notes || "",

        initial_message: row.custom_message || row.ai_message_suggestion || "",

        opportunity_score: Number(row.total_score || 0),

        interest_registered: Number(row.interest_score || 0) > 0,

        preview_registered: Number(row.preview_score || 0) > 0,

        price_registered: Number(row.price_score || 0) > 0,

        closed: Number(row.closed_score || 0) > 0,
      },

      recent_activities: activitiesResult.rows.map((activity) => ({
        type: activity.type,

        description: activity.description,

        created_at: activity.created_at,
      })),
    };

    let guide;

    try {
      guide = await generateNegotiationGuide(context);
    } catch (generationError) {
      console.error("Erro na geração do guia:", generationError);

      return res.status(502).json({
        success: false,
        code: "GUIDE_GENERATION_FAILED",

        error: "A IA não conseguiu gerar um guia válido.",

        details: generationError.message,
      });
    }

    /*
     * A oportunidade pode ter sido trocada
     * enquanto a IA estava processando.
     * Por isso validamos novamente ID e serviço.
     */
    const saveResult = await db.query(
      `
          UPDATE
            lead_service_opportunities

          SET
            negotiation_guide =
              $1::jsonb,

            guide_generated_at =
              NOW()

          WHERE id = $2
            AND lead_id = $3
            AND service_id = $4
            AND is_active = TRUE

          RETURNING *
          `,
      [JSON.stringify(guide), row.opportunity_id, leadId, row.service_id],
    );

    if (saveResult.rowCount === 0) {
      return res.status(409).json({
        success: false,
        code: "OPPORTUNITY_CHANGED",

        error:
          "O serviço em negociação foi alterado durante a geração. Gere o guia novamente.",
      });
    }

    const opportunity = saveResult.rows[0];

    return res.json({
      success: true,

      action: hadPreviousGuide ? "regenerated" : "generated",

      message: hadPreviousGuide
        ? "Guia de negociação regenerado com sucesso."
        : "Guia de negociação gerado com sucesso.",

      guide,

      guide_status: {
        has_guide: true,
        is_outdated: false,

        generated_at: opportunity.guide_generated_at,

        version: guide.metadata?.version || null,

        model: guide.metadata?.model || null,
      },

      service: {
        id: row.service_id,
        service_key: row.service_key,
        service_name: row.service_name,
        problem_category: row.problem_category,
      },

      opportunity,
    });
  } catch (error) {
    console.error("Erro ao processar guia:", error);

    return res.status(500).json({
      success: false,
      error: "Erro ao gerar o guia de negociação.",
    });
  }
});

/**
 * PATCH /api/service-opportunities/leads/:leadId/progress
 *
 * Body:
 * {
 *   "event": "interest" | "preview" | "price" | "closed",
 *   "sale_value": 500,
 *   "deal_details": {}
 * }
 */
router.patch("/leads/:leadId/progress", async (req, res) => {
  const leadId = Number(req.params.leadId);

  const { event, sale_value = null, deal_details = null } = req.body || {};

  if (!Number.isInteger(leadId) || leadId <= 0) {
    return res.status(400).json({
      success: false,
      code: "INVALID_LEAD_ID",
      error: "ID do lead inválido.",
    });
  }

  if (!PROGRESS_EVENTS[event]) {
    return res.status(400).json({
      success: false,
      code: "INVALID_PROGRESS_EVENT",
      error: "Evento inválido. Use interest, preview, price ou closed.",
      allowed_events: Object.keys(PROGRESS_EVENTS),
    });
  }

  let normalizedSaleValue = null;

  if (sale_value !== null && sale_value !== undefined && sale_value !== "") {
    normalizedSaleValue = Number(sale_value);

    if (!Number.isFinite(normalizedSaleValue) || normalizedSaleValue < 0) {
      return res.status(400).json({
        success: false,
        code: "INVALID_SALE_VALUE",
        error: "Valor da venda inválido.",
      });
    }
  }

  const config = PROGRESS_EVENTS[event];

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    /*
     * Bloqueia o lead durante toda a transação.
     * Isso também protege contra dois cliques simultâneos.
     */
    const leadResult = await client.query(
      `
      SELECT
        id,
        name,
        status,
        pipeline_stage,
        preview_sent,
        price_requested,
        sale_value,
        deal_details
      FROM leads
      WHERE id = $1
      FOR UPDATE
      `,
      [leadId],
    );

    if (leadResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        code: "LEAD_NOT_FOUND",
        error: "Lead não encontrado.",
      });
    }

    const leadBeforeProgress = leadResult.rows[0];

    /*
     * Busca e bloqueia a oportunidade ativa.
     *
     * A ausência de oportunidade não impede o avanço
     * normal do pipeline.
     */
    const opportunityResult = await client.query(
      `
      SELECT
        opportunity.*,
        service.service_key,
        service.service_name,
        service.problem_category
      FROM lead_service_opportunities opportunity

      INNER JOIN velaris_services service
        ON service.id = opportunity.service_id

      WHERE opportunity.lead_id = $1
        AND opportunity.is_active = TRUE

      LIMIT 1

      FOR UPDATE OF opportunity
      `,
      [leadId],
    );

    const currentOpportunity = opportunityResult.rows[0] || null;

    let opportunity = null;
    let alreadyAttributed = false;
    let warning = null;

    /*
     * Atualiza a oportunidade quando existe serviço ativo.
     */
    if (currentOpportunity) {
      alreadyAttributed =
        Number(currentOpportunity[config.opportunityField] || 0) > 0;

      const selectedScore = Math.max(
        1,
        Number(currentOpportunity.selected_score || 1),
      );

      const interestScore =
        event === "interest"
          ? 1
          : Number(currentOpportunity.interest_score || 0);

      const previewScore =
        event === "preview" ? 1 : Number(currentOpportunity.preview_score || 0);

      const priceScore =
        event === "price" ? 1 : Number(currentOpportunity.price_score || 0);

      const closedScore =
        event === "closed" ? 4 : Number(currentOpportunity.closed_score || 0);

      const updatedOpportunityResult = await client.query(
        `
  UPDATE lead_service_opportunities
  SET
    selected_score = $2::smallint,
    interest_score = $3::smallint,
    preview_score = $4::smallint,
    price_score = $5::smallint,
    closed_score = $6::smallint,

    interest_marked_at =
      CASE
        WHEN interest_score = 0
          AND $3::smallint > 0
        THEN NOW()
        ELSE interest_marked_at
      END,

    preview_marked_at =
      CASE
        WHEN preview_score = 0
          AND $4::smallint > 0
        THEN NOW()
        ELSE preview_marked_at
      END,

    price_marked_at =
      CASE
        WHEN price_score = 0
          AND $5::smallint > 0
        THEN NOW()
        ELSE price_marked_at
      END,

    closed_marked_at =
      CASE
        WHEN closed_score = 0
          AND $6::smallint > 0
        THEN NOW()
        ELSE closed_marked_at
      END

  WHERE id = $1

  RETURNING *
  `,
        [
          currentOpportunity.id,
          selectedScore,
          interestScore,
          previewScore,
          priceScore,
          closedScore,
        ],
      );

      opportunity = updatedOpportunityResult.rows[0];
    } else {
      warning =
        "O avanço foi registrado no lead, mas não foi atribuído a um serviço porque não existe oportunidade ativa.";
    }

    /*
     * Atualiza o pipeline principal.
     *
     * Eventos posteriores nunca rebaixam um estágio mais avançado.
     */
    const updatedLeadResult = await client.query(
      `
      UPDATE leads
      SET
        status =
          CASE
            WHEN $2 = 'closed'
              THEN 'closed'

            WHEN $2 = 'price'
              AND status <> 'closed'
              THEN 'negotiation'

            WHEN $2 IN ('interest', 'preview')
              AND status NOT IN (
                'closed',
                'negotiation'
              )
              THEN 'qualified'

            ELSE status
          END,

        pipeline_stage =
          CASE
            WHEN $2 = 'closed'
              THEN 'closed'

            WHEN $2 = 'price'
              AND pipeline_stage <> 'closed'
              THEN 'negotiation'

            WHEN $2 = 'preview'
              AND pipeline_stage NOT IN (
                'closed',
                'negotiation'
              )
              THEN 'preview_sent'

            WHEN $2 = 'interest'
              AND pipeline_stage NOT IN (
                'closed',
                'negotiation',
                'preview_sent'
              )
              THEN 'interested'

            ELSE pipeline_stage
          END,

        preview_sent =
          CASE
            WHEN $2 = 'preview'
              THEN TRUE
            ELSE preview_sent
          END,

        price_requested =
          CASE
            WHEN $2 = 'price'
              THEN TRUE
            ELSE price_requested
          END,

        preview_sent_at =
          CASE
            WHEN $2 = 'preview'
              AND preview_sent_at IS NULL
            THEN NOW()
            ELSE preview_sent_at
          END,

        closed_at =
          CASE
            WHEN $2 = 'closed'
              AND closed_at IS NULL
            THEN NOW()
            ELSE closed_at
          END,

        sale_value =
          CASE
            WHEN $2 = 'closed'
              AND $3::numeric IS NOT NULL
            THEN $3::numeric
            ELSE sale_value
          END,

        deal_details =
          CASE
            WHEN $2 = 'closed'
              AND $4::jsonb IS NOT NULL
            THEN $4::jsonb
            ELSE deal_details
          END,

        temperature_band =
          CASE
            WHEN $2 = 'closed'
              THEN 'converted'
            ELSE temperature_band
          END

      WHERE id = $1

      RETURNING *
      `,
      [
        leadId,
        event,
        normalizedSaleValue,
        deal_details ? JSON.stringify(deal_details) : null,
      ],
    );

    const updatedLead = updatedLeadResult.rows[0];

    /*
     * Evita duplicação em lead_events.
     *
     * O bloqueio do lead com FOR UPDATE garante que duas
     * requisições simultâneas não passem por esse teste.
     */
    const existingEventResult = await client.query(
      `
        SELECT id
        FROM lead_events
        WHERE lead_id = $1
          AND event_type = $2
        LIMIT 1
        `,
      [leadId, config.leadEventType],
    );

    const eventAlreadyExists = existingEventResult.rowCount > 0;

    if (!eventAlreadyExists) {
      await createLeadEvent(
        leadId,
        config.leadEventType,

        event === "closed" && normalizedSaleValue !== null
          ? String(normalizedSaleValue)
          : null,

        "manual",

        {
          progress_event: event,

          attributed_to_opportunity: Boolean(opportunity),

          opportunity_id: opportunity?.id || null,

          service_id: opportunity?.service_id || null,

          service_name: currentOpportunity?.service_name || null,

          opportunity_total_score: opportunity?.total_score || null,

          sale_value: event === "closed" ? normalizedSaleValue : null,
        },

        client,
      );

      const serviceLabel = currentOpportunity?.service_name
        ? ` Serviço: ${currentOpportunity.service_name}.`
        : "";

      await client.query(
        `
        INSERT INTO lead_activities (
          lead_id,
          description,
          type
        )
        VALUES ($1, $2, $3)
        `,
        [
          leadId,
          `${config.activityDescription}${serviceLabel}`,
          `service_${event}`,
        ],
      );
    }

    await client.query("COMMIT");

    const action = currentOpportunity
      ? alreadyAttributed
        ? "unchanged"
        : "applied"
      : "applied_without_opportunity";

    return res.json({
      success: true,
      action,
      event,

      attributed_to_opportunity: Boolean(opportunity),

      already_attributed: alreadyAttributed,

      event_already_registered: eventAlreadyExists,

      message: currentOpportunity
        ? alreadyAttributed
          ? "Este avanço já estava registrado para o serviço."
          : "Avanço comercial registrado com sucesso."
        : "Avanço registrado no lead sem atribuição a um serviço.",

      warning,

      lead: updatedLead,

      opportunity,

      progress: opportunity
        ? {
            selected_score: opportunity.selected_score,

            interest_score: opportunity.interest_score,

            preview_score: opportunity.preview_score,

            price_score: opportunity.price_score,

            closed_score: opportunity.closed_score,

            total_score: opportunity.total_score,

            maximum_score: 8,
          }
        : null,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Erro ao registrar progresso comercial:", error);

    return res.status(500).json({
      success: false,
      error: "Erro ao registrar o progresso comercial.",
    });
  } finally {
    client.release();
  }
});

module.exports = router;
