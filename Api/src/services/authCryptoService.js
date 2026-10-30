const argon2 = require("argon2");
const crypto = require("crypto");

const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
  version: 0x13,
});

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,p=1,t=2$Rco1zhj8HB3aaV39YP5dDA$iFR/wM3jPWCcjIBSSZUNfVMXTgn0ICrfHwTAiqIEjWs";

function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

function verifyPassword(password, passwordHash) {
  return argon2.verify(passwordHash, password, { type: argon2.argon2id });
}

const passwordCryptoService = Object.freeze({
  hashPassword,
  verifyPassword,
});

function createAuthCryptoService(config) {
  const hmacSecret = Buffer.from(config.otpHmacSecret, "utf8");
  const developmentBypassCode = Buffer.from(
    config.devEmailBypassCode || "",
    "utf8",
  );

  function generateOpaqueToken() {
    return crypto.randomBytes(32).toString("base64url");
  }

  function createOpaqueTokenDigest(token) {
    return crypto.createHash("sha256").update(token, "utf8").digest();
  }

  function generateOtp() {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  function createRegistrationProof({userId,passwordHash}) {
    return crypto.createHmac('sha256',hmacSecret)
      .update(JSON.stringify(['v1','registration_credentials',String(userId),passwordHash]))
      .digest('base64url');
  }

  function matchesRegistrationProof({userId,passwordHash,proof}) {
    if(typeof proof!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(proof))return false;
    return crypto.timingSafeEqual(Buffer.from(proof),Buffer.from(createRegistrationProof({userId,passwordHash})));
  }

  function createOtpDigest({ userId, challengeId, code, registrationProof = '' }) {
    const material = [
      "v1",
      "email_verification",
      String(userId),
      String(challengeId),
      code,
      registrationProof,
    ].join("|");

    return crypto.createHmac("sha256", hmacSecret).update(material).digest();
  }

  function matchesOtp({ userId, challengeId, code, digest, registrationProof = '' }) {
    if (!Buffer.isBuffer(digest) || digest.length !== 32) {
      return false;
    }

    const candidateDigest = createOtpDigest({ userId, challengeId, code, registrationProof });
    return crypto.timingSafeEqual(candidateDigest, digest);
  }

  return Object.freeze({
    createOtpDigest,
    createRegistrationProof,
    matchesRegistrationProof,
    generateRegistrationDecoy: generateOpaqueToken,
    generateOtp,
    generateWorkspaceSlug: () => `ws-${crypto.randomUUID()}`,
    hashPassword,
    verifyPassword,
    dummyPasswordHash: DUMMY_PASSWORD_HASH,
    generateRefreshToken: generateOpaqueToken,
    createRefreshTokenDigest: createOpaqueTokenDigest,
    generatePasswordResetToken: generateOpaqueToken,
    createPasswordResetTokenDigest: createOpaqueTokenDigest,
    generateRefreshFamilyId: () => crypto.randomUUID(),
    isDevelopmentBypassCode: (code) => {
      if (!config.devEmailBypassEnabled || typeof code !== "string") {
        return false;
      }

      const candidate = Buffer.from(code, "utf8");
      return (
        candidate.length === developmentBypassCode.length &&
        crypto.timingSafeEqual(candidate, developmentBypassCode)
      );
    },
    matchesOtp,
  });
}

module.exports = {
  ARGON2_OPTIONS,
  DUMMY_PASSWORD_HASH,
  createAuthCryptoService,
  passwordCryptoService,
};
