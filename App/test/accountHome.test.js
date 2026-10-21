import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getFirstName } from "../src/account/accountModel.js";

const homeUrl = new URL("../src/sections/Home.jsx", import.meta.url);

test("Home usa o primeiro nome autenticado e mantém fallback neutro", async () => {
  const source = await readFile(homeUrl, "utf8");

  assert.equal(getFirstName("Guilherme Deutsch"), "Guilherme");
  assert.equal(getFirstName("   "), null);
  assert.equal(getFirstName(null), null);
  assert.match(source, /useAuth\(\)/u);
  assert.match(source, /getFirstName\(auth\.user\?\.name\)/u);
  assert.match(source, /firstName \? `Olá, \$\{firstName\}` : "Olá!"/u);
  assert.doesNotMatch(source, /auth\.user\?\.email.*Olá/u);
});
