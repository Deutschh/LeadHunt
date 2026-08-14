const db = require("../database/db");

/**
 * Cria um evento sempre usando o workspace do próprio lead.
 *
 * Compatibilidade:
 * A assinatura pública permanece igual à versão anterior, então os
 * callers existentes continuam funcionando durante a migração.
 *
 * Segurança:
 * workspace_id não vem do frontend/caller. Ele é derivado diretamente
 * de leads.workspace_id no banco.
 */
async function createLeadEvent(
  leadId,
  eventType,
  eventValue = null,
  source = "system",
  metadata = {},
  queryExecutor = db,
) {
  const result = await queryExecutor.query(
    `
    INSERT INTO lead_events (
      workspace_id,
      lead_id,
      event_type,
      event_value,
      source,
      metadata
    )
    SELECT
      workspace_id,
      id,
      $2,
      $3,
      $4,
      $5::jsonb
    FROM leads
    WHERE id = $1
    RETURNING *
    `,
    [
      leadId,
      eventType,
      eventValue,
      source,
      JSON.stringify(metadata || {}),
    ],
  );

  if (result.rowCount === 0) {
    throw new Error(`Não foi possível criar evento: lead ${leadId} não existe.`);
  }

  return result;
}

module.exports = {
  createLeadEvent,
};
