const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createAdminWorkspaceRepository,
  escapeLikePattern,
} = require("../src/repositories/adminWorkspaceRepository");
const {
  AdminWorkspaceNotFoundError,
  createAdminWorkspaceService,
} = require("../src/services/adminWorkspaceService");

function recordingDb(rows = []) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows };
    },
  };
}

function workspaceRow(overrides = {}) {
  return {
    total_items: "1",
    workspace_id: "11",
    workspace_name: "Conta A",
    account_status: "active",
    is_active: true,
    release_channel: "stable",
    min_profiles: 2,
    max_profiles: 5,
    created_at: new Date("2026-01-01T10:00:00.000Z"),
    activated_at: null,
    owner_name: "Owner A",
    owner_email: "owner-a@example.com",
    last_login_at: new Date("2026-02-03T10:00:00.000Z"),
    ...overrides,
  };
}

function detailsRow(overrides = {}) {
  return {
    ...workspaceRow(),
    timezone: "America/Sao_Paulo",
    updated_at: new Date("2026-02-01T10:00:00.000Z"),
    member_user_id: "21",
    member_name: "Owner A",
    member_email: "owner-a@example.com",
    member_role: "owner",
    member_last_login_at: new Date("2026-02-03T10:00:00.000Z"),
    member_created_at: new Date("2026-01-01T11:00:00.000Z"),
    ...overrides,
  };
}

function auditRow(overrides = {}) {
  return {
    workspace_exists: true,
    total_items: "1",
    audit_event_id: "101",
    action: "account_activated",
    reason: "Cadastro aprovado.",
    before_state: { account_status: "pending", activated_at: null },
    after_state: {
      account_status: "active",
      activated_at: "2026-02-01T10:00:00.000Z",
    },
    created_at: new Date("2026-02-01T10:00:00.000Z"),
    actor_user_id: "7",
    actor_name: "Admin",
    actor_email: "admin@example.com",
    ...overrides,
  };
}

