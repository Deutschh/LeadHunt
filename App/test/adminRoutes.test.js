import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveAdminRoute } from "../src/admin/adminRouteModel.js";

test("guard Admin separa autenticação, checagem, negação e falha", () => {
  for (const authStatus of ["anonymous", "bootstrapping", "unavailable"]) {
    assert.equal(resolveAdminRoute(authStatus, "admin"), "login");
  }
  assert.equal(resolveAdminRoute("authenticated", "unknown"), "checking");
  assert.equal(resolveAdminRoute("authenticated", "checking"), "checking");
  assert.equal(resolveAdminRoute("authenticated", "notAdmin"), "deny");
  assert.equal(resolveAdminRoute("authenticated", "error"), "error");
  assert.equal(resolveAdminRoute("authenticated", "admin"), "allow");
});

test("guard Admin não depende do estado operacional do workspace", () => {
  for (const workspace of [
    { accountStatus: "pending", isActive: true },
    { accountStatus: "suspended", isActive: true },
    { accountStatus: "active", isActive: false },
  ]) {
    assert.equal(
      resolveAdminRoute(
        { status: "authenticated", workspace }.status,
        "admin",
      ),
      "allow",
    );
  }
});

test("namespace Admin é montado antes do wildcard e fora do gate operacional", async () => {
  const routesUrl = new URL("../src/auth/AuthRoutes.jsx", import.meta.url);
  const adminRoutesUrl = new URL("../src/admin/AdminRoutes.jsx", import.meta.url);
  const appUrl = new URL("../src/App.jsx", import.meta.url);
  const [routes, adminRoutes, app] = await Promise.all([
    readFile(routesUrl, "utf8"),
    readFile(adminRoutesUrl, "utf8"),
    readFile(appUrl, "utf8"),
  ]);

  assert.ok(routes.indexOf('path="/admin"') < routes.indexOf('path="*"'));
  assert.match(routes, /path="workspaces\/:workspaceId"/u);
  assert.match(
    routes,
    /path="\/admin"[\s\S]*path="workspaces\/:workspaceId"[\s\S]*path="\*"[\s\S]*<\/Route>/u,
  );
  assert.doesNotMatch(adminRoutes, /OperationalRoute|accountStatus|isActive/u);
  assert.match(app, /<AuthProvider>[\s\S]*<AdminProvider>[\s\S]*<AuthRoutes/u);
});
