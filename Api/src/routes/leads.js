const express = require("express");
const router = express.Router();
const db = require("../database/db");
const { generateLeadMessage } = require("../services/aiService");
const { createLeadEvent } = require("../services/eventService");

function calculateChipAvailability(row) {
  const usage_percent =
    Number(row.daily_limit) > 0
      ? Math.min(
          100,
          Math.round(
            (Number(row.sent_today || 0) / Number(row.daily_limit || 0)) * 100,
          ),
        )
      : 0;

  const isPaused = row.paused_until && new Date(row.paused_until) > new Date();

  return {
    ...row,
    usage_percent,
    is_paused: !!isPaused,
    available_slots: Math.max(
      0,
      Number(row.daily_limit || 0) - Number(row.sent_today || 0),
    ),
    can_send:
      row.is_active === true &&
      row.status === "active" &&
      !isPaused &&
      row.health_status !== "paused" &&
      Number(row.sent_today || 0) < Number(row.daily_limit || 0),
  };
}

// 1. Listar todos os leads do workspace atual
router.get("/", async (req, res) => {
  const workspaceId = req.workspaceId;

  try {
    const result = await db.query(
      `
      SELECT *
      FROM leads
      WHERE workspace_id = $1
      ORDER BY created_at DESC, id DESC
      `,
      [workspaceId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao carregar lista:", err);
    res.status(500).json({ error: "Erro ao carregar lista de leads." });
  }
});

// Listar nichos estratégicos do workspace atual
router.get("/niches", async (req, res) => {
  const workspaceId = req.workspaceId;

  try {
    const result = await db.query(
      `
      SELECT *
      FROM niche_strategies
      WHERE workspace_id = $1
      ORDER BY niche_name ASC
      `,
      [workspaceId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar nichos:", err);
    res.status(500).json({ error: "Erro ao buscar nichos." });
  }
});

// Adicionar ou atualizar nicho dentro do workspace atual
router.post("/niches", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { niche_name, hook, call_to_action } = req.body;

  if (!niche_name || typeof niche_name !== "string" || !niche_name.trim()) {
    return res.status(400).json({ error: "niche_name é obrigatório." });
  }

  try {
    const query = `
      INSERT INTO niche_strategies (
        workspace_id,
        niche_name,
        hook,
        call_to_action
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (workspace_id, niche_name)
      DO UPDATE SET
        hook = EXCLUDED.hook,
        call_to_action = EXCLUDED.call_to_action
      RETURNING *;
    `;

    const result = await db.query(query, [
      workspaceId,
      niche_name.trim(),
      hook,
      call_to_action,
    ]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao salvar nicho:", err);
    res.status(500).json({ error: "Erro ao salvar nicho." });
  }
});

// Deletar nicho somente dentro do workspace atual
router.delete("/niches/:id", async (req, res) => {
  const workspaceId = req.workspaceId;

  try {
    const result = await db.query(
      `
      DELETE FROM niche_strategies
      WHERE id = $1
        AND workspace_id = $2
      RETURNING id
      `,
      [req.params.id, workspaceId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Nicho não encontrado." });
    }

    res.json({ message: "Nicho removido com sucesso." });
  } catch (err) {
    console.error("Erro ao deletar nicho:", err);
    res.status(500).json({ error: "Erro ao deletar nicho." });
  }
});

// Buscar notas ativas
router.get("/notes/active", async (req, res) => {
  const workspaceId = req.workspaceId;

  try {
    const result = await db.query(
      `
      SELECT *
      FROM home_notes
      WHERE workspace_id = $1
        AND (expires_at >= CURRENT_DATE OR expires_at IS NULL)
      ORDER BY created_at DESC
      `,
      [workspaceId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar notas:", err);
    res.status(500).json({ error: "Erro ao buscar notas" });
  }
});

// Criar nota
router.post("/notes", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { title, content, expires_at } = req.body;

  try {
    const result = await db.query(
      `
      INSERT INTO home_notes (
        workspace_id,
        title,
        content,
        expires_at
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [workspaceId, title, content, expires_at || null],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao criar nota:", err);
    res.status(500).json({ error: "Erro ao criar nota" });
  }
});

// Deletar nota
router.delete("/notes/:id", async (req, res) => {
  const workspaceId = req.workspaceId;

  try {
    const result = await db.query(
      `
      DELETE FROM home_notes
      WHERE id = $1
        AND workspace_id = $2
      RETURNING id
      `,
      [req.params.id, workspaceId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Nota não encontrada." });
    }

    res.json({ message: "Nota removida" });
  } catch (err) {
    console.error("Erro ao deletar nota:", err);
    res.status(500).json({ error: "Erro ao deletar nota" });
  }
});

// Buscar configurações de automação do workspace atual
router.get("/automation/settings", async (req, res) => {
  const workspaceId = req.workspaceId;

  try {
    const result = await db.query(
      `
      SELECT *
      FROM automation_settings
      WHERE workspace_id = $1
      LIMIT 1
      `,
      [workspaceId],
    );

    // Para um workspace ainda não configurado, não vaza a configuração
    // de outro usuário e não cria registro silenciosamente.
    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Configurações de automação não encontradas para este workspace.",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao buscar configurações:", err);

    res.status(500).json({
      error: "Erro ao buscar configurações.",
    });
  }
});

// Atualizar configurações de automação do workspace atual
router.patch("/automation/settings", async (req, res) => {
  const workspaceId = req.workspaceId;

  const {
    is_active,
    min_interval_minutes,
    max_interval_minutes,
    daily_limit,
    start_hour,
    end_hour,
    is_ai_enabled,
    followup_enabled,
    followup_max_count,
    followup_delay_hours_1,
    followup_delay_hours_2,
    followups_per_cycle,
    followup_gap_seconds,
  } = req.body;

  try {
    const result = await db.query(
      `
      UPDATE automation_settings
      SET
        is_active = COALESCE($1, is_active),
        min_interval_minutes = COALESCE($2, min_interval_minutes),
        max_interval_minutes = COALESCE($3, max_interval_minutes),
        daily_limit = COALESCE($4, daily_limit),
        start_hour = COALESCE($5, start_hour),
        end_hour = COALESCE($6, end_hour),
        is_ai_enabled = COALESCE($7, is_ai_enabled),

        followup_enabled = COALESCE($8, followup_enabled),
        followup_max_count = COALESCE($9, followup_max_count),
        followup_delay_hours_1 = COALESCE($10, followup_delay_hours_1),
        followup_delay_hours_2 = COALESCE($11, followup_delay_hours_2),

        followups_per_cycle = COALESCE($12, followups_per_cycle),
        followup_gap_seconds = COALESCE($13, followup_gap_seconds),

        updated_at = NOW()
      WHERE workspace_id = $14
      RETURNING *
      `,
      [
        is_active,
        min_interval_minutes,
        max_interval_minutes,
        daily_limit,
        start_hour,
        end_hour,
        is_ai_enabled,
        followup_enabled,
        followup_max_count,
        followup_delay_hours_1,
        followup_delay_hours_2,
        followups_per_cycle,
        followup_gap_seconds,
        workspaceId,
      ],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Configurações de automação não encontradas para este workspace.",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao atualizar configurações:", err);
    res.status(500).json({ error: "Erro ao atualizar configurações." });
  }
});

// Listar números/chips de envio do workspace atual
router.get("/sending-numbers", async (req, res) => {
  const workspaceId = req.workspaceId;

  try {
    const result = await db.query(
      `
      SELECT
        id,
        workspace_id,
        label,
        phone_number,
        whatsapp_profile_name,
        status,
        daily_limit,
        sent_today,
        warmup_stage,
        last_reset_at,
        is_active,
        chrome_port,
        chrome_profile_path,
        created_at,
        health_status,
        last_health_check_at,
        last_error,
        consecutive_failures,
        paused_until
      FROM sending_numbers
      WHERE workspace_id = $1
      ORDER BY id ASC
      `,
      [workspaceId],
    );

    res.json(result.rows.map(calculateChipAvailability));
  } catch (err) {
    console.error("Erro ao buscar números de envio:", err);
    res.status(500).json({ error: "Erro ao buscar números de envio." });
  }
});

// Pausar chip manualmente dentro do workspace atual
router.patch("/sending-numbers/:id/pause", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { id } = req.params;
  const { minutes = 30, reason = "Pausa manual" } = req.body;

  const parsedMinutes = Number(minutes);

  if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
    return res.status(400).json({ error: "minutes inválido." });
  }

  try {
    const result = await db.query(
      `
      UPDATE sending_numbers
      SET
        health_status = 'paused',
        paused_until = NOW() + ($3 || ' minutes')::interval,
        last_error = $4,
        last_health_check_at = NOW()
      WHERE id = $1
        AND workspace_id = $2
      RETURNING *
      `,
      [id, workspaceId, String(parsedMinutes), reason],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Chip não encontrado." });
    }

    res.json({
      success: true,
      message: `Chip pausado por ${parsedMinutes} minutos.`,
      chip: result.rows[0],
    });
  } catch (err) {
    console.error("Erro ao pausar chip:", err);
    res.status(500).json({ error: "Erro ao pausar chip." });
  }
});

// Reativar chip manualmente dentro do workspace atual
router.patch("/sending-numbers/:id/resume", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { id } = req.params;

  try {
    const result = await db.query(
      `
      UPDATE sending_numbers
      SET
        health_status = 'healthy',
        paused_until = NULL,
        consecutive_failures = 0,
        last_error = NULL,
        last_health_check_at = NOW(),
        status = 'active'
      WHERE id = $1
        AND workspace_id = $2
      RETURNING *
      `,
      [id, workspaceId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Chip não encontrado." });
    }

    res.json({
      success: true,
      message: "Chip reativado com sucesso.",
      chip: result.rows[0],
    });
  } catch (err) {
    console.error("Erro ao reativar chip:", err);
    res.status(500).json({ error: "Erro ao reativar chip." });
  }
});

// Resetar falhas do chip dentro do workspace atual
router.patch("/sending-numbers/:id/reset-failures", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { id } = req.params;

  try {
    const result = await db.query(
      `
      UPDATE sending_numbers
      SET
        consecutive_failures = 0,
        last_error = NULL,
        health_status = 'healthy',
        paused_until = NULL,
        last_health_check_at = NOW()
      WHERE id = $1
        AND workspace_id = $2
      RETURNING *
      `,
      [id, workspaceId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Chip não encontrado." });
    }

    res.json({
      success: true,
      message: "Falhas resetadas com sucesso.",
      chip: result.rows[0],
    });
  } catch (err) {
    console.error("Erro ao resetar falhas do chip:", err);
    res.status(500).json({ error: "Erro ao resetar falhas do chip." });
  }
});

// Alterar limite diário do chip dentro do workspace atual
router.patch("/sending-numbers/:id/daily-limit", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { id } = req.params;
  const { daily_limit } = req.body;

  if (
    daily_limit === undefined ||
    daily_limit === null ||
    Number.isNaN(Number(daily_limit)) ||
    Number(daily_limit) < 0
  ) {
    return res.status(400).json({ error: "daily_limit inválido." });
  }

  try {
    const result = await db.query(
      `
      UPDATE sending_numbers
      SET daily_limit = $3
      WHERE id = $1
        AND workspace_id = $2
      RETURNING *
      `,
      [id, workspaceId, Number(daily_limit)],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Chip não encontrado." });
    }

    res.json({
      success: true,
      message: "Limite diário atualizado com sucesso.",
      chip: result.rows[0],
    });
  } catch (err) {
    console.error("Erro ao atualizar limite diário:", err);
    res.status(500).json({ error: "Erro ao atualizar limite diário." });
  }
});

// Ativar/Inativar chip dentro do workspace atual
router.patch("/sending-numbers/:id/toggle-active", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { id } = req.params;
  const { is_active } = req.body;

  if (typeof is_active !== "boolean") {
    return res.status(400).json({ error: "is_active deve ser boolean." });
  }

  try {
    const result = await db.query(
      `
      UPDATE sending_numbers
      SET is_active = $3
      WHERE id = $1
        AND workspace_id = $2
      RETURNING *
      `,
      [id, workspaceId, is_active],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Chip não encontrado." });
    }

    res.json({
      success: true,
      message: is_active
        ? "Chip ativado com sucesso."
        : "Chip desativado com sucesso.",
      chip: result.rows[0],
    });
  } catch (err) {
    console.error("Erro ao alternar ativo/inativo:", err);
    res.status(500).json({ error: "Erro ao alternar ativo/inativo." });
  }
});

// Atualizar status textual do chip dentro do workspace atual
router.patch("/sending-numbers/:id/status", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { id } = req.params;
  const { status } = req.body;

  const allowed = ["active", "warming", "blocked", "paused", "inactive"];

  if (!allowed.includes(status)) {
    return res.status(400).json({
      error: `status inválido. Permitidos: ${allowed.join(", ")}`,
    });
  }

  try {
    const result = await db.query(
      `
      UPDATE sending_numbers
      SET status = $3
      WHERE id = $1
        AND workspace_id = $2
      RETURNING *
      `,
      [id, workspaceId, status],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Chip não encontrado." });
    }

    res.json({
      success: true,
      message: "Status do chip atualizado com sucesso.",
      chip: result.rows[0],
    });
  } catch (err) {
    console.error("Erro ao atualizar status do chip:", err);
    res.status(500).json({ error: "Erro ao atualizar status do chip." });
  }
});

// Geração em massa de IA
router.post("/generate-ai-mass", async (req, res) => {
  const workspaceId = req.workspaceId;

  const {
    limit = 10,
    minRating = 0,
    status = "pending",
    category,
    categories = [],
    random = false,
  } = req.body;

  const batchId = `gen_${Date.now()}`;

  try {
    let query = `
      SELECT *
      FROM leads
      WHERE workspace_id = $1
        AND status = $2
        AND is_ai_ready = false
        AND is_archived = false
        AND rating >= $3
    `;

    const queryParams = [workspaceId, status, minRating];

    const selectedCategories = Array.isArray(categories)
      ? categories.filter(Boolean)
      : [];

    if (selectedCategories.length > 0) {
      queryParams.push(selectedCategories);
      query += ` AND lead_category = ANY($${queryParams.length})`;
    } else if (category) {
      queryParams.push(category);
      query += ` AND lead_category = $${queryParams.length}`;
    }

    if (random === true) {
      query += ` ORDER BY RANDOM()`;
    } else {
      query += ` ORDER BY rating DESC, reviews_count DESC, created_at DESC`;
    }

    queryParams.push(Number(limit));
    query += ` LIMIT $${queryParams.length}`;

    const leads = await db.query(query, queryParams);

    if (leads.rowCount === 0) {
      return res.json({
        success: false,
        batch_id: batchId,
        count: 0,
        message: "Nenhum lead encontrado com esses critérios.",
        generated_leads: [],
      });
    }

    const generatedLeads = [];

    for (const lead of leads.rows) {
      try {
        const generated = await generateLeadMessage(lead);

        const updateRes = await db.query(
          `
  UPDATE leads
  SET
    ai_message_suggestion = $1,
    custom_message = $1,

    is_ai_ready = true,
    is_verified = true,

    ai_prompt_angle = $2,
    ai_prompt_version = $3,
    ai_prompt_label = $4,

    ai_message_generated_at = NOW(),
    ai_generation_batch_id = $5,

    offer_type = NULL,
    offer_label = NULL,
    offer_reason = NULL,

    message_type = $6

  WHERE id = $7
    AND workspace_id = $8

  RETURNING
    id,
    name,
    phone,
    lead_category,
    lead_city,
    rating,
    reviews_count,

    ai_prompt_angle,
    ai_prompt_label,
    ai_prompt_version,
    ai_generation_batch_id,
    ai_message_generated_at,

    custom_message,

    offer_type,
    offer_label,
    offer_reason,
    message_type
  `,
          [
            generated.message,
            generated.meta.angle,
            generated.meta.version,
            generated.meta.angle_label,
            batchId,
            generated.meta.message_type,
            lead.id,
            workspaceId,
          ],
        );

        if (updateRes.rowCount === 0) {
          throw new Error(
            "Lead deixou de pertencer ao workspace durante a geração.",
          );
        }

        generatedLeads.push(updateRes.rows[0]);
      } catch (aiErr) {
        console.error(`Erro no lead ${lead.id}:`, aiErr.message);
      }
    }

    res.json({
      success: true,
      batch_id: batchId,
      count: generatedLeads.length,
      message: `${generatedLeads.length} mensagens neutras geradas com sucesso!`,
      generated_leads: generatedLeads,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro na geração inteligente." });
  }
});

// Última geração de mensagens por IA
router.get("/generate-ai-mass/last", async (req, res) => {
  const workspaceId = req.workspaceId;

  try {
    const batchRes = await db.query(
      `
        SELECT ai_generation_batch_id
        FROM leads
        WHERE workspace_id = $1
          AND ai_generation_batch_id IS NOT NULL
        ORDER BY ai_message_generated_at DESC
        LIMIT 1
      `,
      [workspaceId],
    );

    const batchId = batchRes.rows[0]?.ai_generation_batch_id;

    if (!batchId) {
      return res.json({
        success: true,
        batch_id: null,
        count: 0,
        leads: [],
      });
    }

    const leadsRes = await db.query(
      `
      SELECT
        id,
        name,
        phone,
        lead_category,
        lead_city,
        rating,
        reviews_count,
        ai_prompt_angle,
        ai_prompt_label,
        ai_prompt_version,
        ai_generation_batch_id,
        ai_message_generated_at,
        custom_message
      FROM leads
      WHERE ai_generation_batch_id = $1
        AND workspace_id = $2
      ORDER BY ai_message_generated_at DESC, id DESC
      `,
      [batchId, workspaceId],
    );

    res.json({
      success: true,
      batch_id: batchId,
      count: leadsRes.rowCount,
      leads: leadsRes.rows,
    });
  } catch (err) {
    console.error("Erro ao buscar última geração:", err);
    res.status(500).json({ error: "Erro ao buscar última geração." });
  }
});

// Buscar detalhes de um lead do workspace atual
router.get("/:id", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { id } = req.params;

  try {
    const result = await db.query(
      `
      SELECT *
      FROM leads
      WHERE id = $1
        AND workspace_id = $2
      `,
      [id, workspaceId],
    );

    if (result.rows.length === 0) {
      // 404 evita revelar se o ID existe em outro workspace.
      return res.status(404).json({ message: "Lead não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao buscar lead:", err);
    res.status(500).json({ error: "Erro ao buscar lead." });
  }
});

// Histórico do lead dentro do workspace atual
router.get("/:id/activities", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { id } = req.params;

  try {
    // Primeiro valida ownership sem revelar a existência de leads externos.
    const leadRes = await db.query(
      `
      SELECT id
      FROM leads
      WHERE id = $1
        AND workspace_id = $2
      `,
      [id, workspaceId],
    );

    if (leadRes.rowCount === 0) {
      return res.status(404).json({ error: "Lead não encontrado." });
    }

    const result = await db.query(
      `
      SELECT *
      FROM lead_activities
      WHERE lead_id = $1
        AND workspace_id = $2
      ORDER BY created_at DESC
      `,
      [id, workspaceId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao carregar histórico:", err);
    res.status(500).json({ error: "Erro ao carregar histórico." });
  }
});

// Verificar/Aprovar lead para automação dentro do workspace atual
router.patch("/:id/verify", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { id } = req.params;
  const { is_verified } = req.body;

  if (typeof is_verified !== "boolean") {
    return res.status(400).json({
      error: "is_verified deve ser boolean.",
    });
  }

  try {
    const result = await db.query(
      `
      UPDATE leads
      SET is_verified = $1
      WHERE id = $2
        AND workspace_id = $3
      RETURNING *
      `,
      [is_verified, id, workspaceId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Lead não encontrado." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao verificar lead:", err);
    res.status(500).json({ error: "Erro ao verificar lead." });
  }
});

// Dashboard
router.get("/stats/dashboard", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { period = "30", includeArchived = "false" } = req.query;

  const showArchived = includeArchived === "true";
  const days = Number(period) || 30;

  try {
    const stats = await db.query(
      `
      SELECT 
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE pipeline_stage IN ('contacted','responded','interested','preview_sent','negotiation','closed')) as sent,
        COUNT(*) FILTER (WHERE pipeline_stage IN ('responded','interested','preview_sent','negotiation','closed')) as replied,
        COUNT(*) FILTER (WHERE pipeline_stage IN ('interested','preview_sent','negotiation','closed')) as engaged,
        COUNT(*) FILTER (WHERE preview_sent = true OR pipeline_stage IN ('preview_sent','negotiation','closed')) as previews,
        COUNT(*) FILTER (WHERE pipeline_stage = 'negotiation') as negotiation,
        COUNT(*) FILTER (WHERE pipeline_stage = 'closed') as closed,
        COALESCE(SUM(sale_value), 0) as total_revenue
      FROM leads
      WHERE workspace_id = $1
        AND created_at >= CURRENT_DATE - ($2 || ' days')::interval
      `,
      [workspaceId, String(days)],
    );

    const s = stats.rows[0];

    const sent = parseInt(s.sent || 0, 10);
    const replied = parseInt(s.replied || 0, 10);
    const engaged = parseInt(s.engaged || 0, 10);
    const closed = parseInt(s.closed || 0, 10);

    const response_rate = sent > 0 ? (replied / sent) * 100 : 0;
    const interest_rate = replied > 0 ? (engaged / replied) * 100 : 0;
    const conversion_rate = sent > 0 ? (closed / sent) * 100 : 0;

    const nicheStats = await db.query(
      `
      SELECT 
        lead_category as nicho,
        COUNT(*) as leads,
        COUNT(*) FILTER (WHERE pipeline_stage IN ('responded','interested','preview_sent','negotiation','closed')) as respostas,
        COUNT(*) FILTER (WHERE pipeline_stage = 'closed') as vendas
      FROM leads
      WHERE workspace_id = $1
        AND created_at >= CURRENT_DATE - ($2 || ' days')::interval
      GROUP BY lead_category
      ORDER BY leads DESC
      `,
      [workspaceId, String(days)],
    );

    const promptStats = await db.query(
      `
      SELECT
        l.ai_prompt_angle,
        COALESCE(apc.prompt_label, l.ai_prompt_label, 'Sem copy') as prompt_label,
        COALESCE(apc.prompt_version, l.ai_prompt_version) as prompt_version,
        COALESCE(apc.status, 'active') as status,

        COUNT(*) as total,
        COUNT(*) FILTER (
          WHERE l.pipeline_stage IN ('contacted','responded','interested','preview_sent','negotiation','closed')
        ) as enviados,

        COUNT(*) FILTER (
          WHERE l.pipeline_stage IN ('responded','interested','preview_sent','negotiation','closed')
        ) as respostas,

        COUNT(*) FILTER (
          WHERE l.preview_sent = true OR l.pipeline_stage IN ('preview_sent','negotiation','closed')
        ) as previews,

        COUNT(*) FILTER (
          WHERE l.pipeline_stage = 'closed'
        ) as fechamentos

      FROM leads l
      LEFT JOIN ai_prompt_configs apc
        ON apc.prompt_angle = l.ai_prompt_angle
      WHERE l.workspace_id = $1
        AND l.created_at >= CURRENT_DATE - ($2 || ' days')::interval
        AND l.ai_prompt_angle IS NOT NULL
        AND (
          $3::boolean = true
          OR COALESCE(apc.status, 'active') != 'archived'
        )
      GROUP BY
        l.ai_prompt_angle,
        COALESCE(apc.prompt_label, l.ai_prompt_label, 'Sem copy'),
        COALESCE(apc.prompt_version, l.ai_prompt_version),
        COALESCE(apc.status, 'active')
      ORDER BY respostas DESC, enviados DESC
      `,
      [workspaceId, String(days), showArchived],
    );

    res.json({
      core: {
        ...s,
        response_rate,
        interest_rate,
        conversion_rate,
      },

      niches: nicheStats.rows.map((n) => ({
        ...n,
        taxa_res:
          Number(n.leads) > 0
            ? ((Number(n.respostas) / Number(n.leads)) * 100).toFixed(1) + "%"
            : "0%",
      })),

      prompts: promptStats.rows.map((p) => ({
        ...p,
        response_rate:
          Number(p.enviados) > 0
            ? ((Number(p.respostas) / Number(p.enviados)) * 100).toFixed(1) +
              "%"
            : "0%",
        preview_rate:
          Number(p.enviados) > 0
            ? ((Number(p.previews) / Number(p.enviados)) * 100).toFixed(1) + "%"
            : "0%",
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Atualizar lead / scoring / pipeline dentro do workspace atual
router.patch("/:id", async (req, res) => {
  const workspaceId = req.workspaceId;
  const { id } = req.params;

  const {
    status,
    market_observation,
    internal_notes,
    services_offered,
    competitor_url,
    update_contact,
    deal_details,
    snooze_until,
    acquisition_cost,
    is_archived,
    name,
    is_verified,
    custom_message,
    ai_message_suggestion,
    is_ai_ready,
    lead_category,
    lead_city,
    price_requested,
    preview_sent,
    sale_value,
  } = req.body;

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    /*
     * Trava somente o lead pertencente ao workspace atual.
     *
     * Isso garante duas coisas:
     * 1) um ID de outro workspace resulta em 404;
     * 2) duas atualizações simultâneas do mesmo lead não calculam
     *    score/pipeline em cima do mesmo estado antigo.
     */
    const oldRes = await client.query(
      `
      SELECT
        status,
        interest_level,
        lead_score,
        price_requested,
        preview_sent,
        pipeline_stage
      FROM leads
      WHERE id = $1
        AND workspace_id = $2
      FOR UPDATE
      `,
      [id, workspaceId],
    );

    if (oldRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Lead não encontrado." });
    }

    const current = oldRes.rows[0];

    let newScore = current.lead_score ?? current.interest_level ?? 0;

    if (status === "responded" && current.status !== "responded") {
      newScore += 2;
    }

    if (price_requested === true && current.price_requested === false) {
      newScore += 3;
    }

    if (preview_sent === true && current.preview_sent === false) {
      newScore += 2;
    }

    let newTemperatureBand = "cold";

    if (status === "closed") {
      newTemperatureBand = "converted";
    } else if (newScore >= 7) {
      newTemperatureBand = "hot";
    } else if (newScore >= 3) {
      newTemperatureBand = "warm";
    }

    let newPipelineStage = current.pipeline_stage || "pending";

    if (status === "closed") {
      newPipelineStage = "closed";
    } else if (status === "negotiation" || status === "negociacao") {
      newPipelineStage = "negotiation";
    } else if (preview_sent === true || current.preview_sent === true) {
      newPipelineStage = "preview_sent";
    } else if (price_requested === true || current.price_requested === true) {
      newPipelineStage = "interested";
    } else if (status === "responded") {
      newPipelineStage = "responded";
    } else if (status === "contacted") {
      newPipelineStage = "contacted";
    } else if (snooze_until) {
      newPipelineStage = "snoozed";
    }

    const query = `
      UPDATE leads
      SET
        status = COALESCE($1, status),
        market_observation = COALESCE($2, market_observation),
        internal_notes = COALESCE($3, internal_notes),
        services_offered = COALESCE($4, services_offered),
        competitor_url = COALESCE($5, competitor_url),
        interest_level = $6,
        lead_score = $7,
        temperature_band = $8,
        pipeline_stage = $9,
        last_contact = CASE WHEN $10 = true THEN NOW() ELSE last_contact END,
        deal_details = COALESCE($11, deal_details),
        snooze_until = COALESCE($12, snooze_until),
        acquisition_cost = COALESCE($13, acquisition_cost),
        is_archived = COALESCE($14, is_archived),
        name = COALESCE($15, name),
        is_verified = COALESCE($16, is_verified),
        custom_message = COALESCE($17, custom_message),
        ai_message_suggestion = COALESCE($18, ai_message_suggestion),
        is_ai_ready = COALESCE($19, is_ai_ready),
        lead_category = COALESCE($20, lead_category),
        lead_city = COALESCE($21, lead_city),
        price_requested = COALESCE($22, price_requested),
        preview_sent = COALESCE($23, preview_sent),
        sale_value = COALESCE($24, sale_value),
        responded_at = CASE
          WHEN $1 = 'responded' AND status != 'responded'
          THEN NOW()
          ELSE responded_at
        END,
        preview_sent_at = CASE
          WHEN $23 = true AND preview_sent = false
          THEN NOW()
          ELSE preview_sent_at
        END,
        closed_at = CASE
          WHEN $1 = 'closed' AND closed_at IS NULL
          THEN NOW()
          ELSE closed_at
        END,
        last_reply_at = CASE
          WHEN $1 = 'responded' AND status != 'responded'
          THEN NOW()
          ELSE last_reply_at
        END
      WHERE id = $25
        AND workspace_id = $26
      RETURNING *;
    `;

    const values = [
      status,
      market_observation,
      internal_notes,
      services_offered ? JSON.stringify(services_offered) : null,
      competitor_url,
      newScore,
      newScore,
      newTemperatureBand,
      newPipelineStage,
      update_contact || false,
      deal_details ? JSON.stringify(deal_details) : null,
      snooze_until,
      acquisition_cost,
      is_archived,
      name,
      is_verified,
      custom_message,
      ai_message_suggestion,
      is_ai_ready,
      lead_category,
      lead_city,
      price_requested,
      preview_sent,
      sale_value,
      id,
      workspaceId,
    ];

    const result = await client.query(query, values);

    if (result.rowCount === 0) {
      throw new Error("Lead deixou de pertencer ao workspace durante a atualização.");
    }

    const updatedLead = result.rows[0];

    /*
     * createLeadEvent agora deriva workspace_id diretamente do próprio lead.
     * Como estamos usando o mesmo client da transação, lead + eventos +
     * atividade de score são confirmados juntos no COMMIT.
     */
    if (status === "responded" && current.status !== "responded") {
      await createLeadEvent(
        id,
        "lead_replied",
        null,
        "manual",
        {},
        client,
      );
    }

    if (preview_sent === true && current.preview_sent === false) {
      await createLeadEvent(
        id,
        "preview_sent",
        null,
        "manual",
        {},
        client,
      );
    }

    if (price_requested === true && current.price_requested === false) {
      await createLeadEvent(
        id,
        "price_requested",
        null,
        "manual",
        {},
        client,
      );
    }

    if (status === "closed" && current.status !== "closed") {
      await createLeadEvent(
        id,
        "deal_closed",
        sale_value?.toString() || null,
        "manual",
        {
          sale_value: sale_value || null,
        },
        client,
      );
    }

    const previousScore = current.lead_score ?? current.interest_level ?? 0;

    if (newScore !== previousScore) {
      await client.query(
        `
        INSERT INTO lead_activities (
          workspace_id,
          lead_id,
          description,
          type
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          workspaceId,
          id,
          `Score atualizado: lead atingiu ${newScore} pontos.`,
          "score_change",
        ],
      );
    }

    await client.query("COMMIT");

    res.json({
      message: "Lead atualizado com sucesso.",
      lead: updatedLead,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Erro ao processar atualização do lead:", err);

    res.status(500).json({
      error: "Erro ao processar atualização do lead.",
    });
  } finally {
    client.release();
  }
});

module.exports = router;
