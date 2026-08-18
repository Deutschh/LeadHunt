const assert = require("node:assert/strict");
const test = require("node:test");
const argon2 = require("argon2");
const {
  createAuthCryptoService,
} = require("../src/services/authCryptoService");

function createService(overrides = {}) {
  return createAuthCryptoService({
    otpHmacSecret: "s".repeat(32),
    devEmailBypassEnabled: false,
    devEmailBypassCode: "",
    ...overrides,
  });
}

test("OTP possui seis dígitos e HMAC separa user/challenge/purpose", () => {
  const service = createService();
  const code = service.generateOtp();
  assert.match(code, /^\d{6}$/);

  const first = service.createOtpDigest({ userId: 1, challengeId: 10, code });
  const otherUser = service.createOtpDigest({
    userId: 2,
    challengeId: 10,
    code,
  });
  const otherChallenge = service.createOtpDigest({
    userId: 1,
    challengeId: 11,
    code,
  });

  assert.equal(first.length, 32);
  assert.notDeepEqual(first, otherUser);
  assert.notDeepEqual(first, otherChallenge);
  assert.equal(
    service.matchesOtp({ userId: 1, challengeId: 10, code, digest: first }),
    true,
  );
});

test("Argon2id usa o perfil aprovado e produz hash verificável", async () => {
  const hash = await createService().hashPassword("uma senha longa segura");
  assert.match(hash, /^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  assert.equal(await argon2.verify(hash, "uma senha longa segura"), true);
});

test("bypass só reconhece o código quando habilitado", () => {
  assert.equal(createService().isDevelopmentBypassCode("123456"), false);
  assert.equal(
    createService({
      devEmailBypassEnabled: true,
      devEmailBypassCode: "123456",
    }).isDevelopmentBypassCode("123456"),
    true,
  );
});
