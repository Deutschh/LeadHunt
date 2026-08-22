const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const {
  InvalidAccessTokenError,
  createAccessTokenService,
} = require("../src/services/accessTokenService");

const config = {
  jwtSecret: "j".repeat(32),
  jwtKeyId: "key-v1",
  jwtIssuer: "leadhunt-api",
  jwtAudience: "leadhunt-web",
  accessTokenTtlSeconds: 600,
};

test("access JWT contém somente claims aprovadas e TTL de 600 segundos", () => {
  const service = createAccessTokenService(config);
  const token = service.issue({ userId: 42, authVersion: 3 });
  const complete = jwt.decode(token, { complete: true });
  const payload = service.verify(token);

  assert.equal(complete.header.alg, "HS256");
  assert.equal(complete.header.kid, "key-v1");
  assert.equal(payload.sub, "42");
  assert.equal(payload.token_use, "access");
  assert.equal(payload.ver, 3);
  assert.equal(payload.exp - payload.iat, 600);
  assert.deepEqual(Object.keys(payload).sort(), [
    "aud",
    "exp",
    "iat",
    "iss",
    "sub",
    "token_use",
    "ver",
  ]);
});

test("validação rejeita kid incorreto e algoritmo diferente", () => {
  const service = createAccessTokenService(config);
  const payload = { token_use: "access", ver: 0 };
  const baseOptions = {
    audience: config.jwtAudience,
    expiresIn: 600,
    issuer: config.jwtIssuer,
    subject: "1",
  };
  const wrongKid = jwt.sign(payload, config.jwtSecret, {
    ...baseOptions,
    algorithm: "HS256",
    keyid: "other-key",
  });
  const wrongAlgorithm = jwt.sign(payload, config.jwtSecret, {
    ...baseOptions,
    algorithm: "HS384",
    keyid: config.jwtKeyId,
  });
  const missingLifetime = jwt.sign(payload, config.jwtSecret, {
    algorithm: "HS256",
    audience: config.jwtAudience,
    issuer: config.jwtIssuer,
    keyid: config.jwtKeyId,
    noTimestamp: true,
    subject: "1",
  });

  assert.throws(() => service.verify(wrongKid), InvalidAccessTokenError);
  assert.throws(() => service.verify(wrongAlgorithm), InvalidAccessTokenError);
  assert.throws(() => service.verify(missingLifetime), InvalidAccessTokenError);
});
