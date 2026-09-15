import assert from "node:assert/strict";
import test from "node:test";
import {
  getAccountDestination,
  getPostLoginDestination,
  sanitizeReturnTo,
} from "../src/auth/authFlow.js";

test("matriz de destino dá precedência ao kill switch", () => {
  const auth = (accountStatus, isActive) => ({ status: "authenticated", workspace: { accountStatus, isActive } });
  assert.equal(getAccountDestination(auth("active", true)), "/");
  assert.equal(getAccountDestination(auth("pending", true)), "/pending");
  assert.equal(getAccountDestination(auth("suspended", true)), "/suspended");
  assert.equal(getAccountDestination(auth("active", false)), "/inactive");
  assert.equal(getAccountDestination(auth("pending", false)), "/inactive");
  assert.equal(getAccountDestination(auth("suspended", false)), "/inactive");
});

test("returnTo aceita somente caminho operacional interno", () => {
  assert.equal(sanitizeReturnTo("/leads?view=all#top"), "/leads?view=all#top");
  for (const value of ["https://evil.test", "//evil.test", "/login", "/briefing/token", "/pending", "/a\\b", "/x\u0000"]) {
    assert.equal(sanitizeReturnTo(value), null);
  }
  const auth = { status: "authenticated", workspace: { accountStatus: "active", isActive: true } };
  assert.equal(getAccountDestination(auth, "//evil.test"), "/");
  assert.equal(getAccountDestination(auth, "/leads"), "/leads");
});

test("destino pós-login preserva Admin para submeter o acesso ao guard", () => {
  for (const account of [
    { accountStatus: "pending", isActive: true },
    { accountStatus: "suspended", isActive: true },
    { accountStatus: "active", isActive: false },
  ]) {
    const auth = { status: "authenticated", workspace: account };
    assert.equal(getPostLoginDestination(auth, "/admin"), "/admin");
    assert.equal(
      getPostLoginDestination(auth, "/admin/workspaces/22?tab=audit"),
      "/admin/workspaces/22?tab=audit",
    );
  }
  const pending = {
    status: "authenticated",
    workspace: { accountStatus: "pending", isActive: true },
  };
  assert.equal(getPostLoginDestination(pending, "/administrator"), "/pending");
  assert.equal(getPostLoginDestination(pending, "//evil.test"), "/pending");
});
