const express = require("express");
const router = express.Router();
const db = require("../database/db");

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
    custom_message, // Recebendo a mensagem personalizada
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
        is_verified = COALESCE($13, is_verified), --olha a vírgula bem aqui
        custom_message = COALESCE($14, custom_message)
        WHERE id = $15
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
      is_verified, // $13
      custom_message, // $14
      id, // $15
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

module.exports = router;
