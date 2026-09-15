const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_SMALLINT,
  MIN_MAX_PROFILES,
  validateAdminWorkspaceMaxProfilesBody,
} = require("../src/validation/adminWorkspaceMaxProfilesValidation");

test("valida limites inteiros e normaliza a justificativa da 5.4", () => {
  assert.deepEqual(
    validateAdminWorkspaceMaxProfilesBody({
      maxProfiles: MAX_SMALLINT,
      expectedMaxProfiles: MIN_MAX_PROFILES,
      reason: "  Linha 1\r\nLinha 2  ",
    }),
    {
      value: {
        maxProfiles: 32767,
        expectedMaxProfiles: 2,
        reason: "Linha 1\nLinha 2",
      },
    },
  );
  assert.equal(
    validateAdminWorkspaceMaxProfilesBody({
      maxProfiles: 3,
      expectedMaxProfiles: 2,
      reason: "😀".repeat(500),
    }).error,
    undefined,
  );
});

test("rejeita tipos e valores fora do contrato SMALLINT", () => {
  for (const value of [
    -1,
    0,
    1,
    2.5,
    "4",
    NaN,
    Infinity,
    -Infinity,
    null,
    true,
  ]) {
    const result = validateAdminWorkspaceMaxProfilesBody({
      maxProfiles: value,
      expectedMaxProfiles: 2,
      reason: "Justificativa",
    });
    assert.equal(result.error?.code, "VALIDATION_ERROR", String(value));
    assert.ok(result.error?.fieldErrors?.maxProfiles, String(value));
  }

  const aboveSmallint = validateAdminWorkspaceMaxProfilesBody({
    maxProfiles: MAX_SMALLINT + 1,
    expectedMaxProfiles: 2,
    reason: "Justificativa",
  });
  assert.equal(aboveSmallint.error?.code, "VALIDATION_ERROR");

  for (const expectedMaxProfiles of [1, 2.5, "2", 32768, NaN, null, false]) {
    const result = validateAdminWorkspaceMaxProfilesBody({
      maxProfiles: 4,
      expectedMaxProfiles,
      reason: "Justificativa",
    });
    assert.ok(
      result.error?.fieldErrors?.expectedMaxProfiles,
      String(expectedMaxProfiles),
    );
  }
});

test("rejeita campos ausentes, reason inválida e propriedades extras", () => {
  for (const body of [
    undefined,
    null,
    [],
    {},
    { maxProfiles: 4, expectedMaxProfiles: 2 },
    { maxProfiles: 4, reason: "Justificativa" },
    { expectedMaxProfiles: 2, reason: "Justificativa" },
    { maxProfiles: 4, expectedMaxProfiles: 2, reason: "   " },
    { maxProfiles: 4, expectedMaxProfiles: 2, reason: "x".repeat(501) },
  ]) {
    assert.equal(
      validateAdminWorkspaceMaxProfilesBody(body).error?.code,
      "VALIDATION_ERROR",
    );
  }

  for (const field of [
    "actor_user_id",
    "minProfiles",
    "workspaceId",
    "__proto__",
    "constructor",
    "toString",
  ]) {
    const body = JSON.parse(
      `{"maxProfiles":4,"expectedMaxProfiles":2,"reason":"A","${field}":"x"}`,
    );
    const result = validateAdminWorkspaceMaxProfilesBody(body);
    assert.equal(result.error?.code, "VALIDATION_ERROR", field);
    assert.equal(result.error?.fieldErrors?.[field], "unknown_field", field);
  }
});
