const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

function normalizeEmailForKey(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function emailKeyGenerator(req) {
  const email = normalizeEmailForKey(req.body?.email);

  if (email.length === 0) {
    return `missing-email:${ipKeyGenerator(req.ip)}`;
  }

  return `email:${crypto.createHash("sha256").update(email).digest("hex")}`;
}

function rateLimitHandler(_req, res) {
  return res.status(429).json({
    error: "Muitas tentativas. Tente novamente mais tarde.",
    code: "RATE_LIMITED",
  });
}

function createLimiter(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    ...options,
  });
}

function createAuthRateLimits() {
  return Object.freeze({
    register: [
      createLimiter({ windowMs: 15 * 60 * 1000, limit: 10 }),
      createLimiter({
        windowMs: 60 * 60 * 1000,
        limit: 5,
        keyGenerator: emailKeyGenerator,
      }),
    ],
    verify: [
      createLimiter({ windowMs: 15 * 60 * 1000, limit: 30 }),
      createLimiter({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        keyGenerator: emailKeyGenerator,
      }),
    ],
    resend: [
      createLimiter({ windowMs: 15 * 60 * 1000, limit: 10 }),
      createLimiter({
        windowMs: 60 * 1000,
        limit: 1,
        keyGenerator: emailKeyGenerator,
      }),
      createLimiter({
        windowMs: 60 * 60 * 1000,
        limit: 5,
        keyGenerator: emailKeyGenerator,
      }),
    ],
  });
}

module.exports = {
  createAuthRateLimits,
  emailKeyGenerator,
};
