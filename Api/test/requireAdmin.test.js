const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ADMIN_ACCESS_DENIED_RESPONSE,
  createRequireAdmin,
} = require("../src/middleware/requireAdmin");

function createRequest(role = "owner") {
  return {
    user: { id: "7", name: "Maria", email: "maria@example.com" },
    membership: { userId: "7", workspaceId: "11", role },
    workspace: {
      id: "11",
      accountStatus: "active",
      isActive: true,
    },
    workspaceId: "11",
    body: {},
    query: {},
    headers: {},
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

async function invoke({ db, req = createRequest(), logger } = {}) {
  const logs = [];
  const res = createResponse();
  let nextCalls = 0;
  const requireAdmin = createRequireAdmin({
    db,
    logger: logger || { error: (...args) => logs.push(args) },
  });

  await requireAdmin(req, res, () => {
    nextCalls += 1;
  });

  return { logs, nextCalls, res };
}

function createDb(resolveIsAdmin) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      const isAdmin = resolveIsAdmin();
      return {
        rows: isAdmin === null ? [] : [{ is_admin: isAdmin }],
        rowCount: isAdmin === null ? 0 : 1,
      };
    },
  };
}

test("exige dependência de banco injetável", () => {
  assert.throws(
    () => createRequireAdmin({}),
    /Banco de dados administrativo é obrigatório/,
  );
});

test("owner e member comuns recebem 403 e nunca implicam Admin", async () => {
  for (const role of ["owner", "member"]) {
    const db = createDb(() => false);
    const result = await invoke({ db, req: createRequest(role) });

    assert.equal(result.res.statusCode, 403);
    assert.deepEqual(result.res.body, ADMIN_ACCESS_DENIED_RESPONSE);
    assert.equal(result.nextCalls, 0);
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, ["7"]);
  }
});

test("is_admin true consultado no servidor libera a request", async () => {
  const db = createDb(() => true);
  const result = await invoke({ db });

  assert.equal(result.nextCalls, 1);
  assert.equal(result.res.statusCode, null);
  assert.match(db.calls[0].sql, /SELECT is_admin/);
  assert.match(db.calls[0].sql, /FROM public\.users/);
  assert.match(db.calls[0].sql, /WHERE id = \$1/);
});

test("body, query, headers, claims e contexto local forjados não concedem acesso", async () => {
  const req = createRequest("owner");
  req.body = { is_admin: true, actor: "admin" };
  req.query = { is_admin: "true", actor: "admin" };
  req.headers = {
    "x-is-admin": "true",
    "x-admin": "true",
    "x-actor-id": "1",
  };
  req.auth = { is_admin: true, role: "admin" };
  req.admin = true;

  const result = await invoke({ db: createDb(() => false), req });

  assert.equal(result.res.statusCode, 403);
  assert.equal(result.nextCalls, 0);
});

test("reconsulta is_admin e bloqueia imediatamente após remoção", async () => {
  let isAdmin = true;
  const db = createDb(() => isAdmin);
  const requireAdmin = createRequireAdmin({
    db,
    logger: { error: () => {} },
  });

  const firstRes = createResponse();
  let firstNextCalls = 0;
  await requireAdmin(createRequest(), firstRes, () => {
    firstNextCalls += 1;
  });

  isAdmin = false;
  const secondRes = createResponse();
  let secondNextCalls = 0;
  await requireAdmin(createRequest(), secondRes, () => {
    secondNextCalls += 1;
  });

  assert.equal(firstNextCalls, 1);
  assert.equal(secondNextCalls, 0);
  assert.equal(secondRes.statusCode, 403);
  assert.equal(db.calls.length, 2);
});

test("workspace do Admin não participa da decisão administrativa", async () => {
  const cases = [
    { accountStatus: "pending", isActive: true },
    { accountStatus: "active", isActive: true },
    { accountStatus: "suspended", isActive: true },
    { accountStatus: "active", isActive: false },
  ];

  for (const workspace of cases) {
    const req = createRequest();
    req.workspace = { ...req.workspace, ...workspace };
    const result = await invoke({ db: createDb(() => true), req });
    assert.equal(result.nextCalls, 1);
  }
});

test("usuário ausente recebe 403 e resultado inválido falha fechado", async () => {
  const missing = await invoke({ db: createDb(() => null) });
  assert.equal(missing.res.statusCode, 403);

  const malformedCases = [
    null,
    {},
    { rows: [{ is_admin: "true" }], rowCount: 1 },
    { rows: [{ is_admin: true }], rowCount: 2 },
  ];

  for (const malformed of malformedCases) {
    const result = await invoke({ db: { query: async () => malformed } });
    assert.equal(result.res.statusCode, 500);
    assert.deepEqual(result.res.body, {
      error: "Erro interno ao verificar acesso administrativo.",
      code: "INTERNAL_ERROR",
    });
    assert.equal(result.nextCalls, 0);
    assert.deepEqual(result.logs, [["ADMIN_ACCESS_RESULT_INVALID"]]);
  }
});

test("contexto inválido e falha de banco são sanitizados sem consultar autoridade do cliente", async () => {
  let databaseCalls = 0;
  const invalidContext = await invoke({
    db: {
      query: async () => {
        databaseCalls += 1;
      },
    },
    req: { user: { id: 7 } },
  });

  assert.equal(invalidContext.res.statusCode, 500);
  assert.equal(invalidContext.res.body.code, "INTERNAL_ERROR");
  assert.equal(databaseCalls, 0);

  const databaseFailure = await invoke({
    db: {
      query: async () => {
        throw new Error("secret database detail");
      },
    },
  });
  assert.equal(databaseFailure.res.statusCode, 500);
  assert.equal(JSON.stringify(databaseFailure.res.body).includes("secret"), false);
  assert.deepEqual(databaseFailure.logs, [["ADMIN_ACCESS_LOOKUP_FAILED"]]);
});
