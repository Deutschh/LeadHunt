function parseTrustProxyHops(rawValue, nodeEnv) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    if (nodeEnv === "production") {
      throw new Error(
        "TRUST_PROXY_HOPS deve ser configurado explicitamente em produção.",
      );
    }

    return 0;
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error("TRUST_PROXY_HOPS deve ser um inteiro entre 0 e 10.");
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (parsedValue < 0 || parsedValue > 10) {
    throw new Error("TRUST_PROXY_HOPS deve ser um inteiro entre 0 e 10.");
  }

  return parsedValue;
}

const DEVELOPMENT_CORS_ORIGINS = Object.freeze([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function parseCorsAllowedOrigins(rawValue, nodeEnv) {
  if (rawValue === undefined || rawValue === null || rawValue.trim() === "") {
    if (nodeEnv === "production") {
      throw new Error(
        "CORS_ALLOWED_ORIGINS deve ser configurado explicitamente em produção.",
      );
    }

    return [...DEVELOPMENT_CORS_ORIGINS];
  }

  const origins = rawValue.split(",").map((origin) => origin.trim());

  if (origins.some((origin) => origin.length === 0)) {
    throw new Error("CORS_ALLOWED_ORIGINS contém uma origem vazia.");
  }

  const normalizedOrigins = origins.map((origin) => {
    if (origin === "*" || origin === "null") {
      throw new Error("CORS_ALLOWED_ORIGINS contém uma origem proibida.");
    }

    let parsed;
    try {
      parsed = new URL(origin);
    } catch (_error) {
      throw new Error("CORS_ALLOWED_ORIGINS contém uma origem inválida.");
    }

    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.origin !== origin
    ) {
      throw new Error("CORS_ALLOWED_ORIGINS deve conter apenas origins exatas.");
    }

    if (nodeEnv === "production" && parsed.protocol !== "https:") {
      throw new Error("CORS_ALLOWED_ORIGINS deve usar HTTPS em produção.");
    }

    return parsed.origin;
  });

  if (new Set(normalizedOrigins).size !== normalizedOrigins.length) {
    throw new Error("CORS_ALLOWED_ORIGINS contém origins duplicadas.");
  }

  return normalizedOrigins;
}

function loadServerConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";

  return Object.freeze({
    nodeEnv,
    trustProxyHops: parseTrustProxyHops(env.TRUST_PROXY_HOPS, nodeEnv),
    corsAllowedOrigins: Object.freeze(
      parseCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS, nodeEnv),
    ),
  });
}

module.exports = {
  loadServerConfig,
  parseCorsAllowedOrigins,
  parseTrustProxyHops,
};
