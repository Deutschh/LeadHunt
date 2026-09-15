const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AdminWorkspaceMaxProfilesRepositoryError,
  ERROR_REASONS,
  createAdminWorkspaceMaxProfilesRepository,
} = require("../src/repositories/adminWorkspaceMaxProfilesRepository");
const {
  AdminWorkspaceMaxProfilesConflictError,
  AdminWorkspaceMaxProfilesValidationError,
  createAdminWorkspaceMaxProfilesService,
} = require("../src/services/adminWorkspaceMaxProfilesService");
const {
  AdminWorkspaceAuthorizationError,
} = require("../src/services/adminWorkspaceStatusService");
const {
  AdminWorkspaceNotFoundError,
} = require("../src/services/adminWorkspaceService");

const INITIAL_UPDATED_AT = "2026-09-01T10:00:00.000000Z";
const SERVER_TIME = "2026-09-14T12:00:00.000000Z";

function createTransactionalDb({
  minProfiles = 2,
  maxProfiles = 2,
  actorIsAdmin = true,
  actorCheckGate,
  workspaceExists = true,
  failUpdate = false,
  failAudit = false,
} = {}) {
  const state = {
    workspace: workspaceExists
      ? {
          id: "22",
          minProfiles,
          maxProfiles,
          updatedAt: INITIAL_UPDATED_AT,
        }
      : null,
    actorIsAdmin,
    auditEvents: [],
    calls: [],
    nextAuditId: 201n,
    releasedClients: 0,
  };
  let workspaceLockTail = Promise.resolve();
  let nextClientId = 1;

  function releaseWorkspaceLock(transaction) {
    if (!transaction.releaseWorkspaceLock) return;
    transaction.releaseWorkspaceLock();
    transaction.releaseWorkspaceLock = null;
  }

  return {
    state,
    async connect() {
      const clientId = nextClientId;
      nextClientId += 1;
      const transaction = {
        workspace: null,
        auditEvents: [],
        releaseWorkspaceLock: null,
      };

      return {
        async query(sql, params = []) {
          const statement = String(sql);
          state.calls.push({ clientId, sql: statement, params });

          if (statement === "BEGIN" || statement.startsWith("SET LOCAL ")) {
            return { rows: [], rowCount: 0 };
          }
          if (statement === "COMMIT") {
            if (transaction.workspace) state.workspace = { ...transaction.workspace };
            state.auditEvents.push(...transaction.auditEvents);
            releaseWorkspaceLock(transaction);
            return { rows: [], rowCount: 0 };
          }
          if (statement === "ROLLBACK") {
            releaseWorkspaceLock(transaction);
            return { rows: [], rowCount: 0 };
          }

          if (statement.includes("admin-workspace-max-profiles:lock-actor")) {
            if (actorCheckGate) await actorCheckGate;
            return {
              rows: [{ user_id: "7", is_admin: state.actorIsAdmin }],
              rowCount: 1,
            };
          }

          if (statement.includes("admin-workspace-max-profiles:lock-workspace")) {
            const previousLock = workspaceLockTail;
            let unlock;
            workspaceLockTail = new Promise((resolve) => {
              unlock = resolve;
            });
            await previousLock;
            transaction.releaseWorkspaceLock = unlock;
            transaction.workspace = state.workspace ? { ...state.workspace } : null;
            if (!transaction.workspace) return { rows: [], rowCount: 0 };
            return {
              rows: [
                {
                  workspace_id: transaction.workspace.id,
                  min_profiles: transaction.workspace.minProfiles,
                  max_profiles: transaction.workspace.maxProfiles,
                },
              ],
              rowCount: 1,
            };
          }

          if (statement.includes("admin-workspace-max-profiles:update-workspace")) {
            if (failUpdate) throw new Error("sensitive update failure");
            if (
              !transaction.workspace ||
              transaction.workspace.maxProfiles !== params[2] ||
              params[1] < transaction.workspace.minProfiles
            ) {
              return { rows: [], rowCount: 0 };
            }
            transaction.workspace.maxProfiles = params[1];
            transaction.workspace.updatedAt = SERVER_TIME;
            return {
              rows: [
                {
                  workspace_id: transaction.workspace.id,
                  min_profiles: transaction.workspace.minProfiles,
                  max_profiles: transaction.workspace.maxProfiles,
                },
              ],
              rowCount: 1,
            };
          }

          if (statement.includes("admin-workspace-max-profiles:insert-audit")) {
            if (failAudit) throw new Error("sensitive audit failure");
            const auditEventId = String(state.nextAuditId);
            state.nextAuditId += 1n;
            transaction.auditEvents.push({
              actorUserId: params[0],
              targetWorkspaceId: params[1],
              action: params[2],
              reason: params[3],
              beforeState: JSON.parse(params[4]),
              afterState: JSON.parse(params[5]),
            });
            return {
              rows: [{ audit_event_id: auditEventId }],
              rowCount: 1,
            };
          }

          throw new Error(`Unexpected SQL: ${statement}`);
        },
        release() {
          state.releasedClients += 1;
        },
      };
    },
  };
}

