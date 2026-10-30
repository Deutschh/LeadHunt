const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AccountPasswordMaintenanceError,
  createAccountPasswordService,
} = require("../src/services/accountPasswordService");
const {
  passwordCryptoService,
} = require("../src/services/authCryptoService");
const {
  readEmailArgument,
  run,
} = require("../scripts/maintenance/reset-user-password");

function result(rows = []) {
  return { rows, rowCount: rows.length };
}

function createFixture({ users, refreshTokens = [], failOperation = null }) {
  const state = { users, refreshTokens };
  let snapshot = null;
  const order = [];
  const client = {
    released: false,
    async query(sql, params = []) {
      if (sql === "BEGIN") {
        snapshot = structuredClone(state);
        order.push("BEGIN");
        return result();
      }
      if (sql === "COMMIT") {
        snapshot = null;
        order.push("COMMIT");
        return result();
      }
      if (sql === "ROLLBACK") {
        state.users = snapshot.users;
        state.refreshTokens = snapshot.refreshTokens;
        order.push("ROLLBACK");
        return result();
      }
      if (sql.startsWith("SET LOCAL")) return result();

      const operation =
        /\/\* account-password:([a-z-]+) \*\//u.exec(sql)?.[1];
      order.push(operation);
      if (operation === failOperation) throw new Error(`fail:${operation}`);

      if (operation === "maintenance-lock-user-by-email") {
        return result(
          state.users
            .filter((user) => user.email.toLowerCase() === params[0])
            .map((user) => ({ id: user.id })),
        );
      }
      if (operation === "maintenance-lock-refresh-tokens") {
        return result(
          state.refreshTokens
            .filter(
              (token) =>
                token.user_id === params[0] && token.revoked_at === null,
            )
            .map((token) => ({ id: token.id })),
        );
      }
      if (operation === "maintenance-update-password-and-version") {
        const user = state.users.find((candidate) => candidate.id === params[0]);
        if (!user) return result();
        user.password_hash = params[1];
        user.auth_version += 1;
        return result([{ id: user.id, auth_version: user.auth_version }]);
      }
      if (operation === "maintenance-revoke-refresh-tokens") {
        const revoked = state.refreshTokens.filter(
          (token) => token.user_id === params[0] && token.revoked_at === null,
        );
        for (const token of revoked) {
          token.revoked_at = new Date("2026-10-30T12:00:00.000Z");
          token.revocation_reason = "password_reset";
        }
        return result(revoked.map((token) => ({ id: token.id })));
      }
      throw new Error(`SQL inesperado: ${sql}`);
    },
    release() {
      this.released = true;
    },
  };

  return {
    state,
    order,
    client,
    db: { connect: async () => client },
  };
}

async function baseFixture() {
  const oldPassword = "senha administrativa antiga";
  return {
    oldPassword,
    fixture: createFixture({
      users: [
        {
          id: "7",
          email: "admin@example.com",
          password_hash: await passwordCryptoService.hashPassword(oldPassword),
          auth_version: 5,
          is_admin: true,
          name: "Admin",
          workspace_id: "11",
        },
      ],
      refreshTokens: [
        {
          id: "1",
          user_id: "7",
          revoked_at: null,
          revocation_reason: null,
        },
        {
          id: "2",
          user_id: "7",
          revoked_at: new Date("2026-10-29T12:00:00.000Z"),
          revocation_reason: "logout",
        },
      ],
    }),
  };
}

test("reset local troca somente credencial/versão e revoga refresh ativo", async () => {
  const { fixture, oldPassword } = await baseFixture();
  const before = structuredClone(fixture.state.users[0]);
  const service = createAccountPasswordService({
    db: fixture.db,
    cryptoService: passwordCryptoService,
  });

  const outcome = await service.resetPasswordByEmail({
    email: "  ADMIN@example.com ",
    newPassword: "senha administrativa nova",
  });

  const user = fixture.state.users[0];
  assert.equal(
    await passwordCryptoService.verifyPassword(oldPassword, user.password_hash),
    false,
  );
  assert.equal(
    await passwordCryptoService.verifyPassword(
      "senha administrativa nova",
      user.password_hash,
    ),
    true,
  );
  assert.equal(user.auth_version, 6);
  assert.equal(user.is_admin, true);
  assert.equal(user.name, before.name);
  assert.equal(user.workspace_id, before.workspace_id);
  assert.notEqual(fixture.state.refreshTokens[0].revoked_at, null);
  assert.equal(
    fixture.state.refreshTokens[0].revocation_reason,
    "password_reset",
  );
  assert.equal(
    fixture.state.refreshTokens[1].revocation_reason,
    "logout",
  );
  assert.deepEqual(outcome, { authVersion: 6, revokedRefreshTokens: 1 });
  assert.equal(fixture.client.released, true);
  assert.deepEqual(fixture.order, [
    "BEGIN",
    "maintenance-lock-user-by-email",
    "maintenance-lock-refresh-tokens",
    "maintenance-update-password-and-version",
    "maintenance-revoke-refresh-tokens",
    "COMMIT",
  ]);
});

