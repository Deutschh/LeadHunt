import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminContractError,
  normalizeAdminWorkspaceDetails,
  normalizeAdminWorkspaceSummary,
  normalizeReason,
  normalizeWorkspaceAuditResponse,
  normalizeWorkspaceFilters,
  normalizeWorkspaceListResponse,
} from "../src/admin/adminModels.js";

const MAX_BIGINT = "9223372036854775807";
const CREATED_AT = "2026-09-15T12:00:00.000Z";

function summary(overrides = {}) {
  return {
    workspaceId: MAX_BIGINT,
    workspaceName: "Conta",
    accountStatus: "pending",
    isActive: false,
    releaseChannel: "stable",
    minProfiles: 2,
    maxProfiles: 4,
    createdAt: CREATED_AT,
    activatedAt: null,
    lastLoginAt: null,
    owner: { name: "Owner", email: "owner@example.com" },
    ...overrides,
  };
}

function details(workspaceId = MAX_BIGINT) {
  return {
    ...summary({ workspaceId }),
    timezone: "America/Sao_Paulo",
    updatedAt: CREATED_AT,
    members: [
      {
        userId: "7",
        name: "Admin",
        email: "admin@example.com",
        role: "owner",
        lastLoginAt: CREATED_AT,
        createdAt: CREATED_AT,
      },
    ],
  };
}

test("modelos preservam BIGINT como string, datas ISO e nullability", () => {
  const normalizedSummary = normalizeAdminWorkspaceSummary(summary());
  assert.equal(normalizedSummary.workspaceId, MAX_BIGINT);
  assert.equal(typeof normalizedSummary.workspaceId, "string");
  assert.equal(normalizedSummary.activatedAt, null);
  assert.equal(normalizedSummary.lastLoginAt, null);
  assert.equal(Object.isFrozen(normalizedSummary), true);

  const rawDetails = details();
  delete rawDetails.lastLoginAt;
  delete rawDetails.owner;
  const normalizedDetails = normalizeAdminWorkspaceDetails(rawDetails);
  assert.equal(normalizedDetails.members[0].userId, "7");
  assert.equal(Object.isFrozen(normalizedDetails.members), true);
});

test("lista e paginação exigem contrato coerente", () => {
  assert.deepEqual(
    normalizeWorkspaceListResponse({
      workspaces: [summary()],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
    }).pagination,
    { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
  );
  assert.throws(
    () =>
      normalizeWorkspaceListResponse({
        workspaces: [],
        pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 0 },
      }),
    AdminContractError,
  );
  assert.throws(
    () => normalizeAdminWorkspaceSummary(summary({ workspaceId: 22 })),
    AdminContractError,
  );
});

test("histórico aceita somente snapshots administrativos allowlisted", () => {
  const normalized = normalizeWorkspaceAuditResponse({
    workspaceId: "22",
    auditEvents: [
      {
        id: "101",
        action: "release_channel_changed",
        reason: "Teste",
        beforeState: { releaseChannel: "stable" },
        afterState: { releaseChannel: "canary" },
        createdAt: CREATED_AT,
        actor: { userId: "7", name: "Admin", email: "admin@example.com" },
      },
    ],
    pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
  });
  assert.equal(normalized.auditEvents[0].id, "101");

  const invalid = structuredClone(normalized);
  invalid.auditEvents[0].beforeState = { password: "secret" };
  assert.throws(() => normalizeWorkspaceAuditResponse(invalid), AdminContractError);
});

test("filtros e reason seguem os limites aprovados", () => {
  assert.deepEqual(normalizeWorkspaceFilters(), { page: 1, pageSize: 25 });
  assert.deepEqual(
    normalizeWorkspaceFilters({ page: 2, pageSize: 100, status: "active", search: " Conta " }),
    { page: 2, pageSize: 100, status: "active", search: "Conta" },
  );
  assert.equal(normalizeReason("  Linha 1\r\nLinha 2  "), "Linha 1\nLinha 2");
  assert.equal(normalizeReason("Linha 1\nLinha 2"), "Linha 1\nLinha 2");
  for (const character of ["\u0080", "\u0085", "\u009f"]) {
    assert.throws(() => normalizeReason(`Antes${character}depois`));
  }
  for (const filters of [
    { page: 0 },
    { pageSize: 101 },
    { status: "unknown" },
    { search: " " },
    { order: "id" },
  ]) {
    assert.throws(() => normalizeWorkspaceFilters(filters));
  }
});
