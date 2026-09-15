const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AdminWorkspaceReleaseChannelRepositoryError,
  ERROR_REASONS,
  createAdminWorkspaceReleaseChannelRepository,
} = require("../src/repositories/adminWorkspaceReleaseChannelRepository");
const {
  AdminWorkspaceReleaseChannelConflictError,
  createAdminWorkspaceReleaseChannelService,
} = require("../src/services/adminWorkspaceReleaseChannelService");
const {
  AdminWorkspaceAuthorizationError,
} = require("../src/services/adminWorkspaceStatusService");
const {
  AdminWorkspaceNotFoundError,
} = require("../src/services/adminWorkspaceService");

const INITIAL_UPDATED_AT = "2026-09-01T10:00:00.000000Z";
const SERVER_TIME = "2026-09-15T12:00:00.000000Z";

function createTransactionalDb({
  releaseChannel = "stable",
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
          releaseChannel,
          accountStatus: "pending",
          isActive: false,
          maxProfiles: 4,
          updatedAt: INITIAL_UPDATED_AT,
        }
      : null,
    actorIsAdmin,
    auditEvents: [],
    calls: [],
    nextAuditId: 301n,
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

          if (statement.includes("admin-workspace-release-channel:lock-actor")) {
            if (actorCheckGate) await actorCheckGate;
            return {
              rows: [{ user_id: "7", is_admin: state.actorIsAdmin }],
              rowCount: 1,
            };
          }

          if (statement.includes("admin-workspace-release-channel:lock-workspace")) {
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
                  release_channel: transaction.workspace.releaseChannel,
                },
              ],
              rowCount: 1,
            };
          }

          if (statement.includes("admin-workspace-release-channel:update-workspace")) {
            if (failUpdate) throw new Error("sensitive update failure");
            if (
              !transaction.workspace ||
              transaction.workspace.releaseChannel !== params[2]
            ) {
              return { rows: [], rowCount: 0 };
            }
            transaction.workspace.releaseChannel = params[1];
            transaction.workspace.updatedAt = SERVER_TIME;
            return {
              rows: [
                {
                  workspace_id: transaction.workspace.id,
                  release_channel: transaction.workspace.releaseChannel,
                },
              ],
              rowCount: 1,
            };
          }

          if (statement.includes("admin-workspace-release-channel:insert-audit")) {
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
  const repository = createAdminWorkspaceReleaseChannelRepository({ db });
  const service = createAdminWorkspaceReleaseChannelService({ repository });
  return { db, service };
}

function input(overrides = {}) {
  return {
    actorUserId: "7",
    workspaceId: "22",
    releaseChannel: "canary",
    expectedReleaseChannel: "stable",
    reason: "Liberação administrativa.",
    ...overrides,
  };
}

