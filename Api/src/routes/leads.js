const express = require("express");
const router = express.Router();
const db = require("../database/db");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { generateLeadMessage } = require("../services/aiService");
const { createLeadEvent } = require("../services/eventService");

puppeteer.use(StealthPlugin());

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

async function runSingleHealthCheck(number) {
  if (!number.chrome_port) {
    throw new Error("Chip não possui chrome_port configurado.");
  }

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${number.chrome_port}`,
    defaultViewport: null,
  });

  let page = null;

  try {
    page = await browser.newPage();

    await page.goto("https://web.whatsapp.com", {
      waitUntil: "networkidle2",
    });

    const isLogged = await page
      .waitForSelector('div[contenteditable="true"]', {
        timeout: 10000,
      })
      .then(() => true)
      .catch(() => false);

    if (!isLogged) {
      throw new Error("WhatsApp não carregou corretamente");
    }

    await db.query(
      `
      UPDATE sending_numbers
      SET
        health_status = 'healthy',
        last_health_check_at = NOW(),
        last_error = NULL,
        consecutive_failures = 0,
        paused_until = NULL
      WHERE id = $1
      `,
      [number.id],
    );

    return {
      label: number.label,
      id: number.id,
      status: "healthy",
      chrome_port: number.chrome_port,
    };
  } catch (err) {
    const failuresRes = await db.query(
      `
      SELECT consecutive_failures
      FROM sending_numbers
      WHERE id = $1
      `,
      [number.id],
    );

    const failures = Number(failuresRes.rows[0]?.consecutive_failures || 0) + 1;

    let healthStatus = "warning";
    let pausedUntil = null;

    if (failures >= 3) {
      healthStatus = "paused";
      pausedUntil = new Date(Date.now() + 30 * 60 * 1000);
    }

    await db.query(
      `
      UPDATE sending_numbers
      SET
        health_status = $2,
        last_health_check_at = NOW(),
        last_error = $3,
        consecutive_failures = $4,
        paused_until = $5
      WHERE id = $1
      `,
      [number.id, healthStatus, err.message, failures, pausedUntil],
    );

    return {
      label: number.label,
      id: number.id,
      status: "error",
      chrome_port: number.chrome_port,
      error: err.message,
      paused: healthStatus === "paused",
    };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
    await browser.disconnect().catch(() => {});
  }
}

// 1. Listar todos os leads
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM leads ORDER BY created_at DESC, id DESC",
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao carregar lista:", err);
    res.status(500).json({ error: "Erro ao carregar lista de leads." });
  }
});

// Listar nichos estratégicos
router.get("/niches", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM niche_strategies ORDER BY niche_name ASC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar nichos." });
  }
});

// Adicionar ou atualizar nicho
router.post("/niches", async (req, res) => {
  const { niche_name, hook, call_to_action } = req.body;

  try {
    const query = `
      INSERT INTO niche_strategies (niche_name, hook, call_to_action)
      VALUES ($1, $2, $3)
      ON CONFLICT (niche_name) 
      DO UPDATE SET hook = $2, call_to_action = $3
      RETURNING *;
    `;

    const result = await db.query(query, [niche_name, hook, call_to_action]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao salvar nicho." });
  }
});

// Deletar nicho
router.delete("/niches/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM niche_strategies WHERE id = $1", [
      req.params.id,
    ]);
    res.json({ message: "Nicho removido com sucesso." });
  } catch (err) {
    res.status(500).json({ error: "Erro ao deletar nicho." });
  }
});

// Buscar notas ativas
router.get("/notes/active", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM home_notes WHERE expires_at >= CURRENT_DATE OR expires_at IS NULL ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar notas" });
  }
});

// Criar nota
router.post("/notes", async (req, res) => {
  const { title, content, expires_at } = req.body;

  try {
    const result = await db.query(
      "INSERT INTO home_notes (title, content, expires_at) VALUES ($1, $2, $3) RETURNING *",
      [title, content, expires_at || null],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar nota" });
  }
});

// Deletar nota
router.delete("/notes/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM home_notes WHERE id = $1", [req.params.id]);
    res.json({ message: "Nota removida" });
  } catch (err) {
    res.status(500).json({ error: "Erro ao deletar nota" });
  }
});

// Buscar configurações de automação
router.get("/automation/settings", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM automation_settings WHERE id = 1",
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar configurações." });
  }
});

// Atualizar configurações de automação
router.patch("/automation/settings", async (req, res) => {
  const {
    is_active,
    min_interval_minutes,
    max_interval_minutes,
    daily_limit,
    start_hour,
    end_hour,
    is_ai_enabled,
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
        updated_at = NOW()
      WHERE id = 1
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
      ],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao atualizar configurações:", err);
    res.status(500).json({ error: "Erro ao atualizar configurações." });
  }
});

// Listar números/chips de envio
router.get("/sending-numbers", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
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
      ORDER BY id ASC
    `);

    res.json(result.rows.map(calculateChipAvailability));
  } catch (err) {
    console.error("Erro ao buscar números de envio:", err);
    res.status(500).json({ error: "Erro ao buscar números de envio." });
  }
});

