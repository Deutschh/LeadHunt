import { AuthHttpError, AuthProtocolError } from "../auth/authHttpClient.js";
import { validateEmail, validatePassword } from "../auth/authUiModel.js";

const CONTROL_PATTERN = /[\p{Cc}\p{Cf}]/u;
const ACCOUNT_ERROR_CODES = new Set([
  "VALIDATION_ERROR",
  "WEAK_PASSWORD",
  "PASSWORD_UNCHANGED",
  "CURRENT_PASSWORD_INVALID",
  "INVALID_ACCESS_TOKEN",
  "INVALID_SESSION",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "AUTH_TEMPORARILY_UNAVAILABLE",
  "INVALID_ACCOUNT_RESPONSE",
]);

export class AccountInputError extends Error {
  constructor(fieldErrors) {
    super("Revise os dados informados.");
    this.name = "AccountInputError";
    this.status = 400;
    this.code = "VALIDATION_ERROR";
    this.fieldErrors = Object.freeze({ ...fieldErrors });
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactInput(value, fields) {
  if (!isPlainObject(value)) throw new AccountInputError({ body: "Payload inválido." });
  const keys = Object.keys(value);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  ) {
    throw new AccountInputError({ body: "Payload inválido." });
  }
}

function assertExactResponse(value, fields) {
  if (!isPlainObject(value)) throw new AuthProtocolError("INVALID_ACCOUNT_RESPONSE");
  const keys = Object.keys(value);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  ) {
    throw new AuthProtocolError("INVALID_ACCOUNT_RESPONSE");
  }
}

export function normalizeAccountName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  const length = [...name].length;
  return length >= 2 && length <= 120 && !CONTROL_PATTERN.test(name)
    ? name
    : null;
}

export function normalizeProfilePayload(value) {
  assertExactInput(value, ["name"]);
  const name = normalizeAccountName(value.name);
  if (name === null) {
    throw new AccountInputError({
      name: "Informe um nome válido entre 2 e 120 caracteres.",
    });
  }
  return Object.freeze({ name });
}

export function normalizePasswordPayload(value) {
  assertExactInput(value, ["currentPassword", "newPassword"]);
  const currentLength =
    typeof value.currentPassword === "string"
      ? [...value.currentPassword].length
      : 0;
  const currentBytes =
    typeof value.currentPassword === "string"
      ? new TextEncoder().encode(value.currentPassword).length
      : 0;
  if (currentLength === 0 || currentLength > 128 || currentBytes > 512) {
    throw new AccountInputError({ currentPassword: "Informe sua senha atual." });
  }
  if (!validatePassword(value.newPassword)) {
    throw new AccountInputError({
      newPassword: "Use de 12 a 128 caracteres e ao menos um caractere não branco.",
    });
  }
  if (value.currentPassword === value.newPassword) {
    throw new AccountInputError({
      newPassword: "Escolha uma senha diferente da atual.",
    });
  }
  return Object.freeze({
    currentPassword: value.currentPassword,
    newPassword: value.newPassword,
  });
}

export function validatePasswordForm(value) {
  const errors = {};
  try {
    normalizePasswordPayload({
      currentPassword: value.currentPassword,
      newPassword: value.newPassword,
    });
  } catch (error) {
    if (error instanceof AccountInputError) Object.assign(errors, error.fieldErrors);
  }
  if (value.newPassword !== value.passwordConfirmation) {
    errors.passwordConfirmation = "As senhas não coincidem.";
  }
  return errors;
}

export function normalizeProfileResponse(payload) {
  assertExactResponse(payload, ["user"]);
  assertExactResponse(payload.user, ["name", "email"]);
  const name = normalizeAccountName(payload.user.name);
  if (name === null || !validateEmail(payload.user.email)) {
    throw new AuthProtocolError("INVALID_ACCOUNT_RESPONSE");
  }
  return Object.freeze({
    user: Object.freeze({ name, email: payload.user.email }),
  });
}

export function normalizePasswordResponse(payload) {
  assertExactResponse(payload, ["message"]);
  if (typeof payload.message !== "string" || payload.message.trim().length === 0) {
    throw new AuthProtocolError("INVALID_ACCOUNT_RESPONSE");
  }
  return Object.freeze({ message: payload.message });
}

export function getFirstName(name) {
  const normalized = normalizeAccountName(name);
  return normalized === null ? null : normalized.split(/\s+/u)[0];
}

export function getUserInitials(name) {
  const normalized = normalizeAccountName(name);
  if (normalized === null) return "?";
  const parts = normalized.split(/\s+/u);
  const selected = parts.length === 1 ? [parts[0]] : [parts[0], parts.at(-1)];
  return selected.map((part) => [...part][0]).join("").toLocaleUpperCase("pt-BR");
}

export function sanitizeAccountError(error, allowedFields = []) {
  const allowed = new Set(allowedFields);
  const fieldErrors = {};
  if (error?.fieldErrors && typeof error.fieldErrors === "object") {
    for (const [field, detail] of Object.entries(error.fieldErrors)) {
      if (allowed.has(field) && typeof detail === "string") fieldErrors[field] = detail;
    }
  }
  const recognized = ACCOUNT_ERROR_CODES.has(error?.code);
  return Object.freeze({
    code: recognized ? error.code : "INTERNAL_ERROR",
    message:
      recognized && typeof error?.message === "string"
        ? error.message
        : "Não foi possível concluir a operação.",
    fieldErrors: Object.freeze(fieldErrors),
    retryable: error instanceof AuthHttpError && error.retryable === true,
  });
}
