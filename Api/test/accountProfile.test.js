const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const jsonParseErrorHandler = require("../src/middleware/jsonParseErrorHandler");
const {
  createAccountRouter,
  setAccountNoStore,
} = require("../src/routes/accountRoutes");
const { createAccountService } = require("../src/services/accountService");
const { validateProfileUpdate } = require("../src/validation/accountValidation");

async function withServer({ service, authenticated = true }, operation) {
  const app = express();
  app.use("/api/account", setAccountNoStore);
  app.use(express.json());
  app.use(jsonParseErrorHandler);
  app.use(
    "/api/account",
    (req, res, next) => {
      if (!authenticated) {
        return res.status(401).json({
          error: "Token de acesso inválido ou expirado.",
          code: "INVALID_ACCESS_TOKEN",
        });
      }
      req.user = { id: "7", name: "Nome Atual", email: "user@example.com" };
      return next();
    },
    createAccountRouter({
      service,
      passwordService: { changePassword: async () => {} },
      logger: { error: () => {} },
    }),
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await operation(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function patch(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/account/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    body: await response.json(),
  };
}

test("perfil reutiliza a política de nome e rejeita payloads extras", () => {
  assert.deepEqual(validateProfileUpdate({ name: "  Guilherme Deutsch  " }), {
    value: { name: "Guilherme Deutsch" },
  });
  for (const body of [
    {},
    { name: "G" },
    { name: "A\u0085B" },
    { name: "Nome", email: "troca@example.com" },
    { name: "Nome", userId: "99" },
  ]) {
    assert.equal(validateProfileUpdate(body).error.code, "VALIDATION_ERROR");
  }
});

test("service atualiza somente o usuário autenticado e retorna identidade mínima", async () => {
  let captured;
  const service = createAccountService({
    db: {
      query: async (sql, params) => {
        captured = { sql, params };
        return {
          rowCount: 1,
          rows: [{ name: "Guilherme Deutsch", email: "user@example.com" }],
        };
      },
    },
  });

  assert.deepEqual(
    await service.updateProfile({ userId: "7", name: "Guilherme Deutsch" }),
    { name: "Guilherme Deutsch", email: "user@example.com" },
  );
  assert.deepEqual(captured.params, ["7", "Guilherme Deutsch"]);
  assert.match(captured.sql, /SET name = \$2,[\s\S]*updated_at = CURRENT_TIMESTAMP/u);
  assert.doesNotMatch(captured.sql, /email\s*=/u);
});

test("PATCH profile usa req.user, aplica no-store e sanitiza falhas", async () => {
  const calls = [];
  await withServer(
    {
      service: {
        updateProfile: async (value) => {
          calls.push(value);
          return { name: value.name, email: "user@example.com" };
        },
      },
    },
    async (baseUrl) => {
      const response = await patch(baseUrl, {
        name: "  Novo Nome  ",
      });
      assert.equal(response.status, 200);
      assert.equal(response.cacheControl, "no-store");
      assert.deepEqual(response.body, {
        user: { name: "Novo Nome", email: "user@example.com" },
      });
      assert.deepEqual(calls, [{ userId: "7", name: "Novo Nome" }]);

      const invalid = await patch(baseUrl, { name: "Nome", isAdmin: true });
      assert.equal(invalid.status, 400);
      assert.equal(invalid.body.code, "VALIDATION_ERROR");
    },
  );

  await withServer(
    { service: { updateProfile: async () => assert.fail() }, authenticated: false },
    async (baseUrl) => {
      const response = await patch(baseUrl, { name: "Novo Nome" });
      assert.equal(response.status, 401);
      assert.equal(response.cacheControl, "no-store");
    },
  );
});