function createSystem(options) {
  const db = createTransactionalDb(options);
  const repository = createAdminWorkspaceMaxProfilesRepository({ db });
  const service = createAdminWorkspaceMaxProfilesService({ repository });
  return { db, repository, service };
}

function input(overrides = {}) {
  return {
    actorUserId: "7",
    workspaceId: "22",
    maxProfiles: 4,
    expectedMaxProfiles: 2,
    reason: "Ajuste administrativo.",
    ...overrides,
  };
}

test("altera somente max_profiles/updated_at e grava auditoria mínima", async () => {
  const { db, service } = createSystem();
  assert.deepEqual(await service.updateMaxProfiles(input()), {
    workspace: { workspaceId: "22", minProfiles: 2, maxProfiles: 4 },
  });
  assert.equal(db.state.workspace.maxProfiles, 4);
  assert.equal(db.state.workspace.updatedAt, SERVER_TIME);
  assert.deepEqual(db.state.auditEvents, [
    {
      actorUserId: "7",
      targetWorkspaceId: "22",
      action: "max_profiles_changed",
      reason: "Ajuste administrativo.",
      beforeState: { max_profiles: 2 },
      afterState: { max_profiles: 4 },
    },
  ]);

  const statements = db.state.calls.map(({ sql }) => sql);
  assert.equal(statements[0], "BEGIN");
  assert.match(statements[3], /lock-actor[\s\S]*FOR SHARE/u);
  assert.match(statements[4], /lock-workspace[\s\S]*FOR UPDATE/u);
  assert.match(statements[5], /update-workspace/u);
  assert.match(statements[6], /insert-audit/u);
  assert.equal(statements[7], "COMMIT");
  const setClause = statements[5].match(/SET([\s\S]*?)WHERE/u)?.[1] || "";
  assert.match(setClause, /max_profiles = \$2/u);
  assert.match(setClause, /updated_at = CURRENT_TIMESTAMP/u);
  assert.doesNotMatch(
    setClause,
    /min_profiles|account_status|is_active|release_channel|activated_at/u,
  );
  assert.match(statements[5], /AND max_profiles = \$3/u);
  assert.match(statements[5], /AND min_profiles <= \$2/u);
});

test("aceita SMALLINT máximo e rejeita valor abaixo do mínimo bloqueado", async () => {
  const minimum = createSystem();
  const minimumResult = await minimum.service.updateMaxProfiles(
    input({ maxProfiles: 2 }),
  );
  assert.equal(minimumResult.workspace.maxProfiles, 2);
  assert.deepEqual(minimum.db.state.auditEvents, []);

  const ordinary = createSystem();
  const ordinaryResult = await ordinary.service.updateMaxProfiles(
    input({ maxProfiles: 3 }),
  );
  assert.equal(ordinaryResult.workspace.maxProfiles, 3);

  const maximum = createSystem();
  const maximumResult = await maximum.service.updateMaxProfiles(
    input({ maxProfiles: 32767 }),
  );
  assert.equal(maximumResult.workspace.maxProfiles, 32767);

  const belowMinimum = createSystem({ minProfiles: 4, maxProfiles: 5 });
  await assert.rejects(
    belowMinimum.service.updateMaxProfiles(
      input({ maxProfiles: 3, expectedMaxProfiles: 5 }),
    ),
    AdminWorkspaceMaxProfilesValidationError,
  );
  assert.equal(belowMinimum.db.state.workspace.maxProfiles, 5);
  assert.equal(belowMinimum.db.state.workspace.updatedAt, INITIAL_UPDATED_AT);
  assert.deepEqual(belowMinimum.db.state.auditEvents, []);
});

