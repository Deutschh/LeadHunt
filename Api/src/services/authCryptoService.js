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

function createAuthCryptoService(config) {
  const hmacSecret = Buffer.from(config.otpHmacSecret, "utf8");
  const developmentBypassCode = Buffer.from(
    config.devEmailBypassCode || "",
    "utf8",
  );

  function generateOtp() {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  function createOtpDigest({ userId, challengeId, code }) {
    const material = [
      "v1",
      "email_verification",
      String(userId),
      String(challengeId),
      code,
    ].join("|");

    return crypto.createHmac("sha256", hmacSecret).update(material).digest();
  }

  function matchesOtp({ userId, challengeId, code, digest }) {
    if (!Buffer.isBuffer(digest) || digest.length !== 32) {
      return false;
    }

    const candidateDigest = createOtpDigest({ userId, challengeId, code });
    return crypto.timingSafeEqual(candidateDigest, digest);
  }

  return Object.freeze({
    createOtpDigest,
    generateOtp,
    generateWorkspaceSlug: () => `ws-${crypto.randomUUID()}`,
    hashPassword: (password) => argon2.hash(password, ARGON2_OPTIONS),
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
  createAuthCryptoService,
};
