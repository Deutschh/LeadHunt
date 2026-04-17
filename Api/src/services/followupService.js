const db = require("../database/db");

function getFollowupMessage(lead, followupCount = 0) {
  const name = lead?.name || "sua empresa";

  const messages = [
    `Fiquei na dúvida se isso fez sentido pra ${name} ou se não era prioridade agora.`,
    `Lembrei do seu caso aqui porque vi uma situação parecida esses dias e achei que poderia fazer sentido pra vocês.`,
    `Vou encerrar por aqui pra não te incomodar, mas se fizer sentido depois me chama que te mostro melhor.`,
  ];

  return messages[Math.min(followupCount, messages.length - 1)];
}

async function getEligibleFollowupLead() {
  const result = await db.query(`
    SELECT l.*, a.followup_enabled, a.followup_max_count
    FROM leads l
    CROSS JOIN automation_settings a
    WHERE a.id = 1
      AND a.followup_enabled = true
      AND l.status = 'contacted'
      AND l.pipeline_stage = 'contacted'
      AND l.is_archived = false
      AND COALESCE(l.is_invalid_number, false) = false
      AND COALESCE(l.followup_count, 0) < COALESCE(a.followup_max_count, 2)
      AND l.last_reply_at IS NULL
      AND l.next_followup_at IS NOT NULL
      AND l.next_followup_at <= NOW()
    ORDER BY l.next_followup_at ASC
    LIMIT 1
  `);

  return result.rows[0] || null;
}

async function scheduleNextFollowup(leadId, nextCount) {
  const settingsRes = await db.query(
    "SELECT * FROM automation_settings WHERE id = 1"
  );
  const settings = settingsRes.rows[0];

  if (!settings) return;

  let delayHours = null;

  if (nextCount === 1) {
    delayHours = settings.followup_delay_hours_1 ?? 24;
  } else if (nextCount === 2) {
    delayHours = settings.followup_delay_hours_2 ?? 72;
  }

  if (delayHours === null) {
    await db.query(
      `
      UPDATE leads
      SET next_followup_at = NULL
      WHERE id = $1
      `,
      [leadId]
    );
    return;
  }

  await db.query(
    `
    UPDATE leads
    SET next_followup_at = NOW() + ($2 || ' hours')::interval
    WHERE id = $1
    `,
    [leadId, delayHours]
  );
}

module.exports = {
  getFollowupMessage,
  getEligibleFollowupLead,
  scheduleNextFollowup,
};