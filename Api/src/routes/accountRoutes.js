const express = require("express");
const { AccountServiceError } = require("../services/accountService");
const {
  validatePasswordChange,
  validateProfileUpdate,
} = require("../validation/accountValidation");

const PASSWORD_CHANGED_RESPONSE = Object.freeze({
  message: "Senha alterada com sucesso. Faça login novamente.",
});

function setAccountNoStore(_req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

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

function createAccountRouter({
  service,
  passwordService,
  rateLimits = {},
  logger = console,
}) {
  if (!service || typeof service.updateProfile !== "function") {
    throw new TypeError("Account service é obrigatório.");
  }
  if (!passwordService || typeof passwordService.changePassword !== "function") {
    throw new TypeError("Account password service é obrigatório.");
  }

  const router = express.Router();
  const changePasswordRateLimits = rateLimits.changePassword || [];

  router.patch("/profile", async (req, res) => {
    const validationResult = validateProfileUpdate(req.body);
    if (validationResult.error) {
      return sendValidationError(res, validationResult);
    }

    try {
      const user = await service.updateProfile({
        userId: req.user.id,
        name: validationResult.value.name,
      });
      return res.status(200).json({ user });
    } catch (error) {
      if (error instanceof AccountServiceError) {
        return sendServiceError(res, error);
      }

      logger.error("ACCOUNT_PROFILE_UPDATE_FAILED");
      return res.status(500).json({
        error: "Erro interno ao atualizar a conta.",
        code: "INTERNAL_ERROR",
      });
    }
  });

  router.patch(
    "/password",
    ...changePasswordRateLimits,
    async (req, res) => {
      const validationResult = validatePasswordChange(req.body);
      if (validationResult.error) {
        return sendValidationError(res, validationResult);
      }

      try {
        await passwordService.changePassword({
          userId: req.user.id,
          ...validationResult.value,
        });
        return res.status(200).json(PASSWORD_CHANGED_RESPONSE);
      } catch (error) {
        if (error instanceof AccountServiceError) {
          return sendServiceError(res, error);
        }

        logger.error("ACCOUNT_PASSWORD_CHANGE_FAILED");
        return res.status(500).json({
          error: "Erro interno ao alterar a senha.",
          code: "INTERNAL_ERROR",
        });
      }
    },
  );

  return router;
}

module.exports = {
  PASSWORD_CHANGED_RESPONSE,
  createAccountRouter,
  setAccountNoStore,
};
