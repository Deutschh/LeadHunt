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

function hashOpaqueKey(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function refreshCookieKeyGenerator(cookieName) {
  return (req) => {
    const rawCookie = req.headers.cookie || "";
    const matches = rawCookie
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${cookieName}=`));

    if (matches.length !== 1) {
      return `missing-refresh:${ipKeyGenerator(req.ip)}`;
    }

    try {
      const token = decodeURIComponent(
        matches[0].slice(cookieName.length + 1),
      );
      if (token.length === 0) {
        return `missing-refresh:${ipKeyGenerator(req.ip)}`;
      }
      return `refresh:${hashOpaqueKey(token)}`;
    } catch (_error) {
      return `missing-refresh:${ipKeyGenerator(req.ip)}`;
    }
  };
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

function createAuthRateLimits(config = {}) {
  const refreshKeyGenerator = refreshCookieKeyGenerator(
    config.refreshCookieName || "leadhunt_refresh",
  );

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
    login: [
      createLimiter({ windowMs: 15 * 60 * 1000, limit: 10 }),
      createLimiter({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        keyGenerator: emailKeyGenerator,
      }),
    ],
    refresh: [
      createLimiter({ windowMs: 15 * 60 * 1000, limit: 120 }),
      createLimiter({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        keyGenerator: refreshKeyGenerator,
      }),
    ],
    logout: [createLimiter({ windowMs: 15 * 60 * 1000, limit: 60 })],
  });
}

module.exports = {
  createAuthRateLimits,
  emailKeyGenerator,
  refreshCookieKeyGenerator,
};
