const OTP_CODE_PATTERN = /^\d{6}$/;

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

  const config = {
    nodeEnv,
    otpHmacSecret,
    termsVersion: requireTrimmedString(env, "AUTH_TERMS_VERSION", 64),
    privacyPolicyVersion: requireTrimmedString(
      env,
      "AUTH_PRIVACY_POLICY_VERSION",
      64,
    ),
    devEmailBypassEnabled,
    devEmailBypassCode,
    otpExpiresInMinutes: 10,
    otpMaxAttempts: 5,
    resendCooldownSeconds: 60,
    maxChallengesPerHour: 5,
    verificationRetryWindowMinutes: 5,
  };

  if (!devEmailBypassEnabled) {
    config.resendApiKey = requireTrimmedString(env, "RESEND_API_KEY", 2048);
    config.emailFrom = requireTrimmedString(env, "AUTH_EMAIL_FROM", 320);
  } else {
    config.resendApiKey = null;
    config.emailFrom = null;
  }

  return Object.freeze(config);
}

module.exports = {
  OTP_CODE_PATTERN,
  loadAuthConfig,
  parseStrictBoolean,
};
