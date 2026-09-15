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
  AdminWorkspaceAuthorizationError,
  AdminWorkspaceStatusConflictError,
} = require("../src/services/adminWorkspaceStatusService");
const {
  createAdminRouter,
  setAdminNoStore,
} = require("../src/routes/adminRoutes");

function context({ accountStatus = "active", isActive = true } = {}) {
  return {
    user: { id: "7", name: "Admin", email: "admin@example.com" },
    membership: { userId: "7", workspaceId: "11", role: "owner" },
    workspace: {
      id: "11",
      name: "Conta A",
      accountStatus,
      isActive,
      timezone: "America/Sao_Paulo",
      releaseChannel: "stable",
      minProfiles: 2,
      maxProfiles: 5,
    },
  };
}

function readService() {
  return {
    listWorkspaces: async () => ({
      workspaces: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
    }),
    getWorkspaceDetails: async () => {
      throw new Error("unexpected details call");
    },
    listWorkspaceAudit: async () => {
      throw new Error("unexpected audit call");
    },
  };
}

async function withServer(options, operation) {
  const calls = { outerAdmin: 0, status: [] };
  const app = express();
  app.use("/api/admin", setAdminNoStore);
  app.use(express.json());
  app.use(jsonParseErrorHandler);

  const requireAuthenticatedContext = createRequireAuthenticatedContext({
    accessTokenService: { verify: () => ({ sub: "7", ver: 2 }) },
    identityService: { resolve: async () => options.context || context() },
    logger: { error: () => {}, warn: () => {} },
  });
  const requireAdmin = createRequireAdmin({
    db: {
      query: async () => {
        calls.outerAdmin += 1;
        return {
          rows: [{ is_admin: options.isAdmin === true }],
          rowCount: 1,
        };
      },
    },
    logger: { error: () => {} },
  });

  function statusMethod(method, accountStatus) {
    return async (input) => {
      calls.status.push({ method, input });
      if (options.error) throw options.error;
      return {
        workspace: {
          workspaceId: input.workspaceId,
          accountStatus,
          activatedAt:
            method === "activate"
              ? "2026-09-13T15:10:20.123Z"
              : options.activatedAt ?? "2026-08-01T10:20:30.654Z",
        },
      };
    };
  }

  const workspaceStatusService = {
    activateWorkspace: statusMethod("activate", "active"),
    suspendWorkspace: statusMethod("suspend", "suspended"),
    reactivateWorkspace: statusMethod("reactivate", "active"),
  };
  app.use(
    "/api/admin",
    requireAuthenticatedContext,
    requireAdmin,
    createAdminRouter({
      workspaceService: readService(),
      workspaceStatusService,
      workspaceMaxProfilesService: {
        updateMaxProfiles: async () => {
          throw new Error("unexpected max profiles update");
        },
      },
      workspaceReleaseChannelService: {
        updateReleaseChannel: async () => {
          throw new Error("unexpected release channel update");
        },
      },
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

function request(baseUrl, path, { body, headers = {}, ...options } = {}) {
  return fetch(`${baseUrl}/api/admin${path}`, {
    method: "POST",
    ...options,
    headers: {
      Authorization: "Bearer valid-access-token",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body } : {}),
  });
}

test("sem sessão e usuário comum são bloqueados antes da mutação", async () => {
  await withServer({}, async (baseUrl, calls) => {
    const anonymous = await fetch(
      `${baseUrl}/api/admin/workspaces/22/activate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Aprovação." }),
      },
    );
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("cache-control"), "no-store");

    const common = await request(baseUrl, "/workspaces/22/activate", {
      body: JSON.stringify({ reason: "Aprovação." }),
    });
    assert.equal(common.status, 403);
    assert.equal(common.headers.get("cache-control"), "no-store");
    assert.deepEqual(calls.status, []);
  });
});

test("rotas fixas usam ator da sessão, alvo da rota e reason normalizada", async () => {
  await withServer(
    { isAdmin: true, context: context({ accountStatus: "pending" }) },
    async (baseUrl, calls) => {
      const routes = ["activate", "suspend", "reactivate"];
      for (const action of routes) {
        const response = await request(
          baseUrl,
          `/workspaces/22/${action}`,
          {
            body: JSON.stringify({ reason: "  Linha 1\r\nLinha 2  " }),
            headers: { "X-Actor-Id": "99", "X-Is-Admin": "false" },
          },
        );
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal((await response.json()).workspace.workspaceId, "22");
      }

      assert.deepEqual(
        calls.status.map(({ method, input }) => ({ method, input })),
        routes.map((method) => ({
          method,
          input: {
            actorUserId: "7",
            workspaceId: "22",
            reason: "Linha 1\nLinha 2",
          },
        })),
      );
    },
  );
});

test("status e kill switch do workspace próprio não bloqueiam Admin", async () => {
  for (const ownContext of [
    context({ accountStatus: "pending" }),
    context({ accountStatus: "suspended" }),
    context({ accountStatus: "active", isActive: false }),
  ]) {
    await withServer(
      { isAdmin: true, context: ownContext },
      async (baseUrl, calls) => {
        const response = await request(baseUrl, "/workspaces/22/activate", {
          body: JSON.stringify({ reason: "Aprovação." }),
        });
        assert.equal(response.status, 200);
        assert.equal(calls.status.length, 1);
      },
    );
  }
});

test("payloads e queries inválidos retornam 400 antes do service", async () => {
  await withServer({ isAdmin: true }, async (baseUrl, calls) => {
    const cases = [
      { path: "/workspaces/22/activate" },
      { path: "/workspaces/22/activate", body: "{}" },
      { path: "/workspaces/22/activate", body: '{"reason":"   "}' },
      { path: "/workspaces/22/activate", body: '{"reason":7}' },
      {
        path: "/workspaces/22/activate",
        body: '{"reason":"A","actor_user_id":"99"}',
      },
      {
        path: "/workspaces/22/activate",
        body: '{"reason":"A","account_status":"active"}',
      },
      {
        path: "/workspaces/22/activate",
        body: '{"reason":"A","__proto__":"x"}',
      },
      {
        path: "/workspaces/22/activate?is_admin=true",
        body: '{"reason":"A"}',
      },
      { path: "/workspaces/0/activate", body: '{"reason":"A"}' },
    ];

    for (const item of cases) {
      const response = await request(baseUrl, item.path, { body: item.body });
      assert.equal(response.status, 400, JSON.stringify(item));
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal((await response.json()).code, "VALIDATION_ERROR");
    }
    assert.deepEqual(calls.status, []);
  });
});

test("erros de domínio e falha interna têm respostas estáveis e sanitizadas", async () => {
  const cases = [
    {
      error: new AdminWorkspaceAuthorizationError(),
      status: 403,
      code: "ADMIN_ACCESS_DENIED",
    },
    {
      error: new AdminWorkspaceNotFoundError(),
      status: 404,
      code: "NOT_FOUND",
    },
    {
      error: new AdminWorkspaceStatusConflictError(),
      status: 409,
      code: "ADMIN_WORKSPACE_STATUS_CONFLICT",
    },
    { error: new Error("sensitive database failure"), status: 500, code: "INTERNAL_ERROR" },
  ];

  for (const item of cases) {
    await withServer(
      { isAdmin: true, error: item.error },
      async (baseUrl) => {
        const response = await request(baseUrl, "/workspaces/22/activate", {
          body: JSON.stringify({ reason: "Aprovação." }),
        });
        const body = await response.json();
        assert.equal(response.status, item.status);
        assert.equal(body.code, item.code);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.doesNotMatch(JSON.stringify(body), /sensitive|database/iu);
      },
    );
  }
});

test("JSON malformado recebe 400 e no-store antes da autorização", async () => {
  await withServer({ isAdmin: true }, async (baseUrl, calls) => {
    const response = await request(baseUrl, "/workspaces/22/activate", {
      body: "{",
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).code, "VALIDATION_ERROR");
    assert.equal(calls.outerAdmin, 0);
    assert.deepEqual(calls.status, []);
  });
});
