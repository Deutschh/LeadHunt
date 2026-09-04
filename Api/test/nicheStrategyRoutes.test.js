const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const jsonParseErrorHandler = require("../src/middleware/jsonParseErrorHandler");
const {
  createAccessTokenService,
} = require("../src/services/accessTokenService");
const {
  createRequireAuthenticatedContext,
} = require("../src/middleware/requireAuthenticatedContext");
const {
  createRequireOperationalAccess,
} = require("../src/middleware/requireOperationalAccess");
const {
  createNicheStrategyRepository,
} = require("../src/repositories/nicheStrategyRepository");
const {
  createNicheStrategyService,
} = require("../src/services/nicheStrategyService");
const {
  createNicheStrategyRouter,
} = require("../src/routes/nicheStrategyRoutes");
const {
  createOperationalWebRouter,
  setOperationalResourceNoStore,
} = require("../src/routes/operationalWebRoutes");

const JWT_CONFIG = Object.freeze({
  jwtSecret: "j".repeat(32),
  jwtKeyId: "niche-strategy-test",
  jwtIssuer: "leadhunt-api-test",
  jwtAudience: "leadhunt-web-test",
  accessTokenTtlSeconds: 600,
});

function strategyRow(overrides = {}) {
  return {
    id: 1,
    niche_name: "Dentistas",
    hook: "Foco comercial",
    call_to_action: "Podemos conversar?",
    workspace_id: "11",
    ...overrides,
  };
}

function validPayload(overrides = {}) {
  return {
    nicheName: "Dentistas",
    hook: "Foco comercial",
    callToAction: "Podemos conversar?",
    ...overrides,
  };
}

function authenticatedContext({
  userId = "7",
  workspaceId = "11",
  role = "owner",
  accountStatus = "active",
  isActive = true,
} = {}) {
  return {
    user: { id: userId, name: `User ${userId}`, email: `u${userId}@example.com` },
    membership: { userId, workspaceId, role },
    workspace: {
      id: workspaceId,
      name: `Workspace ${workspaceId}`,
      accountStatus,
      isActive,
      timezone: "America/Sao_Paulo",
      releaseChannel: "stable",
      minProfiles: 1,
      maxProfiles: 2,
    },
  };
}

function createFakeDb(initialRows = []) {
  const rows = initialRows.map((item) => ({ ...item }));
  const calls = [];
  let nextId = Math.max(0, ...rows.map(({ id }) => id)) + 1;

  return {
    calls,
    rows,
    fail: null,
    async query(sql, params) {
      const statement = String(sql);
      calls.push({ sql: statement, params });
      if (this.fail) throw this.fail;

      if (/^\s*SELECT/u.test(statement)) {
        let matches = rows.filter(({ workspace_id }) => workspace_id === params[0]);
        if (/AND niche_name = \$2/u.test(statement)) {
          matches = matches.filter(({ niche_name }) => niche_name === params[1]);
        }
        matches.sort((left, right) =>
          left.niche_name.localeCompare(right.niche_name) || left.id - right.id,
        );
        return { rows: matches.map((item) => ({ ...item })) };
      }

      if (/^\s*INSERT/u.test(statement)) {
        let persisted = rows.find(
          ({ workspace_id, niche_name }) =>
            workspace_id === params[0] && niche_name === params[1],
        );
        if (persisted) {
          persisted.hook = params[2];
          persisted.call_to_action = params[3];
        } else {
          persisted = strategyRow({
            id: nextId++,
            workspace_id: params[0],
            niche_name: params[1],
            hook: params[2],
            call_to_action: params[3],
          });
          rows.push(persisted);
        }
        return { rows: [{ ...persisted }] };
      }

      if (/^\s*DELETE/u.test(statement)) {
        const index = rows.findIndex(
          ({ id, workspace_id }) =>
            String(id) === params[0] && workspace_id === params[1],
        );
        if (index < 0) return { rows: [] };
        const [removed] = rows.splice(index, 1);
        return { rows: [{ id: removed.id }] };
      }

      throw new Error("SQL inesperado no fake DB");
    },
  };
}

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function request(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null,
  };
}

