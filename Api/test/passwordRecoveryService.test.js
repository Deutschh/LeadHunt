const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createAuthCryptoService,
} = require("../src/services/authCryptoService");
const {
  AuthIdentityError,
  createAuthIdentityService,
} = require("../src/services/authIdentityService");
const {
  AuthSessionError,
  createAuthSessionService,
} = require("../src/services/authSessionService");
const {
  PasswordRecoveryError,
  createPasswordRecoveryService,
} = require("../src/services/passwordRecoveryService");
const {
  createPasswordResetEmailService,
} = require("../src/services/email/passwordResetEmailService");
const { createFakeAuthDb } = require("./helpers/fakeAuthDb");

const NOW = new Date("2026-08-18T12:00:00.000Z");
const TOKENS = ["a".repeat(43), "b".repeat(43), "c".repeat(43)];

function baseState(overrides = {}) {
  return {
    now: NOW,
    users: [
      {
        id: 7,
        name: "Maria Silva",
        email: "maria@example.com",
        password_hash: "hash:senha antiga segura",
        email_verified_at: new Date(NOW),
        auth_version: 4,
      },
    ],
    workspaces: [
      {
        id: 11,
        slug: "ws-test",
        name: "Maria Silva",
        account_status: "pending",
        is_active: true,
      },
    ],
    memberships: [{ user_id: 7, workspace_id: 11, role: "owner" }],
    commercialProfiles: [{ workspace_id: 11 }],
    nextUserId: 8,
    ...overrides,
  };
}

function createFixture({ state, providerFails = false } = {}) {
  const db = createFakeAuthDb(state || baseState());
  const baseCrypto = createAuthCryptoService({
    otpHmacSecret: "h".repeat(32),
    devEmailBypassEnabled: false,
    devEmailBypassCode: "",
  });
  const availableTokens = [...TOKENS];
  const hashCalls = [];
  const deliveries = [];
  const logs = [];
  const cryptoService = {
    ...baseCrypto,
    generatePasswordResetToken: () => availableTokens.shift(),
    hashPassword: async (password) => {
      hashCalls.push(password);
      return `hash:${password}`;
    },
    verifyPassword: async (password, hash) => hash === `hash:${password}`,
    generateRefreshToken: () => "r".repeat(43),
    generateRefreshFamilyId: () => "00000000-0000-4000-8000-000000000001",
  };
  const service = createPasswordRecoveryService({
    db,
    cryptoService,
    emailService: {
      sendPasswordResetEmail: async (delivery) => {
        deliveries.push(delivery);
        if (providerFails) {
          throw new Error("provider secret detail");
        }
      },
    },
    config: { passwordResetTtlMinutes: 30 },
    logger: { error: (...args) => logs.push(args) },
  });

  return { db, service, cryptoService, hashCalls, deliveries, logs };
}

async function issueReset(fixture) {
  await fixture.service.forgot({ email: "maria@example.com" });
  return fixture.deliveries.at(-1).token;
}

async function expectInvalidReset(promise) {
  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof PasswordRecoveryError, true);
    assert.equal(error.code, "INVALID_RESET_TOKEN");
    return true;
  });
}

test("forgot persiste somente SHA-256, TTL 30 minutos e entrega token de 256 bits", async () => {
  const fixture = createFixture();
  await fixture.service.forgot({ email: "maria@example.com" });

  assert.equal(fixture.db.state.passwordResetTokens.length, 1);
  const stored = fixture.db.state.passwordResetTokens[0];
  const delivery = fixture.deliveries[0];
  assert.match(delivery.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(delivery.token, "base64url").length, 32);
  assert.equal(stored.token_digest.length, 32);
  assert.equal(
    stored.token_digest.equals(Buffer.from(delivery.token, "utf8")),
    false,
  );
  assert.equal(
    stored.token_digest.equals(
      fixture.cryptoService.createPasswordResetTokenDigest(delivery.token),
    ),
    true,
  );
  assert.equal(stored.expires_at.getTime() - NOW.getTime(), 30 * 60 * 1000);
  assert.equal(JSON.stringify(delivery).includes(stored.token_digest.toString("hex")), false);
});

