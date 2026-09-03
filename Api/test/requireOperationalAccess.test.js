const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const {
  createRequireOperationalAccess,
} = require("../src/middleware/requireOperationalAccess");

function createContext(options = {}) {
  const accountStatus = Object.hasOwn(options, "accountStatus")
    ? options.accountStatus
    : "active";
  const isActive = Object.hasOwn(options, "isActive")
    ? options.isActive
    : true;
  const role = Object.hasOwn(options, "role") ? options.role : "owner";

  return {
    user: { id: "7", name: "Maria Silva", email: "maria@example.com" },
    membership: { userId: "7", workspaceId: "11", role },
    workspace: {
      id: "11",
      name: "Maria Silva",
      accountStatus,
      isActive,
    },
    workspaceId: "11",
  };
}

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

function invokeMiddleware({ req = createContext(), logger } = {}) {
  const logs = [];
  const res = createResponse();
  let nextCalls = 0;
  const middleware = createRequireOperationalAccess({
    logger: logger || { error: (...args) => logs.push(args) },
  });

  middleware(req, res, () => {
    nextCalls += 1;
  });

  return { logs, nextCalls, res };
}

test("permite somente workspace active e isActive estritamente true", () => {
  const result = invokeMiddleware();

  assert.equal(result.nextCalls, 1);
  assert.equal(result.res.statusCode, null);
  assert.equal(result.res.body, null);
  assert.deepEqual(result.logs, []);
});

test("nega pending e suspended com contratos comerciais estáveis", () => {
  const cases = [
    {
      accountStatus: "pending",
      expected: {
        error: "Sua conta ainda está aguardando ativação.",
        code: "ACCOUNT_PENDING",
      },
    },
    {
      accountStatus: "suspended",
      expected: {
        error: "Esta conta está suspensa.",
        code: "ACCOUNT_SUSPENDED",
      },
    },
  ];

  for (const item of cases) {
    const result = invokeMiddleware({
      req: createContext({ accountStatus: item.accountStatus }),
    });

    assert.equal(result.res.statusCode, 403);
    assert.deepEqual(result.res.body, item.expected);
    assert.equal(result.nextCalls, 0);
    assert.deepEqual(result.logs, []);
  }
});

test("isActive false prevalece sobre todos os status comerciais válidos", () => {
  for (const accountStatus of ["active", "pending", "suspended"]) {
    const result = invokeMiddleware({
      req: createContext({ accountStatus, isActive: false }),
    });

    assert.equal(result.res.statusCode, 403);
    assert.deepEqual(result.res.body, {
      error: "Esta conta está indisponível no momento.",
      code: "ACCOUNT_INACTIVE",
    });
    assert.equal(result.nextCalls, 0);
    assert.deepEqual(result.logs, []);
  }
});

test("valida status antes da precedência de isActive", () => {
  const result = invokeMiddleware({
    req: createContext({ accountStatus: "invalid", isActive: false }),
  });

  assert.equal(result.res.statusCode, 500);
  assert.deepEqual(result.res.body, {
    error: "Erro interno de autorização.",
    code: "INTERNAL_ERROR",
  });
  assert.equal(result.nextCalls, 0);
  assert.deepEqual(result.logs, [["AUTH_OPERATIONAL_CONTEXT_INVALID"]]);
});

test("rejeita accountStatus ausente ou fora do enum", () => {
  for (const accountStatus of [undefined, null, "", "unknown", [], {}]) {
    const result = invokeMiddleware({
      req: createContext({ accountStatus, isActive: true }),
    });

    assert.equal(result.res.statusCode, 500);
    assert.equal(result.res.body.code, "INTERNAL_ERROR");
    assert.equal(result.nextCalls, 0);
    assert.deepEqual(result.logs, [["AUTH_OPERATIONAL_CONTEXT_INVALID"]]);
  }
});

test("rejeita isActive que não seja booleano real", () => {
  for (const isActive of [
    "true",
    "false",
    1,
    0,
    null,
    undefined,
    [],
    {},
  ]) {
    const result = invokeMiddleware({ req: createContext({ isActive }) });

    assert.equal(result.res.statusCode, 500);
    assert.equal(result.res.body.code, "INTERNAL_ERROR");
    assert.equal(result.nextCalls, 0);
    assert.deepEqual(result.logs, [["AUTH_OPERATIONAL_CONTEXT_INVALID"]]);
  }
});

