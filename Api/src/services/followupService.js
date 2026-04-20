const db = require("../database/db");

const FOLLOWUP_RULES = [
  {
    step: 0,
    delayHours: 24,
    message:
      "Oi! Passando só para saber se conseguiu ver minha mensagem anterior.",
  },
  {
    step: 1,
    delayHours: 48,
    message:
      "Oi! Voltando rapidamente por aqui porque achei que isso poderia fazer sentido para vocês.",
  },
  {
    step: 2,
    delayHours: 72,
    message:
      "Oi! Esse é meu último toque por aqui. Se fizer sentido, posso te mostrar de forma bem direta.",
  },
];

function getFollowupMessage(lead, currentFollowupCount = 0) {
  const safeCount = Number(currentFollowupCount || 0);
  const rule =
    FOLLOWUP_RULES[safeCount] || FOLLOWUP_RULES[FOLLOWUP_RULES.length - 1];

  return rule.message;
}

function getNextFollowupDelayHours(currentFollowupCount = 0) {
  const safeCount = Number(currentFollowupCount || 0);
  const rule =
    FOLLOWUP_RULES[safeCount] || FOLLOWUP_RULES[FOLLOWUP_RULES.length - 1];

  return Number(rule.delayHours || 24);
}

function hasRemainingFollowups(currentFollowupCount = 0) {
  return Number(currentFollowupCount || 0) < FOLLOWUP_RULES.length;
}

async function scheduleNextFollowup(leadId, currentFollowupCount = 0) {
  const nextCount = Number(currentFollowupCount || 0);

  if (!hasRemainingFollowups(nextCount)) {
    await db.query(
      `
      UPDATE leads
      SET next_followup_at = NULL
      WHERE id = $1
      `,
      [leadId],
    );
    return;
  }

  const delayHours = getNextFollowupDelayHours(nextCount);

  await db.query(
    `
    UPDATE leads
    SET next_followup_at = NOW() + ($2 || ' hours')::interval
    WHERE id = $1
    `,
    [leadId, String(delayHours)],
  );
}

async function clearNextFollowup(leadId) {
  await db.query(
    `
    UPDATE leads
    SET next_followup_at = NULL
    WHERE id = $1
    `,
    [leadId],
  );
}

async function getEligibleFollowupLead() {
  const result = await db.query(`
    SELECT *
    FROM leads
    WHERE status = 'contacted'
      AND is_archived = false
      AND COALESCE(is_invalid_number, false) = false
      AND assigned_number IS NOT NULL
      AND COALESCE(followup_count, 0) < ${FOLLOWUP_RULES.length}
      AND next_followup_at IS NOT NULL
      AND next_followup_at <= NOW()
      AND COALESCE(status, '') NOT IN ('closed', 'lost')
      AND (
        pipeline_stage IS NULL
        OR pipeline_stage NOT IN (
          'responded',
          'interested',
          'preview_sent',
          'negotiation',
          'closed',
          'lost'
        )
      )
      AND last_reply_at IS NULL
    ORDER BY next_followup_at ASC, last_contact ASC NULLS FIRST
    LIMIT 1
  `);

  return result.rows[0] || null;
}

async function markLeadAsReplied(leadId) {
  await db.query(
    `
    UPDATE leads
    SET
      status = 'responded',
      pipeline_stage = 'responded',
      responded_at = COALESCE(responded_at, NOW()),
      last_reply_at = NOW(),
      next_followup_at = NULL
    WHERE id = $1
    `,
    [leadId],
  );
}

async function stopFollowupForLead(leadId, reason = "manual_stop") {
  await db.query(
    `
    UPDATE leads
    SET next_followup_at = NULL
    WHERE id = $1
    `,
    [leadId],
  );

  await db.query(
    `
    INSERT INTO lead_activities (lead_id, description, type)
    VALUES ($1, $2, $3)
    `,
    [leadId, `Follow-up interrompido (${reason}).`, "followup_stop"],
  );
}

module.exports = {
  FOLLOWUP_RULES,
  getFollowupMessage,
  getNextFollowupDelayHours,
  hasRemainingFollowups,
  scheduleNextFollowup,
  clearNextFollowup,
  getEligibleFollowupLead,
  markLeadAsReplied,
  stopFollowupForLead,
};