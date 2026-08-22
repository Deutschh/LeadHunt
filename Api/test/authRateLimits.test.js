const assert = require("node:assert/strict");
const test = require("node:test");
const {
  emailKeyGenerator,
  refreshCookieKeyGenerator,
  resetTokenKeyGenerator,
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

test("chaves de forgot/reset usam hash somente para input localmente limitado", () => {
  const ip = "127.0.0.1";
  const emailKey = emailKeyGenerator({
    ip,
    body: { email: " USER@example.com " },
  });
  const resetToken = "r".repeat(43);
  const resetKey = resetTokenKeyGenerator({
    ip,
    body: { token: resetToken },
  });

  assert.match(emailKey, /^email:[a-f0-9]{64}$/);
  assert.match(resetKey, /^password-reset:[a-f0-9]{64}$/);
  assert.equal(emailKey.includes("user@example.com"), false);
  assert.equal(resetKey.includes(resetToken), false);
  assert.match(
    emailKeyGenerator({ ip, body: { email: "a".repeat(255) } }),
    /^missing-email:/,
  );
  assert.match(
    resetTokenKeyGenerator({ ip, body: { token: "r".repeat(44) } }),
    /^missing-reset:/,
  );
});
