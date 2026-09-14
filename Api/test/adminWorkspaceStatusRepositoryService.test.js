const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AdminWorkspaceStatusRepositoryError,
  ERROR_REASONS,
  createAdminWorkspaceStatusRepository,
} = require("../src/repositories/adminWorkspaceStatusRepository");
const {
  AdminWorkspaceAuthorizationError,
  AdminWorkspaceStatusConflictError,
  createAdminWorkspaceStatusService,
} = require("../src/services/adminWorkspaceStatusService");
const {
  AdminWorkspaceNotFoundError,
} = require("../src/services/adminWorkspaceService");

const SERVER_TIME_ISO = "2026-09-13T15:10:20.123456Z";
const EXISTING_ACTIVATION_ISO = "2026-08-01T10:20:30.654321Z";

function createTransactionalDb({
  accountStatus = "pending",
  activatedAtIso = null,
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
          accountStatus,
          activatedAtIso,
          updatedAtIso: "2026-08-15T00:00:00.000000Z",
        }
      : null,
    auditEvents: [],
    calls: [],
    releasedClients: 0,
    nextAuditId: 101n,
    actorIsAdmin,
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
        open: false,
        workspace: null,
        auditEvents: [],
        releaseWorkspaceLock: null,
      };

      return {
        async query(sql, params = []) {
          const statement = String(sql);
          state.calls.push({ clientId, sql: statement, params });

          if (statement === "BEGIN") {
            transaction.open = true;
            return { rows: [], rowCount: 0 };
          }
          if (statement.startsWith("SET LOCAL ")) {
            return { rows: [], rowCount: 0 };
          }
          if (statement === "COMMIT") {
            if (transaction.workspace) {
              state.workspace = { ...transaction.workspace };
            }
            state.auditEvents.push(...transaction.auditEvents);
            transaction.open = false;
            releaseWorkspaceLock(transaction);
            return { rows: [], rowCount: 0 };
          }
          if (statement === "ROLLBACK") {
            transaction.open = false;
            releaseWorkspaceLock(transaction);
            return { rows: [], rowCount: 0 };
          }

          if (statement.includes("admin-workspace-status:lock-actor")) {
            if (actorCheckGate) await actorCheckGate;
            return {
              rows: [{ user_id: "7", is_admin: state.actorIsAdmin }],
              rowCount: 1,
            };
          }

          if (statement.includes("admin-workspace-status:lock-workspace")) {
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
                  account_status: transaction.workspace.accountStatus,
                  activated_at_iso: transaction.workspace.activatedAtIso,
                },
              ],
              rowCount: 1,
            };
          }

          if (statement.includes("admin-workspace-status:update-workspace")) {
            if (failUpdate) throw new Error("sensitive update failure");
            if (
              !transaction.workspace ||
              transaction.workspace.accountStatus !== params[2]
            ) {
              return { rows: [], rowCount: 0 };
            }
            transaction.workspace.accountStatus = params[1];
            transaction.workspace.updatedAtIso = SERVER_TIME_ISO;
            if (/activated_at = CURRENT_TIMESTAMP/u.test(statement)) {
              transaction.workspace.activatedAtIso = SERVER_TIME_ISO;
            }
            return {
              rows: [
                {
                  workspace_id: transaction.workspace.id,
                  account_status: transaction.workspace.accountStatus,
                  activated_at_iso: transaction.workspace.activatedAtIso,
                },
              ],
              rowCount: 1,
            };
          }

          if (statement.includes("admin-workspace-status:insert-audit")) {
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
  const repository = createAdminWorkspaceStatusRepository({ db });
  const service = createAdminWorkspaceStatusService({ repository });
  return { db, repository, service };
}

const INPUT = Object.freeze({
  actorUserId: "7",
  workspaceId: "22",
  reason: "Aprovação administrativa.",
});

function mutationCalls(state) {
  return state.calls.filter(({ sql }) =>
    /admin-workspace-status:(?:update-workspace|insert-audit)/u.test(sql),
  );
}

