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
} = require("../src/services/adminWorkspaceStatusService");
const {
  AdminWorkspaceReleaseChannelConflictError,
} = require("../src/services/adminWorkspaceReleaseChannelService");
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
      maxProfiles: 4,
    },
  };
}

function unrelatedServices() {
  return {
    workspaceService: {
      listWorkspaces: async () => { throw new Error("unexpected list"); },
      getWorkspaceDetails: async () => { throw new Error("unexpected details"); },
      listWorkspaceAudit: async () => { throw new Error("unexpected audit"); },
    },
    workspaceStatusService: {
      activateWorkspace: async () => { throw new Error("unexpected activate"); },
      suspendWorkspace: async () => { throw new Error("unexpected suspend"); },
      reactivateWorkspace: async () => { throw new Error("unexpected reactivate"); },
    },
    workspaceMaxProfilesService: {
      updateMaxProfiles: async () => { throw new Error("unexpected profiles"); },
    },
  };
}

async function withServer(options, operation) {
  const calls = { outerAdmin: 0, updates: [] };
  const app = express();
  app.use("/api/admin", setAdminNoStore);
  app.use(express.json());
  app.use(jsonParseErrorHandler);

  const requireAuthenticatedContext = createRequireAuthenticatedContext({
    accessTokenService: { verify: () => ({ sub: "7", ver: 2 }) },
    identityService: {
      resolve: async () => options.context || context(),
    },
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

  const workspaceReleaseChannelService = {
    updateReleaseChannel: async (input) => {
      calls.updates.push(input);
      if (options.error) throw options.error;
      return {
        workspace: {
          workspaceId: input.workspaceId,
          releaseChannel: input.releaseChannel,
        },
      };
    },
  };

  app.use(
    "/api/admin",
    requireAuthenticatedContext,
    requireAdmin,
    createAdminRouter({
      ...unrelatedServices(),
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

function request(baseUrl, path, { body, headers = {} } = {}) {
  return fetch(`${baseUrl}/api/admin${path}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer valid-access-token",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body } : {}),
  });
}

const VALID_BODY = JSON.stringify({
  releaseChannel: "canary",
  expectedReleaseChannel: "stable",
  reason: "Liberação administrativa.",
});

test("sem sessão e usuário comum são bloqueados antes da alteração", async () => {
  await withServer({}, async (baseUrl, calls) => {
    const anonymous = await fetch(
      `${baseUrl}/api/admin/workspaces/22/release-channel`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: VALID_BODY,
      },
    );
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("cache-control"), "no-store");

    const common = await request(baseUrl, "/workspaces/22/release-channel", {
      body: VALID_BODY,
    });
    assert.equal(common.status, 403);
    assert.equal(common.headers.get("cache-control"), "no-store");
    assert.deepEqual(calls.updates, []);
  });
});

test("usa ator da sessão e alvo da rota, ignorando headers forjados", async () => {
  await withServer({ isAdmin: true }, async (baseUrl, calls) => {
    const response = await request(baseUrl, "/workspaces/22/release-channel", {
      body: JSON.stringify({
        releaseChannel: "canary",
        expectedReleaseChannel: "stable",
        reason: "  Linha 1\r\nLinha 2  ",
      }),
      headers: { "X-Actor-Id": "99", "X-Workspace-Id": "99" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      workspace: { workspaceId: "22", releaseChannel: "canary" },
    });
    assert.deepEqual(calls.updates, [
      {
        actorUserId: "7",
        workspaceId: "22",
        releaseChannel: "canary",
        expectedReleaseChannel: "stable",
        reason: "Linha 1\nLinha 2",
      },
    ]);
  });
});

test("status e kill switch do workspace próprio não bloqueiam Admin", async () => {
  for (const ownContext of [
    context({ accountStatus: "pending" }),
    context({ accountStatus: "suspended" }),
    context({ isActive: false }),
  ]) {
    await withServer(
      { isAdmin: true, context: ownContext },
      async (baseUrl, calls) => {
        const response = await request(baseUrl, "/workspaces/22/release-channel", {
          body: VALID_BODY,
        });
        assert.equal(response.status, 200);
        assert.equal(calls.updates.length, 1);
      },
    );
  }
});

test("payloads, query e workspaceId inválidos retornam 400", async () => {
  await withServer({ isAdmin: true }, async (baseUrl, calls) => {
    const cases = [
      { path: "/workspaces/22/release-channel" },
      { path: "/workspaces/22/release-channel", body: "{}" },
      {
        path: "/workspaces/22/release-channel",
        body: '{"releaseChannel":"Stable","expectedReleaseChannel":"stable","reason":"A"}',
      },
      {
        path: "/workspaces/22/release-channel",
        body: '{"releaseChannel":"canary","expectedReleaseChannel":"stable","reason":"A","actor_user_id":"99"}',
      },
      {
        path: "/workspaces/22/release-channel",
        body: '{"releaseChannel":"canary","expectedReleaseChannel":"stable","reason":"A","__proto__":"x"}',
      },
      { path: "/workspaces/22/release-channel?is_admin=true", body: VALID_BODY },
      { path: "/workspaces/0/release-channel", body: VALID_BODY },
    ];

    for (const item of cases) {
      const response = await request(baseUrl, item.path, { body: item.body });
      assert.equal(response.status, 400, JSON.stringify(item));
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal((await response.json()).code, "VALIDATION_ERROR");
    }
    assert.deepEqual(calls.updates, []);
  });
});

test("erros de domínio e falha interna são estáveis e sanitizados", async () => {
  const cases = [
    {
      error: new AdminWorkspaceAuthorizationError(),
      status: 403,
      code: "ADMIN_ACCESS_DENIED",
    },
    { error: new AdminWorkspaceNotFoundError(), status: 404, code: "NOT_FOUND" },
    {
      error: new AdminWorkspaceReleaseChannelConflictError(),
      status: 409,
      code: "ADMIN_WORKSPACE_RELEASE_CHANNEL_CONFLICT",
    },
    { error: new Error("sensitive database failure"), status: 500, code: "INTERNAL_ERROR" },
  ];

  for (const item of cases) {
    await withServer({ isAdmin: true, error: item.error }, async (baseUrl) => {
      const response = await request(baseUrl, "/workspaces/22/release-channel", {
        body: VALID_BODY,
      });
      const body = await response.json();
      assert.equal(response.status, item.status);
      assert.equal(body.code, item.code);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(JSON.stringify(body), /sensitive|database/iu);
    });
  }
});

test("JSON malformado retorna 400 e no-store antes da autorização", async () => {
  await withServer({ isAdmin: true }, async (baseUrl, calls) => {
    const response = await request(baseUrl, "/workspaces/22/release-channel", {
      body: "{",
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).code, "VALIDATION_ERROR");
    assert.equal(calls.outerAdmin, 0);
    assert.deepEqual(calls.updates, []);
  });
});