test("falha fechado quando o contexto autenticado está ausente", () => {
  const cases = [
    {},
    { ...createContext(), user: undefined },
    { ...createContext(), user: [] },
    { ...createContext(), membership: undefined },
    { ...createContext(), membership: [] },
    { ...createContext(), workspace: undefined },
    { ...createContext(), workspace: [] },
    { ...createContext(), workspaceId: undefined },
  ];

  for (const req of cases) {
    const result = invokeMiddleware({ req });
    assert.equal(result.res.statusCode, 500);
    assert.equal(result.res.body.code, "INTERNAL_ERROR");
    assert.equal(result.nextCalls, 0);
    assert.deepEqual(result.logs, [["AUTH_OPERATIONAL_CONTEXT_INVALID"]]);
  }
});

test("falha fechado diante de IDs internos ausentes ou divergentes", () => {
  const cases = [
    { ...createContext(), workspaceId: "12" },
    { ...createContext(), workspaceId: 11 },
    {
      ...createContext(),
      membership: { ...createContext().membership, workspaceId: undefined },
    },
    {
      ...createContext(),
      membership: { ...createContext().membership, workspaceId: "12" },
    },
    {
      ...createContext(),
      workspace: { ...createContext().workspace, id: "12" },
    },
    {
      ...createContext(),
      membership: { ...createContext().membership, userId: "8" },
    },
  ];

  for (const req of cases) {
    const result = invokeMiddleware({ req });
    assert.equal(result.res.statusCode, 500);
    assert.equal(result.res.body.code, "INTERNAL_ERROR");
    assert.equal(result.nextCalls, 0);
  }
});

test("owner e member não alteram a decisão operacional", () => {
  for (const role of ["owner", "member"]) {
    const allowed = invokeMiddleware({ req: createContext({ role }) });
    assert.equal(allowed.nextCalls, 1);

    const denied = invokeMiddleware({
      req: createContext({ role, accountStatus: "pending" }),
    });
    assert.equal(denied.res.statusCode, 403);
    assert.equal(denied.res.body.code, "ACCOUNT_PENDING");
    assert.equal(denied.nextCalls, 0);
  }
});

test("role ausente ou desconhecida invalida o contexto operacional", () => {
  for (const role of [undefined, null, "", "admin", "OWNER", [], {}]) {
    const result = invokeMiddleware({ req: createContext({ role }) });
    assert.equal(result.res.statusCode, 500);
    assert.equal(result.res.body.code, "INTERNAL_ERROR");
    assert.equal(result.nextCalls, 0);
    assert.deepEqual(result.logs, [["AUTH_OPERATIONAL_CONTEXT_INVALID"]]);
  }
});

test("ignora valores do cliente e não chama DB, JWT ou crypto", () => {
  const calls = [];
  const req = {
    ...createContext(),
    body: { accountStatus: "suspended", isActive: false, workspaceId: "99" },
    query: { accountStatus: "pending", workspace_id: "98" },
    headers: {
      authorization: "Bearer ignored",
      cookie: "refreshToken=ignored",
      "x-workspace-id": "97",
      "x-account-status": "suspended",
    },
    db: { query: () => calls.push("db") },
    accessTokenService: { verify: () => calls.push("jwt") },
    crypto: { verify: () => calls.push("crypto") },
  };

  const result = invokeMiddleware({ req });

  assert.equal(result.nextCalls, 1);
  assert.deepEqual(calls, []);
});

async function withGateServer(context, operation) {
  const app = express();
  const gate = createRequireOperationalAccess({
    logger: { error: () => {} },
  });

  app.get(
    "/operation",
    (req, res, next) => {
      Object.assign(req, context);
      next();
    },
    gate,
    (req, res) => res.status(200).json({ allowed: true }),
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await operation(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("gate funciona em composição HTTP artificial sem rota de produção", async () => {
  await withGateServer(createContext(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/operation`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { allowed: true });
  });

  await withGateServer(
    createContext({ accountStatus: "suspended" }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/operation`);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "ACCOUNT_SUSPENDED");
    },
  );
});
