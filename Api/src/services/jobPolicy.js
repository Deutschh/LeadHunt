const { createHash } = require('node:crypto');

const LEASE_SECONDS = 90;
const HEARTBEAT_SECONDS = 15;
const STALE_SECONDS = 45;
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
class RuntimeError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
function reject(code = 'INVALID_RUNTIME_INPUT', status = code === 'INVALID_RUNTIME_INPUT' ? 400 : 409) { throw new RuntimeError(code, status); }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, allowed) {
  if (!record(value) || Object.keys(value).some((key) => !allowed.includes(key))) reject();
}
function uuid(value) { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) reject(); return value; }
function workspace(value) { if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) reject(); return value; }
function integer(value, min, max) { if (!Number.isInteger(value) || value < min || value > max) reject(); return value; }
function text(value, max = 128) { if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) reject(); return value; }
function instant(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) || !Number.isFinite(Date.parse(value))) reject(); return new Date(value).toISOString(); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function fingerprint(value) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function resultSummary(value = {}) {
  exact(value, ['processedCount', 'savedCount', 'outcome']);
  for (const key of ['processedCount', 'savedCount']) if (value[key] !== undefined) integer(value[key], 0, 100000);
  if (value.outcome !== undefined && !['applied', 'no_change', 'cancelled'].includes(value.outcome)) reject();
  return value;
}
function definition(type, payload, key) {
  if (type === 'search') {
    exact(payload, ['niche','location','limit','minRating','minReviews','websiteFilter']);
    text(payload.niche, 200); text(payload.location, 200);
    integer(payload.limit, 1, 250); integer(payload.minReviews, 0, 1000000);
    if (typeof payload.minRating !== 'number' || payload.minRating < 0 || payload.minRating > 5 || !Number.isFinite(payload.minRating) || !['any','with','without'].includes(payload.websiteFilter)) reject();
    return { lane: 'search', timeoutSeconds: 1800, effectCount: 0, effectBase: `search:${fingerprint(key)}` };
  }
  if (!['send_message', 'followup'].includes(type)) reject();
  exact(payload, ['leadId','sendingNumberId','messageHash','segmentCount', ...(type === 'followup' ? ['followupCount','dueAt'] : [])]);
  integer(payload.leadId, 1, 2147483647); integer(payload.sendingNumberId, 1, 2147483647);
  if (typeof payload.messageHash !== 'string' || !/^[0-9a-f]{64}$/.test(payload.messageHash)) reject();
  integer(payload.segmentCount, 1, 8);
  if (type === 'followup') { integer(payload.followupCount, 1, 100); instant(payload.dueAt); }
  const effectBase = type === 'followup'
    ? `followup:${payload.leadId}:${payload.followupCount}:${instant(payload.dueAt)}`
    : `send:${payload.leadId}:${payload.messageHash}`;
  return { lane: 'automation', timeoutSeconds: 300, effectCount: payload.segmentCount, effectBase };
}
function retrySeconds(attempt, random = Math.random) {
  const base = Math.min(900, 30 * 2 ** (attempt - 1));
  return Math.min(900, base + Math.floor(base * 0.2 * random()));
}
function dispatchPolicy(settings, now, type) {
  if (!settings || !settings.is_active || (type === 'followup' && !settings.followup_enabled)) return { allowed: false };
  const positive = (value) => Number.isInteger(value) && value > 0;
  const gap = settings.followup_gap_seconds;
  const min = settings.min_interval_minutes;
  const max = settings.max_interval_minutes;
  if (!positive(gap) || !positive(min) || !positive(max) || max < min || !positive(settings.daily_limit)) return { allowed: false };
  if (type === 'followup' && !positive(settings.followups_per_cycle)) return { allowed: false };
  let local;
  try { local = new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone, hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(now); }
  catch { return { allowed: false }; }
  const minutes = (v) => Number(v.slice(0,2)) * 60 + Number(v.slice(3,5));
  if (!/^\d{2}:\d{2}/.test(settings.start_hour || '') || !/^\d{2}:\d{2}/.test(settings.end_hour || '')) return { allowed:false };
  const current = minutes(local), start = minutes(settings.start_hour), rawEnd = minutes(settings.end_hour), end = rawEnd === 0 ? 1440 : rawEnd;
  if (start >= end || current < start || current >= end) return { allowed:false };
  return { allowed:true, cooldownSeconds: type === 'followup' ? gap : min * 60 };
}
const ERRORS = Object.freeze({
  TRANSIENT: 'Falha transitória antes de efeito externo.',
  DEFINITIVE: 'Falha definitiva de execução.',
  LEASE_EXPIRED: 'Lease expirou.',
  EXECUTION_TIMEOUT: 'Prazo de execução esgotado.',
  EFFECT_OUTCOME_UNKNOWN: 'Resultado externo incerto; reconciliação necessária.',
  CANCELLED: 'Execução cancelada.',
  OBSOLETE: 'Trabalho não é mais elegível.',
  RESULT_RECONCILIATION_REQUIRED: 'Efeito confirmado requer reconciliação da persistência.',
});
function runtimeLog(logger, event, fields = {}) {
  const safe = {at:new Date().toISOString()};
  for (const key of ['workspaceId','jobId','attemptId','deviceId','status','errorCode']) if (fields[key] !== undefined) safe[key] = fields[key];
  try { logger?.info?.(event, safe); } catch { /* Logging cannot change a committed transition. */ }
}
module.exports = { LEASE_SECONDS, HEARTBEAT_SECONDS, STALE_SECONDS, TERMINAL, RuntimeError, reject, exact, uuid, workspace, integer, text, instant, fingerprint, resultSummary, definition, retrySeconds, dispatchPolicy, ERRORS, runtimeLog };
