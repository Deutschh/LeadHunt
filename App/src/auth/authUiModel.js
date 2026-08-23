import { AuthProtocolError } from "./authHttpClient.js";

export const AUTH_ERROR_CODES = new Set([
  "VALIDATION_ERROR",
  "WEAK_PASSWORD",
  "CONSENT_REQUIRED",
  "LEGAL_VERSION_MISMATCH",
  "INVALID_CREDENTIALS",
  "INVALID_OR_EXPIRED_CODE",
  "INVALID_RESET_TOKEN",
  "AUTH_STATE_CONFLICT",
  "RATE_LIMITED",
  "AUTH_TEMPORARILY_UNAVAILABLE",
  "INTERNAL_ERROR",
  "ORIGIN_NOT_ALLOWED",
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CONTROL_PATTERN = /[\p{Cc}\p{Cf}]/u;
const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeHttpUrl(value) {
  if (value === null) return null;
  if (typeof value !== "string") throw new AuthProtocolError();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new AuthProtocolError();
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    throw new AuthProtocolError();
  }
  return parsed.href;
}

function normalizeLegalDocument(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthProtocolError();
  }
  if (!isNonEmptyString(value.version)) throw new AuthProtocolError();
  const url = normalizeHttpUrl(value.url);
  if (url === null) throw new AuthProtocolError();
  return Object.freeze({
    version: value.version.trim(),
    url,
  });
}

