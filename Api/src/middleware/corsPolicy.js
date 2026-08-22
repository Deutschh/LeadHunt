const cors = require("cors");

function createCorsPolicy(allowedOrigins) {
  const allowlist = new Set(allowedOrigins);

  function enforceOrigin(req, res, next) {
    const origin = req.get("Origin");

    if (origin === undefined) {
      return next();
    }

    if (origin === "null" || !allowlist.has(origin)) {
      return res.status(403).json({
        error: "Origem não autorizada.",
        code: "ORIGIN_NOT_ALLOWED",
      });
    }

    return next();
  }

  const middleware = cors({
    origin(origin, callback) {
      callback(null, origin === undefined || allowlist.has(origin));
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    optionsSuccessStatus: 204,
  });

  return Object.freeze({ enforceOrigin, middleware });
}

module.exports = { createCorsPolicy };
