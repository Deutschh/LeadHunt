const express = require("express");
const db = require("../database/db");

const router = express.Router();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TEXT_FIELDS = [
  "instagram",
  "whatsapp",
  "city",
  "weekly_clients",
  "main_services",
  "most_profitable_service",
  "differential",
  "target_audience",
  "biggest_problem",
  "investment_range",
  "brand_colors",
  "references_text",
  "notes",
];

const ALLOWED_FIELDS = new Set(["business_name", "goals", ...TEXT_FIELDS]);

function isValidUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function hasOwn(object, property) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function validateBriefingBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  if (Object.keys(body).some((field) => !ALLOWED_FIELDS.has(field))) {
    return null;
  }

  if (
    typeof body.business_name !== "string" ||
    body.business_name.trim().length === 0
  ) {
    return null;
  }

  for (const field of TEXT_FIELDS) {
    if (hasOwn(body, field) && typeof body[field] !== "string") {
      return null;
    }
  }

  if (
    hasOwn(body, "goals") &&
    (!Array.isArray(body.goals) ||
      body.goals.some((goal) => typeof goal !== "string"))
  ) {
    return null;
  }

  return {
    business_name: body.business_name,
    instagram: body.instagram ?? null,
    whatsapp: body.whatsapp ?? null,
    city: body.city ?? null,
    weekly_clients: body.weekly_clients ?? null,
    main_services: body.main_services ?? null,
    most_profitable_service: body.most_profitable_service ?? null,
    differential: body.differential ?? null,
    target_audience: body.target_audience ?? null,
    biggest_problem: body.biggest_problem ?? null,
    investment_range: body.investment_range ?? null,
    goals: body.goals ?? [],
    brand_colors: body.brand_colors ?? null,
    references_text: body.references_text ?? null,
    notes: body.notes ?? null,
  };
}

function sendPublicNotFound(res) {
  return res.status(404).json({ error: "Briefing não encontrado." });
}

router.get("/:publicToken", async (req, res) => {
  const { publicToken } = req.params;

  if (!isValidUuid(publicToken)) {
    return sendPublicNotFound(res);
  }

  try {
    const result = await db.query(
      `
      SELECT 1
      FROM client_briefings AS b
      INNER JOIN leads AS l
        ON l.id = b.lead_id
       AND l.workspace_id = b.workspace_id
      WHERE b.public_token = $1::uuid
        AND b.status = 'pending'
      LIMIT 1
      `,
      [publicToken],
    );

    if (result.rowCount === 0) {
      return sendPublicNotFound(res);
    }

    return res.status(204).send();
  } catch (err) {
    console.error("Erro ao validar link público de briefing:", err);
    return res.status(500).json({ error: "Erro ao validar briefing." });
  }
});

router.post("/:publicToken/submit", async (req, res) => {
  const { publicToken } = req.params;
  let client;
  let transactionOpen = false;

  try {
    client = await db.connect();
    await client.query("BEGIN");
    transactionOpen = true;

    if (!isValidUuid(publicToken)) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return sendPublicNotFound(res);
    }

    const briefingResult = await client.query(
      `
      SELECT
        b.id,
        b.lead_id,
        b.workspace_id
      FROM client_briefings AS b
      INNER JOIN leads AS l
        ON l.id = b.lead_id
       AND l.workspace_id = b.workspace_id
      WHERE b.public_token = $1::uuid
        AND b.status = 'pending'
      FOR UPDATE OF b, l
      `,
      [publicToken],
    );

    if (briefingResult.rowCount === 0) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return sendPublicNotFound(res);
    }

    const briefingBody = validateBriefingBody(req.body);

    if (briefingBody === null) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(400).json({ error: "Dados do briefing inválidos." });
    }

    const briefing = briefingResult.rows[0];

    const updateBriefingResult = await client.query(
      `
      UPDATE client_briefings
      SET
        business_name = $4,
        instagram = $5,
        whatsapp = $6,
        city = $7,
        weekly_clients = $8,
        main_services = $9,
        most_profitable_service = $10,
        differential = $11,
        target_audience = $12,
        biggest_problem = $13,
        investment_range = $14,
        goals = $15::jsonb,
        brand_colors = $16,
        references_text = $17,
        notes = $18,
        status = 'submitted',
        created_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND lead_id = $2
        AND workspace_id = $3
        AND status = 'pending'
      RETURNING id
      `,
      [
        briefing.id,
        briefing.lead_id,
        briefing.workspace_id,
        briefingBody.business_name,
        briefingBody.instagram,
        briefingBody.whatsapp,
        briefingBody.city,
        briefingBody.weekly_clients,
        briefingBody.main_services,
        briefingBody.most_profitable_service,
        briefingBody.differential,
        briefingBody.target_audience,
        briefingBody.biggest_problem,
        briefingBody.investment_range,
        JSON.stringify(briefingBody.goals),
        briefingBody.brand_colors,
        briefingBody.references_text,
        briefingBody.notes,
      ],
    );

    if (updateBriefingResult.rowCount !== 1) {
      throw new Error("Briefing pending não foi atualizado.");
    }

    const updateLeadResult = await client.query(
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
        AND workspace_id = $2
      RETURNING id
      `,
      [briefing.lead_id, briefing.workspace_id],
    );

    if (updateLeadResult.rowCount !== 1) {
      throw new Error("Lead do briefing não foi atualizado.");
    }

    const activityResult = await client.query(
      `
      INSERT INTO lead_activities (
        workspace_id,
        lead_id,
        description,
        type
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [
        briefing.workspace_id,
        briefing.lead_id,
        "Briefing respondido pelo cliente. Lead marcado como qualificado.",
        "briefing_submitted",
      ],
    );

    if (activityResult.rowCount !== 1) {
      throw new Error("Atividade do briefing não foi criada.");
    }

    await client.query("COMMIT");
    transactionOpen = false;

    return res.status(201).json({ success: true });
  } catch (err) {
    if (client && transactionOpen) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Erro ao enviar briefing público:", err);
    return res.status(500).json({ error: "Erro ao enviar briefing." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

module.exports = router;
