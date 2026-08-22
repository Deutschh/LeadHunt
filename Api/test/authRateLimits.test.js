const assert = require("node:assert/strict");
const test = require("node:test");
const {
  refreshCookieKeyGenerator,
} = require("../src/middleware/authRateLimits");

test("chave de refresh usa SHA-256 canônico e nunca o cookie plaintext", () => {
  const generator = refreshCookieKeyGenerator("leadhunt_refresh");
  const token = "a".repeat(43);
  const plainKey = generator({
    ip: "127.0.0.1",
    headers: { cookie: `leadhunt_refresh=${token}` },
  });
  const encodedKey = generator({
    ip: "127.0.0.1",
    headers: { cookie: `leadhunt_refresh=${encodeURIComponent(token)}` },
  });

  assert.equal(plainKey, encodedKey);
  assert.match(plainKey, /^refresh:[a-f0-9]{64}$/);
  assert.equal(plainKey.includes(token), false);
});
