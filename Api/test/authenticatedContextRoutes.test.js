const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const {
  InvalidAccessTokenError,
  createAccessTokenService,
} = require("../src/services/accessTokenService");
const {
  AuthIdentityError,
  AuthIdentityUnavailableError,
} = require("../src/services/authIdentityService");
const {
  createRequireAuthenticatedContext,
  extractBearerToken,
} = require("../src/middleware/requireAuthenticatedContext");
const { createAuthRouter } = require("../src/routes/authRoutes");

const context = {
  user: { id: "7", name: "Maria Silva", email: "maria@example.com" },
  membership: { userId: "7", workspaceId: "11", role: "owner" },
  workspace: {
    id: "11",
    name: "Maria Silva",
    accountStatus: "pending",
    isActive: false,
    timezone: "America/Sao_Paulo",
    releaseChannel: "stable",
    minProfiles: 2,
    maxProfiles: 2,
  },
};

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function invokeMiddleware({ req, verify, resolve, logger }) {
  const res = createResponse();
  let nextCalled = false;
  const middleware = createRequireAuthenticatedContext({
    accessTokenService: { verify },
    identityService: { resolve },
    logger: logger || { error: () => {}, warn: () => {} },
  });
  await middleware(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

function requestWithAuthorization(value, rawName = "Authorization") {
  return {
    headers: { authorization: value },
    rawHeaders: [rawName, value],
    query: {},
    body: {},
  };
}

test("parser exige exatamente um Authorization Bearer não ambíguo", () => {
  assert.equal(
    extractBearerToken(requestWithAuthorization("bEaReR valid.jwt.token")),
    "valid.jwt.token",
  );

  for (const req of [
    { headers: {}, rawHeaders: [] },
    requestWithAuthorization("Basic value"),
    requestWithAuthorization("Bearer"),
    requestWithAuthorization("Bearer "),
    requestWithAuthorization("Bearer one,two"),
    requestWithAuthorization("Bearer one two"),
    {
      headers: { authorization: "Bearer first" },
      rawHeaders: [
        "Authorization",
        "Bearer first",
        "aUtHoRiZaTiOn",
        "Bearer second",
      ],
    },
  ]) {
    assert.equal(extractBearerToken(req), null);
  }
});

test("token em query/body/cookie nunca autentica sem Authorization", async () => {
  let verifyCalled = false;
  const result = await invokeMiddleware({
    req: {
      headers: { cookie: "accessToken=query-token" },
      rawHeaders: ["Cookie", "accessToken=query-token"],
      query: { accessToken: "query-token" },
      body: { accessToken: "body-token" },
    },
    verify: () => {
      verifyCalled = true;
    },
    resolve: async () => context,
  });

  assert.equal(result.res.statusCode, 401);
  assert.equal(result.res.body.code, "INVALID_ACCESS_TOKEN");
  assert.equal(result.nextCalled, false);
  assert.equal(verifyCalled, false);
});

test("middleware usa verify uma vez e deriva workspaceId somente do contexto", async () => {
  const calls = [];
  const req = requestWithAuthorization("Bearer signed-token", "authorization");
  req.query.workspace_id = "999";
  req.body.workspace_id = "998";
  req.headers["x-workspace-id"] = "997";

  const result = await invokeMiddleware({
    req,
    verify: (token) => {
      calls.push(["verify", token]);
      return { sub: "7", ver: 2, workspace_id: "999" };
    },
    resolve: async (input) => {
      calls.push(["resolve", input]);
      return context;
    },
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.workspaceId, "11");
  assert.deepEqual(result.req.user, context.user);
  assert.deepEqual(result.req.membership, context.membership);
  assert.deepEqual(result.req.workspace, context.workspace);
  assert.deepEqual(calls, [
    ["verify", "signed-token"],
    ["resolve", { userId: "7", authVersion: 2 }],
  ]);
});

test("token inválido usa contrato uniforme 401", async () => {
  const result = await invokeMiddleware({
    req: requestWithAuthorization("Bearer invalid-token"),
    verify: () => {
      throw new InvalidAccessTokenError();
    },
    resolve: async () => context,
  });
  assert.deepEqual(
    { status: result.res.statusCode, body: result.res.body },
    {
      status: 401,
      body: {
        error: "Token de acesso inválido ou expirado.",
        code: "INVALID_ACCESS_TOKEN",
      },
    },
  );
});

test("middleware separa 401, 409, 503 e 500 sem expor detalhes", async () => {
  const cases = [
    {
      error: new AuthIdentityError(
        401,
        "INVALID_ACCESS_TOKEN",
        "Token de acesso inválido ou expirado.",
        "user_not_found",
      ),
      status: 401,
      code: "INVALID_ACCESS_TOKEN",
    },
    {
      error: new AuthIdentityError(
        409,
        "AUTH_STATE_CONFLICT",
        "Não foi possível carregar o contexto desta conta.",
        "membership_missing",
      ),
      status: 409,
      code: "AUTH_STATE_CONFLICT",
    },
    {
      error: new AuthIdentityUnavailableError(),
      status: 503,
      code: "AUTH_TEMPORARILY_UNAVAILABLE",
    },
    {
      error: new Error("SQL password_hash bearer-secret"),
      status: 500,
      code: "INTERNAL_ERROR",
    },
  ];

  for (const item of cases) {
    const logs = [];
    const result = await invokeMiddleware({
      req: requestWithAuthorization("Bearer sensitive-token"),
      verify: () => ({ sub: "7", ver: 2 }),
      resolve: async () => Promise.reject(item.error),
      logger: {
        error: (...args) => logs.push(args),
        warn: (...args) => logs.push(args),
      },
    });
    assert.equal(result.res.statusCode, item.status);
    assert.equal(result.res.body.code, item.code);
    const serialized = JSON.stringify({ body: result.res.body, logs });
    assert.equal(serialized.includes("sensitive-token"), false);
    assert.equal(serialized.includes("password_hash"), false);
    assert.equal(serialized.includes("bearer-secret"), false);
    assert.equal(serialized.includes("SQL"), false);
  }
});

test("bug inesperado em verify retorna 500 em vez de falso 401/503", async () => {
  const result = await invokeMiddleware({
    req: requestWithAuthorization("Bearer token"),
    verify: () => {
      throw new TypeError("programming error");
    },
    resolve: async () => context,
  });
  assert.equal(result.res.statusCode, 500);
  assert.equal(result.res.body.code, "INTERNAL_ERROR");
});

async function withServer(operation, options = {}) {
  const app = express();
  let middlewareCalls = 0;
  const requireAuthenticatedContext = createRequireAuthenticatedContext({
    accessTokenService: options.accessTokenService || {
      verify: () => ({ sub: "7", ver: 2 }),
    },
    identityService: {
      resolve: async () => {
        middlewareCalls += 1;
        return options.context || context;
      },
    },
    logger: { error: () => {}, warn: () => {} },
  });
  app.use(express.json());
  app.use(
    "/api/auth",
    createAuthRouter({
      service: {
        register: async () => {},
        resend: async () => {},
        verify: async () => ({ accountStatus: "pending" }),
      },
      sessionService: {},
      cookieService: {},
      requireAuthenticatedContext,
      config: {},
      rateLimits: {
        register: [],
        verify: [],
        resend: [],
        login: [],
        refresh: [],
        logout: [],
      },
      logger: { error: () => {} },
    }),
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await operation(`http://127.0.0.1:${server.address().port}`, () =>
      middlewareCalls,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("JWT realmente expirado retorna 401 INVALID_ACCESS_TOKEN via HTTP", async () => {
  const jwtConfig = {
    jwtSecret: "j".repeat(32),
    jwtKeyId: "test-key-v1",
    jwtIssuer: "leadhunt-api-test",
    jwtAudience: "leadhunt-web-test",
    accessTokenTtlSeconds: 600,
  };
  const issuedAt = 1;
  const expiredToken = jwt.sign(
    {
      token_use: "access",
      ver: 2,
      iat: issuedAt,
    },
    jwtConfig.jwtSecret,
    {
      algorithm: "HS256",
      audience: jwtConfig.jwtAudience,
      expiresIn: jwtConfig.accessTokenTtlSeconds,
      issuer: jwtConfig.jwtIssuer,
      keyid: jwtConfig.jwtKeyId,
      subject: "7",
    },
  );

  await withServer(
    async (baseUrl, getMiddlewareCalls) => {
      const response = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });

      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        error: "Token de acesso inválido ou expirado.",
        code: "INVALID_ACCESS_TOKEN",
      });
      assert.equal(getMiddlewareCalls(), 0);
    },
    { accessTokenService: createAccessTokenService(jwtConfig) },
  );
});

test("GET /me retorna contrato mínimo e rotas públicas não exigem Bearer", async () => {
  await withServer(async (baseUrl, getMiddlewareCalls) => {
    const response = await fetch(
      `${baseUrl}/api/auth/me?workspace_id=999`,
      {
        headers: {
          Authorization: "Bearer access-token",
          "X-Workspace-Id": "998",
        },
      },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, {
      user: { name: "Maria Silva", email: "maria@example.com" },
      membership: { role: "owner" },
      workspace: {
        name: "Maria Silva",
        accountStatus: "pending",
        isActive: false,
        timezone: "America/Sao_Paulo",
        releaseChannel: "stable",
        minProfiles: 2,
        maxProfiles: 2,
      },
    });
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      "userId",
      "workspaceId",
      "password_hash",
      "auth_version",
      "account_status",
      "token_use",
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
    assert.equal(getMiddlewareCalls(), 1);

    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.notEqual(registration.status, 401);
    assert.equal(getMiddlewareCalls(), 1);
  });
});

test("GET /me permanece disponível para pending, suspended e isActive false", async () => {
  const cases = [
    { accountStatus: "pending", isActive: true },
    { accountStatus: "suspended", isActive: true },
    { accountStatus: "active", isActive: false },
  ];

  for (const item of cases) {
    await withServer(
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Authorization: "Bearer access-token" },
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.workspace.accountStatus, item.accountStatus);
        assert.equal(body.workspace.isActive, item.isActive);
      },
      {
        context: {
          ...context,
          workspace: {
            ...context.workspace,
            accountStatus: item.accountStatus,
            isActive: item.isActive,
          },
        },
      },
    );
  }
});
