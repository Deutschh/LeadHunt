const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeNicheNameForLookup,
  validateNicheStrategyId,
  validateNicheStrategyPayload,
} = require("../src/validation/nicheStrategyValidation");

function validPayload(overrides = {}) {
  return {
    nicheName: "  Dentistas 🚀  ",
    hook: "  Linha 1\r\nLinha 2\rLinha 3  ",
    callToAction: "  Podemos conversar?  ",
    ...overrides,
  };
}

test("valida e normaliza somente o contrato camelCase aprovado", () => {
  assert.deepEqual(validateNicheStrategyPayload(validPayload()).value, {
    nicheName: "Dentistas 🚀",
    hook: "Linha 1\nLinha 2\nLinha 3",
    callToAction: "Podemos conversar?",
  });

  for (const body of [
    {},
    null,
    [],
    { ...validPayload(), nicheName: undefined },
    { ...validPayload(), unknown: true },
    { ...validPayload(), workspaceId: "9" },
    { ...validPayload(), workspace_id: "9" },
    { ...validPayload(), niche_name: "Dentistas" },
    { ...validPayload(), call_to_action: "Vamos?" },
    { ...validPayload(), id: 1 },
  ]) {
    assert.equal(
      validateNicheStrategyPayload(body).error.code,
      "VALIDATION_ERROR",
    );
  }
});

test("preserva Unicode e composição original sem normalização", () => {
  const decomposed = "Cafe\u0301";
  const result = validateNicheStrategyPayload(
    validPayload({ nicheName: decomposed, hook: "Ação 👩‍💻", callToAction: "東京?" }),
  );
  assert.deepEqual(result.value, {
    nicheName: decomposed,
    hook: "Ação 👩‍💻",
    callToAction: "東京?",
  });
  assert.notEqual(result.value.nicheName, "Café");
});

test("limites contam code points e aceitam Unicode multibyte no limite exato", () => {
  for (const [field, limit] of [
    ["nicheName", 160],
    ["hook", 2000],
    ["callToAction", 500],
  ]) {
    const exact = validateNicheStrategyPayload(
      validPayload({ [field]: "🚀".repeat(limit) }),
    );
    assert.equal(exact.error, undefined, `${field} deveria aceitar o limite`);
    const over = validateNicheStrategyPayload(
      validPayload({ [field]: "á".repeat(limit + 1) }),
    );
    assert.equal(over.error.fieldErrors[field], "too_many_code_points");
  }
});

test("linha única e multilinha rejeitam somente controles inseguros definidos", () => {
  for (const field of ["nicheName", "callToAction"]) {
    for (const value of ["A\nB", "A\rB", "A\u2028B", "A\u2029B", "A\0B", "A\u0085B", "\tA"]) {
      assert.equal(
        validateNicheStrategyPayload(validPayload({ [field]: value })).error
          .fieldErrors[field],
        "contains_unsafe_control",
      );
    }
  }

  assert.equal(
    validateNicheStrategyPayload(validPayload({ hook: "A\nB" })).value.hook,
    "A\nB",
  );
  for (const value of ["A\0B", "A\u000bB", "A\u007fB", "A\u0085B", "\tA"]) {
    assert.equal(
      validateNicheStrategyPayload(validPayload({ hook: value })).error
        .fieldErrors.hook,
      "contains_unsafe_control",
    );
  }
});

test("vazios, tipos inválidos, IDs e lookup inválidos falham antes do domínio", () => {
  for (const field of ["nicheName", "hook", "callToAction"]) {
    for (const value of ["", "   ", null, 1]) {
      assert.ok(validateNicheStrategyPayload(validPayload({ [field]: value })).error);
    }
  }

  assert.deepEqual(validateNicheStrategyId("2147483647"), {
    value: "2147483647",
  });
  for (const id of ["0", "-1", "1.5", "2147483648", 1]) {
    assert.ok(validateNicheStrategyId(id).error);
  }

  assert.deepEqual(normalizeNicheNameForLookup("  Dentistas  "), {
    value: "Dentistas",
  });
  assert.ok(normalizeNicheNameForLookup(" ").error);
  assert.ok(normalizeNicheNameForLookup(null).error);
});