test("usuário inexistente, seleção ambígua e senha fraca não alteram dados", async () => {
  const { fixture } = await baseFixture();
  const before = structuredClone(fixture.state);
  const service = createAccountPasswordService({
    db: fixture.db,
    cryptoService: passwordCryptoService,
  });

  await assert.rejects(
    service.resetPasswordByEmail({
      email: "missing@example.com",
      newPassword: "senha administrativa nova",
    }),
    (error) =>
      error instanceof AccountPasswordMaintenanceError &&
      error.code === "USER_NOT_FOUND",
  );
  await assert.rejects(
    service.resetPasswordByEmail({
      email: "admin@example.com",
      newPassword: "curta",
    }),
    (error) =>
      error instanceof AccountPasswordMaintenanceError &&
      error.code === "WEAK_PASSWORD",
  );

  fixture.state.users.push({
    ...fixture.state.users[0],
    id: "8",
    email: "ADMIN@example.com",
  });
  await assert.rejects(
    service.resetPasswordByEmail({
      email: "admin@example.com",
      newPassword: "senha administrativa nova",
    }),
    (error) =>
      error instanceof AccountPasswordMaintenanceError &&
      error.code === "AMBIGUOUS_USER",
  );

  fixture.state.users.pop();
  assert.deepEqual(fixture.state, before);
});

test("falha de revogação reverte senha e auth_version", async () => {
  const { fixture, oldPassword } = await baseFixture();
  fixture.state.failOperation = "maintenance-revoke-refresh-tokens";
  const originalQuery = fixture.client.query.bind(fixture.client);
  fixture.client.query = (sql, params) => {
    if (sql.includes("maintenance-revoke-refresh-tokens")) {
      return Promise.reject(new Error("fixture revocation failure"));
    }
    return originalQuery(sql, params);
  };

  await assert.rejects(
    createAccountPasswordService({
      db: fixture.db,
      cryptoService: passwordCryptoService,
    }).resetPasswordByEmail({
      email: "admin@example.com",
      newPassword: "senha administrativa nova",
    }),
  );

  assert.equal(fixture.state.users[0].auth_version, 5);
  assert.equal(
    await passwordCryptoService.verifyPassword(
      oldPassword,
      fixture.state.users[0].password_hash,
    ),
    true,
  );
  assert.equal(fixture.state.refreshTokens[0].revoked_at, null);
  assert.equal(fixture.order.at(-1), "ROLLBACK");
});

test("CLI exige e-mail explícito e nunca escreve senha, hash ou URL", async () => {
  assert.equal(
    readEmailArgument(["--email", "admin@example.com"]),
    "admin@example.com",
  );
  assert.throws(() => readEmailArgument([]), { code: "EMAIL_ARGUMENT_REQUIRED" });
  assert.throws(
    () => readEmailArgument(["--email", "a@example.com", "--email", "b@example.com"]),
    { code: "EMAIL_ARGUMENT_REQUIRED" },
  );

  const { fixture } = await baseFixture();
  const prompts = [
    "postgresql://maintenance-secret",
    "senha administrativa nova",
    "senha administrativa nova",
  ];
  let output = "";
  let ended = false;
  await run({
    argv: ["--email", "admin@example.com"],
    env: {},
    prompt: async () => prompts.shift(),
    poolFactory: () => ({
      connect: fixture.db.connect,
      end: async () => {
        ended = true;
      },
    }),
    stdout: { write: (value) => { output += value; } },
  });

  assert.equal(ended, true);
  assert.equal(output, "Senha redefinida e sessões existentes revogadas.\n");
  assert.equal(output.includes("senha administrativa nova"), false);
  assert.equal(output.includes("postgresql://"), false);
  assert.equal(output.includes("$argon2"), false);
});
