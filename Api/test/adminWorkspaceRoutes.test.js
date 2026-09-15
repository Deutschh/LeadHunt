const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const jsonParseErrorHandler = require("../src/middleware/jsonParseErrorHandler");
const {
  createRequireAuthenticatedContext,
} = require("../src/middleware/requireAuthenticatedContext");
const { createRequireAdmin } = require("../src/middleware/requireAdmin");
const {
  AdminWorkspaceNotFoundError,
} = require("../src/services/adminWorkspaceService");
const {
  createAdminRouter,
  setAdminNoStore,
} = require("../src/routes/adminRoutes");

function createContext({
  role = "owner",
  accountStatus = "active",
  isActive = true,
  workspaceId = "11",
} = {}) {
  return {
    user: { id: "7", name: "Admin", email: "admin@example.com" },
    membership: { userId: "7", workspaceId, role },
    workspace: {
      id: workspaceId,
      name: "Conta de origem",
      accountStatus,
      isActive,
      timezone: "America/Sao_Paulo",
      releaseChannel: "stable",
      minProfiles: 2,
      maxProfiles: 5,
    },
  };
}

function defaultResults() {
  return {
    list: {
      workspaces: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
    },
    details: {
      workspaceId: "22",
      workspaceName: "Conta alvo",
      accountStatus: "pending",
      isActive: false,
      timezone: "America/Sao_Paulo",
      releaseChannel: "stable",
      minProfiles: 2,
      maxProfiles: 5,
      createdAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "2026-01-02T10:00:00.000Z",
      activatedAt: null,
      members: [],
    },
    audit: {
      workspaceId: "22",
      auditEvents: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
    },
  };
}