export function normalizePublicConfig(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AuthProtocolError();
  }
  const registration = payload.registration;
  const contact = payload.contact;
  const verification = payload.emailVerification;
  if (
    !registration ||
    typeof registration !== "object" ||
    typeof registration.available !== "boolean" ||
    !contact ||
    typeof contact !== "object" ||
    !verification ||
    typeof verification !== "object" ||
    !Number.isInteger(verification.resendCooldownSeconds) ||
    verification.resendCooldownSeconds <= 0
  ) {
    throw new AuthProtocolError();
  }

  const terms = normalizeLegalDocument(registration.terms);
  const privacyPolicy = normalizeLegalDocument(registration.privacyPolicy);
  if (registration.available && (!terms || !privacyPolicy)) {
    throw new AuthProtocolError();
  }

  return Object.freeze({
    registration: Object.freeze({
      available: registration.available,
      terms,
      privacyPolicy,
    }),
    contact: Object.freeze({
      accessRequestUrl: normalizeHttpUrl(contact.accessRequestUrl),
      supportUrl: normalizeHttpUrl(contact.supportUrl),
    }),
    emailVerification: Object.freeze({
      resendCooldownSeconds: verification.resendCooldownSeconds,
    }),
  });
}

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateEmail(value) {
  const email = normalizeEmail(value);
  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function validatePassword(value) {
  if (typeof value !== "string") return false;
  const codePoints = [...value].length;
  return (
    codePoints >= 12 &&
    codePoints <= 128 &&
    new TextEncoder().encode(value).length <= 512 &&
    /\S/u.test(value) &&
    !CONTROL_PATTERN.test(value)
  );
}

export function validateLoginForm({ email, password }) {
  const fieldErrors = {};
  if (!validateEmail(email)) fieldErrors.email = "Informe um e-mail válido.";
  if (typeof password !== "string" || password.length === 0) {
    fieldErrors.password = "Informe sua senha.";
  }
  return fieldErrors;
}

export function validateRegisterForm(values) {
  const fieldErrors = {};
  const name = typeof values.name === "string" ? values.name.trim() : "";
  const nameLength = Array.from(name).length;
  if (nameLength < 2 || nameLength > 120 || CONTROL_PATTERN.test(name)) {
    fieldErrors.name = "Informe um nome entre 2 e 120 caracteres.";
  }
  if (!validateEmail(values.email)) {
    fieldErrors.email = "Informe um e-mail válido.";
  }
  if (!validatePassword(values.password)) {
    fieldErrors.password = "Use de 12 a 128 caracteres e ao menos um caractere não branco.";
  }
  if (values.password !== values.passwordConfirmation) {
    fieldErrors.passwordConfirmation = "As senhas não coincidem.";
  }
  if (values.termsAccepted !== true) {
    fieldErrors.termsAccepted = "Aceite os Termos para continuar.";
  }
  if (values.privacyPolicyAccepted !== true) {
    fieldErrors.privacyPolicyAccepted = "Aceite a Política de Privacidade para continuar.";
  }
  return fieldErrors;
}

export function resetLegalConsentsForError(values, errorCode) {
  if (errorCode !== "LEGAL_VERSION_MISMATCH") {
    return values;
  }
  return {
    ...values,
    termsAccepted: false,
    privacyPolicyAccepted: false,
  };
}

function positiveIntegerOrZero(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function getInitialResendCountdown(navigationState) {
  if (navigationState?.verificationChallengeCreated !== true) {
    return 0;
  }
  return positiveIntegerOrZero(navigationState.resendCooldownSeconds);
}

export function createVerificationNavigationState(
  email,
  resendCooldownSeconds,
) {
  return Object.freeze({
    email,
    verificationChallengeCreated: true,
    resendCooldownSeconds: positiveIntegerOrZero(resendCooldownSeconds),
  });
}

export function resolveResendCountdown(
  retryAfterSeconds,
  publicCooldownSeconds,
) {
  return (
    positiveIntegerOrZero(retryAfterSeconds) ||
    positiveIntegerOrZero(publicCooldownSeconds)
  );
}

export function decrementResendCountdown(value) {
  return Math.max(0, positiveIntegerOrZero(value) - 1);
}

export function canResendVerification({ countdown, busy, email }) {
  return (
    countdown === 0 &&
    busy === false &&
    typeof email === "string" &&
    email.length > 0
  );
}

export function validateVerifyForm({ email, code }) {
  const fieldErrors = {};
  if (!validateEmail(email)) fieldErrors.email = "Informe um e-mail válido.";
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    fieldErrors.code = "Informe o código de seis dígitos.";
  }
  return fieldErrors;
}

export function validateForgotForm({ email }) {
  return validateEmail(email) ? {} : { email: "Informe um e-mail válido." };
}

export function validateResetForm(values) {
  const fieldErrors = {};
  if (!validatePassword(values.password)) {
    fieldErrors.password = "Use de 12 a 128 caracteres e ao menos um caractere não branco.";
  }
  if (values.password !== values.passwordConfirmation) {
    fieldErrors.passwordConfirmation = "As senhas não coincidem.";
  }
  return fieldErrors;
}

export function captureResetToken(search) {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  const values = params.getAll("token");
  const token = values.length === 1 && RESET_TOKEN_PATTERN.test(values[0])
    ? values[0]
    : null;
  return Object.freeze({ token });
}

export function sanitizeAuthError(error, allowedFields = []) {
  const code = AUTH_ERROR_CODES.has(error?.code) ? error.code : "INTERNAL_ERROR";
  const fieldErrors = {};
  const allowed = new Set(allowedFields);
  if (error?.fieldErrors && typeof error.fieldErrors === "object") {
    for (const [field, detail] of Object.entries(error.fieldErrors)) {
      if (allowed.has(field) && typeof detail === "string") fieldErrors[field] = detail;
    }
  }
  return {
    code,
    message:
      typeof error?.message === "string" && AUTH_ERROR_CODES.has(error?.code)
        ? error.message
        : "Não foi possível concluir a operação.",
    fieldErrors,
    retryAfterSeconds:
      Number.isInteger(error?.retryAfterSeconds) && error.retryAfterSeconds > 0
        ? error.retryAfterSeconds
        : undefined,
  };
}

export function expectAcceptedResponse(payload, nextStep) {
  if (
    !payload ||
    typeof payload !== "object" ||
    !isNonEmptyString(payload.message) ||
    (nextStep !== undefined && payload.nextStep !== nextStep)
  ) {
    throw new AuthProtocolError();
  }
  return {
    message: payload.message,
    retryAfterSeconds:
      Number.isInteger(payload.retryAfterSeconds) && payload.retryAfterSeconds > 0
        ? payload.retryAfterSeconds
        : undefined,
  };
}

export function expectVerifyResponse(payload) {
  if (
    !payload ||
    payload.verified !== true ||
    !["pending", "active", "suspended"].includes(payload.accountStatus)
  ) {
    throw new AuthProtocolError();
  }
  return { verified: true, accountStatus: payload.accountStatus };
}
