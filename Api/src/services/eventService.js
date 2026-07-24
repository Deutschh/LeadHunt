const db = require("../database/db");

async function createLeadEvent(
  leadId,
  eventType,
  eventValue = null,
  source = "system",
  metadata = {},
  queryExecutor = db,
) {
  return queryExecutor.query(
    `
    INSERT INTO lead_events (
      lead_id,
      event_type,
      event_value,
      source,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [leadId, eventType, eventValue, source, JSON.stringify(metadata || {})],
  );
}

module.exports = {
  createLeadEvent,
};
  