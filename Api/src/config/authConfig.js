const OTP_CODE_PATTERN = /^\d{6}$/;
const PASSWORD_RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function requireTrimmedString(env, name, maxLength) {
  const value = env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} é obrigatório.`);
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length > maxLength) {
    throw new Error(`${name} excede o tamanho máximo permitido.`);
  }

  return trimmedValue;
}

function optionalTrimmedString(env, name, maxLength) {
  const value = env[name];

  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`${name} deve ser uma string.`);
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  if (trimmedValue.length > maxLength) {
    throw new Error(`${name} excede o tamanho máximo permitido.`);
  }

  return trimmedValue;
}

function readOptionalPublicString(env, name, maxLength) {
  const value = env[name];
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 && trimmedValue.length <= maxLength
    ? trimmedValue
    : null;
}

function parseOptionalPublicUrl(env, name, nodeEnv) {
  const value = readOptionalPublicString(env, name, 2048);
  if (value === null) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      (nodeEnv === "production" && parsed.protocol !== "https:")
    ) {
      return null;
    }
    return parsed.toString();
  } catch (_error) {
    return null;
  }
}

function parseStrictBoolean(rawValue, name, defaultValue = false) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return defaultValue;
  }

  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  throw new Error(`${name} deve ser "true" ou "false".`);
}

function parsePasswordResetUrl(rawValue, nodeEnv) {
  const value = requireTrimmedString(
    { AUTH_PASSWORD_RESET_URL: rawValue },
    "AUTH_PASSWORD_RESET_URL",
    2048,
  );

  let parsed;
  try {
    parsed = new URL(value);
  } catch (_error) {
    throw new Error("AUTH_PASSWORD_RESET_URL deve ser uma URL absoluta.");
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    parsed.search
  ) {
    throw new Error("AUTH_PASSWORD_RESET_URL possui formato inseguro.");
  }

  if (nodeEnv === "production" && parsed.protocol !== "https:") {
    throw new Error("AUTH_PASSWORD_RESET_URL deve usar HTTPS em produção.");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    parsed.protocol === "http:" &&
    (nodeEnv === "production" || !localHosts.has(parsed.hostname))
  ) {
    throw new Error(
      "AUTH_PASSWORD_RESET_URL só pode usar HTTP em localhost fora de produção.",
    );
  }

  return parsed.toString();
}

function loadAuthConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const otpHmacSecret = requireTrimmedString(
    env,
    "AUTH_OTP_HMAC_SECRET",
    4096,
  );

  if (Buffer.byteLength(otpHmacSecret, "utf8") < 32) {
    throw new Error("AUTH_OTP_HMAC_SECRET deve possuir ao menos 32 bytes.");
  }

  const jwtSecret = requireTrimmedString(env, "AUTH_JWT_SECRET", 4096);

  if (
    jwtSecret === "CHANGE_ME" ||
    Buffer.byteLength(jwtSecret, "utf8") < 32
  ) {
    throw new Error("AUTH_JWT_SECRET deve possuir ao menos 32 bytes.");
  }

  const jwtKeyId = requireTrimmedString(env, "AUTH_JWT_KEY_ID", 128);
  const jwtIssuer = requireTrimmedString(env, "AUTH_JWT_ISSUER", 256);
  const jwtAudience = requireTrimmedString(env, "AUTH_JWT_AUDIENCE", 256);
  const refreshCookieName = requireTrimmedString(
    env,
    "AUTH_REFRESH_COOKIE_NAME",
    128,
  );

  if (!COOKIE_NAME_PATTERN.test(refreshCookieName)) {
    throw new Error("AUTH_REFRESH_COOKIE_NAME não é um nome de cookie válido.");
  }

  const devEmailBypassEnabled = parseStrictBoolean(
    env.DEV_EMAIL_BYPASS_ENABLED,
    "DEV_EMAIL_BYPASS_ENABLED",
  );
  const devEmailBypassCode = env.DEV_EMAIL_BYPASS_CODE || "";

  if (devEmailBypassEnabled && nodeEnv === "production") {
    throw new Error(
      "DEV_EMAIL_BYPASS_ENABLED não pode ser habilitado em produção.",
    );
  }

  if (devEmailBypassEnabled && !OTP_CODE_PATTERN.test(devEmailBypassCode)) {
    throw new Error(
      "DEV_EMAIL_BYPASS_CODE deve conter exatamente seis dígitos quando o bypass está habilitado.",
    );
  }

  if (
    !devEmailBypassEnabled &&
    devEmailBypassCode !== "" &&
    !OTP_CODE_PATTERN.test(devEmailBypassCode)
  ) {
    throw new Error(
      "DEV_EMAIL_BYPASS_CODE deve estar vazio ou conter exatamente seis dígitos.",
    );
  }

  const resendApiKey = optionalTrimmedString(env, "RESEND_API_KEY", 2048);
  const emailProviderConfigured = resendApiKey !== null;

  if (nodeEnv === "production" && !emailProviderConfigured) {
    throw new Error("RESEND_API_KEY é obrigatório em produção.");
  }

  const emailFrom = emailProviderConfigured
    ? requireTrimmedString(env, "AUTH_EMAIL_FROM", 320)
    : null;
  const configuredPasswordResetUrl = optionalTrimmedString(
    env,
    "AUTH_PASSWORD_RESET_URL",
    2048,
  );

  if (emailProviderConfigured && configuredPasswordResetUrl === null) {
    throw new Error(
      "AUTH_PASSWORD_RESET_URL é obrigatório quando o provider de e-mail está configurado.",
    );
  }

  const passwordResetUrl =
    configuredPasswordResetUrl === null
      ? null
      : parsePasswordResetUrl(configuredPasswordResetUrl, nodeEnv);
  const termsVersion = readOptionalPublicString(
    env,
    "AUTH_TERMS_VERSION",
    64,
  );
  const privacyPolicyVersion = readOptionalPublicString(
    env,
    "AUTH_PRIVACY_POLICY_VERSION",
    64,
  );
  const termsUrl = parseOptionalPublicUrl(env, "AUTH_TERMS_URL", nodeEnv);
  const privacyPolicyUrl = parseOptionalPublicUrl(
    env,
    "AUTH_PRIVACY_POLICY_URL",
    nodeEnv,
  );
  const accessRequestUrl = parseOptionalPublicUrl(
    env,
    "AUTH_ACCESS_REQUEST_URL",
    nodeEnv,
  );
  const supportUrl = parseOptionalPublicUrl(
    env,
    "AUTH_SUPPORT_URL",
    nodeEnv,
  );
  const registrationAvailable = Boolean(
    termsVersion && privacyPolicyVersion && termsUrl && privacyPolicyUrl,
  );

  const config = {
    nodeEnv,
    otpHmacSecret,
    jwtSecret,
    jwtKeyId,
    jwtIssuer,
    jwtAudience,
    accessTokenTtlSeconds: 600,
    refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
    refreshCookieName,
    refreshCookieSecure: nodeEnv === "production",
    refreshCookieSameSite: "lax",
    refreshCookiePath: "/api/auth",
    termsVersion,
    privacyPolicyVersion,
    termsUrl,
    privacyPolicyUrl,
    accessRequestUrl,
    supportUrl,
    registrationAvailable,
    devEmailBypassEnabled,
    devEmailBypassCode,
    otpExpiresInMinutes: 10,
    otpMaxAttempts: 5,
    resendCooldownSeconds: 60,
    maxChallengesPerHour: 5,
    verificationRetryWindowMinutes: 5,
    passwordResetTtlMinutes: 30,
    passwordResetUrl,
    emailProviderConfigured,
    resendApiKey,
    emailFrom,
  };

  return Object.freeze(config);
}

module.exports = {
  OTP_CODE_PATTERN,
  PASSWORD_RESET_TOKEN_PATTERN,
  loadAuthConfig,
  parsePasswordResetUrl,
  parseStrictBoolean,
};
