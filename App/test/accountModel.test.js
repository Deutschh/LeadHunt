import assert from "node:assert/strict";
import test from "node:test";
import {
  getFirstName,
  getUserInitials,
  normalizeAccountName,
  normalizePasswordPayload,
  normalizeProfileResponse,
  validatePasswordForm,
} from "../src/account/accountModel.js";

test("nome, primeiro nome e iniciais seguem o contrato aprovado", () => {
  assert.equal(normalizeAccountName("  Guilherme Deutsch  "), "Guilherme Deutsch");
  assert.equal(getFirstName("Guilherme Deutsch"), "Guilherme");
  assert.equal(getFirstName("\u0085inválido"), null);
  assert.equal(getUserInitials("Guilherme Ferreira Deutsch"), "GD");
  assert.equal(getUserInitials(null), "?");
});

test("formulário confirma senha somente no frontend", () => {
  assert.deepEqual(validatePasswordForm({
    currentPassword: "senha atual segura",
    newPassword: "nova senha bem segura",
    passwordConfirmation: "divergente segura",
  }), { passwordConfirmation: "As senhas não coincidem." });
  assert.deepEqual(normalizePasswordPayload({
    currentPassword: "senha atual segura",
    newPassword: "nova senha bem segura",
  }), {
    currentPassword: "senha atual segura",
    newPassword: "nova senha bem segura",
  });
});

test("resposta de perfil é estrita e nunca admite campos sensíveis", () => {
  assert.deepEqual(normalizeProfileResponse({
    user: { name: "Guilherme Deutsch", email: "user@example.com" },
  }), {
    user: { name: "Guilherme Deutsch", email: "user@example.com" },
  });
  assert.throws(() => normalizeProfileResponse({
    user: {
      name: "Guilherme Deutsch",
      email: "user@example.com",
      authVersion: 2,
    },
  }), (error) => error.code === "INVALID_ACCOUNT_RESPONSE");
});