test("repository lista com filtros fixos, busca literal e agregações sem duplicação", async () => {
  const db = recordingDb();
  const repository = createAdminWorkspaceRepository({ db });
  await repository.listWorkspaces({
    page: 2,
    pageSize: 10,
    status: "active",
    search: "100%_\\",
  });

  assert.equal(db.calls.length, 1);
  const [{ sql, params }] = db.calls;
  assert.match(sql, /WITH filtered_workspaces AS/u);
  assert.match(sql, /w\.account_status = \$1/u);
  assert.match(sql, /OR EXISTS \(/u);
  assert.match(sql, /search_membership\.workspace_id = w\.id/u);
  assert.match(sql, /MAX\(member_user\.last_login_at\)/u);
  assert.match(
    sql,
    /ORDER BY owner_membership\.created_at ASC, owner_membership\.user_id ASC/u,
  );
  assert.match(sql, /ORDER BY paged\.created_at DESC NULLS LAST, paged\.id DESC NULLS LAST/u);
  assert.doesNotMatch(sql, /100%_/u);
  assert.deepEqual(params, ["active", escapeLikePattern("100%_\\"), 10, "10"]);
});

test("repository mantém detalhes e histórico estritamente no alvo parametrizado", async () => {
  const db = recordingDb();
  const repository = createAdminWorkspaceRepository({ db });

  await repository.findWorkspaceDetailsById("22");
  await repository.listWorkspaceAudit("22", { page: 3, pageSize: 25 });

  assert.equal(db.calls.length, 2);
  assert.match(db.calls[0].sql, /w\.id::TEXT AS workspace_id/u);
  assert.match(db.calls[0].sql, /WHERE w\.id = \$1/u);
  assert.match(db.calls[0].sql, /LEFT JOIN public\.workspace_members/u);
  assert.match(db.calls[0].sql, /membership\.created_at AS member_created_at/u);
  assert.deepEqual(db.calls[0].params, ["22"]);

  assert.match(db.calls[1].sql, /WITH target_workspace AS/u);
  assert.match(db.calls[1].sql, /WHERE id = \$1/u);
  assert.match(
    db.calls[1].sql,
    /audit_event\.target_workspace_id = target\.id/u,
  );
  assert.match(db.calls[1].sql, /ORDER BY created_at DESC, id DESC/u);
  assert.deepEqual(db.calls[1].params, ["22", 25, "50"]);
  assert.doesNotMatch(
    `${db.calls[0].sql}\n${db.calls[1].sql}`,
    /^\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/imu,
  );
});

test("service mapeia lista, owner, último login, activatedAt null e totais", async () => {
  const repository = {
    listWorkspaces: async () => [workspaceRow()],
    findWorkspaceDetailsById: async () => [],
    listWorkspaceAudit: async () => [],
  };
  const service = createAdminWorkspaceService({ repository });
  const result = await service.listWorkspaces({ page: 1, pageSize: 25 });

  assert.deepEqual(result, {
    workspaces: [
      {
        workspaceId: "11",
        workspaceName: "Conta A",
        accountStatus: "active",
        isActive: true,
        releaseChannel: "stable",
        minProfiles: 2,
        maxProfiles: 5,
        createdAt: "2026-01-01T10:00:00.000Z",
        activatedAt: null,
        lastLoginAt: "2026-02-03T10:00:00.000Z",
        owner: { name: "Owner A", email: "owner-a@example.com" },
      },
    ],
    pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
  });
});

test("service representa página vazia e workspace sem owner", async () => {
  const repository = {
    listWorkspaces: async ({ page }) =>
      page === 1
        ? [workspaceRow({ owner_name: null, owner_email: null, last_login_at: null })]
        : [{ total_items: "1", workspace_id: null }],
    findWorkspaceDetailsById: async () => [],
    listWorkspaceAudit: async () => [],
  };
  const service = createAdminWorkspaceService({ repository });

  const first = await service.listWorkspaces({ page: 1, pageSize: 1 });
  assert.equal(first.workspaces[0].owner, null);
  assert.equal(first.workspaces[0].lastLoginAt, null);

  const beyond = await service.listWorkspaces({ page: 2, pageSize: 1 });
  assert.deepEqual(beyond.workspaces, []);
  assert.deepEqual(beyond.pagination, {
    page: 2,
    pageSize: 1,
    totalItems: 1,
    totalPages: 1,
  });
});

test("service retorna detalhes com membros e createdAt do membership", async () => {
  const repository = {
    listWorkspaces: async () => [],
    findWorkspaceDetailsById: async () => [
      detailsRow(),
      detailsRow({
        member_user_id: "22",
        member_name: "Membro B",
        member_email: "member-b@example.com",
        member_role: "member",
        member_last_login_at: null,
        member_created_at: new Date("2026-01-02T11:00:00.000Z"),
      }),
    ],
    listWorkspaceAudit: async () => [],
  };
  const service = createAdminWorkspaceService({ repository });
  const details = await service.getWorkspaceDetails("11");

  assert.equal(details.workspaceId, "11");
  assert.equal(details.timezone, "America/Sao_Paulo");
  assert.equal(details.members.length, 2);
  assert.deepEqual(details.members[1], {
    userId: "22",
    name: "Membro B",
    email: "member-b@example.com",
    role: "member",
    lastLoginAt: null,
    createdAt: "2026-01-02T11:00:00.000Z",
  });
});

test("service diferencia workspace ausente de histórico vazio", async () => {
  const repository = {
    listWorkspaces: async () => [],
    findWorkspaceDetailsById: async () => [],
    listWorkspaceAudit: async (workspaceId) => [
      {
        workspace_exists: workspaceId === "11",
        total_items: "0",
        audit_event_id: null,
      },
    ],
  };
  const service = createAdminWorkspaceService({ repository });

  await assert.rejects(
    service.getWorkspaceDetails("99"),
    AdminWorkspaceNotFoundError,
  );
  await assert.rejects(
    service.listWorkspaceAudit("99", { page: 1, pageSize: 25 }),
    AdminWorkspaceNotFoundError,
  );
  assert.deepEqual(
    await service.listWorkspaceAudit("11", { page: 1, pageSize: 25 }),
    {
      workspaceId: "11",
      auditEvents: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
    },
  );
});

test("service expõe somente snapshots administrativos allowlisted", async () => {
  const repository = {
    listWorkspaces: async () => [],
    findWorkspaceDetailsById: async () => [],
    listWorkspaceAudit: async () => [auditRow()],
  };
  const service = createAdminWorkspaceService({ repository });
  const result = await service.listWorkspaceAudit("11", {
    page: 1,
    pageSize: 25,
  });

  assert.deepEqual(result.auditEvents[0], {
    id: "101",
    action: "account_activated",
    reason: "Cadastro aprovado.",
    beforeState: { accountStatus: "pending", activatedAt: null },
    afterState: {
      accountStatus: "active",
      activatedAt: "2026-02-01T10:00:00.000Z",
    },
    createdAt: "2026-02-01T10:00:00.000Z",
    actor: {
      userId: "7",
      name: "Admin",
      email: "admin@example.com",
    },
  });

  for (const unexpectedField of [
    "password_hash",
    "toString",
    "constructor",
    "__proto__",
  ]) {
    repository.listWorkspaceAudit = async () => [
      auditRow({
        after_state: { [unexpectedField]: "proibido" },
      }),
    ];
    await assert.rejects(
      service.listWorkspaceAudit("11", { page: 1, pageSize: 25 }),
      TypeError,
      unexpectedField,
    );
  }
});
