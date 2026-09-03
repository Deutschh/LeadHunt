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
  createServiceCatalogRepository,
} = require("../src/repositories/serviceCatalogRepository");
const {
  createServiceCatalogService,
  SERVICE_KEY_CONSTRAINT,
} = require("../src/services/serviceCatalogService");
const {
  createServiceCatalogRouter,
} = require("../src/routes/serviceCatalogRoutes");
const {
  createOperationalWebRouter,
  setOperationalResourceNoStore,
} = require("../src/routes/operationalWebRoutes");

const JWT_CONFIG = Object.freeze({
  jwtSecret: "j".repeat(32),
  jwtKeyId: "service-catalog-test",
  jwtIssuer: "leadhunt-api-test",
  jwtAudience: "leadhunt-web-test",
  accessTokenTtlSeconds: 600,
});

function serviceRow(overrides = {}) {
  return {
    id: 1,
    service_key: "legacy-key",
    service_name: "Oferta",
    service_type: "universal",
    problem_category: "Categoria",
    description: "Descrição",
    how_it_works: "Execução",
    problems_solved: [],
    target_niches: [],
    is_active: true,
    display_order: 0,
    workspace_id: "11",
    ...overrides,
  };
}

function validCreate(overrides = {}) {
  return {
    name: "Nova oferta",
    type: "nichado",
    problemCategory: "Aquisição",
    description: "Descrição",
    howItWorks: "Execução",
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
    failInsert: null,
    async query(sql, params) {
      const statement = String(sql);
      calls.push({ sql: statement, params });

      if (/^\s*SELECT/u.test(statement)) {
        const matches = rows
          .filter(({ workspace_id }) => workspace_id === params[0])
          .filter(({ is_active }) => params.length < 2 || is_active === params[1])
          .sort((left, right) =>
            left.display_order - right.display_order || left.id - right.id,
          );
        return { rows: matches.map((item) => ({ ...item })) };
      }

      if (/^\s*INSERT/u.test(statement)) {
        if (this.failInsert) throw this.failInsert;
        const workspaceRows = rows.filter(({ workspace_id }) => workspace_id === params[0]);
        const displayOrder = params.length === 11
          ? params[10]
          : workspaceRows.length === 0
            ? 0
            : Math.max(...workspaceRows.map(({ display_order }) => display_order)) + 1;
        const created = serviceRow({
          id: nextId++,
          workspace_id: params[0],
          service_key: params[1],
          service_name: params[2],
          service_type: params[3],
          problem_category: params[4],
          description: params[5],
          how_it_works: params[6],
          problems_solved: JSON.parse(params[7]),
          target_niches: JSON.parse(params[8]),
          is_active: params[9],
          display_order: displayOrder,
        });
        rows.push(created);
        return { rows: [{ ...created }] };
      }

      if (/^\s*UPDATE/u.test(statement)) {
        const current = rows.find(
          ({ id, workspace_id }) =>
            String(id) === params[0] && workspace_id === params[1],
        );
        if (!current) return { rows: [] };
        for (const match of statement.matchAll(
          /(service_name|service_type|problem_category|description|how_it_works|problems_solved|target_niches|is_active|display_order) = \$(\d+)/gu,
        )) {
          const [, column, number] = match;
          const raw = params[Number(number) - 1];
          current[column] =
            column === "problems_solved" || column === "target_niches"
              ? JSON.parse(raw)
              : raw;
        }
        return { rows: [{ ...current }] };
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

function createFixture({ contexts = {}, rows = [], logger, keyFactory } = {}) {
  const db = createFakeDb(rows);
  const accessTokenService = createAccessTokenService(JWT_CONFIG);
  const identityService = {
    async resolve({ userId }) {
      const context = contexts[userId];
      if (!context) throw new Error("contexto de teste ausente");
      return context;
    },
  };
  const silentLogger = logger || { error() {}, warn() {} };
  const repository = createServiceCatalogRepository({ db });
  const service = createServiceCatalogService({ repository, ...(keyFactory ? { keyFactory } : {}) });
  const serviceCatalogRouter = createServiceCatalogRouter({ service, logger: silentLogger });
  const unusedRouter = express.Router();
  const app = express();
  app.use(
    ["/api/commercial-profile", "/api/services"],
    setOperationalResourceNoStore,
  );
  app.use(express.json());
  app.use(jsonParseErrorHandler);
  app.use(
    "/api",
    createOperationalWebRouter({
      requireAuthenticatedContext: createRequireAuthenticatedContext({
        accessTokenService,
        identityService,
        logger: silentLogger,
      }),
      requireOperationalAccess: createRequireOperationalAccess({ logger: silentLogger }),
      leadsRouter: unusedRouter,
      briefingRouter: unusedRouter,
      serviceOpportunitiesRouter: unusedRouter,
      commercialProfileRouter: unusedRouter,
      serviceCatalogRouter,
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

test("no-store cobre JSON malformado de services sem atingir rota não relacionada", async (t) => {
  const fixture = createFixture();
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const malformed = await fetch(`${runtime.origin}/api/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"name":',
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

test("GET exige acesso operacional e não consulta banco quando bloqueado", async (t) => {
  const fixture = createFixture({
    contexts: {
      "1": authenticatedContext({ userId: "1", accountStatus: "pending" }),
      "2": authenticatedContext({ userId: "2", accountStatus: "suspended" }),
      "3": authenticatedContext({ userId: "3", isActive: false }),
    },
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const anonymous = await request(runtime.origin, "/api/services");
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get("cache-control"), "no-store");

  for (const [userId, code] of [["1", "ACCOUNT_PENDING"], ["2", "ACCOUNT_SUSPENDED"], ["3", "ACCOUNT_INACTIVE"]]) {
    const response = await request(runtime.origin, "/api/services", {
      headers: bearer(fixture.issueToken(userId)),
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, code);
  }
  assert.equal(fixture.db.calls.length, 0);
});

test("GET owner/member isola workspaces, filtra ativos e neutraliza o contrato", async (t) => {
  const fixture = createFixture({
    contexts: {
      "7": authenticatedContext({ userId: "7", workspaceId: "11" }),
      "8": authenticatedContext({ userId: "8", workspaceId: "12", role: "member" }),
    },
    rows: [
      serviceRow({ id: 3, workspace_id: "11", service_name: "A inativo", is_active: false, display_order: 1 }),
      serviceRow({ id: 2, workspace_id: "11", service_name: "A ativo", display_order: 1 }),
      serviceRow({ id: 1, workspace_id: "12", service_name: "B ativo" }),
    ],
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const responseA = await request(
    runtime.origin,
    "/api/services?workspace_id=12",
    {
      headers: bearer(
        fixture.issueToken("7", { workspace_id: "12", role: "member" }),
        { "X-Workspace-Id": "12", "X-Role": "member" },
      ),
    },
  );
  assert.equal(responseA.status, 200);
  assert.equal(responseA.headers.get("cache-control"), "no-store");
  assert.deepEqual(responseA.body.services.map(({ id }) => id), [2, 3]);
  assert.deepEqual(fixture.db.calls.at(-1).params, ["11"]);
  for (const item of responseA.body.services) {
    assert.deepEqual(Object.keys(item), [
      "id", "name", "type", "problemCategory", "description", "howItWorks",
      "problemsSolved", "targetNiches", "isActive", "displayOrder",
    ]);
  }

  const responseB = await request(runtime.origin, "/api/services?active=true", {
    headers: bearer(fixture.issueToken("8")),
  });
  assert.deepEqual(responseB.body.services.map(({ name }) => name), ["B ativo"]);
  assert.deepEqual(fixture.db.calls.at(-1).params, ["12", true]);
});

test("owner cria no próprio workspace e PATCH é parcial, absoluto e workspace-scoped", async (t) => {
  const fixture = createFixture({
    contexts: { "7": authenticatedContext() },
    rows: [
      serviceRow({ id: 2, workspace_id: "11", display_order: 1 }),
      serviceRow({ id: 9, workspace_id: "12", service_name: "Oferta B" }),
    ],
    keyFactory: () => "svc_testopaque",
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);
  const headers = bearer(
    fixture.issueToken("7", { workspace_id: "12", role: "member" }),
    { "X-Workspace-Id": "12", "X-Role": "member" },
  );

  const created = await request(runtime.origin, "/api/services?workspace_id=12", {
    method: "POST",
    headers,
    body: validCreate({ workspace_id: "12" }),
  });
  assert.equal(created.status, 400);

  const validCreated = await request(runtime.origin, "/api/services", {
    method: "POST",
    headers,
    body: validCreate(),
  });
  assert.equal(validCreated.status, 201);
  assert.equal(validCreated.body.displayOrder, 2);
  assert.equal(Object.hasOwn(validCreated.body, "serviceKey"), false);
  const insertCall = fixture.db.calls.find(({ sql }) => /^\s*INSERT/u.test(sql));
  assert.equal(insertCall.params[0], "11");
  assert.equal(insertCall.params[1], "svc_testopaque");

  const updated = await request(runtime.origin, "/api/services/2", {
    method: "PATCH",
    headers,
    body: { displayOrder: 1, isActive: false },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.displayOrder, 1);
  assert.equal(updated.body.isActive, false);
  assert.equal(updated.body.name, "Oferta");
  const updateCall = fixture.db.calls.at(-1);
  assert.deepEqual(updateCall.params.slice(0, 2), ["2", "11"]);
  assert.doesNotMatch(updateCall.sql, /ROW_NUMBER|CASE|WITH /);

  const reactivated = await request(runtime.origin, "/api/services/2", {
    method: "PATCH",
    headers,
    body: { isActive: true },
  });
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.body.isActive, true);
  assert.equal(reactivated.body.displayOrder, 1);

  const crossWorkspace = await request(runtime.origin, "/api/services/9", {
    method: "PATCH",
    headers,
    body: { isActive: false },
  });
  assert.equal(crossWorkspace.status, 404);
  assert.equal(crossWorkspace.body.code, "NOT_FOUND");
  assert.deepEqual(fixture.db.calls.at(-1).params.slice(0, 2), ["9", "11"]);
});

test("member não escreve e validação falha antes do SQL", async (t) => {
  const fixture = createFixture({
    contexts: {
      "7": authenticatedContext({ userId: "7", role: "member" }),
      "8": authenticatedContext({ userId: "8", role: "owner" }),
    },
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  for (const method of ["POST", "PATCH"]) {
    const response = await request(
      runtime.origin,
      method === "POST" ? "/api/services" : "/api/services/1",
      {
        method,
        headers: bearer(fixture.issueToken("7"), { "X-Role": "owner" }),
        body: method === "POST" ? validCreate() : { isActive: false },
      },
    );
    assert.equal(response.status, 403);
    assert.equal(response.body.code, "INSUFFICIENT_WORKSPACE_ROLE");
  }
  assert.equal(fixture.db.calls.length, 0);

  for (const [path, method, body] of [
    ["/api/services", "POST", {}],
    ["/api/services", "POST", validCreate({ serviceKey: "site" })],
    ["/api/services/0", "PATCH", { isActive: false }],
    ["/api/services/1", "PATCH", {}],
    ["/api/services/1", "PATCH", { workspaceId: "12" }],
    ["/api/services/1", "PATCH", { displayOrder: -1 }],
  ]) {
    const before = fixture.db.calls.length;
    const response = await request(runtime.origin, path, {
      method,
      headers: bearer(fixture.issueToken("8")),
      body,
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "VALIDATION_ERROR");
    assert.equal(fixture.db.calls.length, before);
  }

  const invalidFilter = await request(runtime.origin, "/api/services?active=all", {
    headers: bearer(fixture.issueToken("8")),
  });
  assert.equal(invalidFilter.status, 400);
  assert.equal(fixture.db.calls.length, 0);
});

test("role ausente ou desconhecida falha fechado antes do catálogo", async (t) => {
  const missingRole = authenticatedContext({ userId: "7" });
  delete missingRole.membership.role;
  const fixture = createFixture({
    contexts: {
      "7": missingRole,
      "8": authenticatedContext({ userId: "8", role: "admin" }),
    },
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  for (const userId of ["7", "8"]) {
    const response = await request(runtime.origin, "/api/services", {
      headers: bearer(fixture.issueToken(userId, { role: "owner" })),
    });
    assert.equal(response.status, 500);
    assert.equal(response.body.code, "INTERNAL_ERROR");
  }
  assert.equal(fixture.db.calls.length, 0);
});

test("colisão de key e erro inesperado retornam contratos sanitizados", async (t) => {
  const fixture = createFixture({ contexts: { "7": authenticatedContext() } });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);
  const headers = bearer(fixture.issueToken("7"));

  fixture.db.failInsert = { code: "23505", constraint: SERVICE_KEY_CONSTRAINT };
  const conflict = await request(runtime.origin, "/api/services", {
    method: "POST",
    headers,
    body: validCreate(),
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.body, {
    error: "Não foi possível criar o serviço no momento.",
    code: "SERVICE_KEY_CONFLICT",
  });
  assert.doesNotMatch(JSON.stringify(conflict.body), /constraint|velaris/iu);

  fixture.db.failInsert = new Error("sensitive SQL payload");
  const unexpected = await request(runtime.origin, "/api/services", {
    method: "POST",
    headers,
    body: validCreate(),
  });
  assert.equal(unexpected.status, 500);
  assert.equal(unexpected.body.code, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(unexpected.body), /sensitive|SQL/iu);
});
