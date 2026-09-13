const express = require("express");

function setAdminNoStore(_req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

function createAdminRouter() {
  const router = express.Router();

  router.get("/me", (_req, res) => {
    return res.status(200).json({ admin: true });
  });

  return router;
}

module.exports = {
  createAdminRouter,
  setAdminNoStore,
};
