const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const {
  AuthSessionError,
  createAuthSessionService,
} = require("../src/services/authSessionService");
const { createFakeAuthDb } = require("./helpers/fakeAuthDb");

const NOW = new Date("2026-08-18T12:00:00.000Z");
const TOKENS = ["a", "b", "c", "d", "e", "f"].map((char) =>
  char.repeat(43),
);

function createFixture(overrides = {}) {
  const user = {
    id: 7,
    name: "Maria",
    email: "maria@example.com",
    password_hash: "hash:correct",
    email_verified_at: new Date("2026-08-18T11:00:00.000Z"),
    auth_version: 2,
    last_login_at: null,
  };
  const db = createFakeAuthDb({
    now: NOW,
    users: [user],
    workspaces: [
      {
        id: 1,
        slug: "internal-main",
        name: "Internal",
        account_status: "active",
        is_active: true,
      },
      {
        id: 8,
        slug: "ws-test",
        name: "Maria",
        account_status: overrides.accountStatus || "pending",
        is_active: overrides.isActive ?? true,
      },
    ],
    memberships: [{ workspace_id: 8, user_id: 7, role: "owner" }],
    commercialProfiles: [{ workspace_id: 1 }, { workspace_id: 8 }],
    ...overrides.state,
  });
  const generatedTokens = [...TOKENS];
  const passwordChecks = [];
  const cryptoService = {
    dummyPasswordHash: "hash:dummy",
    verifyPassword: async (password, hash) => {
      passwordChecks.push({ password, hash });
      return password === "correct password" && hash === "hash:correct";
    },
    generateRefreshToken: () => generatedTokens.shift(),
    createRefreshTokenDigest: (token) =>
      crypto.createHash("sha256").update(token).digest(),
    generateRefreshFamilyId: () => crypto.randomUUID(),
  };
  const issuedAccessTokens = [];
  const accessTokenService = {
    issue: (claims) => {
      issuedAccessTokens.push(claims);
      return `access-${claims.userId}-${claims.authVersion}`;
    },
  };
  const logs = [];
  const service = createAuthSessionService({
    db,
    cryptoService,
    accessTokenService,
    config: {
      refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
    },
    clock: () => new Date(db.state.now),
    logger: { warn: (event) => logs.push(event) },
  });

  return { db, service, passwordChecks, issuedAccessTokens, logs };
}

async function expectSessionError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error instanceof AuthSessionError, true);
    assert.equal(error.code, code);
    return true;
  });
}

test("login normalizado cria sessão digest-only com snapshot e atualiza last_login", async () => {
  for (const accountStatus of ["pending", "active", "suspended"]) {
    const fixture = createFixture({ accountStatus, isActive: false });
    const result = await fixture.service.login({
      email: "maria@example.com",
      password: "correct password",
    });
    const stored = fixture.db.state.refreshTokens[0];

    assert.equal(result.accessToken, "access-7-2");
    assert.equal(result.refreshToken, TOKENS[0]);
    assert.equal(stored.token_digest.equals(Buffer.from(TOKENS[0])), false);
    assert.equal(stored.token_digest.length, 32);
    assert.equal(stored.auth_version_at_issue, 2);
    assert.equal(stored.revoked_at, null);
    assert.equal(fixture.db.state.users[0].last_login_at.getTime(), NOW.getTime());
  }
});

test("login uniforme usa dummy Argon para e-mail inexistente e rejeita senha/unverified", async () => {
  const missing = createFixture();
  await expectSessionError(
    missing.service.login({
      email: "missing@example.com",
      password: "correct password",
    }),
    "INVALID_CREDENTIALS",
  );
  assert.equal(missing.passwordChecks[0].hash, "hash:dummy");

  const wrong = createFixture();
  await expectSessionError(
    wrong.service.login({
      email: "maria@example.com",
      password: "wrong password",
    }),
    "INVALID_CREDENTIALS",
  );

  const unverified = createFixture();
  unverified.db.state.users[0].email_verified_at = null;
  await expectSessionError(
    unverified.service.login({
      email: "maria@example.com",
      password: "correct password",
    }),
    "INVALID_CREDENTIALS",
  );
  assert.equal(unverified.db.state.refreshTokens.length, 0);
});

test("login falha fechado sem membership/workspace e não cria sessão", async () => {
  const fixture = createFixture();
  fixture.db.state.memberships = [];
  await expectSessionError(
    fixture.service.login({
      email: "maria@example.com",
      password: "correct password",
    }),
    "AUTH_STATE_CONFLICT",
  );
  assert.equal(fixture.db.state.refreshTokens.length, 0);
  assert.equal(fixture.db.state.users[0].last_login_at, null);
});

test("refresh rotaciona, preserva expiração absoluta e mantém um ativo por família", async () => {
  const fixture = createFixture();
  const login = await fixture.service.login({
    email: "maria@example.com",
    password: "correct password",
  });
  const originalExpiry = new Date(login.refreshExpiresAt).getTime();
  fixture.db.state.now = new Date(NOW.getTime() + 60_000);
  const refreshed = await fixture.service.refresh(login.refreshToken);
  const [original, successor] = fixture.db.state.refreshTokens;

  assert.equal(refreshed.refreshToken, TOKENS[1]);
  assert.equal(original.revocation_reason, "rotated");
  assert.equal(original.replaced_by_token_id, successor.id);
  assert.equal(successor.revoked_at, null);
  assert.equal(successor.family_id, original.family_id);
  assert.equal(successor.auth_version_at_issue, 2);
  assert.equal(successor.expires_at.getTime(), originalExpiry);
  assert.equal(
    fixture.db.state.refreshTokens.filter((token) => token.revoked_at === null)
      .length,
    1,
  );
});

