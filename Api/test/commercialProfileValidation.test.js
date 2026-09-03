const assert = require("node:assert/strict");
const test = require("node:test");
const {
  validateCommercialProfilePatch,
  validatePresentationPreferences,
} = require("../src/validation/commercialProfileValidation");

test("PATCH aceita somente campos permitidos e preserva omitido, null e objeto vazio", () => {
  const result = validateCommercialProfilePatch({
    senderName: null,
    presentationPreferences: {},
  });
  assert.deepEqual(result, {
    value: { senderName: null, presentationPreferences: {} },
  });

  for (const body of [
    {},
    null,
    [],
    { unknown: true },
    { sender_name: "Nome" },
    { workspaceId: "99" },
    { workspace_id: "99" },
    { isComplete: true },
    { senderName: "Nome", unknown: true },
  ]) {
    assert.equal(validateCommercialProfilePatch(body).error.code, "VALIDATION_ERROR");
  }
});

test("campos textuais aplicam trim e normalização prevista sem normalizar Unicode", () => {
  const decomposed = "Cafe\u0301";
  const result = validateCommercialProfilePatch({
    senderName: `  Júlia 👩‍💻  `,
    businessName: `  ${decomposed} 東京  `,
    businessDescription: "  linha 1\r\nlinha 2\rlinha 3  ",
    salesContext: "  contexto com ação 🚀  ",
  });

  assert.deepEqual(result.value, {
    senderName: "Júlia 👩‍💻",
    businessName: `${decomposed} 東京`,
    businessDescription: "linha 1\nlinha 2\nlinha 3",
    salesContext: "contexto com ação 🚀",
  });
  assert.notEqual(result.value.businessName, "Café 東京");
});

test("limites funcionais contam code points inclusive para Unicode multibyte", () => {
  const cases = [
    ["senderName", 120],
    ["businessName", 160],
    ["businessDescription", 2000],
    ["salesContext", 4000],
  ];

  for (const [field, limit] of cases) {
    const exact = validateCommercialProfilePatch({ [field]: "🚀".repeat(limit) });
    assert.equal(exact.error, undefined, `${field} deveria aceitar o limite exato`);

    const over = validateCommercialProfilePatch({
      [field]: "á".repeat(limit + 1),
    });
    assert.equal(over.error.code, "VALIDATION_ERROR");
    assert.equal(over.error.fieldErrors[field], "too_many_code_points");
  }
});

test("nomes rejeitam quebras e controles, preservando ZWJ e variation selector", () => {
  for (const field of ["senderName", "businessName"]) {
    for (const unsafe of [
      "a\nb",
      "a\rb",
      "a\u2028b",
      "a\u2029b",
      "a\0b",
      "a\u0085b",
      "nome\n",
      "\tNome",
    ]) {
      const result = validateCommercialProfilePatch({ [field]: unsafe });
      assert.equal(result.error.fieldErrors[field], "contains_unsafe_control");
    }

    const legitimate = validateCommercialProfilePatch({
      [field]: "Equipe 👩‍💻 ✈️",
    });
    assert.equal(legitimate.error, undefined);
  }
});

test("textos multilinha preservam LF e rejeitam controles C0/C1 inseguros", () => {
  for (const field of ["businessDescription", "salesContext"]) {
    assert.equal(
      validateCommercialProfilePatch({ [field]: "linha 1\nlinha 2" }).error,
      undefined,
    );
    for (const unsafe of [
      "a\0b",
      "a\tb",
      "a\u007fb",
      "a\u0085b",
      "\ttexto",
    ]) {
      assert.equal(
        validateCommercialProfilePatch({ [field]: unsafe }).error.fieldErrors[field],
        "contains_unsafe_control",
      );
    }
  }

  for (const blank of ["", "   ", "\r\n"]) {
    assert.equal(
      validateCommercialProfilePatch({ businessDescription: blank }).error
        .fieldErrors.businessDescription,
      "must_not_be_blank",
    );
  }
});

test("preferences aceita somente árvore JSON pura dentro dos limites", () => {
  const valid = Object.create(null);
  valid.tom = "próximo";
  valid.options = [true, null, { emoji: "🚀" }];
  assert.equal(validatePresentationPreferences(valid).error, undefined);
  assert.equal(validatePresentationPreferences({}).error, undefined);

  for (const invalid of [null, [], "texto", 1, new Date()]) {
    assert.ok(validatePresentationPreferences(invalid).error);
  }
  assert.ok(validatePresentationPreferences({ value: Infinity }).error);
  assert.ok(validatePresentationPreferences({ items: Array(51).fill(true) }).error);
  assert.ok(validatePresentationPreferences({ text: "🚀".repeat(501) }).error);
  assert.ok(
    validatePresentationPreferences({
      a: { b: { c: { d: { e: true } } } },
    }).error,
  );
  assert.ok(
    validatePresentationPreferences(
      Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`k${index}`, true])),
    ).error,
  );
});

test("preferences bloqueia chaves perigosas em qualquer nível e referências cíclicas", () => {
  for (const key of ["__proto__", "prototype", "constructor"]) {
    const nested = JSON.parse(`{"safe":{"${key}":true}}`);
    assert.equal(validatePresentationPreferences(nested).error, "unsafe_key");
  }

  assert.equal(
    validatePresentationPreferences({ "unsafe\u0000key": true }).error,
    "unsafe_key",
  );

  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(
    validatePresentationPreferences(cyclic).error,
    "cyclic_or_repeated_reference",
  );
});

test("preferences impõe limites de chave, strings, entradas e 16 KiB serializados", () => {
  assert.equal(
    validatePresentationPreferences({ ["k".repeat(65)]: true }).error,
    "unsafe_key",
  );
  assert.equal(
    validatePresentationPreferences({ payload: "a".repeat(16 * 1024) }).error,
    "string_too_long",
  );
  assert.equal(
    validatePresentationPreferences(
      Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [
          `payload${index}`,
          "a".repeat(500),
        ]),
      ),
    ).error,
    "serialized_value_too_large",
  );

  const nestedEntries = { groups: [] };
  for (let index = 0; index < 50; index += 1) {
    nestedEntries.groups.push({ [`key${index}`]: index });
  }
  assert.equal(validatePresentationPreferences(nestedEntries).error, "too_many_entries");
});
