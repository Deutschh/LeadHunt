const express = require("express");
const router = express.Router();
const db = require("../database/db");

// 1. Listar todos os leads (GET /api/leads)
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM leads ORDER BY created_at DESC, id DESC"
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
      [id]
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
      "SELECT * FROM home_notes WHERE expires_at >= CURRENT_DATE OR expires_at IS NULL ORDER BY created_at DESC"
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
      [title, content, expires_at || null]
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
    deal_details,      // Novo: detalhes do fechamento
    snooze_until,      // Novo: data de retorno
    acquisition_cost,  // Novo: custo de aquisição (ROI)
    is_archived,       // Novo: para excluir/arquivar
    name               // Novo: permitir editar o nome
  } = req.body;

  try {
    // 1. Buscamos o estado atual do lead para saber o que mudou
    const oldLead = await db.query("SELECT status, interest_level FROM leads WHERE id = $1", [id]);
    
    if (oldLead.rowCount === 0) return res.status(404).json({ error: "Lead não encontrado." });

    // 2. Query de Atualização Principal
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
        name = COALESCE($12, name)
      WHERE id = $13
      RETURNING *;
    `;

    const values = [
      status, market_observation, internal_notes, 
      services_offered ? JSON.stringify(services_offered) : null,
      competitor_url, interest_level, update_contact || false,
      deal_details ? JSON.stringify(deal_details) : null,
      snooze_until, acquisition_cost, is_archived, name, id
    ];

    const result = await db.query(query, values);
    const updatedLead = result.rows[0];

    // 3. LOGICA DE ATIVIDADES AUTOMÁTICA
    // Registra se o status mudou
    if (status && status !== oldLead.rows[0].status) {
      await db.query(
        "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
        [id, `Status alterado para: ${status}`, 'status_change']
      );
    }

    // Registra se o interesse mudou
    if (interest_level !== undefined && interest_level !== oldLead.rows[0].interest_level) {
      await db.query(
        "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
        [id, `Nível de interesse alterado para: ${interest_level}`, 'interest_change']
      );
    }

    // Registra se mandou mensagem (update_contact foi true)
    if (update_contact) {
      await db.query(
        "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
        [id, "Mensagem de abordagem enviada via WhatsApp", 'contact']
      );
    }

    res.json({ message: "Lead atualizado e atividade registrada!", lead: updatedLead });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar lead e histórico." });
  }
});

module.exports = router;