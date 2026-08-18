const assert = require("node:assert/strict");
const test = require("node:test");
const {
  validateRegister,
  validateResend,
  validateVerify,
} = require("../src/validation/authValidation");

const config = {
  termsVersion: "terms-v1",
  privacyPolicyVersion: "privacy-v1",
};

function validRegistration(overrides = {}) {
  return {
    name: "  Maria Silva  ",
    email: "  MARIA@EXAMPLE.COM  ",
    password: "senha longa segura",
    termsAccepted: true,
    termsVersion: "terms-v1",
    privacyPolicyAccepted: true,
    privacyPolicyVersion: "privacy-v1",
    ...overrides,
  };
}

test("register normaliza nome/e-mail sem alterar a senha", () => {
  const input = validRegistration({ password: "  senha longa segura  " });
  const result = validateRegister(input, config);

  assert.deepEqual(result.value, {
    name: "Maria Silva",
    email: "maria@example.com",
    password: "  senha longa segura  ",
    termsVersion: "terms-v1",
    privacyPolicyVersion: "privacy-v1",
  });
});

test("register rejeita campo desconhecido e confirmação de senha", () => {
  const result = validateRegister(
    validRegistration({ passwordConfirmation: "senha longa segura" }),
    config,
  );
  assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("register rejeita e-mail inválido, senha fraca e aceites ausentes", () => {
  assert.equal(
    validateRegister(validRegistration({ email: "inválido" }), config).error
      .code,
    "VALIDATION_ERROR",
  );
  assert.equal(
    validateRegister(validRegistration({ password: "curta" }), config).error
      .code,
    "WEAK_PASSWORD",
  );
  assert.equal(
    validateRegister(validRegistration({ termsAccepted: false }), config).error
      .code,
    "CONSENT_REQUIRED",
  );
});

test("register rejeita versões legais divergentes", () => {
  const result = validateRegister(
    validRegistration({ termsVersion: "terms-antigos" }),
    config,
  );
  assert.equal(result.error.status, 409);
  assert.equal(result.error.code, "LEGAL_VERSION_MISMATCH");
});

test("verify exige código como string de seis dígitos", () => {
  assert.deepEqual(
    validateVerify({ email: " USER@example.com ", code: "001234" }).value,
    { email: "user@example.com", code: "001234" },
  );
  assert.equal(
    validateVerify({ email: "user@example.com", code: 123456 }).error.code,
    "VALIDATION_ERROR",
  );
});

test("resend aceita somente e-mail válido", () => {
  assert.deepEqual(validateResend({ email: " USER@example.com " }).value, {
    email: "user@example.com",
  });
  assert.equal(
    validateResend({ email: "user@example.com", extra: true }).error.code,
    "VALIDATION_ERROR",
  );
});
