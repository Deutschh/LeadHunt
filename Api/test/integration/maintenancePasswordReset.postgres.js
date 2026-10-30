require("../helpers/safeTestEnvironment");

const assert = require("node:assert/strict");
const test = require("node:test");
const { Pool } = require("pg");
const { startLocalPostgres } = require("../helpers/localPostgres");
const {
  createAccountPasswordService,
} = require("../../src/services/accountPasswordService");
const {
  createAuthCryptoService,
} = require("../../src/services/authCryptoService");
const {
  AuthSessionError,
  createAuthSessionService,
} = require("../../src/services/authSessionService");

test("reset administrativo em PostgreSQL descartável preserva admin e invalida sessões", async (t) => {
  const local = await startLocalPostgres();
  const db = new Pool(local.config);
  t.after(async () => {
    await db.end();
    await local.stop();
  });

  const cryptoService = createAuthCryptoService({
    otpHmacSecret: "m".repeat(32),
    devEmailBypassEnabled: false,
    devEmailBypassCode: "",
  });
  const sessions = createAuthSessionService({
    db,
    cryptoService,
    accessTokenService: { issue: () => "fixture-access-token" },
    config: { refreshTokenTtlSeconds: 86400 },
  });
  const oldPassword = "senha administrativa antiga";
  const newPassword = "senha administrativa nova";
  const email = "admin-maintenance@example.test";
  const oldHash = await cryptoService.hashPassword(oldPassword);
  const inserted = await db.query(
    `INSERT INTO public.users (
       name, email, password_hash, email_verified_at, is_admin, auth_version
     )
     VALUES ($1, $2, $3, clock_timestamp(), TRUE, 9)
     RETURNING id`,
    ["Admin Maintenance", email, oldHash],
  );
  const userId = inserted.rows[0].id;
  await db.query(
    `INSERT INTO public.workspace_members (workspace_id, user_id, role)
     VALUES (1, $1, 'owner')`,
    [userId],
  );
  const oldSession = await sessions.login({ email, password: oldPassword });

  await createAccountPasswordService({ db, cryptoService }).resetPasswordByEmail({
    email,
    newPassword,
  });

  await assert.rejects(
    sessions.login({ email, password: oldPassword }),
    (error) =>
      error instanceof AuthSessionError && error.code === "INVALID_CREDENTIALS",
  );
  assert.equal(
    (await sessions.login({ email, password: newPassword })).accessToken,
    "fixture-access-token",
  );
  await assert.rejects(sessions.refresh(oldSession.refreshToken), {
    code: "INVALID_SESSION",
  });

  const user = (
    await db.query(
      `SELECT auth_version, is_admin
       FROM public.users
       WHERE id = $1`,
      [userId],
    )
  ).rows[0];
  assert.equal(user.auth_version, 10);
  assert.equal(user.is_admin, true);
  const oldRefresh = (
    await db.query(
      `SELECT revoked_at, revocation_reason
       FROM public.refresh_tokens
       WHERE token_digest = $1`,
      [cryptoService.createRefreshTokenDigest(oldSession.refreshToken)],
    )
  ).rows[0];
  assert.notEqual(oldRefresh.revoked_at, null);
  assert.equal(oldRefresh.revocation_reason, "password_reset");
});
