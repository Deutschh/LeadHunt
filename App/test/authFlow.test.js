import assert from "node:assert/strict";
import test from "node:test";
import { getAccountDestination, sanitizeReturnTo } from "../src/auth/authFlow.js";

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
