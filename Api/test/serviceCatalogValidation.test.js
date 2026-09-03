const assert = require("node:assert/strict");
const test = require("node:test");
const {
  validateActiveFilter,
  validateServiceCreate,
  validateServiceId,
  validateServicePatch,
} = require("../src/validation/serviceCatalogValidation");

function validCreate(overrides = {}) {
  return {
    name: "  Automação 🚀  ",
    type: "universal",
    problemCategory: "  Eficiência  ",
    description: "Descrição comercial",
    howItWorks: "Etapa 1\r\nEtapa 2",
    ...overrides,
  };
}

test("POST normaliza o contrato e aplica defaults sem alterar Unicode", () => {
  const result = validateServiceCreate(validCreate());
  assert.deepEqual(result.value, {
    name: "Automação 🚀",
    type: "universal",
    problemCategory: "Eficiência",
    description: "Descrição comercial",
    howItWorks: "Etapa 1\nEtapa 2",
    problemsSolved: [],
    targetNiches: [],
    isActive: true,
  });

  const decomposed = "Cafe\u0301";
  assert.equal(
    validateServicePatch({ name: decomposed }).value.name,
    decomposed,
  );
});

test("POST exige campos obrigatórios e rejeita campos arbitrários ou internos", () => {
  for (const body of [
    {},
    { ...validCreate(), name: undefined },
    { ...validCreate(), workspace_id: "9" },
    { ...validCreate(), workspaceId: "9" },
    { ...validCreate(), service_key: "site" },
    { ...validCreate(), serviceKey: "site" },
    { ...validCreate(), id: 3 },
    { ...validCreate(), created_at: "now" },
    { ...validCreate(), updatedAt: "now" },
  ]) {
    assert.equal(validateServiceCreate(body).error.code, "VALIDATION_ERROR");
  }
});

test("strings respeitam code points, Unicode e controles permitidos", () => {
  assert.equal(
    validateServicePatch({ name: "á".repeat(160) }).value.name,
    "á".repeat(160),
  );
  assert.equal(
    validateServicePatch({ name: "🚀".repeat(160) }).value.name,
    "🚀".repeat(160),
  );
  assert.equal(
    validateServicePatch({ name: "界".repeat(161) }).error.fieldErrors.name,
    "too_many_code_points",
  );
  assert.equal(
    validateServicePatch({ description: "A\rB\r\nC\nD" }).value.description,
    "A\nB\nC\nD",
  );

  for (const value of ["", "  ", "A\nB", "A\n", "\tA", "A\0B", "A\u007fB", "A\u0085B"])
    assert.ok(validateServicePatch({ name: value }).error);
  for (const value of ["A\0B", "A\u000bB", "A\u0085B"])
    assert.ok(validateServicePatch({ description: value }).error);
});

test("todos os limites textuais aceitam o exato e rejeitam limite + 1", () => {
  for (const [field, limit] of [
    ["name", 160],
    ["problemCategory", 160],
    ["description", 2000],
    ["howItWorks", 4000],
  ]) {
    assert.equal(
      validateServicePatch({ [field]: "🚀".repeat(limit) }).value[field],
      "🚀".repeat(limit),
    );
    assert.equal(
      validateServicePatch({ [field]: "🚀".repeat(limit + 1) }).error
        .fieldErrors[field],
      "too_many_code_points",
    );
  }

  for (const [field, limit] of [
    ["problemsSolved", 300],
    ["targetNiches", 160],
  ]) {
    assert.deepEqual(
      validateServicePatch({ [field]: ["界".repeat(limit)] }).value[field],
      ["界".repeat(limit)],
    );
    assert.ok(
      validateServicePatch({ [field]: ["界".repeat(limit + 1)] }).error,
    );
  }
});

test("type, boolean e displayOrder são estritos", () => {
  assert.equal(validateServicePatch({ type: " nichado " }).value.type, "nichado");
  for (const type of ["site", "UNIVERSAL", null, 1])
    assert.ok(validateServicePatch({ type }).error);
  for (const isActive of ["true", 1, null])
    assert.ok(validateServicePatch({ isActive }).error);
  for (const displayOrder of [-1, 1.5, 2147483648, "1", null])
    assert.ok(validateServicePatch({ displayOrder }).error);
  assert.equal(validateServicePatch({ displayOrder: 2147483647 }).value.displayOrder, 2147483647);
});

test("arrays validam itens, limites e duplicatas equivalentes", () => {
  assert.deepEqual(
    validateServicePatch({
      problemsSolved: ["  Processo manual  ", "Retrabalho"],
      targetNiches: ["Clínicas 🚀"],
    }).value,
    {
      problemsSolved: ["Processo manual", "Retrabalho"],
      targetNiches: ["Clínicas 🚀"],
    },
  );

  for (const problemsSolved of [
    "não-array",
    [""],
    ["Duplicado", " duplicado "],
    ["a".repeat(301)],
    Array.from({ length: 51 }, (_, index) => `item-${index}`),
  ]) {
    assert.ok(validateServicePatch({ problemsSolved }).error);
  }
  assert.ok(validateServicePatch({ targetNiches: ["A\nB"] }).error);
});

test("PATCH vazio, serviceId e filtro active inválidos falham fechados", () => {
  assert.ok(validateServicePatch({}).error);
  assert.deepEqual(validateServiceId("2147483647"), { value: "2147483647" });
  for (const id of ["0", "-1", "1.5", "2147483648", 1])
    assert.ok(validateServiceId(id).error);

  assert.deepEqual(validateActiveFilter(undefined), { value: undefined });
  assert.deepEqual(validateActiveFilter("true"), { value: true });
  assert.deepEqual(validateActiveFilter("false"), { value: false });
  for (const active of ["1", "TRUE", ["true"]])
    assert.ok(validateActiveFilter(active).error);
});
