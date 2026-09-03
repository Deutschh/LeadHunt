const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");

const db = require("../src/database/db");
const leadsRouter = require("../src/routes/leads");
const briefingRouter = require("../src/routes/briefingRoutes");
const serviceOpportunitiesRouter = require("../src/routes/serviceOpportunities");
const {
  AuthIdentityError,
} = require("../src/services/authIdentityService");
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
  NOT_FOUND_RESPONSE,
  createOperationalWebRouter,
} = require("../src/routes/operationalWebRoutes");
const { createSystemRouter } = require("../src/routes/systemRoutes");

const JWT_CONFIG = Object.freeze({
  jwtSecret: "j".repeat(32),
  jwtKeyId: "operational-test-key",
  jwtIssuer: "leadhunt-api-test",
  jwtAudience: "leadhunt-web-test",
  accessTokenTtlSeconds: 600,
});

function context(overrides = {}) {
  const workspace = {
    id: "11",
    name: "Workspace 11",
    accountStatus: "active",
    isActive: true,
    timezone: "America/Sao_Paulo",
    releaseChannel: "stable",
    minProfiles: 2,
    maxProfiles: 2,
    ...overrides,
  };

  return {
    user: { id: "7", name: "Maria", email: "maria@example.com" },
    membership: { userId: "7", workspaceId: "11", role: "owner" },
    workspace,
  };
}

