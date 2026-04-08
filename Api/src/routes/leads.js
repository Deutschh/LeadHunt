const express = require("express");
const router = express.Router();
const db = require("../database/db");
const { generateLeadMessage } = require("../services/aiService");

// 1. Listar todos os leads (GET /api/leads)
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

// ROTA: Listar todos os nichos estratégicos
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

// ROTA: Adicionar ou Atualizar um nicho
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

// ROTA: Deletar um nicho
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

// 2. Buscar detalhes de UM lead (GET /api/leads/:id)
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

// GET /api/leads/:id/activities
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

// Criar nova nota
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

// 1. Rota para Verificar/Aprovar um lead para automação
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

// 2. Rota para buscar configurações de automação
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

// 3. Rota para atualizar configurações de automação
router.patch("/automation/settings", async (req, res) => {
  const {
    is_active,
    min_interval_minutes,
    max_interval_minutes,
    daily_limit,
    start_hour,
    end_hour,
    is_ai_enabled, // NOVO CAMPO
  } = req.body;
  try {
    const query = `
        UPDATE automation_settings 
        SET is_active = COALESCE($1, is_active),
            min_interval_minutes = COALESCE($2, min_interval_minutes),
            max_interval_minutes = COALESCE($3, max_interval_minutes),
            daily_limit = COALESCE($4, daily_limit),
            start_hour = COALESCE($5, start_hour),
            end_hour = COALESCE($6, end_hour),
            is_ai_enabled = COALESCE($7, is_ai_enabled), -- NOVO CAMPO
            updated_at = NOW()
        WHERE id = 1 RETURNING *;
      `;
    const result = await db.query(query, [
      is_active,
      min_interval_minutes,
      max_interval_minutes,
      daily_limit,
      start_hour,
      end_hour,
      is_ai_enabled, // $7
    ]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao salvar configurações." });
  }
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    status,
    market_observation,
    internal_notes,
    services_offered,
    competitor_url,
    interest_level,
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
    lead_category, // NOVO
    lead_city, // NOVO
  } = req.body;

  try {
    const oldLead = await db.query(
      "SELECT status, interest_level FROM leads WHERE id = $1",
      [id],
    );

    if (oldLead.rowCount === 0)
      return res.status(404).json({ error: "Lead não encontrado." });

    const query = `
        UPDATE leads 
        SET 
          status = COALESCE($1, status),
          market_observation = COALESCE($2, market_observation),
          internal_notes = COALESCE($3, internal_notes),
          services_offered = COALESCE($4, services_offered),
          competitor_url = COALESCE($5, competitor_url),
          interest_level = COALESCE($6, interest_level),
          last_contact = CASE WHEN $7 = true THEN NOW() ELSE last_contact END,
          deal_details = COALESCE($8, deal_details),
          snooze_until = COALESCE($9, snooze_until),
          acquisition_cost = COALESCE($10, acquisition_cost),
          is_archived = COALESCE($11, is_archived),
          name = COALESCE($12, name),
          is_verified = COALESCE($13, is_verified),
          custom_message = COALESCE($14, custom_message),
          ai_message_suggestion = COALESCE($15, ai_message_suggestion),
          is_ai_ready = COALESCE($16, is_ai_ready),
          lead_category = COALESCE($17, lead_category), -- NOVO
          lead_city = COALESCE($18, lead_city)           -- NOVO
        WHERE id = $19 -- ID AGORA É $19
        RETURNING *;
      `;

    const values = [
      status,
      market_observation,
      internal_notes,
      services_offered ? JSON.stringify(services_offered) : null,
      competitor_url,
      interest_level,
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
      lead_category, // $17
      lead_city, // $18
      id, // $19
    ];

    const result = await db.query(query, values);
    const updatedLead = result.rows[0];

    // 3. LOGICA DE ATIVIDADES AUTOMÁTICA
    if (status && status !== oldLead.rows[0].status) {
      await db.query(
        "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
        [id, `Status alterado para: ${status}`, "status_change"],
      );
    }

    if (
      interest_level !== undefined &&
      interest_level !== oldLead.rows[0].interest_level
    ) {
      await db.query(
        "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
        [
          id,
          `Nível de interesse alterado para: ${interest_level}`,
          "interest_change",
        ],
      );
    }

    if (update_contact) {
      await db.query(
        "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
        [id, "Mensagem de abordagem enviada via WhatsApp", "contact"],
      );
    }

    res.json({
      message: "Lead atualizado e atividade registrada!",
      lead: updatedLead,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar lead e histórico." });
  }
});

router.post("/generate-ai-mass", async (req, res) => {
  // Adicionamos 'category' aqui para receber o filtro do modal
  const { limit = 10, minRating = 0, status = "pending", category } = req.body;

  try {
    // A query agora filtra por categoria se ela for enviada
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

    for (let lead of leads.rows) {
      try {
        const suggestion = await generateLeadMessage(lead);

        // ATUALIZAÇÃO AQUI: Salvamos a sugestão também no 'custom_message'
        await db.query(
          `UPDATE leads 
       SET ai_message_suggestion = $1, 
           custom_message = $1,     -- Isso faz o lead já ter a mensagem pronta!
           is_ai_ready = true, 
           is_verified = true 
       WHERE id = $2`,
          [suggestion, lead.id],
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

module.exports = router;
