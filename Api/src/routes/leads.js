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

// 3. Atualizar Lead - O Cérebro (PATCH /api/leads/:id)
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { 
    status, 
    market_observation, 
    internal_notes, 
    services_offered, 
    competitor_url,
    interest_level,
    update_contact 
  } = req.body;

  try {
    const query = `
      UPDATE leads 
      SET 
        status = COALESCE($1, status),
        market_observation = COALESCE($2, market_observation),
        internal_notes = COALESCE($3, internal_notes),
        services_offered = COALESCE($4, services_offered),
        competitor_url = COALESCE($5, competitor_url),
        interest_level = COALESCE($6, interest_level),
        last_contact = CASE WHEN $7 = true THEN NOW() ELSE last_contact END
      WHERE id = $8
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
      id
    ];

    const result = await db.query(query, values);
    
    if (result.rowCount === 0) {
        return res.status(404).json({ error: "Lead não encontrado." });
    }

    res.json({ message: "Lead atualizado!", lead: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar lead" });
  }
});

module.exports = router;