const {workspace}=require('./jobPolicy');

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

function createFollowupService({db}) {
async function getFollowupSettings(workspaceId) {
  workspace(workspaceId);
  const result = await db.query(`
    SELECT
      followup_enabled,
      followup_max_count,
      followup_delay_hours_1,
      followup_delay_hours_2
    FROM automation_settings
    WHERE workspace_id = $1
  `,[workspaceId]);

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

async function getNextFollowupDelayHours(workspaceId,currentFollowupCount = 0) {
  const settings = await getFollowupSettings(workspaceId);

  const count = Number(currentFollowupCount || 0);

  if (count === 1) {
    return Number(settings.followup_delay_hours_1 || 24);
  }

  return Number(settings.followup_delay_hours_2 || 72);
}
async function hasRemainingFollowups(workspaceId,currentFollowupCount = 0) {
  const settings = await getFollowupSettings(workspaceId);

  return (
    Number(currentFollowupCount || 0) < Number(settings.followup_max_count || 2)
  );
}

async function scheduleNextFollowup(workspaceId,leadId, currentFollowupCount = 0) {
  workspace(workspaceId);
  const nextCount = Number(currentFollowupCount || 0);

  if (!(await hasRemainingFollowups(workspaceId,nextCount))) {
    await db.query(
      `
      UPDATE leads
      SET next_followup_at = NULL
      WHERE id = $1 AND workspace_id = $2
      `,
      [leadId,workspaceId],
    );
    return;
  }

  const delayHours = await getNextFollowupDelayHours(workspaceId,nextCount);

  await db.query(
    `
    UPDATE leads
    SET next_followup_at = NOW() + ($2 || ' hours')::interval
    WHERE id = $1 AND workspace_id = $3
    `,
    [leadId, String(delayHours),workspaceId],
  );
}

async function clearNextFollowup(workspaceId,leadId) {
  workspace(workspaceId);
  await db.query(
    `
    UPDATE leads
    SET next_followup_at = NULL
    WHERE id = $1 AND workspace_id = $2
    `,
    [leadId,workspaceId],
  );
}

async function getEligibleFollowupLead(workspaceId) {
  const settings = await getFollowupSettings(workspaceId);
  if (!settings?.followup_enabled) return null;

  const result = await db.query(
    `
SELECT *
FROM leads
WHERE workspace_id=$2 AND status='contacted'
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
    [Number(settings.followup_max_count),workspaceId],
  );

  return result.rows[0] || null;
}

async function markLeadAsReplied(workspaceId,leadId) {
  workspace(workspaceId);
  await db.query(
    `
    UPDATE leads
    SET
      status = 'responded',
      pipeline_stage = 'responded',
      responded_at = COALESCE(responded_at, NOW()),
      last_reply_at = NOW(),
      next_followup_at = NULL
    WHERE id = $1 AND workspace_id = $2
    `,
    [leadId,workspaceId],
  );
}

async function stopFollowupForLead(workspaceId,leadId) {
  workspace(workspaceId);
  await db.query(
    `
    UPDATE leads
    SET next_followup_at = NULL
    WHERE id = $1 AND workspace_id = $2
    `,
    [leadId,workspaceId],
  );

  await db.query(
    `
    INSERT INTO lead_activities (workspace_id,lead_id, description, type)
    SELECT workspace_id,id,$2,$3 FROM leads WHERE id=$1 AND workspace_id=$4
    `,
    [leadId, 'Follow-up interrompido.', "followup_stop",workspaceId],
  );
}

return {
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
}
const names=['getFollowupMessage','getNextFollowupDelayHours','hasRemainingFollowups','scheduleNextFollowup','clearNextFollowup','getEligibleFollowupLead','markLeadAsReplied','stopFollowupForLead'];
module.exports={FOLLOWUP_RULES,createFollowupService,...Object.fromEntries(names.map(name=>[name,(...args)=>createFollowupService({db:require('../database/db')})[name](...args)]))};
