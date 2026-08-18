const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createAuthCryptoService,
} = require("../src/services/authCryptoService");
const {
  AuthServiceError,
  createAuthService,
} = require("../src/services/authService");
const { createFakeAuthDb } = require("./helpers/fakeAuthDb");

function createHarness({ providerFails = false, bypass = false } = {}) {
  const config = {
    otpHmacSecret: "h".repeat(32),
    devEmailBypassEnabled: bypass,
    devEmailBypassCode: bypass ? "999999" : "",
    otpExpiresInMinutes: 10,
    otpMaxAttempts: 5,
    resendCooldownSeconds: 60,
    maxChallengesPerHour: 5,
    verificationRetryWindowMinutes: 5,
  };
  const baseCrypto = createAuthCryptoService(config);
  const generatedCodes = [
    "111111",
    "222222",
    "333333",
    "444444",
    "555555",
    "666666",
  ];
  let slugCounter = 0;
  const cryptoService = {
    createOtpDigest: baseCrypto.createOtpDigest,
    generateOtp: () => generatedCodes.shift(),
    generateWorkspaceSlug: () =>
      `ws-00000000-0000-4000-8000-${String(++slugCounter).padStart(12, "0")}`,
    hashPassword: async (password) => `argon2:${password}`,
    isDevelopmentBypassCode: baseCrypto.isDevelopmentBypassCode,
    matchesOtp: baseCrypto.matchesOtp,
  };
  const db = createFakeAuthDb();
  const sentEmails = [];
  const logEvents = [];
  const emailService = {
    sendVerificationEmail: async (payload) => {
      sentEmails.push(payload);
      if (providerFails) {
        throw new Error("provider details must not escape");
      }
    },
  };
  const logger = {
    error: (event) => logEvents.push(event),
    warn: (event) => logEvents.push(event),
  };
  const service = createAuthService({
    db,
    cryptoService,
    emailService,
    config,
    logger,
  });

  return { db, service, sentEmails, logEvents };
}

function registration(overrides = {}) {
  return {
    name: "Maria Silva",
    email: "maria@example.com",
    password: "senha longa segura",
    termsVersion: "terms-v1",
    privacyPolicyVersion: "privacy-v1",
    ...overrides,
  };
}

async function assertInvalidCode(promise) {
  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof AuthServiceError, true);
    assert.equal(error.code, "INVALID_OR_EXPIRED_CODE");
    return true;
  });
}

test("register cria somente user e challenge, sem workspace", async () => {
  const harness = createHarness();
  await harness.service.register(registration());

  assert.equal(harness.db.state.users.length, 1);
  assert.equal(harness.db.state.users[0].email, "maria@example.com");
  assert.equal(harness.db.state.challenges.length, 1);
  assert.equal(harness.db.state.workspaces.length, 1);
  assert.equal(harness.db.state.memberships.length, 0);
  assert.equal(harness.sentEmails.length, 1);
  assert.equal(harness.sentEmails[0].code, "111111");
});

test("cadastro duplicado não sobrescreve credenciais/aceites e respeita cooldown", async () => {
  const harness = createHarness();
  await harness.service.register(registration());
  const originalUser = { ...harness.db.state.users[0] };

  await harness.service.register(
    registration({
      name: "Nome Alterado",
      password: "outra senha segura",
      termsVersion: "terms-v2",
    }),
  );

  assert.equal(harness.db.state.users.length, 1);
  assert.equal(harness.db.state.users[0].name, originalUser.name);
  assert.equal(
    harness.db.state.users[0].password_hash,
    originalUser.password_hash,
  );
  assert.equal(harness.db.state.users[0].terms_version, originalUser.terms_version);
  assert.equal(harness.db.state.challenges.length, 1);
  assert.equal(harness.sentEmails.length, 1);
});

test("cadastro duplicado verificado é no-op e não cria segundo workspace", async () => {
  const harness = createHarness();
  await harness.service.register(registration());
  await harness.service.verify({
    email: "maria@example.com",
    code: harness.sentEmails[0].code,
  });

  await harness.service.register(
    registration({ name: "Nome Alterado", password: "outra senha segura" }),
  );

  assert.equal(harness.db.state.users[0].name, "Maria Silva");
  assert.equal(
    harness.db.state.users[0].password_hash,
    "argon2:senha longa segura",
  );
  assert.equal(harness.db.state.workspaces.length, 2);
  assert.equal(harness.db.state.memberships.length, 1);
  assert.equal(harness.sentEmails.length, 1);
});

test("falha do provider invalida somente o challenge novo e não propaga erro", async () => {
  const harness = createHarness({ providerFails: true });

  await harness.service.register(registration());

  assert.equal(harness.db.state.users.length, 1);
  assert.notEqual(harness.db.state.challenges[0].invalidated_at, null);
  assert.deepEqual(harness.logEvents, [
    "AUTH_VERIFICATION_EMAIL_DELIVERY_FAILED",
  ]);
});

