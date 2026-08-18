const validator = require("validator");
const { OTP_CODE_PATTERN } = require("../config/authConfig");

const CONTROL_CHARACTER_PATTERN = /[\p{Cc}\p{Cf}]/u;
const REGISTER_FIELDS = new Set([
  "name",
  "email",
  "password",
  "termsAccepted",
  "termsVersion",
  "privacyPolicyAccepted",
  "privacyPolicyVersion",
]);
const VERIFY_FIELDS = new Set(["email", "code"]);
const RESEND_FIELDS = new Set(["email"]);

function error(status, code, message, fieldErrors) {
  return {
    error: {
      status,
      code,
      message,
      ...(fieldErrors ? { fieldErrors } : {}),
    },
  };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyFields(body, allowedFields) {
  return Object.keys(body).every((field) => allowedFields.has(field));
}

function normalizeEmail(rawEmail) {
  if (typeof rawEmail !== "string") {
    return null;
  }

  const email = rawEmail.trim().toLowerCase();

  if (
    email.length === 0 ||
    email.length > 254 ||
    !validator.isEmail(email, {
      allow_utf8_local_part: false,
      require_tld: true,
    })
  ) {
    return null;
  }

  return email;
}

function validateRegister(body, config) {
  if (!isPlainObject(body) || !hasOnlyFields(body, REGISTER_FIELDS)) {
    return error(
      400,
      "VALIDATION_ERROR",
      "Payload de cadastro inválido.",
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const nameLength = [...name].length;
  const email = normalizeEmail(body.email);

  const fieldErrors = {};

  if (
    nameLength < 2 ||
    nameLength > 120 ||
    CONTROL_CHARACTER_PATTERN.test(name)
  ) {
    fieldErrors.name = "Informe um nome válido entre 2 e 120 caracteres.";
  }

  if (email === null) {
    fieldErrors.email = "Informe um e-mail válido.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return error(
      400,
      "VALIDATION_ERROR",
      "Revise os dados informados.",
      fieldErrors,
    );
  }

  if (typeof body.password !== "string") {
    return error(400, "WEAK_PASSWORD", "A senha informada não é válida.", {
      password: "Informe uma senha válida.",
    });
  }

  const passwordLength = [...body.password].length;
  const passwordByteLength = Buffer.byteLength(body.password, "utf8");

  if (
    passwordLength < 12 ||
    passwordLength > 128 ||
    passwordByteLength > 512 ||
    !/\S/u.test(body.password) ||
    CONTROL_CHARACTER_PATTERN.test(body.password)
  ) {
    return error(400, "WEAK_PASSWORD", "A senha informada não é válida.", {
      password: "Use entre 12 e 128 caracteres válidos.",
    });
  }

  if (
    body.termsAccepted !== true ||
    body.privacyPolicyAccepted !== true
  ) {
    return error(
      400,
      "CONSENT_REQUIRED",
      "É necessário aceitar os termos e a política de privacidade.",
    );
  }

  if (
    typeof body.termsVersion !== "string" ||
    body.termsVersion.trim().length === 0 ||
    body.termsVersion.trim().length > 64 ||
    typeof body.privacyPolicyVersion !== "string" ||
    body.privacyPolicyVersion.trim().length === 0 ||
    body.privacyPolicyVersion.trim().length > 64
  ) {
    return error(
      400,
      "VALIDATION_ERROR",
      "As versões dos documentos legais são obrigatórias.",
    );
  }

  if (
    body.termsVersion.trim() !== config.termsVersion ||
    body.privacyPolicyVersion.trim() !== config.privacyPolicyVersion
  ) {
    return error(
      409,
      "LEGAL_VERSION_MISMATCH",
      "Os documentos legais foram atualizados. Revise-os antes de continuar.",
    );
  }

  return {
    value: {
      name,
      email,
      password: body.password,
      termsVersion: config.termsVersion,
      privacyPolicyVersion: config.privacyPolicyVersion,
    },
  };
}

function validateVerify(body) {
  if (!isPlainObject(body) || !hasOnlyFields(body, VERIFY_FIELDS)) {
    return error(
      400,
      "VALIDATION_ERROR",
      "Payload de verificação inválido.",
    );
  }

  const email = normalizeEmail(body.email);

  if (
    email === null ||
    typeof body.code !== "string" ||
    !OTP_CODE_PATTERN.test(body.code)
  ) {
    return error(
      400,
      "VALIDATION_ERROR",
      "Informe um e-mail e um código válidos.",
    );
  }

  return { value: { email, code: body.code } };
}

function validateResend(body) {
  if (!isPlainObject(body) || !hasOnlyFields(body, RESEND_FIELDS)) {
    return error(
      400,
      "VALIDATION_ERROR",
      "Payload de reenvio inválido.",
    );
  }

  const email = normalizeEmail(body.email);

  if (email === null) {
    return error(400, "VALIDATION_ERROR", "Informe um e-mail válido.", {
      email: "Informe um e-mail válido.",
    });
  }

  return { value: { email } };
}

module.exports = {
  normalizeEmail,
  validateRegister,
  validateResend,
  validateVerify,
};
