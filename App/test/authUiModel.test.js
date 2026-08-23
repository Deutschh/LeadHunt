import assert from "node:assert/strict";
import test from "node:test";
import {
  canResendVerification,
  captureResetToken,
  createVerificationNavigationState,
  decrementResendCountdown,
  getInitialResendCountdown,
  normalizePublicConfig,
  resetLegalConsentsForError,
  resolveResendCountdown,
  sanitizeAuthError,
  validatePassword,
  validateRegisterForm,
} from "../src/auth/authUiModel.js";
import { AuthProtocolError } from "../src/auth/authHttpClient.js";

test("config pública válida é reduzida ao contrato conhecido", () => {
  const normalized = normalizePublicConfig({
    registration: {
      available: true,
      terms: { version: "v1", url: "https://example.com/terms" },
      privacyPolicy: { version: "v1", url: "https://example.com/privacy" },
      ignored: "secret",
    },
    contact: { accessRequestUrl: null, supportUrl: "https://example.com/help" },
    emailVerification: { resendCooldownSeconds: 75 },
    ignored: "secret",
  });
  assert.equal(normalized.registration.available, true);
  assert.equal(normalized.emailVerification.resendCooldownSeconds, 75);
  assert.equal("ignored" in normalized, false);
  assert.equal("ignored" in normalized.registration, false);
});

test("config pública disponível sem documentos falha fechada", () => {
  assert.throws(
    () => normalizePublicConfig({ registration: { available: true, terms: null, privacyPolicy: null }, contact: { accessRequestUrl: null, supportUrl: null }, emailVerification: { resendCooldownSeconds: 60 } }),
    AuthProtocolError,
  );
});

test("política de senha e cadastro preserva os limites do backend", () => {
  assert.equal(validatePassword("senha segura 123"), true);
  assert.equal(validatePassword("curta"), false);
  assert.equal(validatePassword("            "), false);
  assert.deepEqual(validateRegisterForm({ name: "Nome", email: "USER@example.com", password: "senha segura 123", passwordConfirmation: "senha segura 123", termsAccepted: true, privacyPolicyAccepted: true }), {});
});

test("mudança legal invalida consentimentos e exige novo aceite explícito", () => {
  const v1 = normalizePublicConfig({ registration: { available: true, terms: { version: "v1", url: "https://example.com/terms-v1" }, privacyPolicy: { version: "v1", url: "https://example.com/privacy-v1" } }, contact: { accessRequestUrl: null, supportUrl: null }, emailVerification: { resendCooldownSeconds: 60 } });
  const v2 = normalizePublicConfig({ registration: { available: true, terms: { version: "v2", url: "https://example.com/terms-v2" }, privacyPolicy: { version: "v2", url: "https://example.com/privacy-v2" } }, contact: { accessRequestUrl: null, supportUrl: null }, emailVerification: { resendCooldownSeconds: 75 } });
  const acceptedV1 = { name: "Nome", email: "user@example.com", password: "senha segura 123", passwordConfirmation: "senha segura 123", termsAccepted: true, privacyPolicyAccepted: true };

  assert.equal(v1.registration.terms.version, "v1");
  const invalidated = resetLegalConsentsForError(
    acceptedV1,
    "LEGAL_VERSION_MISMATCH",
  );
  assert.equal(v2.registration.terms.version, "v2");
  assert.equal(invalidated.termsAccepted, false);
  assert.equal(invalidated.privacyPolicyAccepted, false);
  assert.deepEqual(validateRegisterForm(invalidated), {
    termsAccepted: "Aceite os Termos para continuar.",
    privacyPolicyAccepted: "Aceite a Política de Privacidade para continuar.",
  });
});

test("cooldown de resend distingue challenge recém-criado de acesso direto", () => {
  const navigationState = createVerificationNavigationState(
    "user@example.com",
    75,
  );
  assert.deepEqual(navigationState, {
    email: "user@example.com",
    verificationChallengeCreated: true,
    resendCooldownSeconds: 75,
  });
  assert.equal(getInitialResendCountdown(navigationState), 75);
  assert.equal(getInitialResendCountdown({ resendCooldownSeconds: 75 }), 0);
  assert.equal(getInitialResendCountdown(undefined), 0);
  assert.equal(canResendVerification({ countdown: 75, busy: false, email: "user@example.com" }), false);

  let countdown = 2;
  countdown = decrementResendCountdown(countdown);
  assert.equal(countdown, 1);
  countdown = decrementResendCountdown(countdown);
  assert.equal(countdown, 0);
  assert.equal(canResendVerification({ countdown, busy: false, email: "user@example.com" }), true);
  assert.equal(resolveResendCountdown(90, 75), 90);
  assert.equal(resolveResendCountdown(undefined, 75), 75);
});

test("nome Unicode usa code points nos limites de 120 caracteres", () => {
  const base = { email: "user@example.com", password: "senha segura 123", passwordConfirmation: "senha segura 123", termsAccepted: true, privacyPolicyAccepted: true };
  assert.deepEqual(validateRegisterForm({ ...base, name: "😀".repeat(120) }), {});
  assert.equal(validateRegisterForm({ ...base, name: "😀".repeat(121) }).name, "Informe um nome entre 2 e 120 caracteres.");
});

test("captura de reset é síncrona, imutável e independe da URL depois da inicialização", () => {
  const token = "a".repeat(43);
  const captured = captureResetToken(`?token=${token}`);
  const cleanedSearch = "";
  assert.equal(captured.token, token);
  assert.equal(captureResetToken(cleanedSearch).token, null);
  assert.equal(captured.token, token);
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(captureResetToken(`?token=${token}&token=${"b".repeat(43)}`).token, null);
  assert.equal(captureResetToken("?token=invalid").token, null);
});

test("erros e fieldErrors desconhecidos não são propagados", () => {
  assert.deepEqual(
    sanitizeAuthError({ code: "UNKNOWN", message: "internal", fieldErrors: { token: "secret", email: "bad" } }, ["email"]),
    { code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação.", fieldErrors: { email: "bad" }, retryAfterSeconds: undefined },
  );
});