function createFixture({ contexts = {}, rows = [], logger } = {}) {
  const db = createFakeDb(rows);
  const accessTokenService = createAccessTokenService(JWT_CONFIG);
  const silentLogger = logger || { error() {}, warn() {} };
  const repository = createNicheStrategyRepository({ db });
  const service = createNicheStrategyService({ repository });
  const nicheStrategyRouter = createNicheStrategyRouter({
    service,
    logger: silentLogger,
  });
  const unusedRouter = express.Router();
  const app = express();
  app.use("/api/leads/niches", setOperationalResourceNoStore);
  app.use(express.json());
  app.use(jsonParseErrorHandler);
  app.use(
    "/api",
    createOperationalWebRouter({
      requireAuthenticatedContext: createRequireAuthenticatedContext({
        accessTokenService,
        identityService: {
          async resolve({ userId }) {
            const context = contexts[userId];
            if (!context) throw new Error("contexto de teste ausente");
            return context;
          },
        },
        logger: silentLogger,
      }),
      requireOperationalAccess: createRequireOperationalAccess({
        logger: silentLogger,
      }),
      leadsRouter: unusedRouter,
      briefingRouter: unusedRouter,
      serviceOpportunitiesRouter: unusedRouter,
      commercialProfileRouter: unusedRouter,
      serviceCatalogRouter: unusedRouter,
      nicheStrategyRouter,
    }),
  );
  app.get("/api/unrelated", (_req, res) => res.json({ unrelated: true }));

  return {
    app,
    db,
    issueToken(userId, extraClaims = {}) {
      if (Object.keys(extraClaims).length === 0) {
        return accessTokenService.issue({ userId, authVersion: 1 });
      }
      return jwt.sign(
        { token_use: "access", ver: 1, ...extraClaims },
        JWT_CONFIG.jwtSecret,
        {
          algorithm: "HS256",
          audience: JWT_CONFIG.jwtAudience,
          expiresIn: JWT_CONFIG.accessTokenTtlSeconds,
          issuer: JWT_CONFIG.jwtIssuer,
          keyid: JWT_CONFIG.jwtKeyId,
          subject: userId,
        },
      );
    },
  };
}

