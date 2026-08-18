function jsonParseErrorHandler(error, _req, res, next) {
  if (error?.type === "entity.parse.failed" && error.status === 400) {
    return res.status(400).json({
      error: "JSON inválido.",
      code: "VALIDATION_ERROR",
    });
  }

  return next(error);
}

module.exports = jsonParseErrorHandler;
