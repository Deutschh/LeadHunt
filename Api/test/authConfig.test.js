const assert = require("node:assert/strict");
const test = require("node:test");
const { loadAuthConfig } = require("../src/config/authConfig");
const { loadServerConfig } = require("../src/config/serverConfig");

function validEnv(overrides = {}) {
  return {
    NODE_ENV: "test",
    AUTH_OTP_HMAC_SECRET: "a".repeat(32),
    AUTH_TERMS_VERSION: "terms-v1",
    AUTH_PRIVACY_POLICY_VERSION: "privacy-v1",
    AUTH_JWT_SECRET: "j".repeat(32),
    AUTH_JWT_KEY_ID: "v1",
    AUTH_JWT_ISSUER: "leadhunt-api",
    AUTH_JWT_AUDIENCE: "leadhunt-web",
    AUTH_REFRESH_COOKIE_NAME: "leadhunt_refresh",
    RESEND_API_KEY: "re_test",
    AUTH_EMAIL_FROM: "LeadHunt <no-reply@example.com>",
    DEV_EMAIL_BYPASS_ENABLED: "false",
    ...overrides,
  };
}

test("auth config rejeita bypass em produção", () => {
  assert.throws(
    () =>
      loadAuthConfig(
        validEnv({
          NODE_ENV: "production",
          DEV_EMAIL_BYPASS_ENABLED: "true",
          DEV_EMAIL_BYPASS_CODE: "123456",
        }),
      ),
    /não pode ser habilitado em produção/,
  );
});

test("auth config permite bypass válido apenas fora de produção", () => {
  const config = loadAuthConfig(
    validEnv({
      DEV_EMAIL_BYPASS_ENABLED: "true",
      DEV_EMAIL_BYPASS_CODE: "123456",
      RESEND_API_KEY: undefined,
      AUTH_EMAIL_FROM: undefined,
    }),
  );

  assert.equal(config.devEmailBypassEnabled, true);
  assert.equal(config.resendApiKey, null);
});

test("auth config exige segredo HMAC com ao menos 32 bytes", () => {
  assert.throws(
    () => loadAuthConfig(validEnv({ AUTH_OTP_HMAC_SECRET: "curto" })),
    /ao menos 32 bytes/,
  );
});

test("auth config rejeita o sentinel versionado do segredo HMAC", () => {
  assert.throws(
    () => loadAuthConfig(validEnv({ AUTH_OTP_HMAC_SECRET: "CHANGE_ME" })),
    /ao menos 32 bytes/,
  );
});

test("auth config rejeita sentinel JWT e mantém parâmetros fixos de sessão", () => {
  assert.throws(
    () => loadAuthConfig(validEnv({ AUTH_JWT_SECRET: "CHANGE_ME" })),
    /ao menos 32 bytes/,
  );

  const config = loadAuthConfig(validEnv());
  assert.equal(config.accessTokenTtlSeconds, 600);
  assert.equal(config.refreshTokenTtlSeconds, 30 * 24 * 60 * 60);
  assert.equal(config.refreshCookieSecure, false);
  assert.equal(config.refreshCookieSameSite, "lax");
  assert.equal(
    loadAuthConfig(validEnv({ NODE_ENV: "production" })).refreshCookieSecure,
    true,
  );
});

test("trust proxy usa zero localmente e exige valor explícito em produção", () => {
  assert.equal(loadServerConfig({ NODE_ENV: "development" }).trustProxyHops, 0);
  assert.equal(
    loadServerConfig({
      NODE_ENV: "production",
      TRUST_PROXY_HOPS: "2",
      CORS_ALLOWED_ORIGINS: "https://app.example.com",
    })
      .trustProxyHops,
    2,
  );
  assert.throws(
    () => loadServerConfig({ NODE_ENV: "production" }),
    /configurado explicitamente/,
  );
});

test("CORS usa origins locais e exige allowlist HTTPS em produção", () => {
  assert.deepEqual(loadServerConfig({ NODE_ENV: "test" }).corsAllowedOrigins, [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  assert.throws(
    () =>
      loadServerConfig({
        NODE_ENV: "production",
        TRUST_PROXY_HOPS: "1",
      }),
    /CORS_ALLOWED_ORIGINS/,
  );
  assert.throws(() =>
    loadServerConfig({
      NODE_ENV: "production",
      TRUST_PROXY_HOPS: "1",
      CORS_ALLOWED_ORIGINS: "http://app.example.com",
    }),
  );
});

test("trust proxy rejeita valores fora do intervalo", () => {
  for (const value of ["-1", "11", "1.5", "true"]) {
    assert.throws(() =>
      loadServerConfig({ NODE_ENV: "test", TRUST_PROXY_HOPS: value }),
    );
  }
});