test("replay revoga successor e concorrência não deixa sessão ativa", async () => {
  const fixture = createFixture();
  const login = await fixture.service.login({
    email: "maria@example.com",
    password: "correct password",
  });
  const attempts = await Promise.allSettled([
    fixture.service.refresh(login.refreshToken),
    fixture.service.refresh(login.refreshToken),
  ]);

  assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((item) => item.status === "rejected").length, 1);
  assert.equal(
    fixture.db.state.refreshTokens.filter((token) => token.revoked_at === null)
      .length,
    0,
  );
  assert.equal(fixture.logs.includes("AUTH_REFRESH_REPLAY_DETECTED"), true);
});

test("refresh, replay e logout sempre bloqueiam user antes do token/família", async () => {
  const fixture = createFixture();
  const login = await fixture.service.login({
    email: "maria@example.com",
    password: "correct password",
  });
  assert.ok(
    fixture.db.queryLog.indexOf("lock-login-user") <
      fixture.db.queryLog.indexOf("insert-refresh-token"),
  );

  fixture.db.queryLog.length = 0;
  await fixture.service.refresh(login.refreshToken);
  assert.deepEqual(fixture.db.queryLog.slice(0, 3), [
    "find-refresh-owner",
    "lock-refresh-user",
    "lock-refresh-token",
  ]);
  assert.ok(
    fixture.db.queryLog.indexOf("lock-refresh-token") <
      fixture.db.queryLog.indexOf("rotate-current-token"),
  );

  fixture.db.queryLog.length = 0;
  await expectSessionError(
    fixture.service.refresh(login.refreshToken),
    "INVALID_SESSION",
  );
  assert.deepEqual(fixture.db.queryLog.slice(0, 3), [
    "find-refresh-owner",
    "lock-refresh-user",
    "lock-refresh-token",
  ]);
  assert.ok(
    fixture.db.queryLog.indexOf("lock-refresh-token") <
      fixture.db.queryLog.indexOf("revoke-refresh-family"),
  );

  const logoutFixture = createFixture();
  const logoutLogin = await logoutFixture.service.login({
    email: "maria@example.com",
    password: "correct password",
  });
  logoutFixture.db.queryLog.length = 0;
  await logoutFixture.service.logout(logoutLogin.refreshToken);
  assert.deepEqual(logoutFixture.db.queryLog.slice(0, 3), [
    "find-logout-owner",
    "lock-logout-user",
    "lock-logout-token",
  ]);
  assert.ok(
    logoutFixture.db.queryLog.indexOf("lock-logout-token") <
      logoutFixture.db.queryLog.indexOf("revoke-refresh-family"),
  );
});

test("auth_version divergente revoga família e não emite token", async () => {
  const fixture = createFixture();
  const login = await fixture.service.login({
    email: "maria@example.com",
    password: "correct password",
  });
  fixture.db.state.users[0].auth_version = 3;

  await expectSessionError(
    fixture.service.refresh(login.refreshToken),
    "INVALID_SESSION",
  );
  assert.equal(fixture.db.state.refreshTokens[0].revoked_at !== null, true);
  assert.equal(
    fixture.db.state.refreshTokens[0].revocation_reason,
    "auth_version_changed",
  );
});

test("refresh expirado e desconhecido usam o mesmo contrato e não emitem token", async () => {
  const fixture = createFixture();
  const login = await fixture.service.login({
    email: "maria@example.com",
    password: "correct password",
  });
  fixture.db.state.now = new Date(
    NOW.getTime() + 30 * 24 * 60 * 60 * 1000 + 1,
  );

  await expectSessionError(
    fixture.service.refresh(login.refreshToken),
    "INVALID_SESSION",
  );
  await expectSessionError(
    fixture.service.refresh("z".repeat(43)),
    "INVALID_SESSION",
  );
  assert.equal(fixture.issuedAccessTokens.length, 1);
  assert.equal(fixture.db.state.refreshTokens[0].revocation_reason, "expired");
});

test("logout é idempotente e revoga somente a família atual", async () => {
  const fixture = createFixture();
  const first = await fixture.service.login({
    email: "maria@example.com",
    password: "correct password",
  });
  const second = await fixture.service.login({
    email: "maria@example.com",
    password: "correct password",
  });

  await fixture.service.logout(first.refreshToken);
  await fixture.service.logout(first.refreshToken);
  await fixture.service.logout(null);

  const firstFamily = fixture.db.state.refreshTokens[0].family_id;
  const secondFamily = fixture.db.state.refreshTokens[1].family_id;
  assert.equal(
    fixture.db.state.refreshTokens
      .filter((token) => token.family_id === firstFamily)
      .every((token) => token.revoked_at !== null),
    true,
  );
  assert.equal(fixture.db.state.refreshTokens[1].revoked_at, null);
  assert.equal(second.refreshToken, TOKENS[1]);

  await expectSessionError(
    fixture.service.refresh(first.refreshToken),
    "INVALID_SESSION",
  );
  assert.equal(
    fixture.db.state.refreshTokens.filter(
      (token) => token.family_id === firstFamily,
    ).length,
    1,
  );

  const refreshedSecond = await fixture.service.refresh(second.refreshToken);
  assert.equal(refreshedSecond.refreshToken, TOKENS[2]);
  assert.equal(
    fixture.db.state.refreshTokens.filter(
      (token) => token.family_id === secondFamily,
    ).length,
    2,
  );
  assert.equal(fixture.issuedAccessTokens.length, 3);
});
