const express = require("express");

function createSystemRouter() {
  const router = express.Router();

  router.get("/", (_req, res) => {
    return res.json({ status: "ok" });
  });

  router.post("/run-scraper", (_req, res) => {
    return res.status(404).json({
      error: "Recurso não encontrado.",
      code: "NOT_FOUND",
    });
  });

  return router;
}

module.exports = { createSystemRouter };
