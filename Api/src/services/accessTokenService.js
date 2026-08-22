const jwt = require("jsonwebtoken");

class InvalidAccessTokenError extends Error {
  constructor() {
    super("Access token inválido.");
    this.name = "InvalidAccessTokenError";
  }
}

function isValidSubject(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return false;
  }

  try {
    return BigInt(value) <= 9_223_372_036_854_775_807n;
  } catch (_error) {
    return false;
  }
}

function createAccessTokenService(config) {
  function issue({ userId, authVersion }) {
    return jwt.sign(
      {
        token_use: "access",
        ver: authVersion,
      },
      config.jwtSecret,
      {
        algorithm: "HS256",
        audience: config.jwtAudience,
        expiresIn: config.accessTokenTtlSeconds,
        issuer: config.jwtIssuer,
        keyid: config.jwtKeyId,
        subject: String(userId),
      },
    );
  }

  function verify(token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret, {
        algorithms: ["HS256"],
        audience: config.jwtAudience,
        complete: true,
        issuer: config.jwtIssuer,
      });

      if (
        decoded.header.alg !== "HS256" ||
        decoded.header.kid !== config.jwtKeyId ||
        decoded.payload.token_use !== "access" ||
        !isValidSubject(decoded.payload.sub) ||
        !Number.isInteger(decoded.payload.ver) ||
        decoded.payload.ver < 0 ||
        !Number.isInteger(decoded.payload.iat) ||
        !Number.isInteger(decoded.payload.exp) ||
        decoded.payload.exp - decoded.payload.iat !==
          config.accessTokenTtlSeconds
      ) {
        throw new InvalidAccessTokenError();
      }

      return decoded.payload;
    } catch (error) {
      if (error instanceof InvalidAccessTokenError) {
        throw error;
      }

      throw new InvalidAccessTokenError();
    }
  }

  return Object.freeze({ issue, verify });
}

module.exports = {
  InvalidAccessTokenError,
  createAccessTokenService,
};