test("resend invalida challenge anterior antes de criar o novo", async () => {
  const harness = createHarness();
  await harness.service.register(registration());

  await harness.service.resend({ email: "maria@example.com" });
  assert.equal(harness.db.state.challenges.length, 1);

  harness.db.state.now = new Date(
    harness.db.state.now.getTime() + 61 * 1000,
  );
  await harness.service.resend({ email: "maria@example.com" });

  assert.equal(harness.db.state.challenges.length, 2);
  assert.notEqual(harness.db.state.challenges[0].invalidated_at, null);
  assert.equal(harness.db.state.challenges[1].invalidated_at, null);
  assert.equal(harness.sentEmails.length, 2);
});

test("resend respeita quota persistente de cinco challenges por hora", async () => {
  const harness = createHarness();
  await harness.service.register(registration());

  for (let resend = 0; resend < 4; resend += 1) {
    harness.db.state.now = new Date(
      harness.db.state.now.getTime() + 61 * 1000,
    );
    await harness.service.resend({ email: "maria@example.com" });
  }

  assert.equal(harness.db.state.challenges.length, 5);
  harness.db.state.now = new Date(
    harness.db.state.now.getTime() + 61 * 1000,
  );
  await harness.service.resend({ email: "maria@example.com" });
  assert.equal(harness.db.state.challenges.length, 5);
  assert.equal(harness.sentEmails.length, 5);
});

test("resend é no-op para e-mail inexistente ou já verificado", async () => {
  const harness = createHarness();
  await harness.service.resend({ email: "missing@example.com" });
  assert.equal(harness.sentEmails.length, 0);

  await harness.service.register(registration());
  await harness.service.verify({
    email: "maria@example.com",
    code: harness.sentEmails[0].code,
  });
  await harness.service.resend({ email: "maria@example.com" });
  assert.equal(harness.sentEmails.length, 1);
});

test("verify cria workspace pending, owner e commercial profile atomicamente", async () => {
  const harness = createHarness();
  await harness.service.register(registration());

  const result = await harness.service.verify({
    email: "maria@example.com",
    code: harness.sentEmails[0].code,
  });

  assert.deepEqual(result, { accountStatus: "pending" });
  assert.notEqual(harness.db.state.users[0].email_verified_at, null);
  assert.equal(harness.db.state.workspaces.length, 2);
  assert.equal(harness.db.state.workspaces[1].name, "Maria Silva");
  assert.match(
    harness.db.state.workspaces[1].slug,
    /^ws-[0-9a-f-]{36}$/i,
  );
  assert.equal(harness.db.state.workspaces[1].account_status, "pending");
  assert.deepEqual(harness.db.state.memberships, [
    { workspace_id: 2, user_id: 1, role: "owner" },
  ]);
  assert.deepEqual(harness.db.state.commercialProfiles, [
    { workspace_id: 1 },
    { workspace_id: 2 },
  ]);
  assert.notEqual(harness.db.state.challenges[0].consumed_at, null);
});

test("verify reverte user, challenge, workspace e membership em falha transacional", async () => {
  const harness = createHarness();
  await harness.service.register(registration());
  const code = harness.sentEmails[0].code;
  harness.db.state.failOperation = "create-commercial-profile";

  await assert.rejects(
    harness.service.verify({ email: "maria@example.com", code }),
    /Falha injetada/,
  );

  assert.equal(harness.db.state.users[0].email_verified_at, null);
  assert.equal(harness.db.state.challenges[0].consumed_at, null);
  assert.equal(harness.db.state.workspaces.length, 1);
  assert.equal(harness.db.state.memberships.length, 0);
  assert.deepEqual(harness.db.state.commercialProfiles, [{ workspace_id: 1 }]);
});

test("verify real repetido dentro de cinco minutos é idempotente", async () => {
  const harness = createHarness();
  await harness.service.register(registration());
  const code = harness.sentEmails[0].code;

  await harness.service.verify({ email: "maria@example.com", code });
  harness.db.state.now = new Date(
    harness.db.state.now.getTime() + 4 * 60 * 1000 + 59 * 1000,
  );
  const repeated = await harness.service.verify({
    email: "maria@example.com",
    code,
  });

  assert.deepEqual(repeated, { accountStatus: "pending" });
  assert.equal(harness.db.state.workspaces.length, 2);
  assert.equal(harness.db.state.memberships.length, 1);
  assert.equal(harness.db.state.commercialProfiles.length, 2);
});

test("verify real repetido depois de cinco minutos é recusado", async () => {
  const harness = createHarness();
  await harness.service.register(registration());
  const code = harness.sentEmails[0].code;

  await harness.service.verify({ email: "maria@example.com", code });
  harness.db.state.now = new Date(
    harness.db.state.now.getTime() + 5 * 60 * 1000 + 1,
  );

  await assertInvalidCode(
    harness.service.verify({ email: "maria@example.com", code }),
  );
  assert.equal(harness.db.state.workspaces.length, 2);
  assert.equal(harness.db.state.memberships.length, 1);
  assert.equal(harness.db.state.commercialProfiles.length, 2);
});

