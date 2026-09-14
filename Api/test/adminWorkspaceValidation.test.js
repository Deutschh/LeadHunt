const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_POSTGRES_BIGINT,
  validateEmptyQuery,
  validateWorkspaceAuditQuery,
  validateWorkspaceId,
  validateWorkspaceListQuery,
} = require("../src/validation/adminWorkspaceValidation");

test("listagem aplica defaults e aceita filtros canônicos", () => {
  assert.deepEqual(validateWorkspaceListQuery({}).value, {
    page: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
    status: undefined,
    search: undefined,
  });
  assert.deepEqual(
    validateWorkspaceListQuery({
      page: "2",
      pageSize: "100",
      status: "suspended",
      search: "  Maria  ",
    }).value,
    { page: 2, pageSize: 100, status: "suspended", search: "Maria" },
  );
});

test("paginação rejeita zero, excesso, duplicata e offset inseguro", () => {
  for (const query of [
    { page: "0" },
    { pageSize: "0" },
    { pageSize: "101" },
    { page: ["1", "2"] },
    { page: String(Number.MAX_SAFE_INTEGER), pageSize: "100" },
  ]) {
    assert.equal(validateWorkspaceListQuery(query).error?.code, "VALIDATION_ERROR");
  }
});

test("listagem rejeita status, busca e campos fora da allowlist", () => {
  for (const query of [
    { status: "disabled" },
    { search: "   " },
    { search: "x".repeat(161) },
    { search: ["Maria", "João"] },
    { actor_user_id: "7" },
    { is_admin: "true" },
    { workspaceId: "11" },
    { order: "DROP TABLE" },
  ]) {
    assert.equal(validateWorkspaceListQuery(query).error?.code, "VALIDATION_ERROR");
  }
});

test("allowlist rejeita nomes herdados de Object.prototype", () => {
  for (const field of ["__proto__", "constructor", "toString"]) {
    const query = Object.create(null);
    query[field] = "x";

    const result = validateWorkspaceListQuery(query);
    assert.equal(result.error?.code, "VALIDATION_ERROR", field);
    assert.equal(result.error?.fieldErrors?.[field], "unknown_field", field);
  }
});

test("histórico aceita somente paginação e detalhes não aceitam query", () => {
  assert.deepEqual(validateWorkspaceAuditQuery({ page: "3" }).value, {
    page: 3,
    pageSize: 25,
  });
  assert.equal(
    validateWorkspaceAuditQuery({ status: "active" }).error?.code,
    "VALIDATION_ERROR",
  );
  assert.deepEqual(validateEmptyQuery({}), { value: {} });
  assert.equal(validateEmptyQuery({ actor_user_id: "1" }).error?.code, "VALIDATION_ERROR");
});

test("workspaceId preserva BIGINT como string e rejeita valores fora do domínio", () => {
  const maximum = String(MAX_POSTGRES_BIGINT);
  assert.deepEqual(validateWorkspaceId(maximum), { value: maximum });
  for (const value of [
    "0",
    "01",
    "-1",
    "1.2",
    "abc",
    "9223372036854775808",
    1,
  ]) {
    assert.equal(validateWorkspaceId(value).error?.code, "VALIDATION_ERROR");
  }
});