test("activate executa a transação ordenada e audita timestamps ISO explícitos", async () => {
  const { db, service } = createSystem();
  const result = await service.activateWorkspace(INPUT);

  assert.deepEqual(result, {
    workspace: {
      workspaceId: "22",
      accountStatus: "active",
      activatedAt: "2026-09-13T15:10:20.123Z",
    },
  });
  assert.equal(db.state.workspace.updatedAtIso, SERVER_TIME_ISO);
  assert.equal(db.state.workspace.activatedAtIso, SERVER_TIME_ISO);
  assert.deepEqual(db.state.auditEvents, [
    {
      actorUserId: "7",
      targetWorkspaceId: "22",
      action: "account_activated",
      reason: INPUT.reason,
      beforeState: { account_status: "pending", activated_at: null },
      afterState: {
        account_status: "active",
        activated_at: SERVER_TIME_ISO,
      },
    },
  ]);

  const statements = db.state.calls.map(({ sql }) => sql);
  assert.equal(statements[0], "BEGIN");
  assert.match(statements[1], /^SET LOCAL lock_timeout/u);
  assert.match(statements[2], /^SET LOCAL statement_timeout/u);
  assert.match(statements[3], /lock-actor[\s\S]*FOR SHARE/u);
  assert.match(statements[4], /lock-workspace[\s\S]*FOR UPDATE/u);
  assert.match(statements[5], /update-workspace/u);
  assert.match(statements[6], /insert-audit/u);
  assert.equal(statements[7], "COMMIT");
  assert.equal(db.state.releasedClients, 1);

  const updateSql = statements[5];
  assert.match(updateSql, /updated_at = CURRENT_TIMESTAMP/u);
  assert.match(updateSql, /activated_at = CURRENT_TIMESTAMP/u);
  assert.match(updateSql, /AND account_status = \$3/u);
  assert.match(updateSql, /AND activated_at IS NULL/u);
  assert.match(updateSql, /TO_CHAR\([\s\S]*AT TIME ZONE 'UTC'/u);
  const setClause = updateSql.match(/SET([\s\S]*?)WHERE/u)?.[1] || "";
  assert.doesNotMatch(
    setClause,
    /is_active|release_channel|min_profiles|max_profiles/u,
  );
  assert.doesNotMatch(JSON.stringify(db.state.auditEvents), /updated_at/u);
});

test("suspend e reactivate preservam activated_at e atualizam updated_at", async () => {
  for (const scenario of [
    {
      method: "suspendWorkspace",
      initialStatus: "active",
      finalStatus: "suspended",
      action: "account_suspended",
      activatedAtIso: EXISTING_ACTIVATION_ISO,
    },
    {
      method: "reactivateWorkspace",
      initialStatus: "suspended",
      finalStatus: "active",
      action: "account_reactivated",
      activatedAtIso: EXISTING_ACTIVATION_ISO,
    },
    {
      method: "reactivateWorkspace",
      initialStatus: "suspended",
      finalStatus: "active",
      action: "account_reactivated",
      activatedAtIso: null,
    },
  ]) {
    const { db, service } = createSystem({
      accountStatus: scenario.initialStatus,
      activatedAtIso: scenario.activatedAtIso,
    });
    const result = await service[scenario.method](INPUT);

    assert.equal(result.workspace.accountStatus, scenario.finalStatus);
    assert.equal(db.state.workspace.activatedAtIso, scenario.activatedAtIso);
    assert.equal(db.state.workspace.updatedAtIso, SERVER_TIME_ISO);
    assert.equal(db.state.auditEvents[0].action, scenario.action);
    assert.equal(
      db.state.auditEvents[0].beforeState.activated_at,
      scenario.activatedAtIso,
    );
    assert.equal(
      db.state.auditEvents[0].afterState.activated_at,
      scenario.activatedAtIso,
    );

    const updateSql = mutationCalls(db.state)[0].sql;
    const setClause = updateSql.match(/SET([\s\S]*?)WHERE/u)?.[1] || "";
    assert.match(setClause, /updated_at = CURRENT_TIMESTAMP/u);
    assert.doesNotMatch(setClause, /activated_at\s*=/u);
    assert.doesNotMatch(
      setClause,
      /is_active|release_channel|min_profiles|max_profiles/u,
    );
  }
});

test("transições inválidas e pending com data retornam conflito sem mutação", async () => {
  const cases = [
    ["suspendWorkspace", "pending", null],
    ["activateWorkspace", "active", EXISTING_ACTIVATION_ISO],
    ["suspendWorkspace", "suspended", EXISTING_ACTIVATION_ISO],
    ["reactivateWorkspace", "pending", null],
    ["activateWorkspace", "pending", EXISTING_ACTIVATION_ISO],
  ];

  for (const [method, accountStatus, activatedAtIso] of cases) {
    const { db, service } = createSystem({ accountStatus, activatedAtIso });
    await assert.rejects(service[method](INPUT), AdminWorkspaceStatusConflictError);
    assert.equal(db.state.workspace.accountStatus, accountStatus);
    assert.equal(db.state.workspace.activatedAtIso, activatedAtIso);
    assert.deepEqual(db.state.auditEvents, []);
    assert.equal(db.state.calls.at(-1).sql, "ROLLBACK");
    assert.equal(db.state.releasedClients, 1);
  }
});

test("revalidação transacional nega Admin removido antes de tocar o alvo", async () => {
  const { db, service } = createSystem({ actorIsAdmin: false });
  await assert.rejects(service.activateWorkspace(INPUT), AdminWorkspaceAuthorizationError);

  assert.equal(db.state.calls.some(({ sql }) => /lock-workspace/u.test(sql)), false);
  assert.equal(db.state.calls.at(-1).sql, "ROLLBACK");
  assert.deepEqual(db.state.auditEvents, []);
  assert.equal(db.state.workspace.accountStatus, "pending");
});

test("remoção concluída durante a transação é observada pela revalidação", async () => {
  let releaseActorCheck;
  const actorCheckGate = new Promise((resolve) => {
    releaseActorCheck = resolve;
  });
  const { db, service } = createSystem({ actorCheckGate });
  const transition = service.activateWorkspace(INPUT);

  db.state.actorIsAdmin = false;
  releaseActorCheck();
  await assert.rejects(transition, AdminWorkspaceAuthorizationError);
  assert.equal(db.state.calls.some(({ sql }) => /lock-workspace/u.test(sql)), false);
  assert.equal(db.state.workspace.accountStatus, "pending");
  assert.deepEqual(db.state.auditEvents, []);
  assert.equal(db.state.calls.at(-1).sql, "ROLLBACK");
});

test("workspace ausente retorna not found após revalidar o ator", async () => {
  const { db, service } = createSystem({ workspaceExists: false });
  await assert.rejects(service.activateWorkspace(INPUT), AdminWorkspaceNotFoundError);
  assert.match(db.state.calls[3].sql, /lock-actor/u);
  assert.match(db.state.calls[4].sql, /lock-workspace/u);
  assert.equal(db.state.calls.at(-1).sql, "ROLLBACK");
});

test("falha no UPDATE não audita e falha no INSERT desfaz toda alteração", async () => {
  const updateFailure = createSystem({ failUpdate: true });
  await assert.rejects(
    updateFailure.service.activateWorkspace(INPUT),
    /sensitive update failure/u,
  );
  assert.equal(
    updateFailure.db.state.calls.some(({ sql }) => /insert-audit/u.test(sql)),
    false,
  );
  assert.equal(updateFailure.db.state.workspace.accountStatus, "pending");
  assert.equal(updateFailure.db.state.workspace.activatedAtIso, null);

  const auditFailure = createSystem({ failAudit: true });
  await assert.rejects(
    auditFailure.service.activateWorkspace(INPUT),
    /sensitive audit failure/u,
  );
  assert.equal(auditFailure.db.state.workspace.accountStatus, "pending");
  assert.equal(auditFailure.db.state.workspace.activatedAtIso, null);
  assert.equal(
    auditFailure.db.state.workspace.updatedAtIso,
    "2026-08-15T00:00:00.000000Z",
  );
  assert.deepEqual(auditFailure.db.state.auditEvents, []);
  assert.equal(auditFailure.db.state.calls.at(-1).sql, "ROLLBACK");
});

test("duas ativações concorrentes geram um sucesso, um conflito e um evento", async () => {
  const { db, service } = createSystem();
  const results = await Promise.allSettled([
    service.activateWorkspace(INPUT),
    service.activateWorkspace(INPUT),
  ]);

  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  const rejected = results.find(({ status }) => status === "rejected");
  assert.ok(rejected.reason instanceof AdminWorkspaceStatusConflictError);
  assert.equal(db.state.workspace.accountStatus, "active");
  assert.equal(db.state.auditEvents.length, 1);
  assert.equal(db.state.releasedClients, 2);
});

test("erros internos do repository permanecem distintos dos aborts públicos", () => {
  const error = new AdminWorkspaceStatusRepositoryError(
    ERROR_REASONS.STATUS_CONFLICT,
  );
  assert.equal(error.reason, "status_conflict");
});
