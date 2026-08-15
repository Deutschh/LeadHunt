const express = require("express");
const db = require("../database/db");

const router = express.Router();
const MAX_POSTGRES_INTEGER = 2147483647;

function parseLeadId(value) {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const leadId = Number(value);

  return Number.isSafeInteger(leadId) && leadId <= MAX_POSTGRES_INTEGER
    ? leadId
    : null;
}

function sendLeadNotFound(res) {
  return res.status(404).json({ error: "Lead não encontrado." });
}

router.get("/lead/:leadId", async (req, res) => {
  const leadId = parseLeadId(req.params.leadId);
  const workspaceId = req.workspaceId;

  if (leadId === null) {
    return sendLeadNotFound(res);
  }

  try {
    const result = await db.query(
      `
      SELECT
        l.id AS owned_lead_id,
        briefing.id,
        briefing.lead_id,
        briefing.business_name,
        briefing.instagram,
        briefing.whatsapp,
        briefing.city,
        briefing.main_services,
        briefing.most_profitable_service,
        briefing.differential,
        briefing.target_audience,
        briefing.goals,
        briefing.brand_colors,
        briefing.references_text,
        briefing.notes,
        briefing.status,
        briefing.created_at,
        briefing.updated_at,
        briefing.weekly_clients,
        briefing.biggest_problem,
        briefing.investment_range,
        briefing.workspace_id
      FROM leads AS l
      LEFT JOIN LATERAL (
        SELECT
          b.id,
          b.lead_id,
          b.business_name,
          b.instagram,
          b.whatsapp,
          b.city,
          b.main_services,
          b.most_profitable_service,
          b.differential,
          b.target_audience,
          b.goals,
          b.brand_colors,
          b.references_text,
          b.notes,
          b.status,
          b.created_at,
          b.updated_at,
          b.weekly_clients,
          b.biggest_problem,
          b.investment_range,
          b.workspace_id
        FROM client_briefings AS b
        WHERE b.lead_id = l.id
          AND b.workspace_id = l.workspace_id
          AND b.status = 'submitted'
        ORDER BY b.created_at DESC
        LIMIT 1
      ) AS briefing ON TRUE
      WHERE l.id = $1
        AND l.workspace_id = $2
      `,
      [leadId, workspaceId],
    );

    if (result.rowCount === 0) {
      return sendLeadNotFound(res);
    }

    const briefing = { ...result.rows[0] };
    delete briefing.owned_lead_id;

    if (briefing.id === null) {
      return res.json(null);
    }

    return res.json(briefing);
  } catch (err) {
    console.error("Erro ao buscar briefing:", err);
    return res.status(500).json({ error: "Erro ao buscar briefing." });
  }
});

router.post("/lead/:leadId/public-link", async (req, res) => {
  const leadId = parseLeadId(req.params.leadId);
  const workspaceId = req.workspaceId;

  if (leadId === null) {
    return sendLeadNotFound(res);
  }

  try {
    const result = await db.query(
      `
      INSERT INTO client_briefings (
        workspace_id,
        lead_id,
        status
      )
      SELECT
        $1,
        l.id,
        'pending'
      FROM leads AS l
      WHERE l.id = $2
        AND l.workspace_id = $1
      ON CONFLICT (workspace_id, lead_id)
      WHERE status = 'pending'
        AND lead_id IS NOT NULL
      DO UPDATE
      SET public_token = client_briefings.public_token
      RETURNING public_token
      `,
      [workspaceId, leadId],
    );

    if (result.rowCount === 0) {
      return sendLeadNotFound(res);
    }

    return res.json({ public_token: result.rows[0].public_token });
  } catch (err) {
    console.error("Erro ao gerar link público de briefing:", err);
    return res.status(500).json({ error: "Erro ao gerar link público." });
  }
});

router.delete("/lead/:leadId/public-link", async (req, res) => {
  const leadId = parseLeadId(req.params.leadId);
  const workspaceId = req.workspaceId;

  if (leadId === null) {
    return sendLeadNotFound(res);
  }

  try {
    const result = await db.query(
      `
      WITH owned_lead AS (
        SELECT id, workspace_id
        FROM leads
        WHERE id = $2
          AND workspace_id = $1
      ),
      revoked AS (
        UPDATE client_briefings AS b
        SET
          status = 'revoked',
          updated_at = NOW()
        FROM owned_lead AS l
        WHERE b.workspace_id = l.workspace_id
          AND b.lead_id = l.id
          AND b.status = 'pending'
        RETURNING b.id
      )
      SELECT
        EXISTS (SELECT 1 FROM owned_lead) AS lead_exists,
        (SELECT COUNT(*) FROM revoked) AS revoked_count
      `,
      [workspaceId, leadId],
    );

    if (!result.rows[0].lead_exists) {
      return sendLeadNotFound(res);
    }

    return res.status(204).send();
  } catch (err) {
    console.error("Erro ao revogar link público de briefing:", err);
    return res.status(500).json({ error: "Erro ao revogar link público." });
  }
});

module.exports = router;
