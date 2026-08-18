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

function loadServerConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";

  return Object.freeze({
    nodeEnv,
    trustProxyHops: parseTrustProxyHops(env.TRUST_PROXY_HOPS, nodeEnv),
  });
}

module.exports = {
  loadServerConfig,
  parseTrustProxyHops,
};
