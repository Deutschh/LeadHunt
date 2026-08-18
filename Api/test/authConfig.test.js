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

test("trust proxy usa zero localmente e exige valor explícito em produção", () => {
  assert.equal(loadServerConfig({ NODE_ENV: "development" }).trustProxyHops, 0);
  assert.equal(
    loadServerConfig({ NODE_ENV: "production", TRUST_PROXY_HOPS: "2" })
      .trustProxyHops,
    2,
  );
  assert.throws(
    () => loadServerConfig({ NODE_ENV: "production" }),
    /configurado explicitamente/,
  );
});

test("trust proxy rejeita valores fora do intervalo", () => {
  for (const value of ["-1", "11", "1.5", "true"]) {
    assert.throws(() =>
      loadServerConfig({ NODE_ENV: "test", TRUST_PROXY_HOPS: value }),
    );
  }
});
