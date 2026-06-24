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
    weekly_clients,
    main_services,
    most_profitable_service,
    differential,
    target_audience,
    biggest_problem,
    investment_range,
    goals,
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
        weekly_clients,
        main_services,
        most_profitable_service,
        differential,
        target_audience,
        biggest_problem,
        investment_range,
        goals,
        brand_colors,
        references_text,
        notes,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13::jsonb,
        $14,
        $15,
        $16,
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
        weekly_clients,
        main_services,
        most_profitable_service,
        differential,
        target_audience,
        biggest_problem,
        investment_range,
        JSON.stringify(goals || []),
        brand_colors,
        references_text,
        notes,
      ],
    );

    const briefing = result.rows[0];

    if (lead_id) {
      await db.query(
        `
    UPDATE leads
    SET
      pipeline_stage = 'qualified',
      status = CASE
        WHEN status IN ('pending', 'contacted') THEN 'responded'
        ELSE status
      END,
      last_reply_at = COALESCE(last_reply_at, NOW()),
      responded_at = COALESCE(responded_at, NOW())
    WHERE id = $1
    `,
        [lead_id],
      );

      await db.query(
        `
    INSERT INTO lead_activities (lead_id, description, type)
    VALUES ($1, $2, $3)
    `,
        [
          lead_id,
          "Briefing respondido pelo cliente. Lead marcado como qualificado.",
          "briefing_submitted",
        ],
      );
    }

    res.status(201).json(briefing);
  } catch (err) {
    console.error("Erro ao salvar briefing:", err);
    res.status(500).json({ error: "Erro ao salvar briefing." });
  }
});

module.exports = router;
