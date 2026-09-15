const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const express = require("express");
const jsonParseErrorHandler = require("../src/middleware/jsonParseErrorHandler");
const {
  createRequireAuthenticatedContext,
} = require("../src/middleware/requireAuthenticatedContext");
const { createRequireAdmin } = require("../src/middleware/requireAdmin");
const {
  createAdminRouter,
  setAdminNoStore,
} = require("../src/routes/adminRoutes");

function createContext({
  role = "owner",
  accountStatus = "active",
  isActive = true,
} = {}) {
  return {
    user: { id: "7", name: "Maria", email: "maria@example.com" },
    membership: { userId: "7", workspaceId: "11", role },
    workspace: {
      id: "11",
      name: "Maria",
      accountStatus,
      isActive,
      timezone: "America/Sao_Paulo",
      releaseChannel: "stable",
      minProfiles: 2,
      maxProfiles: 2,
    },
  };
}

async function withServer(options, operation) {
  const state = { isAdmin: options.isAdmin === true, adminQueries: 0 };
  const app = express();

  app.use("/api/admin", setAdminNoStore);
  app.use(express.json());
  app.use(jsonParseErrorHandler);

  const requireAuthenticatedContext = createRequireAuthenticatedContext({
    accessTokenService: {
      verify: () => options.claims || { sub: "7", ver: 2 },
    },
    identityService: {
      resolve: async () => options.context || createContext(),
    },
    logger: { error: () => {}, warn: () => {} },
  });
  const requireAdmin = createRequireAdmin({
    db: {
      query: async () => {
        state.adminQueries += 1;
        return {
          rows: [{ is_admin: state.isAdmin }],
          rowCount: 1,
        };
      },
    },
    logger: { error: () => {} },
  });

  app.use(
    "/api/admin",
    requireAuthenticatedContext,
    requireAdmin,
    createAdminRouter({
      workspaceService: {
        listWorkspaces: async () => {
          throw new Error("unexpected workspace list");
        },
        getWorkspaceDetails: async () => {
          throw new Error("unexpected workspace details");
        },
        listWorkspaceAudit: async () => {
          throw new Error("unexpected workspace audit");
        },
      },
      workspaceStatusService: {
        activateWorkspace: async () => {
          throw new Error("unexpected workspace activation");
        },
        suspendWorkspace: async () => {
          throw new Error("unexpected workspace suspension");
        },
        reactivateWorkspace: async () => {
          throw new Error("unexpected workspace reactivation");
        },
      },
      workspaceMaxProfilesService: {
        updateMaxProfiles: async () => {
          throw new Error("unexpected max profiles update");
        },
      },
      logger: { error: () => {} },
    }),
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await operation(`http://127.0.0.1:${server.address().port}`, state);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function adminRequest(baseUrl, options = {}) {
  return fetch(`${baseUrl}/api/admin/me${options.query || ""}`, {
    headers: {
      Authorization: "Bearer valid-access-token",
      ...(options.headers || {}),
    },
  });
}

test("index monta no-store antes do parser e protege o namespace sem gate operacional", () => {
  const indexSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "index.js"),
    "utf8",
  );
  const noStoreIndex = indexSource.indexOf(
    'app.use("/api/admin", setAdminNoStore);',
  );
  const jsonParserIndex = indexSource.indexOf("app.use(express.json());");

  assert.notEqual(noStoreIndex, -1);
  assert.ok(noStoreIndex < jsonParserIndex);

  const adminMount = indexSource.match(
    /app\.use\(\s*"\/api\/admin",\s*requireAuthenticatedContext,\s*requireAdmin,\s*adminRouter,\s*\);/,
  );
  assert.ok(adminMount);
  assert.doesNotMatch(adminMount[0], /requireOperationalAccess/);
});

test("namespace sem sessão retorna 401 e no-store", async () => {
  await withServer({}, async (baseUrl, state) => {
    const response = await fetch(`${baseUrl}/api/admin/me`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      error: "Token de acesso inválido ou expirado.",
      code: "INVALID_ACCESS_TOKEN",
    });
    assert.equal(state.adminQueries, 0);
  });
});

test("owner e member sem is_admin recebem 403", async () => {
  for (const role of ["owner", "member"]) {
    await withServer(
      { context: createContext({ role }) },
      async (baseUrl, state) => {
        const response = await adminRequest(baseUrl);
        assert.equal(response.status, 403);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal((await response.json()).code, "ADMIN_ACCESS_DENIED");
        assert.equal(state.adminQueries, 1);
      },
    );
  }
});

test("Admin recebe contrato mínimo 200", async () => {
  await withServer({ isAdmin: true }, async (baseUrl) => {
    const response = await adminRequest(baseUrl);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { admin: true });
  });
});

test("valores forjados no cliente continuam recebendo 403", async () => {
  await withServer(
    { claims: { sub: "7", ver: 2, is_admin: true, role: "admin" } },
    async (baseUrl) => {
      const response = await adminRequest(baseUrl, {
        query: "?is_admin=true&actor=1",
        headers: {
          "X-Is-Admin": "true",
          "X-Admin": "true",
          "X-Actor-Id": "1",
        },
      });
      assert.equal(response.status, 403);
    },
  );
});

test("no-store é aplicado antes do parser JSON", async () => {
  await withServer({}, async (baseUrl, state) => {
    const response = await fetch(`${baseUrl}/api/admin/me`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      error: "JSON inválido.",
      code: "VALIDATION_ERROR",
    });
    assert.equal(state.adminQueries, 0);
  });
});

test("remoção server-side bloqueia a próxima request", async () => {
  await withServer({ isAdmin: true }, async (baseUrl, state) => {
    const first = await adminRequest(baseUrl);
    assert.equal(first.status, 200);

    state.isAdmin = false;
    const second = await adminRequest(baseUrl);
    assert.equal(second.status, 403);
    assert.equal(state.adminQueries, 2);
  });
});

test("status e is_active do workspace não interferem no Admin", async () => {
  const cases = [
    { accountStatus: "pending", isActive: true },
    { accountStatus: "suspended", isActive: true },
    { accountStatus: "active", isActive: false },
  ];

  for (const item of cases) {
    await withServer(
      { isAdmin: true, context: createContext(item) },
      async (baseUrl) => {
        const response = await adminRequest(baseUrl);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { admin: true });
      },
    );
  }
});
