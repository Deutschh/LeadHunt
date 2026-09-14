const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_REASON_BYTES,
  MAX_REASON_CODE_POINTS,
  validateAdminWorkspaceStatusBody,
} = require("../src/validation/adminWorkspaceStatusValidation");

test("reason é obrigatória, multilinha e normalizada dentro dos limites", () => {
  assert.deepEqual(
    validateAdminWorkspaceStatusBody({ reason: "  Linha 1\r\nLinha 2  " }),
    { value: { reason: "Linha 1\nLinha 2" } },
  );
  assert.deepEqual(
    validateAdminWorkspaceStatusBody({
      reason: "á".repeat(MAX_REASON_CODE_POINTS),
    }).value,
    { reason: "á".repeat(MAX_REASON_CODE_POINTS) },
  );
  assert.equal(
    Buffer.byteLength("á".repeat(MAX_REASON_CODE_POINTS), "utf8") <=
      MAX_REASON_BYTES,
    true,
  );
  assert.equal(
    validateAdminWorkspaceStatusBody({
      reason: "😀".repeat(MAX_REASON_CODE_POINTS),
    }).error,
    undefined,
  );
});

test("reason rejeita ausência, vazio, tipo, controles e limites excedidos", () => {
  for (const body of [
    undefined,
    null,
    [],
    {},
    { reason: "   " },
    { reason: 7 },
    { reason: "linha\u0000" },
    { reason: "x".repeat(MAX_REASON_CODE_POINTS + 1) },
    { reason: "😀".repeat(501) },
  ]) {
    assert.equal(
      validateAdminWorkspaceStatusBody(body).error?.code,
      "VALIDATION_ERROR",
    );
  }
});

test("body rejeita propriedades desconhecidas e nomes especiais", () => {
  for (const field of [
    "actor_user_id",
    "is_admin",
    "account_status",
    "workspaceId",
    "__proto__",
    "constructor",
    "toString",
  ]) {
    const body = JSON.parse(`{"reason":"Justificativa","${field}":"x"}`);
    const result = validateAdminWorkspaceStatusBody(body);
    assert.equal(result.error?.code, "VALIDATION_ERROR", field);
    assert.equal(result.error?.fieldErrors?.[field], "unknown_field", field);
  }
});
