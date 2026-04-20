const db = require("../database/db");

async function resetDailyCountersIfNeeded() {
  await db.query(`
    UPDATE sending_numbers
    SET sent_today = 0,
        last_reset_at = NOW()
    WHERE DATE(last_reset_at) < CURRENT_DATE
  `);
}

async function getAvailableSendingNumber() {
  await resetDailyCountersIfNeeded();

  const result = await db.query(`
    SELECT *
    FROM sending_numbers
    WHERE is_active = true
      AND status = 'active'
      AND sent_today < daily_limit
      AND (paused_until IS NULL OR paused_until <= NOW())
    ORDER BY sent_today ASC, created_at ASC
    LIMIT 1
  `);

  return result.rows[0] || null;
}

async function assignNumberToLead(leadId, sendingNumber) {
  await db.query(
    `
    UPDATE leads
    SET assigned_number = $2
    WHERE id = $1
    `,
    [leadId, sendingNumber.phone_number],
  );
}

async function incrementNumberUsage(phoneNumber) {
  await db.query(
    `
    UPDATE sending_numbers
    SET sent_today = sent_today + 1
    WHERE phone_number = $1
    `,
    [phoneNumber],
  );
}

async function getLeadAssignedNumber(leadId) {
  const result = await db.query(
    `
    SELECT assigned_number
    FROM leads
    WHERE id = $1
    `,
    [leadId],
  );

  return result.rows[0]?.assigned_number || null;
}

async function getSendingNumberByPhone(phoneNumber) {
  const result = await db.query(
    `
    SELECT *
    FROM sending_numbers
    WHERE phone_number = $1
    LIMIT 1
    `,
    [phoneNumber],
  );

  return result.rows[0] || null;
}

async function markNumberHealthy(phoneNumber) {
  await db.query(
    `
    UPDATE sending_numbers
    SET
      health_status = 'healthy',
      last_health_check_at = NOW(),
      last_error = NULL,
      consecutive_failures = 0
    WHERE phone_number = $1
    `,
    [phoneNumber],
  );
}

async function markNumberFailure(phoneNumber, errorMessage) {
  const currentRes = await db.query(
    `
    SELECT consecutive_failures
    FROM sending_numbers
    WHERE phone_number = $1
    `,
    [phoneNumber],
  );

  const currentFailures = Number(currentRes.rows[0]?.consecutive_failures || 0);
  const nextFailures = currentFailures + 1;

  let pausedUntil = null;
  let healthStatus = "warning";

  if (nextFailures >= 3) {
    pausedUntil = new Date(Date.now() + 30 * 60 * 1000);
    healthStatus = "paused";
  }

  await db.query(
    `
    UPDATE sending_numbers
    SET
      health_status = $2,
      last_health_check_at = NOW(),
      last_error = $3,
      consecutive_failures = $4,
      paused_until = COALESCE($5, paused_until)
    WHERE phone_number = $1
    `,
    [phoneNumber, healthStatus, errorMessage, nextFailures, pausedUntil],
  );
}

async function clearExpiredPauses() {
  await db.query(`
    UPDATE sending_numbers
    SET
      paused_until = NULL,
      health_status = 'healthy',
      consecutive_failures = 0,
      last_error = NULL
    WHERE paused_until IS NOT NULL
      AND paused_until <= NOW()
  `);
}

module.exports = {
  getAvailableSendingNumber,
  assignNumberToLead,
  incrementNumberUsage,
  getLeadAssignedNumber,
  getSendingNumberByPhone,
  markNumberHealthy,
  markNumberFailure,
  clearExpiredPauses,
};