test("forgot inexistente ou não verificado não persiste nem envia", async () => {
  const missing = createFixture();
  await missing.service.forgot({ email: "missing@example.com" });
  assert.equal(missing.db.state.passwordResetTokens.length, 0);
  assert.equal(missing.deliveries.length, 0);

  const unverified = createFixture();
  unverified.db.state.users[0].email_verified_at = null;
  await unverified.service.forgot({ email: "maria@example.com" });
  assert.equal(unverified.db.state.passwordResetTokens.length, 0);
  assert.equal(unverified.deliveries.length, 0);
  assert.deepEqual([...missing.logs, ...unverified.logs], []);
});

test("segundo forgot invalida o anterior e mantém exatamente um token aberto", async () => {
  const fixture = createFixture();
  await fixture.service.forgot({ email: "maria@example.com" });
  await fixture.service.forgot({ email: "maria@example.com" });

  assert.equal(fixture.db.state.passwordResetTokens.length, 2);
  assert.notEqual(fixture.db.state.passwordResetTokens[0].invalidated_at, null);
  assert.equal(fixture.db.state.passwordResetTokens[1].invalidated_at, null);
  assert.equal(
    fixture.db.state.passwordResetTokens.filter(
      (item) => item.consumed_at === null && item.invalidated_at === null,
    ).length,
    1,
  );
});

test("forgots concorrentes preservam no máximo um token aberto", async () => {
  const fixture = createFixture();

  const outcomes = await Promise.allSettled([
    fixture.service.forgot({ email: "maria@example.com" }),
    fixture.service.forgot({ email: "maria@example.com" }),
  ]);

  assert.equal(outcomes.every((item) => item.status === "fulfilled"), true);
  assert.equal(fixture.db.state.passwordResetTokens.length, 2);
  assert.equal(
    fixture.db.state.passwordResetTokens.filter(
      (item) => item.consumed_at === null && item.invalidated_at === null,
    ).length,
    1,
  );
});

test("falha do provider mantém resposta de serviço e invalida somente o token novo", async () => {
  const unrelatedDigest = Buffer.alloc(32, 9);
  const fixture = createFixture({
    providerFails: true,
    state: baseState({
      users: [
        ...baseState().users,
        {
          id: 8,
          name: "Outro User",
          email: "outro@example.com",
          password_hash: "hash:outra senha segura",
          email_verified_at: new Date(NOW),
          auth_version: 1,
        },
      ],
      passwordResetTokens: [
        {
          id: 50,
          user_id: 8,
          token_digest: unrelatedDigest,
          expires_at: new Date(NOW.getTime() + 30 * 60 * 1000),
          consumed_at: null,
          invalidated_at: null,
          created_at: new Date(NOW),
        },
      ],
      nextPasswordResetTokenId: 51,
    }),
  });

  await fixture.service.forgot({ email: "maria@example.com" });

  assert.equal(fixture.db.state.passwordResetTokens[0].invalidated_at, null);
  assert.notEqual(fixture.db.state.passwordResetTokens[1].invalidated_at, null);
  assert.deepEqual(fixture.logs, [["AUTH_PASSWORD_RESET_EMAIL_DELIVERY_FAILED"]]);
  const cleanupOrder = fixture.db.queryLog.slice(-3);
  assert.deepEqual(cleanupOrder, [
    "lock-failed-delivery-user",
    "lock-failed-delivery-token",
    "invalidate-failed-delivery-token",
  ]);
});

test("lookup inexistente rejeita antes de executar Argon2", async () => {
  const fixture = createFixture();
  await expectInvalidReset(
    fixture.service.reset({
      token: "z".repeat(43),
      password: "nova senha longa segura",
    }),
  );
  assert.deepEqual(fixture.hashCalls, []);
  assert.deepEqual(fixture.db.queryLog, ["find-reset-owner"]);
});

