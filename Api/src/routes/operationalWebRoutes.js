const express = require("express");

const NOT_FOUND_RESPONSE = Object.freeze({
  error: "Recurso não encontrado.",
  code: "NOT_FOUND",
});

function sendNotFound(_req, res) {
  return res.status(404).json(NOT_FOUND_RESPONSE);
}

function setCommercialProfileNoStore(_req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

function createOperationalWebRouter({
  requireAuthenticatedContext,
  requireOperationalAccess,
  leadsRouter,
  briefingRouter,
  serviceOpportunitiesRouter,
  commercialProfileRouter,
}) {
  if (
    typeof requireAuthenticatedContext !== "function" ||
    typeof requireOperationalAccess !== "function"
  ) {
    throw new TypeError("Middlewares operacionais são obrigatórios.");
  }

  const router = express.Router();

  // Funcionalidades fora da V1 web ficam em quarentena antes de qualquer
  // router operacional. router.use cobre o path exato e seus subpaths.
  router.use("/previews", sendNotFound);
  router.use("/settings/selectors", sendNotFound);
  router.use("/leads/sending-numbers/health-check-all", sendNotFound);
  router.use("/leads/sending-numbers/:id/health-check", sendNotFound);
  router.use("/leads/prompt-configs/:promptAngle/status", sendNotFound);

  router.use(
    "/commercial-profile",
    requireAuthenticatedContext,
    requireOperationalAccess,
    commercialProfileRouter,
  );

  router.use(
    "/leads",
    requireAuthenticatedContext,
    requireOperationalAccess,
    leadsRouter,
  );
  router.use(
    "/briefings",
    requireAuthenticatedContext,
    requireOperationalAccess,
    briefingRouter,
  );
  router.use(
    "/service-opportunities",
    requireAuthenticatedContext,
    requireOperationalAccess,
    serviceOpportunitiesRouter,
  );

  return router;
}

module.exports = {
  NOT_FOUND_RESPONSE,
  createOperationalWebRouter,
  setCommercialProfileNoStore,
};