test("repetição idempotente retorna 200 lógico sem update, timestamp ou evento", async () => {
  const { db, service } = createSystem({ maxProfiles: 4 });
  assert.deepEqual(
    await service.updateMaxProfiles(input({ expectedMaxProfiles: 2 })),
    { workspace: { workspaceId: "22", minProfiles: 2, maxProfiles: 4 } },
  );
  assert.equal(db.state.workspace.updatedAt, INITIAL_UPDATED_AT);
  assert.deepEqual(db.state.auditEvents, []);
  assert.equal(
    db.state.calls.some(({ sql }) => /update-workspace|insert-audit/u.test(sql)),
    false,
  );
  assert.equal(db.state.calls.at(-1).sql, "COMMIT");
});

test("expectedMaxProfiles divergente retorna conflito sem sobrescrever", async () => {
  const { db, service } = createSystem({ maxProfiles: 3 });
  await assert.rejects(
    service.updateMaxProfiles(input({ maxProfiles: 4, expectedMaxProfiles: 2 })),
    AdminWorkspaceMaxProfilesConflictError,
  );
  assert.equal(db.state.workspace.maxProfiles, 3);
  assert.equal(db.state.workspace.updatedAt, INITIAL_UPDATED_AT);
  assert.deepEqual(db.state.auditEvents, []);
  assert.equal(db.state.calls.at(-1).sql, "ROLLBACK");
});

test("Admin removido e workspace inexistente falham antes do update", async () => {
  const denied = createSystem({ actorIsAdmin: false });
  await assert.rejects(
    denied.service.updateMaxProfiles(input()),
    AdminWorkspaceAuthorizationError,
  );
  assert.equal(
    denied.db.state.calls.some(({ sql }) => /lock-workspace/u.test(sql)),
    false,
  );

  const missing = createSystem({ workspaceExists: false });
  await assert.rejects(
    missing.service.updateMaxProfiles(input()),
    AdminWorkspaceNotFoundError,
  );
  assert.equal(missing.db.state.calls.at(-1).sql, "ROLLBACK");
});

test("remoção concluída durante a transação é observada", async () => {
  let releaseActorCheck;
  const actorCheckGate = new Promise((resolve) => {
    releaseActorCheck = resolve;
  });
  const { db, service } = createSystem({ actorCheckGate });
  const operation = service.updateMaxProfiles(input());
  db.state.actorIsAdmin = false;
  releaseActorCheck();
  await assert.rejects(operation, AdminWorkspaceAuthorizationError);
  assert.equal(db.state.workspace.maxProfiles, 2);
  assert.deepEqual(db.state.auditEvents, []);
});

test("falhas de update e auditoria preservam valor, timestamp e histórico", async () => {
  const updateFailure = createSystem({ failUpdate: true });
  await assert.rejects(
    updateFailure.service.updateMaxProfiles(input()),
    /sensitive update failure/u,
  );
  assert.equal(updateFailure.db.state.workspace.maxProfiles, 2);
  assert.deepEqual(updateFailure.db.state.auditEvents, []);

  const auditFailure = createSystem({ failAudit: true });
  await assert.rejects(
    auditFailure.service.updateMaxProfiles(input()),
    /sensitive audit failure/u,
  );
  assert.equal(auditFailure.db.state.workspace.maxProfiles, 2);
  assert.equal(auditFailure.db.state.workspace.updatedAt, INITIAL_UPDATED_AT);
  assert.deepEqual(auditFailure.db.state.auditEvents, []);
  assert.equal(auditFailure.db.state.calls.at(-1).sql, "ROLLBACK");
  assert.equal(auditFailure.db.state.releasedClients, 1);
});

test("duas mudanças concorrentes com a mesma expectativa não se sobrescrevem", async () => {
  const { db, service } = createSystem();
  const results = await Promise.allSettled([
    service.updateMaxProfiles(input({ maxProfiles: 3 })),
    service.updateMaxProfiles(input({ maxProfiles: 4 })),
  ]);

  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  const rejected = results.find(({ status }) => status === "rejected");
  assert.ok(rejected.reason instanceof AdminWorkspaceMaxProfilesConflictError);
  assert.equal(db.state.auditEvents.length, 1);
  assert.equal(db.state.auditEvents[0].afterState.max_profiles, db.state.workspace.maxProfiles);
  assert.equal(db.state.releasedClients, 2);
});

test("erros internos do repository permanecem separados dos aborts públicos", () => {
  const error = new AdminWorkspaceMaxProfilesRepositoryError(
    ERROR_REASONS.CONFLICT,
  );
  assert.equal(error.reason, "max_profiles_conflict");
});