test("reset válido é atômico, use-once e segue a ordem global de locks", async () => {
  const fixture = createFixture();
  const resetToken = await issueReset(fixture);
  fixture.db.state.refreshTokens.push(
    {
      id: 1,
      user_id: 7,
      token_digest: Buffer.alloc(32, 1),
      family_id: "family-1",
      replaced_by_token_id: null,
      expires_at: new Date(NOW.getTime() + 60_000),
      last_used_at: null,
      revoked_at: null,
      revocation_reason: null,
      created_at: new Date(NOW),
      auth_version_at_issue: 4,
    },
    {
      id: 2,
      user_id: 7,
      token_digest: Buffer.alloc(32, 2),
      family_id: "family-2",
      replaced_by_token_id: null,
      expires_at: new Date(NOW.getTime() + 60_000),
      last_used_at: null,
      revoked_at: null,
      revocation_reason: null,
      created_at: new Date(NOW),
      auth_version_at_issue: 4,
    },
    {
      id: 3,
      user_id: 7,
      token_digest: Buffer.alloc(32, 3),
      family_id: "family-old",
      replaced_by_token_id: null,
      expires_at: new Date(NOW.getTime() + 60_000),
      last_used_at: null,
      revoked_at: new Date(NOW),
      revocation_reason: "logout",
      created_at: new Date(NOW),
      auth_version_at_issue: 4,
    },
  );
  fixture.db.queryLog.length = 0;

  await fixture.service.reset({
    token: resetToken,
    password: "nova senha longa segura",
  });

  assert.equal(fixture.db.state.users[0].password_hash, "hash:nova senha longa segura");
  assert.equal(fixture.db.state.users[0].auth_version, 5);
  assert.notEqual(fixture.db.state.passwordResetTokens[0].consumed_at, null);
  assert.deepEqual(
    fixture.db.state.refreshTokens.slice(0, 2).map((item) => item.revocation_reason),
    ["password_reset", "password_reset"],
  );
  assert.equal(fixture.db.state.refreshTokens[2].revocation_reason, "logout");
  assert.deepEqual(fixture.db.queryLog, [
    "find-reset-owner",
    "lock-reset-user",
    "lock-reset-token",
    "lock-user-refresh-tokens",
    "update-password-and-version",
    "consume-reset-token",
    "revoke-user-refresh-tokens",
  ]);

  await expectInvalidReset(
    fixture.service.reset({ token: resetToken, password: "terceira senha segura" }),
  );
  assert.equal(fixture.db.state.users[0].auth_version, 5);
});

test("token expirado, consumido ou invalidado usa o mesmo erro externo", async () => {
  for (const lifecycle of ["expired", "consumed", "invalidated"]) {
    const fixture = createFixture();
    const token = await issueReset(fixture);
    const stored = fixture.db.state.passwordResetTokens[0];
    if (lifecycle === "expired") {
      stored.expires_at = new Date(NOW.getTime() - 1);
    } else if (lifecycle === "consumed") {
      stored.consumed_at = new Date(NOW);
    } else {
      stored.invalidated_at = new Date(NOW);
    }

    await expectInvalidReset(
      fixture.service.reset({ token, password: "nova senha longa segura" }),
    );
    assert.equal(fixture.db.state.users[0].password_hash, "hash:senha antiga segura");
  }
});

test("duas requests concorrentes com o mesmo token produzem apenas um sucesso", async () => {
  const fixture = createFixture();
  const token = await issueReset(fixture);
  const outcomes = await Promise.allSettled([
    fixture.service.reset({ token, password: "primeira senha segura" }),
    fixture.service.reset({ token, password: "segunda senha segura" }),
  ]);

  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((item) => item.status === "rejected").length, 1);
  assert.equal(fixture.db.state.users[0].auth_version, 5);
  assert.notEqual(fixture.db.state.passwordResetTokens[0].consumed_at, null);
});

