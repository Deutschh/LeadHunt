import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dialogs enviam expected values locais e não enviam autoridade", async () => {
  const source = await readFile(new URL("../src/admin/AdminMutationDialogs.jsx", import.meta.url), "utf8");
  assert.match(source, /expectedMaxProfiles: details\.maxProfiles/u);
  assert.match(source, /expectedReleaseChannel: details\.releaseChannel/u);
  assert.doesNotMatch(source, /actor_user_id|is_admin|req\.workspaceId/u);
});

test("dialog usa portal, inert, focus trap e restauração", async () => {
  const [dialog, focus] = await Promise.all([
    readFile(new URL("../src/admin/AdminUi.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/admin/adminFocusTrap.js", import.meta.url), "utf8"),
  ]);
  assert.match(dialog, /createPortal/u);
  assert.match(dialog, /getTrappedFocusTarget/u);
  assert.match(dialog, /openerRef\.current\.focus/u);
  assert.match(focus, /root\.inert = true/u);
  assert.match(focus, /aria-hidden/u);
});

test("sucesso refaz detalhes, histórico, lista e summary quando aplicável", async () => {
  const source = await readFile(new URL("../src/admin/AdminWorkspaceDetailsPage.jsx", import.meta.url), "utf8");
  assert.match(source, /loadWorkspaceDetails\(workspaceId\)/u);
  assert.match(source, /loadWorkspaceAudit\(workspaceId, \{ page: 1, pageSize: 25 \}\)/u);
  assert.match(source, /workspaces\.data[\s\S]*loadWorkspaces\(filters\)/u);
  assert.match(source, /statusChanged[\s\S]*loadWorkspaceSummary\(\)/u);
});
