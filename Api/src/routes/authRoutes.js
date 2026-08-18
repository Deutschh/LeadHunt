const express = require("express");
const { AuthServiceError } = require("../services/authService");
const {
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
  config,
  rateLimits,
  logger = console,
}) {
  const router = express.Router();

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

  return router;
}

module.exports = {
  REGISTER_RESPONSE,
  RESEND_RESPONSE,
  createAuthRouter,
};