function listen(app) {
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve({
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

async function requestJson(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const rawBody = await response.text();
  return {
    status: response.status,
    body: rawBody ? JSON.parse(rawBody) : null,
  };
}

function createDownstreamRouter() {
  const router = express.Router();
  router.use((req, res) =>
    res.json({
      reached: true,
      workspaceId: req.workspaceId,
      accountStatus: req.workspace.accountStatus,
    }),
  );
  return router;
}

function createRealAuthentication(identityService) {
  const accessTokenService = createAccessTokenService(JWT_CONFIG);
  return {
    accessTokenService,
    middleware: createRequireAuthenticatedContext({
      accessTokenService,
      identityService,
      logger: { error() {}, warn() {} },
    }),
  };
}

test("rotas operacionais exigem JWT e aplicam o gate comercial", async (t) => {
  const { accessTokenService, middleware } = createRealAuthentication({
    async resolve({ authVersion }) {
      if (authVersion !== 2) {
        throw new AuthIdentityError(
          401,
          "INVALID_ACCESS_TOKEN",
          "Token de acesso inválido ou expirado.",
          "auth_version_mismatch",
        );
      }
      return context();
    },
  });
  const gate = createRequireOperationalAccess({
    logger: { error() {} },
  });
  const downstream = createDownstreamRouter();
  const app = express();
  app.use(
    "/api",
    createOperationalWebRouter({
      requireAuthenticatedContext: middleware,
      requireOperationalAccess: gate,
      leadsRouter: downstream,
      briefingRouter: downstream,
      serviceOpportunitiesRouter: downstream,
      commercialProfileRouter: downstream,
      serviceCatalogRouter: downstream,
    }),
  );
  const runtime = await listen(app);
  t.after(runtime.close);

  assert.equal((await requestJson(runtime.origin, "/api/leads")).status, 401);

  const stale = accessTokenService.issue({ userId: "7", authVersion: 1 });
  assert.equal(
    (
      await requestJson(runtime.origin, "/api/leads", {
        headers: { Authorization: `Bearer ${stale}` },
      })
    ).status,
    401,
  );

  const active = accessTokenService.issue({ userId: "7", authVersion: 2 });
  assert.deepEqual(
    await requestJson(runtime.origin, "/api/leads", {
      headers: { Authorization: `Bearer ${active}` },
    }),
    {
      status: 200,
      body: {
        reached: true,
        workspaceId: "11",
        accountStatus: "active",
      },
    },
  );
});

test("claims e workspace enviados pelo cliente não alteram a autoridade do banco", async (t) => {
  const { middleware } = createRealAuthentication({
    async resolve(input) {
      assert.deepEqual(input, { userId: "7", authVersion: 2 });
      return context();
    },
  });
  const token = jwt.sign(
    {
      token_use: "access",
      ver: 2,
      workspace_id: "999",
      workspace: { id: "999" },
      account_status: "active",
      role: "admin",
    },
    JWT_CONFIG.jwtSecret,
    {
      algorithm: "HS256",
      audience: JWT_CONFIG.jwtAudience,
      expiresIn: JWT_CONFIG.accessTokenTtlSeconds,
      issuer: JWT_CONFIG.jwtIssuer,
      keyid: JWT_CONFIG.jwtKeyId,
      subject: "7",
    },
  );
  const downstream = createDownstreamRouter();
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createOperationalWebRouter({
      requireAuthenticatedContext: middleware,
      requireOperationalAccess: createRequireOperationalAccess(),
      leadsRouter: downstream,
      briefingRouter: downstream,
      serviceOpportunitiesRouter: downstream,
      commercialProfileRouter: downstream,
      serviceCatalogRouter: downstream,
    }),
  );
  const runtime = await listen(app);
  t.after(runtime.close);

  const response = await requestJson(
    runtime.origin,
    "/api/leads?workspace_id=998",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Workspace-Id": "997",
      },
      body: { workspace_id: "996" },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.workspaceId, "11");
});

test("pending, suspended e inactive são bloqueados antes do router", async (t) => {
  let downstreamCalls = 0;
  const downstream = express.Router();
  downstream.use((_req, res) => {
    downstreamCalls += 1;
    res.json({ reached: true });
  });
  const app = express();
  app.use(
    "/api",
    createOperationalWebRouter({
      requireAuthenticatedContext(req, _res, next) {
        const state = req.headers["x-test-state"];
        const isInactive = state === "inactive";
        const resolved = context({
          accountStatus: isInactive ? "active" : state,
          isActive: !isInactive,
        });
        req.user = resolved.user;
        req.membership = resolved.membership;
        req.workspace = resolved.workspace;
        req.workspaceId = resolved.membership.workspaceId;
        next();
      },
      requireOperationalAccess: createRequireOperationalAccess(),
      leadsRouter: downstream,
      briefingRouter: downstream,
      serviceOpportunitiesRouter: downstream,
      commercialProfileRouter: downstream,
      serviceCatalogRouter: downstream,
    }),
  );
  const runtime = await listen(app);
  t.after(runtime.close);

  const cases = [
    ["pending", "ACCOUNT_PENDING"],
    ["suspended", "ACCOUNT_SUSPENDED"],
    ["inactive", "ACCOUNT_INACTIVE"],
  ];
  for (const [state, code] of cases) {
    const response = await requestJson(runtime.origin, "/api/leads", {
      headers: { "X-Test-State": state },
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, code);
  }
  assert.equal(downstreamCalls, 0);
});

test("quarentenas têm precedência real sobre auth e routers no Express 5", async (t) => {
  let authCalls = 0;
  let downstreamCalls = 0;
  const downstream = express.Router();
  downstream.use((_req, res) => {
    downstreamCalls += 1;
    res.json({ reached: true });
  });
  const app = express();
  app.use(
    "/api",
    createOperationalWebRouter({
      requireAuthenticatedContext(_req, _res, next) {
        authCalls += 1;
        next();
      },
      requireOperationalAccess(_req, _res, next) {
        next();
      },
      leadsRouter: downstream,
      briefingRouter: downstream,
      serviceOpportunitiesRouter: downstream,
      commercialProfileRouter: downstream,
      serviceCatalogRouter: downstream,
    }),
  );
  app.use(createSystemRouter());
  const runtime = await listen(app);
  t.after(runtime.close);

  const cases = [
    ["GET", "/api/previews"],
    ["POST", "/api/previews/"],
    ["PATCH", "/api/previews/123/nested"],
    ["POST", "/api/settings/selectors"],
    ["GET", "/api/settings/selectors/nested"],
    ["POST", "/api/leads/sending-numbers/5/health-check"],
    ["GET", "/api/leads/sending-numbers/5/health-check/details"],
    ["POST", "/api/leads/sending-numbers/health-check-all"],
    ["POST", "/api/leads/sending-numbers/health-check-all/again"],
    ["PATCH", "/api/leads/prompt-configs/angle/status"],
    ["POST", "/api/leads/prompt-configs/angle/status/nested"],
    ["POST", "/run-scraper"],
    ["GET", "/run-scraper/"],
    ["PATCH", "/run-scraper/nested"],
  ];

  for (const [method, path] of cases) {
    const response = await requestJson(runtime.origin, path, {
      method,
      headers: { Authorization: "Bearer active-user" },
    });
    assert.deepEqual(response, { status: 404, body: NOT_FOUND_RESPONSE });
  }
  assert.equal(authCalls, 0);
  assert.equal(downstreamCalls, 0);
});

test("routers reais usam SQL e parâmetros do workspace autenticado", async (t) => {
  const originalQuery = db.query;
  const calls = [];
  db.query = async (sql, params) => {
    calls.push({ sql: String(sql), params });
    if (/FROM leads/.test(sql) && params?.[0] === 22) {
      return {
        rowCount: 1,
        rows: [
          {
            id: 22,
            name: "Lead próprio",
            status: "new",
            pipeline_stage: "new",
          },
        ],
      };
    }
    if (/INSERT INTO home_notes/.test(sql)) {
      return { rowCount: 1, rows: [{ id: 1, workspace_id: params[0] }] };
    }
    if (/INSERT INTO client_briefings/.test(sql)) {
      return { rowCount: 1, rows: [{ public_token: "opaque-public-token" }] };
    }
    return { rowCount: 0, rows: [] };
  };
  t.after(() => {
    db.query = originalQuery;
  });

  const authenticated = context();
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createOperationalWebRouter({
      requireAuthenticatedContext(req, _res, next) {
        req.user = authenticated.user;
        req.membership = authenticated.membership;
        req.workspace = authenticated.workspace;
        req.workspaceId = authenticated.membership.workspaceId;
        next();
      },
      requireOperationalAccess: createRequireOperationalAccess(),
      leadsRouter,
      briefingRouter,
      serviceOpportunitiesRouter,
      commercialProfileRouter: createDownstreamRouter(),
      serviceCatalogRouter: createDownstreamRouter(),
    }),
  );
  const runtime = await listen(app);
  t.after(runtime.close);

  let response = await requestJson(
    runtime.origin,
    "/api/leads/91?workspace_id=999",
    { headers: { "X-Workspace-Id": "998" } },
  );
  assert.equal(response.status, 404);
  assert.match(calls.at(-1).sql, /WHERE id = \$1\s+AND workspace_id = \$2/);
  assert.deepEqual(calls.at(-1).params, ["91", "11"]);

  response = await requestJson(runtime.origin, "/api/leads/notes", {
    method: "POST",
    body: {
      title: "Nota",
      content: "Conteúdo",
      workspace_id: "999",
    },
  });
  assert.equal(response.status, 200);
  assert.match(calls.at(-1).sql, /INSERT INTO home_notes\s*\(\s*workspace_id/);
  assert.deepEqual(calls.at(-1).params, ["11", "Nota", "Conteúdo", null]);

  response = await requestJson(runtime.origin, "/api/leads/niches/12", {
    method: "DELETE",
  });
  assert.equal(response.status, 404);
  assert.match(calls.at(-1).sql, /DELETE FROM niche_strategies[\s\S]*workspace_id = \$2/);
  assert.deepEqual(calls.at(-1).params, ["12", "11"]);

  response = await requestJson(
    runtime.origin,
    "/api/leads/sending-numbers/8/daily-limit",
    { method: "PATCH", body: { daily_limit: 25, workspace_id: "999" } },
  );
  assert.equal(response.status, 404);
  assert.match(calls.at(-1).sql, /UPDATE sending_numbers[\s\S]*workspace_id = \$2/);
  assert.deepEqual(calls.at(-1).params, ["8", "11", 25]);

  response = await requestJson(
    runtime.origin,
    "/api/briefings/lead/17/public-link",
    { method: "POST", body: { workspace_id: "999" } },
  );
  assert.equal(response.status, 200);
  assert.match(calls.at(-1).sql, /INSERT INTO client_briefings\s*\(\s*workspace_id/);
  assert.deepEqual(calls.at(-1).params, ["11", 17]);

  response = await requestJson(
    runtime.origin,
    "/api/service-opportunities/leads/22/current?workspace_id=999",
  );
  assert.equal(response.status, 200);
  assert.match(calls.at(-2).sql, /FROM leads[\s\S]*workspace_id = \$2/);
  assert.deepEqual(calls.at(-2).params, [22, "11"]);
  assert.match(
    calls.at(-1).sql,
    /FROM lead_service_opportunities opportunity[\s\S]*opportunity\.workspace_id = \$2/,
  );
  assert.deepEqual(calls.at(-1).params, [22, "11"]);

  response = await requestJson(
    runtime.origin,
    "/api/service-opportunities/services?workspace_id=999",
  );
  assert.equal(response.status, 200);
  assert.match(calls.at(-1).sql, /FROM velaris_services[\s\S]*workspace_id = \$1/);
  assert.deepEqual(calls.at(-1).params, ["11"]);

  response = await requestJson(runtime.origin, "/api/leads/automation/settings");
  assert.equal(response.status, 404);
  assert.match(calls.at(-1).sql, /FROM automation_settings[\s\S]*workspace_id = \$1/);
  assert.deepEqual(calls.at(-1).params, ["11"]);
});

test("rotas públicas permanecem fora da composição operacional", async (t) => {
  const app = express();
  app.get("/api/auth/public-config", (_req, res) => res.json({ public: true }));
  app.get("/api/public/briefings/token", (_req, res) => res.status(204).send());
  app.use(
    "/api",
    createOperationalWebRouter({
      requireAuthenticatedContext(_req, res) {
        res.status(401).json({ code: "INVALID_ACCESS_TOKEN" });
      },
      requireOperationalAccess(_req, _res, next) {
        next();
      },
      leadsRouter: createDownstreamRouter(),
      briefingRouter: createDownstreamRouter(),
      serviceOpportunitiesRouter: createDownstreamRouter(),
      commercialProfileRouter: createDownstreamRouter(),
      serviceCatalogRouter: createDownstreamRouter(),
    }),
  );
  const runtime = await listen(app);
  t.after(runtime.close);

  assert.deepEqual(
    await requestJson(runtime.origin, "/api/auth/public-config"),
    { status: 200, body: { public: true } },
  );
  assert.equal(
    (await requestJson(runtime.origin, "/api/public/briefings/token")).status,
    204,
  );
});

test("runtime web não importa contexto legado nem preview router", () => {
  const indexSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "index.js"),
    "utf8",
  );

  assert.doesNotMatch(indexSource, /legacyWorkspaceContext|LEGACY_WORKSPACE_ID/);
  assert.doesNotMatch(indexSource, /previewRoutes/);
  assert.match(indexSource, /createOperationalWebRouter/);
});
