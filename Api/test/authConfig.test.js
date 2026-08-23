const assert = require("node:assert/strict");
const test = require("node:test");
const { loadAuthConfig } = require("../src/config/authConfig");
const { loadServerConfig } = require("../src/config/serverConfig");
const {
  createAuthCryptoService,
} = require("../src/services/authCryptoService");
const {
  createConfiguredEmailProvider,
} = require("../src/services/email/resendEmailProvider");

function validEnv(overrides = {}) {
  return {
    NODE_ENV: "test",
    AUTH_OTP_HMAC_SECRET: "a".repeat(32),
    AUTH_TERMS_VERSION: "terms-v1",
    AUTH_PRIVACY_POLICY_VERSION: "privacy-v1",
    AUTH_TERMS_URL: "https://app.example.com/terms",
    AUTH_PRIVACY_POLICY_URL: "https://app.example.com/privacy",
    AUTH_ACCESS_REQUEST_URL: "https://app.example.com/access",
    AUTH_SUPPORT_URL: "https://app.example.com/support",
    AUTH_JWT_SECRET: "j".repeat(32),
    AUTH_JWT_KEY_ID: "v1",
    AUTH_JWT_ISSUER: "leadhunt-api",
    AUTH_JWT_AUDIENCE: "leadhunt-web",
    AUTH_REFRESH_COOKIE_NAME: "leadhunt_refresh",
    RESEND_API_KEY: "re_test",
    AUTH_EMAIL_FROM: "LeadHunt <no-reply@example.com>",
    AUTH_PASSWORD_RESET_URL: "http://localhost:5173/reset-password",
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
    }),
  );

  assert.equal(config.devEmailBypassEnabled, true);
  assert.equal(config.resendApiKey, "re_test");
});

test("config pública legal falha fechada sem impedir a composição Auth", () => {
  const unavailable = loadAuthConfig(
    validEnv({
      AUTH_TERMS_VERSION: undefined,
      AUTH_PRIVACY_POLICY_URL: "javascript:alert(1)",
      AUTH_ACCESS_REQUEST_URL: undefined,
      AUTH_SUPPORT_URL: "ftp://example.com/support",
    }),
  );

  assert.equal(unavailable.registrationAvailable, false);
  assert.equal(unavailable.termsVersion, null);
  assert.equal(unavailable.privacyPolicyUrl, null);
  assert.equal(unavailable.accessRequestUrl, null);
  assert.equal(unavailable.supportUrl, null);
  assert.equal(unavailable.accessTokenTtlSeconds, 600);
});

test("config pública aceita somente HTTPS em produção sem exigir contatos", () => {
  const config = loadAuthConfig(
    validEnv({
      NODE_ENV: "production",
      AUTH_PASSWORD_RESET_URL: "https://app.example.com/reset-password",
      AUTH_ACCESS_REQUEST_URL: undefined,
      AUTH_SUPPORT_URL: undefined,
    }),
  );

  assert.equal(config.registrationAvailable, true);
  assert.equal(config.accessRequestUrl, null);
  assert.equal(config.supportUrl, null);

  const invalidLegal = loadAuthConfig(
    validEnv({
      NODE_ENV: "production",
      AUTH_PASSWORD_RESET_URL: "https://app.example.com/reset-password",
      AUTH_TERMS_URL: "http://app.example.com/terms",
    }),
  );
  assert.equal(invalidLegal.registrationAvailable, false);
});

test("desenvolvimento compõe Auth sem provider real ou reset URL", async () => {
  const config = loadAuthConfig(
    validEnv({
      RESEND_API_KEY: undefined,
      AUTH_EMAIL_FROM: undefined,
      AUTH_PASSWORD_RESET_URL: undefined,
    }),
  );
  const provider = createConfiguredEmailProvider({
    enabled: config.emailProviderConfigured,
    apiKey: config.resendApiKey,
    from: config.emailFrom,
  });

  assert.equal(config.emailProviderConfigured, false);
  assert.equal(config.resendApiKey, null);
  assert.equal(config.emailFrom, null);
  assert.equal(config.passwordResetUrl, null);
  assert.equal(provider.available, false);
  await assert.rejects(provider.sendEmail());
});

test("OTP bypass continua utilizável sem controlar o provider de reset", async () => {
  const config = loadAuthConfig(
    validEnv({
      RESEND_API_KEY: undefined,
      AUTH_EMAIL_FROM: undefined,
      AUTH_PASSWORD_RESET_URL: undefined,
      DEV_EMAIL_BYPASS_ENABLED: "true",
      DEV_EMAIL_BYPASS_CODE: "123456",
    }),
  );
  const cryptoService = createAuthCryptoService(config);
  const passwordResetProvider = createConfiguredEmailProvider({
    enabled: config.emailProviderConfigured,
    apiKey: config.resendApiKey,
    from: config.emailFrom,
  });

  assert.equal(cryptoService.isDevelopmentBypassCode("123456"), true);
  assert.equal(passwordResetProvider.available, false);
  await assert.rejects(passwordResetProvider.sendEmail());
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
    loadAuthConfig(
      validEnv({
        NODE_ENV: "production",
        AUTH_PASSWORD_RESET_URL: "https://app.example.com/reset-password",
      }),
    ).refreshCookieSecure,
    true,
  );
});

test("password reset URL é absoluta e exige HTTPS em produção", () => {
  assert.equal(
    loadAuthConfig(validEnv()).passwordResetUrl,
    "http://localhost:5173/reset-password",
  );
  assert.equal(loadAuthConfig(validEnv()).passwordResetTtlMinutes, 30);

  for (const value of [
    "reset-password",
    "ftp://example.com/reset-password",
    "https://user:pass@example.com/reset-password",
    "https://example.com/reset-password#token",
    "https://example.com/reset-password?existing=true",
    "http://example.com/reset-password",
  ]) {
    assert.throws(() =>
      loadAuthConfig(validEnv({ AUTH_PASSWORD_RESET_URL: value })),
    );
  }

  assert.throws(() =>
    loadAuthConfig(
      validEnv({
        NODE_ENV: "production",
        AUTH_PASSWORD_RESET_URL: "http://localhost:5173/reset-password",
      }),
    ),
  );

  assert.throws(
    () =>
      loadAuthConfig(
        validEnv({
          NODE_ENV: "production",
          RESEND_API_KEY: undefined,
          AUTH_PASSWORD_RESET_URL: "https://app.example.com/reset-password",
        }),
      ),
    /RESEND_API_KEY é obrigatório em produção/,
  );

  assert.throws(
    () =>
      loadAuthConfig(
        validEnv({
          AUTH_PASSWORD_RESET_URL: undefined,
        }),
      ),
    /AUTH_PASSWORD_RESET_URL é obrigatório quando o provider/,
  );

  assert.throws(
    () =>
      loadAuthConfig(
        validEnv({
          NODE_ENV: "production",
          AUTH_PASSWORD_RESET_URL: undefined,
        }),
      ),
    /AUTH_PASSWORD_RESET_URL é obrigatório quando o provider/,
  );

  assert.throws(() =>
    loadAuthConfig(
      validEnv({
        RESEND_API_KEY: undefined,
        AUTH_EMAIL_FROM: undefined,
        AUTH_PASSWORD_RESET_URL: "javascript:alert(1)",
      }),
    ),
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
