const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migrationsDirectory = path.join(
  __dirname,
  "..",
  "src",
  "database",
  "migrations",
);

function readMigration(name) {
  return fs.readFileSync(path.join(migrationsDirectory, name), "utf8");
}

const migration = readMigration(
  "006_admin_activation_audit_foundation.sql",
);
const verification = readMigration("006_verify.sql");
const rollback = readMigration("006_rollback.sql");

test("006 depende da 005, registra a versão seguinte e é transacional", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /WHERE version = '005'/);
  assert.match(migration, /WHERE version = '006'/);
  assert.match(
    migration,
    /INSERT INTO public\.schema_migrations \(version, description\)[\s\S]*'006'/,
  );
  assert.match(migration, /COMMIT;\s*$/);
});

test("preflight exige a constraint canônica e validada antes do DDL da 006", () => {
  const constraintName = migration.indexOf(
    "conname = 'workspaces_account_status_check'",
  );
  const preflightStart = migration.lastIndexOf("IF NOT EXISTS (", constraintName);
  const preflightEnd = migration.indexOf("END IF;", constraintName);
  const firstStructuralChange = migration.indexOf("ALTER TABLE public.workspaces");

  assert.ok(preflightStart >= 0);
  assert.ok(preflightEnd > constraintName);
  assert.ok(firstStructuralChange > preflightEnd);

  const statusConstraintPreflight = migration.slice(
    preflightStart,
    preflightEnd,
  );

  assert.match(statusConstraintPreflight, /AND contype = 'c'/);
  assert.match(statusConstraintPreflight, /AND convalidated/);
  assert.match(statusConstraintPreflight, /pg_catalog\.pg_get_constraintdef\(oid\)/);
  assert.match(
    statusConstraintPreflight,
    /= 'CHECKaccount_status=ANYARRAY\[''pending''::text,''active''::text,''suspended''::text\]'/,
  );
  assert.match(
    statusConstraintPreflight,
    /Constraint canônica de account_status está ausente, inválida ou divergente/,
  );
});

test("activated_at é nullable, sem default e sem histórico inventado", () => {
  const addColumn = migration.match(
    /ALTER TABLE public\.workspaces\s+ADD COLUMN activated_at TIMESTAMPTZ;/,
  );

  assert.ok(addColumn);
  assert.doesNotMatch(addColumn[0], /DEFAULT|NOT NULL/i);
  assert.doesNotMatch(migration, /UPDATE\s+public\.workspaces/i);
  assert.match(
    migration,
    /FROM public\.workspaces\s+WHERE activated_at IS NOT NULL/,
  );
});

test("tabela de auditoria contém somente o contrato administrativo aprovado", () => {
  const createTable = migration.match(
    /CREATE TABLE public\.admin_audit_events \([\s\S]*?\n\);/,
  );

  assert.ok(createTable);
  for (const expected of [
    /id BIGSERIAL PRIMARY KEY/,
    /actor_user_id BIGINT NOT NULL/,
    /target_workspace_id BIGINT NOT NULL/,
    /action TEXT NOT NULL/,
    /reason TEXT NOT NULL/,
    /before_state JSONB NOT NULL/,
    /after_state JSONB NOT NULL/,
    /created_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/,
  ]) {
    assert.match(createTable[0], expected);
  }

  assert.doesNotMatch(
    createTable[0],
    /password|refresh|access_token|otp|secret|cookie|commercial|metadata/i,
  );
});

test("FKs preservam o histórico e snapshots exigem objetos JSON", () => {
  assert.match(
    migration,
    /FOREIGN KEY \(actor_user_id\)[\s\S]*?REFERENCES public\.users\(id\)[\s\S]*?ON DELETE RESTRICT/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \(target_workspace_id\)[\s\S]*?REFERENCES public\.workspaces\(id\)[\s\S]*?ON DELETE RESTRICT/,
  );
  assert.match(migration, /CHECK \(BTRIM\(action\) <> ''\)/);
  assert.match(migration, /CHECK \(BTRIM\(reason\) <> ''\)/);
  assert.match(
    migration,
    /CHECK \(jsonb_typeof\(before_state\) = 'object'\)/,
  );
  assert.match(
    migration,
    /CHECK \(jsonb_typeof\(after_state\) = 'object'\)/,
  );
  assert.doesNotMatch(migration, /action\s+IN\s*\(/i);
});

test("índices suportam histórico por workspace e ator", () => {
  assert.match(
    migration,
    /CREATE INDEX ix_admin_audit_events_target_created_at[\s\S]*target_workspace_id,[\s\S]*created_at DESC,[\s\S]*id DESC/,
  );
  assert.match(
    migration,
    /CREATE INDEX ix_admin_audit_events_actor_created_at[\s\S]*actor_user_id,[\s\S]*created_at DESC,[\s\S]*id DESC/,
  );
});

test("verificação 006 é somente leitura e não expõe linhas da auditoria", () => {
  assert.match(verification, /WITH migration_status AS/);
  assert.match(verification, /'no_historical_date_invented'/);
  assert.match(verification, /'actor_fk_restrict'/);
  assert.match(verification, /'workspace_fk_restrict'/);
  assert.match(verification, /conkey = ARRAY\[\(\s*SELECT attnum/);
  assert.match(verification, /confkey = ARRAY\[\(\s*SELECT attnum/);
  assert.match(verification, /'btrim\(action\)<>''''::text'/);
  assert.match(verification, /'btrim\(reason\)<>''''::text'/);
  assert.match(verification, /'empty_immediately_after_006'/);
  assert.doesNotMatch(
    verification,
    /^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/im,
  );
  assert.doesNotMatch(verification, /SELECT\s+\*\s+FROM\s+public\.admin_audit_events/i);
});

test("rollback aborta antes de apagar qualquer histórico e não usa CASCADE", () => {
  const eventGuard = rollback.indexOf(
    "IF EXISTS (SELECT 1 FROM public.admin_audit_events)",
  );
  const activationGuard = rollback.indexOf(
    "WHERE activated_at IS NOT NULL",
  );
  const dropTable = rollback.indexOf("DROP TABLE public.admin_audit_events;");
  const dropColumn = rollback.indexOf("DROP COLUMN activated_at;");

  assert.ok(eventGuard >= 0 && eventGuard < dropTable);
  assert.ok(activationGuard >= 0 && activationGuard < dropColumn);
  assert.doesNotMatch(rollback, /DROP TABLE[^;]*CASCADE/i);
  assert.doesNotMatch(rollback, /DROP COLUMN[^;]*CASCADE/i);
  assert.match(rollback, /WITH expected_columns/);
  assert.match(rollback, /pg_get_constraintdef/);
  assert.match(rollback, /pg_get_indexdef/);
  assert.match(rollback, /WHERE version = '006'/);
  assert.match(rollback, /COMMIT;\s*$/);
});
