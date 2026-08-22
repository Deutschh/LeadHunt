const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AuthIdentityError,
  AuthIdentityUnavailableError,
  createAuthIdentityService,
  isTransientDatabaseError,
} = require("../src/services/authIdentityService");
const { createFakeAuthDb } = require("./helpers/fakeAuthDb");

function createIdentityFixture(overrides = {}) {
  const db = createFakeAuthDb({
    users: [
      {
        id: 7,
        name: "Maria Silva",
        email: "maria@example.com",
        password_hash: "not-selected",
        email_verified_at: new Date("2026-08-18T11:00:00.000Z"),
        auth_version: 2,
        account_status: "suspended",
      },
    ],
    workspaces: [
      {
        id: 11,
        slug: "ws-test",
        name: "Maria Silva",
        account_status: overrides.accountStatus || "pending",
        is_active: overrides.isActive ?? true,
        timezone: "America/Sao_Paulo",
        release_channel: "stable",
        min_profiles: 2,
        max_profiles: 2,
      },
    ],
    memberships: [
      {
        user_id: 7,
        workspace_id: 11,
        role: overrides.role || "owner",
      },
    ],
    ...overrides.state,
  });

  return { db, service: createAuthIdentityService({ db }) };
}

async function expectIdentityError(operation, status, code) {
  await assert.rejects(operation, (error) => {
    assert.equal(error instanceof AuthIdentityError, true);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

test("resolve contexto mínimo com IDs BIGINT como string e workspace do banco", async () => {
  const { db, service } = createIdentityFixture();
  const context = await service.resolve({ userId: "7", authVersion: 2 });

  assert.deepEqual(context, {
    user: {
      id: "7",
      name: "Maria Silva",
      email: "maria@example.com",
    },
    membership: {
      userId: "7",
      workspaceId: "11",
      role: "owner",
    },
    workspace: {
      id: "11",
      name: "Maria Silva",
      accountStatus: "pending",
      isActive: true,
      timezone: "America/Sao_Paulo",
      releaseChannel: "stable",
      minProfiles: 2,
      maxProfiles: 2,
    },
  });
  assert.deepEqual(db.queryLog, ["resolve-context"]);
  assert.equal(Object.hasOwn(context.user, "authVersion"), false);
  assert.equal(Object.hasOwn(context.user, "accountStatus"), false);
});

test("query preserva LEFT JOIN e filtra somente pelo users.id", async () => {
  let capturedSql = "";
  const { db: baseDb } = createIdentityFixture();
  const db = {
    query: async (sql, params) => {
      capturedSql = sql;
      return baseDb.query(sql, params);
    },
  };
  await createAuthIdentityService({ db }).resolve({
    userId: "7",
    authVersion: 2,
  });

  assert.match(capturedSql, /LEFT JOIN public\.workspace_members/);
  assert.match(capturedSql, /LEFT JOIN public\.workspaces/);
  assert.match(capturedSql, /WHERE u\.id = \$1\s+LIMIT 2/);
  assert.doesNotMatch(capturedSql, /WHERE[\s\S]*wm\./);
  assert.doesNotMatch(capturedSql, /WHERE[\s\S]*w\./);
  assert.doesNotMatch(capturedSql, /password_hash|users\.account_status|is_admin/i);
});

test("user inexistente, não verificado e auth_version divergente retornam 401", async () => {
  const missing = createFakeAuthDb({ users: [], memberships: [] });
  await expectIdentityError(
    () =>
      createAuthIdentityService({ db: missing }).resolve({
        userId: "999",
        authVersion: 0,
      }),
    401,
    "INVALID_ACCESS_TOKEN",
  );

  const unverified = createIdentityFixture();
  unverified.db.state.users[0].email_verified_at = null;
  await expectIdentityError(
    () => unverified.service.resolve({ userId: "7", authVersion: 2 }),
    401,
    "INVALID_ACCESS_TOKEN",
  );

  const changed = createIdentityFixture();
  await expectIdentityError(
    () => changed.service.resolve({ userId: "7", authVersion: 3 }),
    401,
    "INVALID_ACCESS_TOKEN",
  );
});

test("user sem membership permanece na resultset e retorna conflito estrutural", async () => {
  const fixture = createIdentityFixture({ state: { memberships: [] } });
  await expectIdentityError(
    () => fixture.service.resolve({ userId: "7", authVersion: 2 }),
    409,
    "AUTH_STATE_CONFLICT",
  );
  assert.deepEqual(fixture.db.queryLog, ["resolve-context"]);
});

test("múltiplas memberships, workspace ausente e role inválida falham fechado", async () => {
  const multiple = createIdentityFixture({
    state: {
      memberships: [
        { user_id: 7, workspace_id: 11, role: "owner" },
        { user_id: 7, workspace_id: 12, role: "member" },
      ],
      workspaces: [
        { id: 11, name: "A", account_status: "active" },
        { id: 12, name: "B", account_status: "active" },
      ],
    },
  });
  await expectIdentityError(
    () => multiple.service.resolve({ userId: "7", authVersion: 2 }),
    409,
    "AUTH_STATE_CONFLICT",
  );

  const absentWorkspace = createIdentityFixture({
    state: {
      memberships: [{ user_id: 7, workspace_id: 99, role: "owner" }],
    },
  });
  await expectIdentityError(
    () => absentWorkspace.service.resolve({ userId: "7", authVersion: 2 }),
    409,
    "AUTH_STATE_CONFLICT",
  );

  const invalidRole = createIdentityFixture({ role: "admin" });
  await expectIdentityError(
    () => invalidRole.service.resolve({ userId: "7", authVersion: 2 }),
    409,
    "AUTH_STATE_CONFLICT",
  );

  const invalidStatus = createIdentityFixture({ accountStatus: "legacy" });
  await expectIdentityError(
    () => invalidStatus.service.resolve({ userId: "7", authVersion: 2 }),
    409,
    "AUTH_STATE_CONFLICT",
  );
});

test("owner/member e todos os estados comerciais resolvem sem gate", async () => {
  for (const role of ["owner", "member"]) {
    for (const accountStatus of ["pending", "active", "suspended"]) {
      const fixture = createIdentityFixture({
        role,
        accountStatus,
        isActive: false,
      });
      const context = await fixture.service.resolve({
        userId: "7",
        authVersion: 2,
      });
      assert.equal(context.membership.role, role);
      assert.equal(context.workspace.accountStatus, accountStatus);
      assert.equal(context.workspace.isActive, false);
    }
  }
});

test("somente falhas transitórias reconhecidas viram indisponibilidade", async () => {
  for (const code of [
    "08006",
    "53300",
    "57P03",
    "58000",
    "40001",
    "40P01",
    "55P03",
    "57014",
    "ECONNREFUSED",
    "ETIMEDOUT",
  ]) {
    assert.equal(isTransientDatabaseError({ code }), true);
  }
  assert.equal(
    isTransientDatabaseError({
      message: "timeout exceeded when trying to connect",
    }),
    true,
  );
  assert.equal(
    isTransientDatabaseError({ message: "Connection terminated unexpectedly" }),
    true,
  );
  assert.equal(isTransientDatabaseError({ code: "42703" }), false);
  assert.equal(isTransientDatabaseError(new Error("programming error")), false);

  const unavailableService = createAuthIdentityService({
    db: {
      query: async () => {
        throw Object.assign(new Error("not logged"), { code: "ECONNRESET" });
      },
    },
  });
  await assert.rejects(
    () => unavailableService.resolve({ userId: "7", authVersion: 2 }),
    AuthIdentityUnavailableError,
  );

  const programmingError = Object.assign(new Error("undefined column"), {
    code: "42703",
  });
  const internalService = createAuthIdentityService({
    db: { query: async () => Promise.reject(programmingError) },
  });
  await assert.rejects(
    () => internalService.resolve({ userId: "7", authVersion: 2 }),
    (error) => error === programmingError,
  );
});
