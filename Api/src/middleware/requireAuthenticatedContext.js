const {
  InvalidAccessTokenError,
} = require("../services/accessTokenService");
const {
  AuthIdentityError,
  AuthIdentityUnavailableError,
} = require("../services/authIdentityService");

const INVALID_ACCESS_RESPONSE = Object.freeze({
  error: "Token de acesso inválido ou expirado.",
  code: "INVALID_ACCESS_TOKEN",
});

function extractBearerToken(req) {
  const rawHeaders = Array.isArray(req.rawHeaders) ? req.rawHeaders : [];
  let authorizationHeaderCount = 0;

  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (String(rawHeaders[index]).toLowerCase() === "authorization") {
      authorizationHeaderCount += 1;
    }
  }

  if (authorizationHeaderCount !== 1) {
    return null;
  }

  const value = req.headers?.authorization;
  if (typeof value !== "string" || value.includes(",")) {
    return null;
  }

  const match = /^Bearer ([^\s,]+)$/i.exec(value);
  return match ? match[1] : null;
}

function createRequireAuthenticatedContext({
  accessTokenService,
  identityService,
  logger = console,
}) {
  return async function requireAuthenticatedContext(req, res, next) {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json(INVALID_ACCESS_RESPONSE);
    }

    let claims;
    try {
      claims = accessTokenService.verify(token);
    } catch (error) {
      if (error instanceof InvalidAccessTokenError) {
        return res.status(401).json(INVALID_ACCESS_RESPONSE);
      }

      logger.error("AUTH_IDENTITY_INTERNAL_ERROR");
      return res.status(500).json({
        error: "Erro interno de autenticação.",
        code: "INTERNAL_ERROR",
      });
    }

    try {
      const context = await identityService.resolve({
        userId: claims.sub,
        authVersion: claims.ver,
      });

      req.user = context.user;
      req.membership = context.membership;
      req.workspace = context.workspace;
      req.workspaceId = context.membership.workspaceId;
      return next();
    } catch (error) {
      if (error instanceof AuthIdentityError) {
        if (error.status === 409) {
          logger.warn("AUTH_IDENTITY_STATE_CONFLICT", {
            reason: error.reason,
          });
        }

        return res.status(error.status).json({
          error: error.publicMessage,
          code: error.code,
        });
      }

      if (error instanceof AuthIdentityUnavailableError) {
        logger.error("AUTH_IDENTITY_DATABASE_UNAVAILABLE");
        return res.status(503).json({
          error: "Autenticação temporariamente indisponível.",
          code: "AUTH_TEMPORARILY_UNAVAILABLE",
        });
      }

      logger.error("AUTH_IDENTITY_INTERNAL_ERROR");
      return res.status(500).json({
        error: "Erro interno de autenticação.",
        code: "INTERNAL_ERROR",
      });
    }
  };
}

module.exports = {
  INVALID_ACCESS_RESPONSE,
  createRequireAuthenticatedContext,
  extractBearerToken,
};