test("verify repetido com código diferente não confirma user verificado", async () => {
  const harness = createHarness();
  await harness.service.register(registration());

  await harness.service.verify({
    email: "maria@example.com",
    code: harness.sentEmails[0].code,
  });

  await assertInvalidCode(
    harness.service.verify({ email: "maria@example.com", code: "222222" }),
  );
  assert.equal(harness.db.state.workspaces.length, 2);
  assert.equal(harness.db.state.memberships.length, 1);
  assert.equal(harness.db.state.commercialProfiles.length, 2);
});

test("quinta tentativa incorreta invalida o challenge", async () => {
  const harness = createHarness();
  await harness.service.register(registration());

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assertInvalidCode(
      harness.service.verify({
        email: "maria@example.com",
        code: "000000",
      }),
    );
  }

  assert.equal(harness.db.state.challenges[0].attempt_count, 5);
  assert.notEqual(harness.db.state.challenges[0].invalidated_at, null);
  assert.equal(harness.db.state.workspaces.length, 1);
});

test("quinta tentativa correta ainda verifica a conta", async () => {
  const harness = createHarness();
  await harness.service.register(registration());
  const correctCode = harness.sentEmails[0].code;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await assertInvalidCode(
      harness.service.verify({
        email: "maria@example.com",
        code: "000000",
      }),
    );
  }

  const result = await harness.service.verify({
    email: "maria@example.com",
    code: correctCode,
  });
  assert.equal(result.accountStatus, "pending");
  assert.equal(harness.db.state.challenges[0].attempt_count, 5);
});

test("challenge expirado é invalidado sem criar workspace", async () => {
  const harness = createHarness();
  await harness.service.register(registration());
  const code = harness.sentEmails[0].code;
  harness.db.state.now = new Date(
    harness.db.state.now.getTime() + 11 * 60 * 1000,
  );

  await assertInvalidCode(
    harness.service.verify({ email: "maria@example.com", code }),
  );
  assert.notEqual(harness.db.state.challenges[0].invalidated_at, null);
  assert.equal(harness.db.state.workspaces.length, 1);
});

test("código de outro user não cruza challenges", async () => {
  const harness = createHarness();
  await harness.service.register(registration());
  await harness.service.register(
    registration({
      name: "João Souza",
      email: "joao@example.com",
    }),
  );

  await assertInvalidCode(
    harness.service.verify({
      email: "joao@example.com",
      code: harness.sentEmails[0].code,
    }),
  );
  assert.equal(harness.db.state.users[1].email_verified_at, null);
  assert.equal(harness.db.state.workspaces.length, 1);
});

test("bypass exige challenge real e permite retry idempotente dentro da janela", async () => {
  const harness = createHarness({ bypass: true });

  await assertInvalidCode(
    harness.service.verify({ email: "missing@example.com", code: "999999" }),
  );

  await harness.service.register(registration());
  const result = await harness.service.verify({
    email: "maria@example.com",
    code: "999999",
  });

  harness.db.state.now = new Date(
    harness.db.state.now.getTime() + 4 * 60 * 1000 + 59 * 1000,
  );
  const repeated = await harness.service.verify({
    email: "maria@example.com",
    code: "999999",
  });

  assert.equal(result.accountStatus, "pending");
  assert.equal(repeated.accountStatus, "pending");
  assert.equal(harness.logEvents.includes("AUTH_DEV_EMAIL_BYPASS_USED"), true);
  assert.notEqual(harness.db.state.challenges[0].consumed_at, null);
  assert.equal(harness.db.state.workspaces.length, 2);
  assert.equal(harness.db.state.memberships.length, 1);
  assert.equal(harness.db.state.commercialProfiles.length, 2);
});

test("retry do bypass depois de cinco minutos é recusado", async () => {
  const harness = createHarness({ bypass: true });
  await harness.service.register(registration());
  await harness.service.verify({
    email: "maria@example.com",
    code: "999999",
  });

  harness.db.state.now = new Date(
    harness.db.state.now.getTime() + 5 * 60 * 1000 + 1,
  );
  await assertInvalidCode(
    harness.service.verify({ email: "maria@example.com", code: "999999" }),
  );
  assert.equal(harness.db.state.workspaces.length, 2);
  assert.equal(harness.db.state.memberships.length, 1);
  assert.equal(harness.db.state.commercialProfiles.length, 2);
});

test("retry do bypass com código diferente é recusado", async () => {
  const harness = createHarness({ bypass: true });
  await harness.service.register(registration());
  await harness.service.verify({
    email: "maria@example.com",
    code: "999999",
  });

  await assertInvalidCode(
    harness.service.verify({ email: "maria@example.com", code: "111111" }),
  );
  assert.equal(harness.db.state.workspaces.length, 2);
  assert.equal(harness.db.state.memberships.length, 1);
  assert.equal(harness.db.state.commercialProfiles.length, 2);
});