test("falha intermediária reverte senha, versão, consumo e sessões", async () => {
  for (const failOperation of [
    "update-password-and-version",
    "consume-reset-token",
    "revoke-user-refresh-tokens",
  ]) {
    const fixture = createFixture();
    const token = await issueReset(fixture);
    fixture.db.state.refreshTokens.push({
      id: 1,
      user_id: 7,
      token_digest: Buffer.alloc(32, 4),
      family_id: "family-rollback",
      replaced_by_token_id: null,
      expires_at: new Date(NOW.getTime() + 60_000),
      last_used_at: null,
      revoked_at: null,
      revocation_reason: null,
      created_at: new Date(NOW),
      auth_version_at_issue: 4,
    });
    fixture.db.state.failOperation = failOperation;

    await assert.rejects(
      fixture.service.reset({ token, password: "nova senha longa segura" }),
    );
    assert.equal(fixture.db.state.users[0].password_hash, "hash:senha antiga segura");
    assert.equal(fixture.db.state.users[0].auth_version, 4);
    assert.equal(fixture.db.state.passwordResetTokens[0].consumed_at, null);
    assert.equal(fixture.db.state.refreshTokens[0].revoked_at, null);
  }
});

test("reset funciona independentemente do status comercial e invalida JWT antigo", async () => {
  for (const accountStatus of ["pending", "active", "suspended"]) {
    const fixture = createFixture();
    fixture.db.state.workspaces[0].account_status = accountStatus;
    fixture.db.state.workspaces[0].is_active = false;
    const token = await issueReset(fixture);

    await fixture.service.reset({ token, password: "nova senha longa segura" });
    await assert.rejects(
      createAuthIdentityService({ db: fixture.db }).resolve({
        userId: "7",
        authVersion: 4,
      }),
      (error) => error instanceof AuthIdentityError && error.status === 401,
    );
  }
});

test("senha antiga falha, nova autentica e cria sessão somente após novo login", async () => {
  const fixture = createFixture();
  const token = await issueReset(fixture);
  await fixture.service.reset({ token, password: "nova senha longa segura" });
  assert.equal(fixture.db.state.refreshTokens.length, 0);

  const sessionService = createAuthSessionService({
    db: fixture.db,
    cryptoService: fixture.cryptoService,
    accessTokenService: { issue: () => "new-access" },
    config: { refreshTokenTtlSeconds: 30 * 24 * 60 * 60 },
    clock: () => new Date(fixture.db.state.now),
  });

  await assert.rejects(
    sessionService.login({
      email: "maria@example.com",
      password: "senha antiga segura",
    }),
    (error) => error instanceof AuthSessionError && error.code === "INVALID_CREDENTIALS",
  );
  const login = await sessionService.login({
    email: "maria@example.com",
    password: "nova senha longa segura",
  });
  assert.equal(login.accessToken, "new-access");
  assert.equal(fixture.db.state.refreshTokens.length, 1);
  assert.equal(fixture.db.state.refreshTokens[0].auth_version_at_issue, 5);
});

test("serviço de e-mail monta URL com searchParams e não altera a base", async () => {
  const sent = [];
  const emailService = createPasswordResetEmailService({
    provider: { sendEmail: async (message) => sent.push(message) },
    passwordResetUrl: "https://app.example.com/reset-password",
  });
  const token = "a_b-C".padEnd(43, "x");

  await emailService.sendPasswordResetEmail({
    to: "maria@example.com",
    token,
    expiresInMinutes: 30,
    idempotencyKey: "password-reset-1",
  });

  assert.equal(sent.length, 1);
  assert.match(sent[0].text, new RegExp(`https://app\\.example\\.com/reset-password\\?token=${token}`));
  assert.equal(sent[0].idempotencyKey, "password-reset-1");
});