test("altera somente release_channel/updated_at e audita snapshot mínimo", async () => {
  const { db, service } = createSystem();
  assert.deepEqual(await service.updateReleaseChannel(input()), {
    workspace: { workspaceId: "22", releaseChannel: "canary" },
  });
  assert.equal(db.state.workspace.releaseChannel, "canary");
  assert.equal(db.state.workspace.updatedAt, SERVER_TIME);
  assert.equal(db.state.workspace.accountStatus, "pending");
  assert.equal(db.state.workspace.isActive, false);
  assert.equal(db.state.workspace.maxProfiles, 4);
  assert.deepEqual(db.state.auditEvents, [
    {
      actorUserId: "7",
      targetWorkspaceId: "22",
      action: "release_channel_changed",
      reason: "Liberação administrativa.",
      beforeState: { release_channel: "stable" },
      afterState: { release_channel: "canary" },
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
  assert.match(setClause, /release_channel = \$2/u);
  assert.match(setClause, /updated_at = CURRENT_TIMESTAMP/u);
  assert.doesNotMatch(
    setClause,
    /account_status|is_active|max_profiles|min_profiles|activated_at/u,
  );
  assert.match(statements[5], /AND release_channel = \$3/u);
});

test("aceita as transições de canal aprovadas, inclusive internal fora do workspace 1", async () => {
  for (const scenario of [
    ["stable", "canary"],
    ["canary", "beta"],
    ["beta", "stable"],
    ["stable", "internal"],
  ]) {
    const [current, desired] = scenario;
    const { db, service } = createSystem({ releaseChannel: current });
    const result = await service.updateReleaseChannel(
      input({ releaseChannel: desired, expectedReleaseChannel: current }),
    );
    assert.equal(result.workspace.workspaceId, "22");
    assert.equal(result.workspace.releaseChannel, desired);
    assert.equal(db.state.auditEvents.length, 1);
  }
});

test("repetição idempotente ignora expected defasado sem update ou auditoria", async () => {
  const { db, service } = createSystem({ releaseChannel: "canary" });
  assert.deepEqual(await service.updateReleaseChannel(input()), {
    workspace: { workspaceId: "22", releaseChannel: "canary" },
  });
  assert.equal(db.state.workspace.updatedAt, INITIAL_UPDATED_AT);
  assert.deepEqual(db.state.auditEvents, []);
  assert.equal(
    db.state.calls.some(({ sql }) => /update-workspace|insert-audit/u.test(sql)),
    false,
  );
  assert.equal(db.state.calls.at(-1).sql, "COMMIT");
});

test("expected divergente com desired diferente retorna conflito", async () => {
  const { db, service } = createSystem({ releaseChannel: "beta" });
  await assert.rejects(
    service.updateReleaseChannel(input()),
    AdminWorkspaceReleaseChannelConflictError,
  );
  assert.equal(db.state.workspace.releaseChannel, "beta");
  assert.equal(db.state.workspace.updatedAt, INITIAL_UPDATED_AT);
  assert.deepEqual(db.state.auditEvents, []);
  assert.equal(db.state.calls.at(-1).sql, "ROLLBACK");
});

test("Admin removido e workspace inexistente falham antes do update", async () => {
  const denied = createSystem({ actorIsAdmin: false });
  await assert.rejects(
    denied.service.updateReleaseChannel(input()),
    AdminWorkspaceAuthorizationError,
  );
  assert.equal(
    denied.db.state.calls.some(({ sql }) => /lock-workspace/u.test(sql)),
    false,
  );

  const missing = createSystem({ workspaceExists: false });
  await assert.rejects(
    missing.service.updateReleaseChannel(input()),
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
  const operation = service.updateReleaseChannel(input());
  db.state.actorIsAdmin = false;
  releaseActorCheck();
  await assert.rejects(operation, AdminWorkspaceAuthorizationError);
  assert.equal(db.state.workspace.releaseChannel, "stable");
  assert.deepEqual(db.state.auditEvents, []);
});

test("falhas de update e auditoria preservam canal, timestamp e histórico", async () => {
  const updateFailure = createSystem({ failUpdate: true });
  await assert.rejects(
    updateFailure.service.updateReleaseChannel(input()),
    /sensitive update failure/u,
  );
  assert.equal(updateFailure.db.state.workspace.releaseChannel, "stable");
  assert.deepEqual(updateFailure.db.state.auditEvents, []);

  const auditFailure = createSystem({ failAudit: true });
  await assert.rejects(
    auditFailure.service.updateReleaseChannel(input()),
    /sensitive audit failure/u,
  );
  assert.equal(auditFailure.db.state.workspace.releaseChannel, "stable");
  assert.equal(auditFailure.db.state.workspace.updatedAt, INITIAL_UPDATED_AT);
  assert.deepEqual(auditFailure.db.state.auditEvents, []);
  assert.equal(auditFailure.db.state.calls.at(-1).sql, "ROLLBACK");
  assert.equal(auditFailure.db.state.releasedClients, 1);
});

test("mudanças concorrentes com a mesma expectativa não se sobrescrevem", async () => {
  const { db, service } = createSystem();
  const results = await Promise.allSettled([
    service.updateReleaseChannel(input({ releaseChannel: "canary" })),
    service.updateReleaseChannel(input({ releaseChannel: "beta" })),
  ]);

  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  const rejected = results.find(({ status }) => status === "rejected");
  assert.ok(rejected.reason instanceof AdminWorkspaceReleaseChannelConflictError);
  assert.equal(db.state.auditEvents.length, 1);
  assert.equal(
    db.state.auditEvents[0].afterState.release_channel,
    db.state.workspace.releaseChannel,
  );
  assert.equal(db.state.releasedClients, 2);
});

test("erros internos do repository permanecem separados dos aborts públicos", () => {
  const error = new AdminWorkspaceReleaseChannelRepositoryError(
    ERROR_REASONS.CONFLICT,
  );
  assert.equal(error.reason, "release_channel_conflict");
});