// Pausar chip manualmente
router.patch("/sending-numbers/:id/pause", async (req, res) => {
  const { id } = req.params;
  const { minutes = 30, reason = "Pausa manual" } = req.body;

  try {
    const result = await db.query(
      `
      UPDATE sending_numbers
      SET
        health_status = 'paused',
        paused_until = NOW() + ($2 || ' minutes')::interval,
        last_error = $3,
        last_health_check_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id, String(minutes), reason],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Chip não encontrado." });
    }

    res.json({
      success: true,
      message: `Chip pausado por ${minutes} minutos.`,
      chip: result.rows[0],
    });
  } catch (err) {
    console.error("Erro ao pausar chip:", err);
    res.status(500).json({ error: "Erro ao pausar chip." });
  }
});

// Reativar chip manualmente
router.patch("/sending-numbers/:id/resume", async (req, res) => {
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
      RETURNING *
      `,
      [id],
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

// Resetar falhas do chip
router.patch("/sending-numbers/:id/reset-failures", async (req, res) => {
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
      RETURNING *
      `,
      [id],
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

// Alterar limite diário do chip
router.patch("/sending-numbers/:id/daily-limit", async (req, res) => {
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
      SET daily_limit = $2
      WHERE id = $1
      RETURNING *
      `,
      [id, Number(daily_limit)],
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

// Ativar/Inativar chip
router.patch("/sending-numbers/:id/toggle-active", async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (typeof is_active !== "boolean") {
    return res.status(400).json({ error: "is_active deve ser boolean." });
  }

  try {
    const result = await db.query(
      `
      UPDATE sending_numbers
      SET is_active = $2
      WHERE id = $1
      RETURNING *
      `,
      [id, is_active],
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

// Atualizar status textual do chip
router.patch("/sending-numbers/:id/status", async (req, res) => {
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
      SET status = $2
      WHERE id = $1
      RETURNING *
      `,
      [id, status],
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

// Health check individual
router.post("/sending-numbers/:id/health-check", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `
      SELECT *
      FROM sending_numbers
      WHERE id = $1
      LIMIT 1
      `,
      [id],
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Chip não encontrado." });
    }

    const number = result.rows[0];
    const checkResult = await runSingleHealthCheck(number);

    return res.json({
      message: "Health check concluído.",
      result: checkResult,
    });
  } catch (err) {
    console.error("Erro no health check individual:", err);
    return res.status(500).json({
      error: err.message || "Erro ao executar health check individual.",
    });
  }
});

// Health check em lote
router.post("/sending-numbers/health-check-all", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM sending_numbers
      WHERE is_active = true
        AND chrome_port IS NOT NULL
    `);

    const numbers = result.rows;

    if (!numbers.length) {
      return res.json({ message: "Nenhum chip ativo para testar." });
    }

    const results = await Promise.all(
      numbers.map(async (number) => runSingleHealthCheck(number)),
    );

    return res.json({
      message: "Health check concluído.",
      results,
    });
  } catch (err) {
    console.error("Erro no health check em lote:", err);
    return res
      .status(500)
      .json({ error: "Erro ao executar health check em lote." });
  }
});

// Buscar detalhes de um lead
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query("SELECT * FROM leads WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Lead não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Histórico do lead
router.get("/:id/activities", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      "SELECT * FROM lead_activities WHERE lead_id = $1 ORDER BY created_at DESC",
      [id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao carregar histórico." });
  }
});

// Verificar/Aprovar lead para automação
router.patch("/:id/verify", async (req, res) => {
  const { id } = req.params;
  const { is_verified } = req.body;

  try {
    const result = await db.query(
      "UPDATE leads SET is_verified = $1 WHERE id = $2 RETURNING *",
      [is_verified, id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao verificar lead." });
  }
});

// Atualizar lead / scoring / pipeline
router.patch("/:id", async (req, res) => {
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

  try {
    const oldRes = await db.query(
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
      `,
      [id],
    );

    if (oldRes.rowCount === 0) {
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
        responded_at = CASE WHEN $1 = 'responded' AND status != 'responded' THEN NOW() ELSE responded_at END,
        preview_sent_at = CASE WHEN $23 = true AND preview_sent = false THEN NOW() ELSE preview_sent_at END,
        closed_at = CASE WHEN $1 = 'closed' AND closed_at IS NULL THEN NOW() ELSE closed_at END,
        last_reply_at = CASE WHEN $1 = 'responded' AND status != 'responded' THEN NOW() ELSE last_reply_at END
      WHERE id = $25
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
    ];

    const result = await db.query(query, values);
    const updatedLead = result.rows[0];

    if (status === "responded" && current.status !== "responded") {
      await createLeadEvent(id, "lead_replied", null, "manual");
    }

    if (preview_sent === true && current.preview_sent === false) {
      await createLeadEvent(id, "preview_sent", null, "manual");
    }

    if (price_requested === true && current.price_requested === false) {
      await createLeadEvent(id, "price_requested", null, "manual");
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
      );
    }

    const previousScore = current.lead_score ?? current.interest_level ?? 0;

    if (newScore !== previousScore) {
      await db.query(
        "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
        [
          id,
          `Score atualizado: lead atingiu ${newScore} pontos.`,
          "score_change",
        ],
      );
    }

    res.json({
      message: "Lead atualizado com sucesso.",
      lead: updatedLead,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao processar atualização do lead." });
  }
});

// Geração em massa de IA
router.post("/generate-ai-mass", async (req, res) => {
  const { limit = 10, minRating = 0, status = "pending", category } = req.body;

  try {
    let query = `
      SELECT * FROM leads 
      WHERE status = $1 
      AND is_ai_ready = false 
      AND is_archived = false 
      AND rating >= $2
    `;

    const queryParams = [status, minRating];

    if (category) {
      query += ` AND lead_category = $3`;
      queryParams.push(category);
    }

    query += ` ORDER BY rating DESC, reviews_count DESC LIMIT $${queryParams.length + 1}`;
    queryParams.push(limit);

    const leads = await db.query(query, queryParams);

    if (leads.rowCount === 0) {
      return res.json({
        message: "Nenhum lead encontrado com esses critérios.",
      });
    }

    for (const lead of leads.rows) {
      try {
        const generated = await generateLeadMessage(lead);

        await db.query(
          `UPDATE leads 
           SET ai_message_suggestion = $1,
               custom_message = $1,
               is_ai_ready = true,
               is_verified = true,
               ai_prompt_angle = $2,
               ai_prompt_version = $3,
               ai_prompt_label = $4,
               ai_message_generated_at = NOW()
           WHERE id = $5`,
          [
            generated.message,
            generated.meta.angle,
            generated.meta.version,
            generated.meta.angle_label,
            lead.id,
          ],
        );
      } catch (aiErr) {
        console.error(`Erro no lead ${lead.id}:`, aiErr);
      }
    }

    res.json({
      success: true,
      count: leads.rowCount,
      message: `${leads.rowCount} leads processados com estratégia de nicho aplicada!`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro na geração inteligente." });
  }
});

// Dashboard
router.get("/stats/dashboard", async (req, res) => {
  const { period = "30" } = req.query;
  const interval = `${period} days`;

  try {
    const stats = await db.query(`
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
      WHERE created_at >= CURRENT_DATE - INTERVAL '${interval}'
    `);

    const s = stats.rows[0];
    const sent = parseInt(s.sent || 0, 10);
    const replied = parseInt(s.replied || 0, 10);
    const engaged = parseInt(s.engaged || 0, 10);
    const closed = parseInt(s.closed || 0, 10);

    const response_rate = sent > 0 ? (replied / sent) * 100 : 0;
    const interest_rate = replied > 0 ? (engaged / replied) * 100 : 0;
    const conversion_rate = sent > 0 ? (closed / sent) * 100 : 0;

    const nicheStats = await db.query(`
      SELECT 
        lead_category as nicho,
        COUNT(*) as leads,
        COUNT(*) FILTER (WHERE pipeline_stage IN ('responded','interested','preview_sent','negotiation','closed')) as respostas,
        COUNT(*) FILTER (WHERE pipeline_stage = 'closed') as vendas
      FROM leads
      WHERE created_at >= CURRENT_DATE - INTERVAL '${interval}'
      GROUP BY lead_category
      ORDER BY leads DESC
    `);

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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
