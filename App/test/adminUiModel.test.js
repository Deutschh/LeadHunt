import assert from "node:assert/strict";
import test from "node:test";
import { getTrappedFocusTarget, isolateApplicationRoot } from "../src/admin/adminFocusTrap.js";
import {
  deriveWorkspacePeople,
  getAuditActionLabel,
  getConflictMessage,
  getSnapshotRows,
  getStatusAction,
} from "../src/admin/adminUiModel.js";

test("focus trap circula nos limites com Tab e Shift+Tab", () => {
  const first = {};
  const middle = {};
  const last = {};
  const elements = [first, middle, last];
  assert.equal(getTrappedFocusTarget(elements, last, false), first);
  assert.equal(getTrappedFocusTarget(elements, first, true), last);
  assert.equal(getTrappedFocusTarget(elements, middle, false), null);
  assert.equal(getTrappedFocusTarget([], first, false), null);
});

test("isolamento do modal restaura inert e aria-hidden anteriores", () => {
  const attributes = new Map([["aria-hidden", "false"]]);
  const root = {
    inert: false,
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
  };
  const restore = isolateApplicationRoot(root);
  assert.equal(root.inert, true);
  assert.equal(attributes.get("aria-hidden"), "true");
  restore();
  assert.equal(root.inert, false);
  assert.equal(attributes.get("aria-hidden"), "false");
});

test("ações visíveis dependem somente do account status", () => {
  assert.deepEqual(getStatusAction("pending"), { action: "activate", label: "Ativar conta", next: "active" });
  assert.deepEqual(getStatusAction("active"), { action: "suspend", label: "Suspender conta", next: "suspended" });
  assert.deepEqual(getStatusAction("suspended"), { action: "reactivate", label: "Reativar conta", next: "active" });
  assert.equal(getStatusAction("unknown"), null);
});

test("owner e último login são derivados de todos os membros", () => {
  const result = deriveWorkspacePeople({ members: [
    { role: "member", lastLoginAt: "2026-09-12T10:00:00.000Z" },
    { role: "owner", name: "Owner", lastLoginAt: null },
    { role: "member", lastLoginAt: "2026-09-14T10:00:00.000Z" },
  ] });
  assert.equal(result.owner.name, "Owner");
  assert.equal(result.lastLoginAt, "2026-09-14T10:00:00.000Z");
});

test("labels de auditoria e conflitos são específicos", () => {
  assert.equal(getAuditActionLabel("account_activated"), "Conta ativada");
  assert.equal(getAuditActionLabel("future_event"), "Evento administrativo · future_event");
  assert.match(getConflictMessage("ADMIN_WORKSPACE_STATUS_CONFLICT"), /status/u);
  assert.equal(getConflictMessage("INTERNAL_ERROR"), null);
});

test("snapshots visuais mantêm somente campos administrativos conhecidos", () => {
  assert.deepEqual(getSnapshotRows(
    { accountStatus: "pending", activatedAt: null },
    { accountStatus: "active", activatedAt: "2026-09-15T12:00:00.000Z" },
  ), [
    { field: "accountStatus", label: "Status da conta", before: "pending", after: "active" },
    { field: "activatedAt", label: "Data de ativação", before: null, after: "2026-09-15T12:00:00.000Z" },
  ]);
});
