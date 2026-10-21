import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const accountPageUrl = new URL("../src/account/AccountPage.jsx", import.meta.url);
const routesUrl = new URL("../src/auth/AuthRoutes.jsx", import.meta.url);

test("Minha conta usa a sessão atual, relê a identidade e encerra após trocar senha", async () => {
  const source = await readFile(accountPageUrl, "utf8");

  assert.match(source, /api\.updateProfile\(\{ name: normalizedName \}\)/u);
  assert.match(source, /await auth\.reloadMe\(\)/u);
  assert.match(source, /api\.changePassword\(\{[\s\S]*currentPassword:[\s\S]*newPassword:/u);
  assert.match(source, /await auth\.logout\(\)/u);
  assert.match(source, /readOnly helper="A alteração de e-mail não está disponível/u);
  assert.doesNotMatch(source, /userId\s*:/u);
  assert.doesNotMatch(source, /actor_user_id/u);
});

test("rota /account exige autenticação sem usar o gate operacional", async () => {
  const source = await readFile(routesUrl, "utf8");
  const accountRoute = source.match(/<Route path="\/account"[^\n]+/u)?.[0] || "";

  assert.match(accountRoute, /AuthenticatedAccountRoute/u);
  assert.doesNotMatch(accountRoute, /OperationalRoute/u);
});
