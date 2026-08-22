const express = require("express");
const { AuthServiceError } = require("../services/authService");
const { AuthSessionError } = require("../services/authSessionService");
const {
  validateLogin,
  validateRegister,
  validateResend,
  validateVerify,
} = require("../validation/authValidation");

const REGISTER_RESPONSE = Object.freeze({
  message:
    "Se o cadastro puder ser iniciado ou retomado, enviaremos instruções para o e-mail informado.",
  nextStep: "verify_email",
});

const RESEND_RESPONSE = Object.freeze({
  message:
    "Se houver um cadastro pendente, um novo código será enviado quando permitido.",
  nextStep: "verify_email",
  retryAfterSeconds: 60,
});

function sendValidationError(res, validationResult) {
  const { status, code, message, fieldErrors } = validationResult.error;

  return res.status(status).json({
    error: message,
    code,
    ...(fieldErrors ? { fieldErrors } : {}),
  });
}

function sendServiceError(res, error) {
  return res.status(error.status).json({
    error: error.publicMessage,
    code: error.code,
  });
}

function createAuthRouter({
  service,
  sessionService,
  cookieService,
  requireAuthenticatedContext,
  config,
  rateLimits,
  logger = console,
}) {
  const router = express.Router();
  const loginRateLimits = rateLimits.login || [];
  const refreshRateLimits = rateLimits.refresh || [];
  const logoutRateLimits = rateLimits.logout || [];

  router.get("/me", requireAuthenticatedContext, (req, res) => {
    return res.status(200).json({
      user: {
        name: req.user.name,
        email: req.user.email,
      },
      membership: {
        role: req.membership.role,
      },
      workspace: {
        name: req.workspace.name,
        accountStatus: req.workspace.accountStatus,
        isActive: req.workspace.isActive,
        timezone: req.workspace.timezone,
        releaseChannel: req.workspace.releaseChannel,
        minProfiles: req.workspace.minProfiles,
        maxProfiles: req.workspace.maxProfiles,
      },
    });
  });

  router.post("/register", ...rateLimits.register, async (req, res) => {
    const validationResult = validateRegister(req.body, config);

    if (validationResult.error) {
      return sendValidationError(res, validationResult);
    }

    try {
      await service.register(validationResult.value);
      return res.status(202).json(REGISTER_RESPONSE);
    } catch (_error) {
      logger.error("AUTH_REGISTER_PROCESSING_FAILED");
      return res.status(503).json({
        error: "Autenticação temporariamente indisponível.",
        code: "AUTH_TEMPORARILY_UNAVAILABLE",
      });
    }
  });

  router.post("/email/verify", ...rateLimits.verify, async (req, res) => {
    const validationResult = validateVerify(req.body);

    if (validationResult.error) {
      return sendValidationError(res, validationResult);
    }

    try {
      const result = await service.verify(validationResult.value);
      return res.status(200).json({
        verified: true,
        accountStatus: result.accountStatus,
      });
    } catch (error) {
      if (error instanceof AuthServiceError) {
        return sendServiceError(res, error);
      }

      logger.error("AUTH_EMAIL_VERIFICATION_FAILED");
      return res.status(500).json({
        error: "Erro interno ao verificar o e-mail.",
        code: "INTERNAL_ERROR",
      });
    }
  });

  router.post("/email/resend", ...rateLimits.resend, async (req, res) => {
    const validationResult = validateResend(req.body);

    if (validationResult.error) {
      return sendValidationError(res, validationResult);
    }

    try {
      await service.resend(validationResult.value);
      return res.status(202).json(RESEND_RESPONSE);
    } catch (_error) {
      logger.error("AUTH_EMAIL_RESEND_PROCESSING_FAILED");
      return res.status(503).json({
        error: "Autenticação temporariamente indisponível.",
        code: "AUTH_TEMPORARILY_UNAVAILABLE",
      });
    }
  });

  router.post("/login", ...loginRateLimits, async (req, res) => {
    const validationResult = validateLogin(req.body);

    if (validationResult.error) {
      return sendValidationError(res, validationResult);
    }

    try {
      const result = await sessionService.login(validationResult.value);
      cookieService.set(res, result.refreshToken, result.refreshExpiresAt);
      return res.status(200).json({
        accessToken: result.accessToken,
        tokenType: "Bearer",
        expiresIn: config.accessTokenTtlSeconds,
      });
    } catch (error) {
      if (error instanceof AuthSessionError) {
        return sendServiceError(res, error);
      }

      logger.error("AUTH_LOGIN_PROCESSING_FAILED");
      return res.status(503).json({
        error: "Autenticação temporariamente indisponível.",
        code: "AUTH_TEMPORARILY_UNAVAILABLE",
      });
    }
  });

  router.post("/refresh", ...refreshRateLimits, async (req, res) => {
    const cookie = cookieService.read(req);

    if (cookie.status !== "present") {
      cookieService.clear(res);
      return res.status(401).json({
        error: "Sessão inválida ou expirada.",
        code: "INVALID_SESSION",
      });
    }

    try {
      const result = await sessionService.refresh(cookie.token);
      cookieService.set(res, result.refreshToken, result.refreshExpiresAt);
      return res.status(200).json({
        accessToken: result.accessToken,
        tokenType: "Bearer",
        expiresIn: config.accessTokenTtlSeconds,
      });
    } catch (error) {
      if (error instanceof AuthSessionError) {
        if (error.clearRefreshCookie) {
          cookieService.clear(res);
        }
        return sendServiceError(res, error);
      }

      logger.error("AUTH_REFRESH_PROCESSING_FAILED");
      return res.status(503).json({
        error: "Autenticação temporariamente indisponível.",
        code: "AUTH_TEMPORARILY_UNAVAILABLE",
      });
    }
  });

  router.post("/logout", ...logoutRateLimits, async (req, res) => {
    const cookie = cookieService.read(req);

    try {
      await sessionService.logout(
        cookie.status === "present" ? cookie.token : null,
      );
      cookieService.clear(res);
      return res.status(204).end();
    } catch (_error) {
      logger.error("AUTH_LOGOUT_PROCESSING_FAILED");
      return res.status(503).json({
        error: "Autenticação temporariamente indisponível.",
        code: "AUTH_TEMPORARILY_UNAVAILABLE",
      });
    }
  });

  return router;
}

module.exports = {
  REGISTER_RESPONSE,
  RESEND_RESPONSE,
  createAuthRouter,
};
