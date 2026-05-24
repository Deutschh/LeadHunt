const express = require("express");
const db = require("../database/db");

const router = express.Router();

router.get("/lead/:leadId", async (req, res) => {
  const { leadId } = req.params;

  try {
    const result = await db.query(
      `
      SELECT *
      FROM client_briefings
      WHERE lead_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [leadId],
    );

    res.json(result.rows[0] || null);
  } catch (err) {
    console.error("Erro ao buscar briefing:", err);
    res.status(500).json({ error: "Erro ao buscar briefing." });
  }
});

router.post("/", async (req, res) => {
  const {
    lead_id,
    business_name,
    instagram,
    whatsapp,
    city,
    main_services,
    most_profitable_service,
    differential,
    target_audience,
    goals = [],
    brand_colors,
    references_text,
    notes,
  } = req.body;

  try {
    const result = await db.query(
      `
      INSERT INTO client_briefings (
        lead_id,
        business_name,
        instagram,
        whatsapp,
        city,
        main_services,
        most_profitable_service,
        differential,
        target_audience,
        goals,
        brand_colors,
        references_text,
        notes,
        status
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10::jsonb,
        $11, $12, $13,
        'submitted'
      )
      RETURNING *
      `,
      [
        lead_id || null,
        business_name,
        instagram,
        whatsapp,
        city,
        main_services,
        most_profitable_service,
        differential,
        target_audience,
        JSON.stringify(goals),
        brand_colors,
        references_text,
        notes,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao salvar briefing:", err);
    res.status(500).json({ error: "Erro ao salvar briefing." });
  }
});

module.exports = router;
