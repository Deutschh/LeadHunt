const { isValidPassword, normalizeName } = require("./authValidation");

const PROFILE_FIELDS = new Set(["name"]);
const PASSWORD_FIELDS = new Set(["currentPassword", "newPassword"]);

function error(code, message, fieldErrors) {
  return {
    error: {
      status: 400,
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

function validateProfileUpdate(body) {
  if (!isPlainObject(body) || !hasOnlyFields(body, PROFILE_FIELDS)) {
    return error(
      "VALIDATION_ERROR",
      "Payload de atualização do perfil inválido.",
    );
  }

  const name = normalizeName(body.name);
  if (name === null) {
    return error("VALIDATION_ERROR", "Revise os dados informados.", {
      name: "Informe um nome válido entre 2 e 120 caracteres.",
    });
  }

  return { value: { name } };
}

function validatePasswordChange(body) {
  if (!isPlainObject(body) || !hasOnlyFields(body, PASSWORD_FIELDS)) {
    return error(
      "VALIDATION_ERROR",
      "Payload de alteração de senha inválido.",
    );
  }

  const currentPasswordLength =
    typeof body.currentPassword === "string"
      ? [...body.currentPassword].length
      : 0;
  const currentPasswordBytes =
    typeof body.currentPassword === "string"
      ? Buffer.byteLength(body.currentPassword, "utf8")
      : 0;
  if (
    currentPasswordLength === 0 ||
    currentPasswordLength > 128 ||
    currentPasswordBytes > 512
  ) {
    return error("VALIDATION_ERROR", "Revise os dados informados.", {
      currentPassword: "Informe sua senha atual.",
    });
  }

  if (!isValidPassword(body.newPassword)) {
    return error("WEAK_PASSWORD", "A nova senha informada não é válida.", {
      newPassword: "Use entre 12 e 128 caracteres válidos.",
    });
  }

  if (body.currentPassword === body.newPassword) {
    return error(
      "PASSWORD_UNCHANGED",
      "A nova senha deve ser diferente da senha atual.",
      { newPassword: "Escolha uma senha diferente da atual." },
    );
  }

  return {
    value: {
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    },
  };
}

module.exports = {
  isPlainObject,
  validatePasswordChange,
  validateProfileUpdate,
};
