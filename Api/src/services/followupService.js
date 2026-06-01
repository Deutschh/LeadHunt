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

async function getFollowupSettings() {
  const result = await db.query(`
    SELECT
      followup_enabled,
      followup_max_count,
      followup_delay_hours_1,
      followup_delay_hours_2
    FROM automation_settings
    WHERE id = 1
  `);

  return result.rows[0];
}

function getFollowupMessage(lead, currentFollowupCount = 0) {
  const safeCount = Number(currentFollowupCount || 0);

  const rule =
    FOLLOWUP_RULES[safeCount] || FOLLOWUP_RULES[FOLLOWUP_RULES.length - 1];

  if (!rule) {
    return null;
  }

  return rule.message;
}

async function getNextFollowupDelayHours(currentFollowupCount = 0) {
  const settings = await getFollowupSettings();

  const count = Number(currentFollowupCount || 0);

  if (count === 1) {
    return Number(settings.followup_delay_hours_1 || 24);
  }

  return Number(settings.followup_delay_hours_2 || 72);
}
async function hasRemainingFollowups(currentFollowupCount = 0) {
  const settings = await getFollowupSettings();

  return (
    Number(currentFollowupCount || 0) < Number(settings.followup_max_count || 2)
  );
}

async function scheduleNextFollowup(leadId, currentFollowupCount = 0) {
  const nextCount = Number(currentFollowupCount || 0);

  if (!(await hasRemainingFollowups(nextCount))) {
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

  const delayHours = await getNextFollowupDelayHours(nextCount);

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
  const settings = await getFollowupSettings();

  const result = await db.query(
    `
SELECT *
FROM leads
WHERE status='contacted'
AND is_archived=false
AND COALESCE(
is_invalid_number,
false
)=false

AND assigned_number IS NOT NULL

AND COALESCE(
followup_count,
0
)<$1

AND next_followup_at<=NOW()

AND last_reply_at IS NULL

ORDER BY
next_followup_at ASC

LIMIT 1
`,
    [Number(settings.followup_max_count)],
  );

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