function bearer(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

test("no-store cobre JSON malformado sem atingir rota não relacionada", async (t) => {
  const fixture = createFixture();
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const malformed = await fetch(`${runtime.origin}/api/leads/niches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"nicheName":',
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    error: "JSON inválido.",
    code: "VALIDATION_ERROR",
  });
  assert.equal(malformed.headers.get("cache-control"), "no-store");

  const unrelated = await fetch(`${runtime.origin}/api/unrelated`);
  assert.equal(unrelated.status, 200);
  assert.equal(unrelated.headers.get("cache-control"), null);
});

test("acesso operacional bloqueia anonymous, pending, suspended e inactive", async (t) => {
  const fixture = createFixture({
    contexts: {
      "1": authenticatedContext({ userId: "1", accountStatus: "pending" }),
      "2": authenticatedContext({ userId: "2", accountStatus: "suspended" }),
      "3": authenticatedContext({ userId: "3", isActive: false }),
    },
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const anonymous = await request(runtime.origin, "/api/leads/niches");
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get("cache-control"), "no-store");

  for (const [userId, code] of [
    ["1", "ACCOUNT_PENDING"],
    ["2", "ACCOUNT_SUSPENDED"],
    ["3", "ACCOUNT_INACTIVE"],
  ]) {
    const response = await request(runtime.origin, "/api/leads/niches", {
      headers: bearer(fixture.issueToken(userId)),
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, code);
  }
  assert.equal(fixture.db.calls.length, 0);
});

test("GET owner/member isola workspaces e retorna contrato neutro", async (t) => {
  const fixture = createFixture({
    contexts: {
      "7": authenticatedContext({ userId: "7", workspaceId: "11" }),
      "8": authenticatedContext({ userId: "8", workspaceId: "12", role: "member" }),
    },
    rows: [
      strategyRow({ id: 2, workspace_id: "11", niche_name: "Clínicas" }),
      strategyRow({ id: 3, workspace_id: "11", niche_name: "Dentistas" }),
      strategyRow({ id: 1, workspace_id: "12", niche_name: "Academias" }),
    ],
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const responseA = await request(
    runtime.origin,
    "/api/leads/niches?workspace_id=12&role=member",
    {
      headers: bearer(
        fixture.issueToken("7", { workspace_id: "12", role: "member" }),
        { "X-Workspace-Id": "12", "X-Role": "member" },
      ),
    },
  );
  assert.equal(responseA.status, 200);
  assert.equal(responseA.headers.get("cache-control"), "no-store");
  assert.deepEqual(responseA.body.map(({ nicheName }) => nicheName), [
    "Clínicas",
    "Dentistas",
  ]);
  assert.deepEqual(fixture.db.calls.at(-1).params, ["11"]);
  for (const strategy of responseA.body) {
    assert.deepEqual(Object.keys(strategy), [
      "id",
      "nicheName",
      "hook",
      "callToAction",
    ]);
  }

  const responseB = await request(runtime.origin, "/api/leads/niches", {
    headers: bearer(fixture.issueToken("8")),
  });
  assert.deepEqual(responseB.body.map(({ nicheName }) => nicheName), ["Academias"]);
  assert.deepEqual(fixture.db.calls.at(-1).params, ["12"]);
});

test("owner faz upsert exato e delete somente no próprio workspace", async (t) => {
  const fixture = createFixture({
    contexts: { "7": authenticatedContext() },
    rows: [
      strategyRow({ id: 1, workspace_id: "11", niche_name: "Dentistas" }),
      strategyRow({ id: 9, workspace_id: "12", niche_name: "Dentistas" }),
    ],
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);
  const headers = bearer(
    fixture.issueToken("7", { workspace_id: "12", role: "member" }),
    { "X-Workspace-Id": "12", "X-Role": "member" },
  );

  const updated = await request(runtime.origin, "/api/leads/niches", {
    method: "POST",
    headers,
    body: validPayload({ hook: "Hook atualizado" }),
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.id, 1);
  assert.equal(updated.body.hook, "Hook atualizado");
  assert.deepEqual(fixture.db.calls.at(-1).params, [
    "11",
    "Dentistas",
    "Hook atualizado",
    "Podemos conversar?",
  ]);

  const differentCase = await request(runtime.origin, "/api/leads/niches", {
    method: "POST",
    headers,
    body: validPayload({ nicheName: "dentistas" }),
  });
  assert.equal(differentCase.status, 200);
  assert.notEqual(differentCase.body.id, 1);
  assert.equal(fixture.db.rows.filter(({ workspace_id }) => workspace_id === "11").length, 2);

  const crossWorkspace = await request(runtime.origin, "/api/leads/niches/9", {
    method: "DELETE",
    headers,
  });
  assert.equal(crossWorkspace.status, 404);
  assert.equal(crossWorkspace.body.code, "NOT_FOUND");
  assert.deepEqual(fixture.db.calls.at(-1).params, ["9", "11"]);

  const removed = await request(runtime.origin, "/api/leads/niches/1", {
    method: "DELETE",
    headers,
  });
  assert.equal(removed.status, 200);
  assert.deepEqual(fixture.db.calls.at(-1).params, ["1", "11"]);
  assert.equal(fixture.db.rows.some(({ id }) => id === 1), false);
});

test("member não escreve e entradas inválidas falham antes do SQL", async (t) => {
  const fixture = createFixture({
    contexts: {
      "7": authenticatedContext({ userId: "7", role: "member" }),
      "8": authenticatedContext({ userId: "8", role: "owner" }),
    },
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  for (const [method, path, body] of [
    ["POST", "/api/leads/niches", validPayload()],
    ["DELETE", "/api/leads/niches/1", undefined],
  ]) {
    const response = await request(runtime.origin, path, {
      method,
      headers: bearer(
        fixture.issueToken("7", { role: "owner" }),
        { "X-Role": "owner" },
      ),
      body,
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, "INSUFFICIENT_WORKSPACE_ROLE");
  }
  assert.equal(fixture.db.calls.length, 0);

  for (const [path, method, body] of [
    ["/api/leads/niches", "POST", {}],
    ["/api/leads/niches", "POST", validPayload({ workspaceId: "12" })],
    ["/api/leads/niches", "POST", validPayload({ niche_name: "Outro" })],
    ["/api/leads/niches", "POST", validPayload({ hook: "" })],
    ["/api/leads/niches/0", "DELETE", undefined],
  ]) {
    const before = fixture.db.calls.length;
    const response = await request(runtime.origin, path, {
      method,
      headers: bearer(fixture.issueToken("8")),
      body,
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "VALIDATION_ERROR");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(fixture.db.calls.length, before);
  }
});

test("método não previsto não cai no router genérico de leads", async (t) => {
  const fixture = createFixture({
    contexts: { "7": authenticatedContext() },
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const response = await request(runtime.origin, "/api/leads/niches", {
    method: "PATCH",
    headers: bearer(fixture.issueToken("7")),
    body: validPayload(),
  });
  assert.equal(response.status, 404);
  assert.equal(response.body.code, "NOT_FOUND");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(fixture.db.calls.length, 0);
});

test("role ausente/desconhecida e erros internos falham fechados", async (t) => {
  const missingRole = authenticatedContext({ userId: "7" });
  delete missingRole.membership.role;
  const fixture = createFixture({
    contexts: {
      "7": missingRole,
      "8": authenticatedContext({ userId: "8", role: "admin" }),
      "9": authenticatedContext({ userId: "9" }),
    },
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  for (const userId of ["7", "8"]) {
    const response = await request(runtime.origin, "/api/leads/niches", {
      headers: bearer(fixture.issueToken(userId, { role: "owner" })),
    });
    assert.equal(response.status, 500);
    assert.equal(response.body.code, "INTERNAL_ERROR");
  }
  assert.equal(fixture.db.calls.length, 0);

  fixture.db.fail = new Error("sensitive SQL payload");
  const unexpected = await request(runtime.origin, "/api/leads/niches", {
    headers: bearer(fixture.issueToken("9")),
  });
  assert.equal(unexpected.status, 500);
  assert.equal(unexpected.body.code, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(unexpected.body), /sensitive|SQL/iu);
});
