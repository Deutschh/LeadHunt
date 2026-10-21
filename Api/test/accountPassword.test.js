const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { createAccountRouter } = require("../src/routes/accountRoutes");
const {
  createAccountPasswordService,
} = require("../src/services/accountPasswordService");
const {
  validatePasswordChange,
} = require("../src/validation/accountValidation");

function createTransactionalFixture({ failOperation } = {}) {
  const state = {
    user: { id: "7", password_hash: "hash:senha atual segura", auth_version: 3 },
    refreshTokens: [
      { id: 1, user_id: "7", revoked_at: null, revocation_reason: null },
      { id: 2, user_id: "7", revoked_at: null, revocation_reason: null },
    ],
  };
  const order = [];
  let snapshot;
  const clone = () => structuredClone(state);
  const result = (rows = []) => ({ rows, rowCount: rows.length });
  const client = {
    releaseCalled: false,
    async query(sql, params = []) {
      if (sql === "BEGIN") {
        snapshot = clone();
        order.push("BEGIN");
        return result();
      }
      if (sql === "COMMIT") {
        order.push("COMMIT");
        snapshot = null;
        return result();
      }
      if (sql === "ROLLBACK") {
        order.push("ROLLBACK");
        Object.assign(state, snapshot);
        return result();
      }
      if (sql.startsWith("SET LOCAL")) return result();

      const operation = /\/\* account-password:([a-z-]+) \*\//u.exec(sql)?.[1];
      if (operation) order.push(operation);
      if (operation === failOperation) throw new Error(`fail:${operation}`);
      if (operation === "lock-user") {
        return params[0] === state.user.id
          ? result([{ id: state.user.id, password_hash: state.user.password_hash }])
          : result();
      }
      if (operation === "lock-refresh-tokens") {
        return result(
          state.refreshTokens
            .filter((token) => token.user_id === params[0] && token.revoked_at === null)
            .map((token) => ({ id: token.id })),
        );
      }
      if (operation === "update-password-and-version") {
        state.user.password_hash = params[1];
        state.user.auth_version += 1;
        return result([{ id: state.user.id, auth_version: state.user.auth_version }]);
      }
      if (operation === "revoke-refresh-tokens") {
        const revoked = state.refreshTokens.filter(
          (token) => token.user_id === params[0] && token.revoked_at === null,
        );
        for (const token of revoked) {
          token.revoked_at = new Date("2026-09-17T12:00:00.000Z");
          token.revocation_reason = "password_change";
        }
        return result(revoked.map((token) => ({ id: token.id })));
      }
      throw new Error(`SQL inesperado: ${sql}`);
    },
    release() { this.releaseCalled = true; },
  };
  return {
    state,
    order,
    client,
    db: { connect: async () => client },
    cryptoService: {
      hashPassword: async (password) => `hash:${password}`,
      verifyPassword: async (password, hash) => hash === `hash:${password}`,
    },
  };
}

test("validação de senha é estrita e reutiliza a política existente", () => {
  assert.deepEqual(
    validatePasswordChange({
      currentPassword: "senha atual segura",
      newPassword: "nova senha bem segura",
    }),
    {
      value: {
        currentPassword: "senha atual segura",
        newPassword: "nova senha bem segura",
      },
    },
  );
  for (const body of [
    {},
    { currentPassword: "senha atual segura", newPassword: "curta" },
    { currentPassword: "senha atual segura", newPassword: "senha atual segura" },
    { currentPassword: "senha atual segura", newPassword: "nova senha segura", userId: "9" },
    { currentPassword: null, newPassword: "nova senha bem segura" },
  ]) {
    assert.ok(validatePasswordChange(body).error);
  }
});

test("troca incrementa auth_version e revoga todas as sessões atomicamente", async () => {
  const fixture = createTransactionalFixture();
  const service = createAccountPasswordService(fixture);
  await service.changePassword({
    userId: "7",
    currentPassword: "senha atual segura",
    newPassword: "nova senha bem segura",
  });
  assert.equal(fixture.state.user.password_hash, "hash:nova senha bem segura");
  assert.equal(fixture.state.user.auth_version, 4);
  assert.deepEqual(
    fixture.state.refreshTokens.map((token) => token.revocation_reason),
    ["password_change", "password_change"],
  );
  assert.deepEqual(fixture.order, [
    "BEGIN",
    "lock-user",
    "lock-refresh-tokens",
    "update-password-and-version",
    "revoke-refresh-tokens",
    "COMMIT",
  ]);
  assert.equal(fixture.client.releaseCalled, true);
});

test("senha atual errada não escreve e falha de revogação desfaz update", async () => {
  const wrong = createTransactionalFixture();
  await assert.rejects(
    createAccountPasswordService(wrong).changePassword({
      userId: "7",
      currentPassword: "senha incorreta",
      newPassword: "nova senha bem segura",
    }),
    (error) => error.code === "CURRENT_PASSWORD_INVALID",
  );
  assert.equal(wrong.state.user.auth_version, 3);
  assert.equal(wrong.order.includes("update-password-and-version"), false);
  assert.equal(wrong.order.at(-1), "ROLLBACK");

  const failure = createTransactionalFixture({ failOperation: "revoke-refresh-tokens" });
  await assert.rejects(
    createAccountPasswordService(failure).changePassword({
      userId: "7",
      currentPassword: "senha atual segura",
      newPassword: "nova senha bem segura",
    }),
  );
  assert.equal(failure.state.user.password_hash, "hash:senha atual segura");
  assert.equal(failure.state.user.auth_version, 3);
  assert.equal(failure.state.refreshTokens.every((token) => token.revoked_at === null), true);
  assert.equal(failure.client.releaseCalled, true);
});

test("rota usa somente o ator autenticado e retorna contrato sanitizado", async () => {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: "7" }; next(); });
  app.use("/api/account", createAccountRouter({
    service: { updateProfile: async () => ({}) },
    passwordService: { changePassword: async (value) => calls.push(value) },
    logger: { error: () => {} },
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/account/password`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: "senha atual segura",
          newPassword: "nova senha bem segura",
        }),
      },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      message: "Senha alterada com sucesso. Faça login novamente.",
    });
    assert.deepEqual(calls, [{
      userId: "7",
      currentPassword: "senha atual segura",
      newPassword: "nova senha bem segura",
    }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