async function withServer(options, operation) {
  const calls = { admin: 0, list: [], details: [], audit: [] };
  const results = { ...defaultResults(), ...(options.results || {}) };
  const errors = options.errors || {};
  const app = express();

  app.use("/api/admin", setAdminNoStore);
  app.use(express.json());
  app.use(jsonParseErrorHandler);

  const requireAuthenticatedContext = createRequireAuthenticatedContext({
    accessTokenService: { verify: () => options.claims || { sub: "7", ver: 2 } },
    identityService: {
      resolve: async () => options.context || createContext(),
    },
    logger: { error: () => {}, warn: () => {} },
  });
  const requireAdmin = createRequireAdmin({
    db: {
      query: async () => {
        calls.admin += 1;
        return {
          rows: [{ is_admin: options.isAdmin === true }],
          rowCount: 1,
        };
      },
    },
    logger: { error: () => {} },
  });
  const workspaceService = {
    listWorkspaces: async (query) => {
      calls.list.push(query);
      if (errors.list) throw errors.list;
      return results.list;
    },
    getWorkspaceDetails: async (workspaceId) => {
      calls.details.push(workspaceId);
      if (errors.details) throw errors.details;
      return results.details;
    },
    listWorkspaceAudit: async (workspaceId, query) => {
      calls.audit.push({ workspaceId, query });
      if (errors.audit) throw errors.audit;
      return results.audit;
    },
  };
  const workspaceStatusService = {
    activateWorkspace: async () => {
      throw new Error("unexpected workspace activation");
    },
    suspendWorkspace: async () => {
      throw new Error("unexpected workspace suspension");
    },
    reactivateWorkspace: async () => {
      throw new Error("unexpected workspace reactivation");
    },
  };
  const workspaceMaxProfilesService = {
    updateMaxProfiles: async () => {
      throw new Error("unexpected max profiles update");
    },
  };
  const workspaceReleaseChannelService = {
    updateReleaseChannel: async () => {
      throw new Error("unexpected release channel update");
    },
  };

  app.use(
    "/api/admin",
    requireAuthenticatedContext,
    requireAdmin,
    createAdminRouter({
      workspaceService,
      workspaceStatusService,
      workspaceMaxProfilesService,
      workspaceReleaseChannelService,
      logger: { error: () => {} },
    }),
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await operation(`http://127.0.0.1:${server.address().port}`, calls);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function request(baseUrl, route, options = {}) {
  return fetch(`${baseUrl}/api/admin${route}`, {
    ...options,
    headers: {
      Authorization: "Bearer valid-access-token",
      ...(options.headers || {}),
    },
  });
}

test("barreira responde antes de qualquer consulta ao workspace alvo", async () => {
  await withServer({}, async (baseUrl, calls) => {
    const withoutSession = await fetch(`${baseUrl}/api/admin/workspaces/22`);
    assert.equal(withoutSession.status, 401);
    assert.equal(withoutSession.headers.get("cache-control"), "no-store");
    assert.equal(calls.admin, 0);
    assert.deepEqual(calls.details, []);

    for (const role of ["owner", "member"]) {
      const denied = await request(baseUrl, `/workspaces/22?role=${role}`);
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get("cache-control"), "no-store");
    }
    assert.equal(calls.admin, 2);
    assert.deepEqual(calls.details, []);
  });
});

test("Admin lista com validação normalizada e no-store", async () => {
  await withServer({ isAdmin: true }, async (baseUrl, calls) => {
    const response = await request(
      baseUrl,
      "/workspaces?page=2&pageSize=100&status=suspended&search=%20Maria%20",
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(calls.list, [
      { page: 2, pageSize: 100, status: "suspended", search: "Maria" },
    ]);
  });
});

test("Admin do workspace A consulta detalhes e auditoria somente do alvo B", async () => {
  await withServer(
    { isAdmin: true, context: createContext({ workspaceId: "11" }) },
    async (baseUrl, calls) => {
      const details = await request(baseUrl, "/workspaces/22");
      const audit = await request(
        baseUrl,
        "/workspaces/22/audit?page=3&pageSize=10",
      );

      assert.equal(details.status, 200);
      assert.equal(audit.status, 200);
      assert.equal(details.headers.get("cache-control"), "no-store");
      assert.equal(audit.headers.get("cache-control"), "no-store");
      assert.deepEqual(calls.details, ["22"]);
      assert.deepEqual(calls.audit, [
        { workspaceId: "22", query: { page: 3, pageSize: 10 } },
      ]);
      assert.equal((await details.json()).workspaceId, "22");
      assert.equal((await audit.json()).workspaceId, "22");
    },
  );
});

test("status e ativação do workspace próprio não removem privilégio Admin", async () => {
  for (const context of [
    createContext({ accountStatus: "pending" }),
    createContext({ accountStatus: "suspended" }),
    createContext({ accountStatus: "active", isActive: false }),
  ]) {
    await withServer({ isAdmin: true, context }, async (baseUrl, calls) => {
      const response = await request(baseUrl, "/workspaces");
      assert.equal(response.status, 200);
      assert.equal(calls.list.length, 1);
    });
  }
});

test("parâmetros forjados, duplicados ou inválidos falham antes do service", async () => {
  await withServer({ isAdmin: true }, async (baseUrl, calls) => {
    const cases = [
      "/workspaces?actor_user_id=7",
      "/workspaces?is_admin=true",
      "/workspaces?workspaceId=11",
      "/workspaces?page=1&page=2",
      "/workspaces?__proto__=x",
      "/workspaces?constructor=x",
      "/workspaces?toString=x",
      "/workspaces/0",
      "/workspaces/22?workspace_authority=11",
      "/workspaces/22/audit?action=account_activated",
    ];

    for (const route of cases) {
      const response = await request(baseUrl, route, {
        headers: { "X-Is-Admin": "true", "X-Actor-Id": "99" },
      });
      assert.equal(response.status, 400, route);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal((await response.json()).code, "VALIDATION_ERROR");
    }
    assert.deepEqual(calls.list, []);
    assert.deepEqual(calls.details, []);
    assert.deepEqual(calls.audit, []);
  });
});

test("workspace inexistente retorna 404 e falhas inesperadas retornam 500 sanitizado", async () => {
  await withServer(
    {
      isAdmin: true,
      errors: {
        details: new AdminWorkspaceNotFoundError(),
        audit: new Error("segredo interno"),
      },
    },
    async (baseUrl) => {
      const missing = await request(baseUrl, "/workspaces/99");
      assert.equal(missing.status, 404);
      assert.deepEqual(await missing.json(), {
        error: "Workspace não encontrado.",
        code: "NOT_FOUND",
      });

      const failed = await request(baseUrl, "/workspaces/22/audit");
      assert.equal(failed.status, 500);
      assert.deepEqual(await failed.json(), {
        error: "Erro interno ao consultar workspaces administrativos.",
        code: "INTERNAL_ERROR",
      });
      assert.equal(failed.headers.get("cache-control"), "no-store");
    },
  );
});

test("namespace não expõe handlers administrativos de escrita", async () => {
  await withServer({ isAdmin: true }, async (baseUrl, calls) => {
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const response = await request(baseUrl, "/workspaces/22", { method });
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.deepEqual(calls.list, []);
    assert.deepEqual(calls.details, []);
    assert.deepEqual(calls.audit, []);
  });
});
