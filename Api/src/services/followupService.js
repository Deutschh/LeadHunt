const db = require("../database/db");

const FOLLOWUP_RULES = [
  {
    step: 0,
    label: "D+1 - Follow-up leve",
    delayHours: 24,
    message:
      "Boa tarde! Tudo bem?\n\nFiquei em dúvida se consegui explicar bem a ideia ontem.\n\nSe quiser, posso montar uma prévia rápida de como isso funcionaria pra vocês, sem compromisso.",
  },
  {
    step: 1,
    label: "D+3 - Curiosidade",
    delayHours: 48,
    message:
      "Boa tarde! Tudo bem?\n\nUma coisa que percebi é que vocês já têm pontos fortes que poderiam aparecer com mais destaque logo de cara.\n\nVocê já chegou a olhar isso com calma?",
  },
  {
    step: 2,
    label: "D+5 - Oportunidade",
    delayHours: 48,
    message:
      "Boa tarde! Tudo bem?\n\nVou ser bem direto: pelo que vi, acho que vocês poderiam aproveitar melhor a atenção que já recebem.\n\nFaz sentido pra você ou estou viajando?",
  },
  {
    step: 3,
    label: "D+7 - Última tentativa",
    delayHours: 48,
    message:
      "Boa tarde! Tudo bem?\n\nPrometo que essa é minha última mensagem por aqui.\n\nFiquei com a impressão de que existe uma oportunidade aí que talvez esteja passando batido. Posso te mostrar rapidinho o que pensei?",
  },
];

function getFollowupMessage(lead, currentFollowupCount = 0) {
  const safeCount = Number(currentFollowupCount || 0);
  const rule = FOLLOWUP_RULES[safeCount];

  if (!rule) {
    return null;
  }

  return rule.message;
}

function getNextFollowupDelayHours(currentFollowupCount = 0) {
  const safeCount = Number(currentFollowupCount || 0);
  const rule = FOLLOWUP_RULES[safeCount];

  if (!rule) {
    return null;
  }

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
