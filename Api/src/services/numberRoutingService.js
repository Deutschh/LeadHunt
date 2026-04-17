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
    [leadId, sendingNumber.phone_number]
  );
}

async function incrementNumberUsage(phoneNumber) {
  await db.query(
    `
    UPDATE sending_numbers
    SET sent_today = sent_today + 1
    WHERE phone_number = $1
    `,
    [phoneNumber]
  );
}

async function getLeadAssignedNumber(leadId) {
  const result = await db.query(
    `
    SELECT assigned_number
    FROM leads
    WHERE id = $1
    `,
    [leadId]
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
    [phoneNumber]
  );

  return result.rows[0] || null;
}

module.exports = {
  getAvailableSendingNumber,
  assignNumberToLead,
  incrementNumberUsage,
  getLeadAssignedNumber,
  getSendingNumberByPhone,
};