import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sidebarUrl = new URL("../src/components/Sidebar.jsx", import.meta.url);
const appUrl = new URL("../src/App.jsx", import.meta.url);
const statePageUrl = new URL("../src/pages/auth/AccountStatePage.jsx", import.meta.url);

test("sidebar desktop exibe identidade, Minha conta e logout centralizado", async () => {
  const source = await readFile(sidebarUrl, "utf8");
  assert.match(source, /auth\.user\?\.name/u);
  assert.match(source, /auth\.user\?\.email/u);
  assert.match(source, /to="\/account"/u);
  assert.match(source, /<LogoutButton/u);
});

test("drawer mobile isola background, prende foco e restaura trigger", async () => {
  const source = await readFile(sidebarUrl, "utf8");
  assert.match(source, /createPortal/u);
  assert.match(source, /isolateApplicationRoot\(root\)/u);
  assert.match(source, /event\.key === "Escape"/u);
  assert.match(source, /event\.key !== "Tab"/u);
  assert.match(source, /getTrappedFocusTarget/u);
  assert.match(source, /handleFocusIn/u);
  assert.match(source, /event\.target === event\.currentTarget/u);
  assert.match(source, /const trigger = triggerRef\.current/u);
  assert.match(source, /trigger\?\.isConnected/u);
  assert.match(source, /aria-modal="true"/u);
});

test("shell operacional alterna header mobile e sidebar desktop", async () => {
  const [sidebar, app, statePage] = await Promise.all([
    readFile(sidebarUrl, "utf8"),
    readFile(appUrl, "utf8"),
    readFile(statePageUrl, "utf8"),
  ]);
  assert.match(sidebar, /lg:hidden/u);
  assert.match(sidebar, /hidden[^"]*lg:flex/u);
  assert.match(app, /flex-col[^"]*lg:flex-row/u);
  assert.match(statePage, /to="\/account"/u);
});
