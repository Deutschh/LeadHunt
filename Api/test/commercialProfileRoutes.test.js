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
  createCommercialProfileRepository,
} = require("../src/repositories/commercialProfileRepository");
const {
  createCommercialProfileService,
} = require("../src/services/commercialProfileService");
const {
  createCommercialProfileRouter,
} = require("../src/routes/commercialProfileRoutes");
const {
  createOperationalWebRouter,
  setCommercialProfileNoStore,
} = require("../src/routes/operationalWebRoutes");

const JWT_CONFIG = Object.freeze({
  jwtSecret: "j".repeat(32),
  jwtKeyId: "commercial-profile-test",
  jwtIssuer: "leadhunt-api-test",
  jwtAudience: "leadhunt-web-test",
  accessTokenTtlSeconds: 600,
});

function profileRow(overrides = {}) {
  return {
    sender_name: null,
    business_name: null,
    business_description: null,
    sales_context: null,
    presentation_preferences: {},
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

function createFakeDb(initialRows = {}) {
  const rows = new Map(
    Object.entries(initialRows).map(([key, value]) => [key, { ...value }]),
  );
  const calls = [];
  return {
    calls,
    rows,
    async query(sql, params) {
      const statement = String(sql);
      calls.push({ sql: statement, params });
      const workspaceId = params[0];

      if (/^\s*SELECT/u.test(statement)) {
        const row = rows.get(workspaceId);
        return { rowCount: row ? 1 : 0, rows: row ? [{ ...row }] : [] };
      }

      if (/^\s*UPDATE/u.test(statement)) {
        const row = rows.get(workspaceId);
        if (!row) return { rowCount: 0, rows: [] };

        for (const match of statement.matchAll(/(sender_name|business_name|business_description|sales_context|presentation_preferences) = \$(\d+)/gu)) {
          const [, column, parameterNumber] = match;
          const rawValue = params[Number(parameterNumber) - 1];
          row[column] =
            column === "presentation_preferences"
              ? JSON.parse(rawValue)
              : rawValue;
        }
        return { rowCount: 1, rows: [{ ...row }] };
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
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    body:
      options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null,
  };
}

function createFixture({ contexts = {}, rows = {}, logger } = {}) {
  const db = createFakeDb(rows);
  const accessTokenService = createAccessTokenService(JWT_CONFIG);
  const identityService = {
    async resolve({ userId }) {
      const context = contexts[userId];
      if (!context) throw new Error("contexto de teste ausente");
      return context;
    },
  };
  const requireAuthenticatedContext = createRequireAuthenticatedContext({
    accessTokenService,
    identityService,
    logger: logger || { error() {}, warn() {} },
  });
  const requireOperationalAccess = createRequireOperationalAccess({
    logger: logger || { error() {} },
  });
  const repository = createCommercialProfileRepository({ db });
  const service = createCommercialProfileService({ repository });
  const commercialProfileRouter = createCommercialProfileRouter({
    service,
    logger: logger || { error() {} },
  });
  const unusedRouter = express.Router();
  const app = express();
  app.use("/api/commercial-profile", setCommercialProfileNoStore);
  app.use(express.json());
  app.use(jsonParseErrorHandler);
  app.use(
    "/api",
    createOperationalWebRouter({
      requireAuthenticatedContext,
      requireOperationalAccess,
      leadsRouter: unusedRouter,
      briefingRouter: unusedRouter,
      serviceOpportunitiesRouter: unusedRouter,
      commercialProfileRouter,
      serviceCatalogRouter: unusedRouter,
      nicheStrategyRouter: unusedRouter,
    }),
  );
  app.get("/api/unrelated", (_req, res) => {
    res.status(200).json({ unrelated: true });
  });

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

test("JSON malformado recebe no-store somente no recurso commercial-profile", async (t) => {
  const fixture = createFixture();
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const malformed = await fetch(`${runtime.origin}/api/commercial-profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: '{"senderName":',
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    error: "JSON inválido.",
    code: "VALIDATION_ERROR",
  });
  assert.equal(malformed.headers.get("cache-control"), "no-store");

  const unrelated = await fetch(`${runtime.origin}/api/unrelated`);
  assert.equal(unrelated.status, 200);
  assert.deepEqual(await unrelated.json(), { unrelated: true });
  assert.equal(unrelated.headers.get("cache-control"), null);
});

function bearer(token, extraHeaders = {}) {
  return { Authorization: `Bearer ${token}`, ...extraHeaders };
}

test("GET exige autenticação e bloqueia pending, suspended e inactive", async (t) => {
  const states = {
    "1": authenticatedContext({ userId: "1", accountStatus: "pending" }),
    "2": authenticatedContext({ userId: "2", accountStatus: "suspended" }),
    "3": authenticatedContext({ userId: "3", isActive: false }),
  };
  const fixture = createFixture({ contexts: states, rows: { "11": profileRow() } });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const anonymous = await request(runtime.origin, "/api/commercial-profile");
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get("cache-control"), "no-store");

  for (const [userId, code] of [
    ["1", "ACCOUNT_PENDING"],
    ["2", "ACCOUNT_SUSPENDED"],
    ["3", "ACCOUNT_INACTIVE"],
  ]) {
    const response = await request(runtime.origin, "/api/commercial-profile", {
      headers: bearer(fixture.issueToken(userId)),
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, code);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(fixture.db.calls.length, 0);
});

test("GET owner/member isola workspaces e ignora autoridades enviadas pelo cliente", async (t) => {
  const fixture = createFixture({
    contexts: {
      "7": authenticatedContext({ userId: "7", workspaceId: "11", role: "owner" }),
      "8": authenticatedContext({ userId: "8", workspaceId: "12", role: "member" }),
    },
    rows: {
      "11": profileRow({ sender_name: "Ana", business_name: "Oferta A" }),
      "12": profileRow({ sender_name: "Bia", business_name: "Oferta B" }),
    },
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const tokenA = fixture.issueToken("7", { role: "member", workspace_id: "12" });
  const responseA = await request(
    runtime.origin,
    "/api/commercial-profile?workspace_id=12&role=member",
    { headers: bearer(tokenA, { "X-Workspace-Id": "12", "X-Role": "member" }) },
  );
  assert.equal(responseA.status, 200);
  assert.equal(responseA.body.businessName, "Oferta A");
  assert.equal(responseA.body.isComplete, true);
  assert.equal(responseA.headers.get("cache-control"), "no-store");
  assert.deepEqual(fixture.db.calls.at(-1).params, ["11"]);

  const responseB = await request(runtime.origin, "/api/commercial-profile", {
    headers: bearer(fixture.issueToken("8")),
  });
  assert.equal(responseB.status, 200);
  assert.equal(responseB.body.businessName, "Oferta B");
  assert.deepEqual(fixture.db.calls.at(-1).params, ["12"]);
  for (const body of [responseA.body, responseB.body]) {
    assert.deepEqual(Object.keys(body), [
      "senderName",
      "businessName",
      "businessDescription",
      "salesContext",
      "presentationPreferences",
      "isComplete",
    ]);
  }
});

test("PATCH owner é parcial, usa estado retornado e não aceita workspace do cliente", async (t) => {
  const fixture = createFixture({
    contexts: { "7": authenticatedContext() },
    rows: { "11": profileRow({ business_name: "Empresa" }) },
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);
  const token = fixture.issueToken("7", { workspace_id: "99", role: "member" });

  const response = await request(
    runtime.origin,
    "/api/commercial-profile?workspace_id=99",
    {
      method: "PATCH",
      headers: bearer(token, { "X-Workspace-Id": "99", "X-Role": "member" }),
      body: { senderName: "  Júlia 🚀  ", presentationPreferences: {} },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.senderName, "Júlia 🚀");
  assert.equal(response.body.businessName, "Empresa");
  assert.equal(response.body.isComplete, true);
  assert.deepEqual(response.body.presentationPreferences, {});
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(fixture.db.calls.at(-1).params, ["11", "Júlia 🚀", "{}"]);

  for (const invalidBody of [
    {},
    { workspace_id: "99" },
    { workspaceId: "99" },
    { isComplete: true },
    { unknown: true },
    { senderName: "   " },
    { presentationPreferences: null },
  ]) {
    const before = fixture.db.calls.length;
    const invalid = await request(runtime.origin, "/api/commercial-profile", {
      method: "PATCH",
      headers: bearer(token),
      body: invalidBody,
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, "VALIDATION_ERROR");
    assert.equal(invalid.headers.get("cache-control"), "no-store");
    assert.equal(fixture.db.calls.length, before);
  }
});

test("PATCH diferencia omitido, null e preferences vazio", async (t) => {
  const fixture = createFixture({
    contexts: { "7": authenticatedContext() },
    rows: {
      "11": profileRow({
        sender_name: "Ana",
        business_name: "Empresa",
        business_description: "Descrição anterior",
        presentation_preferences: { tone: "formal" },
      }),
    },
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);
  const token = fixture.issueToken("7");

  const nulled = await request(runtime.origin, "/api/commercial-profile", {
    method: "PATCH",
    headers: bearer(token),
    body: { businessDescription: null },
  });
  assert.equal(nulled.status, 200);
  assert.equal(nulled.body.businessDescription, null);
  assert.deepEqual(nulled.body.presentationPreferences, { tone: "formal" });

  const replaced = await request(runtime.origin, "/api/commercial-profile", {
    method: "PATCH",
    headers: bearer(token),
    body: { presentationPreferences: {} },
  });
  assert.equal(replaced.status, 200);
  assert.deepEqual(replaced.body.presentationPreferences, {});
});

test("PATCH member é 403 sem SQL e role ausente/desconhecida falha fechado", async (t) => {
  const missingRoleContext = authenticatedContext({ userId: "8" });
  delete missingRoleContext.membership.role;
  const fixture = createFixture({
    contexts: {
      "7": authenticatedContext({ userId: "7", role: "member" }),
      "8": missingRoleContext,
      "9": authenticatedContext({ userId: "9", role: "admin" }),
    },
    rows: { "11": profileRow() },
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const member = await request(runtime.origin, "/api/commercial-profile", {
    method: "PATCH",
    headers: bearer(fixture.issueToken("7"), { "X-Role": "owner" }),
    body: { senderName: "Ana", role: "owner" },
  });
  assert.equal(member.status, 403);
  assert.equal(member.body.code, "INSUFFICIENT_WORKSPACE_ROLE");
  assert.equal(fixture.db.calls.length, 0);

  for (const userId of ["8", "9"]) {
    const response = await request(runtime.origin, "/api/commercial-profile", {
      headers: bearer(fixture.issueToken(userId, { role: "owner" })),
    });
    assert.equal(response.status, 500);
    assert.equal(response.body.code, "INTERNAL_ERROR");
  }
  assert.equal(fixture.db.calls.length, 0);
});

test("perfil ausente retorna 409 sem INSERT/upsert e erro inesperado é sanitizado", async (t) => {
  const fixture = createFixture({ contexts: { "7": authenticatedContext() } });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);
  const headers = bearer(fixture.issueToken("7"));

  for (const [method, body] of [
    ["GET", undefined],
    ["PATCH", { senderName: "Ana" }],
  ]) {
    const response = await request(runtime.origin, "/api/commercial-profile", {
      method,
      headers,
      body,
    });
    assert.equal(response.status, 409);
    assert.deepEqual(response.body, {
      error: "O perfil comercial deste workspace está indisponível.",
      code: "COMMERCIAL_PROFILE_STATE_CONFLICT",
    });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(
    fixture.db.calls.some(({ sql }) => /INSERT|UPSERT|ON CONFLICT/iu.test(sql)),
    false,
  );

  fixture.db.query = async () => {
    throw new Error("sensitive SQL details");
  };
  const unexpected = await request(runtime.origin, "/api/commercial-profile", {
    headers,
  });
  assert.equal(unexpected.status, 500);
  assert.deepEqual(unexpected.body, {
    error: "Erro interno ao processar o perfil comercial.",
    code: "INTERNAL_ERROR",
  });
  assert.equal(unexpected.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(JSON.stringify(unexpected.body), /sensitive|SQL/iu);
});
