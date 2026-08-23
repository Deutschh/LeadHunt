const LOCAL_API_PORT = 3001;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

function normalizeConfiguredOrigin(configuredUrl, isProduction) {
  if (typeof configuredUrl !== "string" || configuredUrl.trim() === "") {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(configuredUrl.trim());
  } catch {
    throw new Error("VITE_API_URL deve ser uma origem absoluta válida.");
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("VITE_API_URL deve conter somente uma origem HTTP(S).");
  }

  if (isProduction && parsed.protocol !== "https:") {
    throw new Error("VITE_API_URL deve usar HTTPS em produção.");
  }

  return parsed.origin;
}

export function resolveApiConfig({
  configuredUrl,
  isProduction = false,
  browserHostname,
} = {}) {
  const configuredOrigin = normalizeConfiguredOrigin(
    configuredUrl,
    isProduction,
  );

  let apiOrigin = configuredOrigin;
  if (!apiOrigin) {
    if (isProduction) {
      throw new Error("VITE_API_URL é obrigatória em produção.");
    }

    const hostname = browserHostname || "localhost";
    if (!LOCAL_HOSTNAMES.has(hostname)) {
      throw new Error(
        "VITE_API_URL é obrigatória fora de localhost no desenvolvimento.",
      );
    }

    apiOrigin = `http://${hostname}:${LOCAL_API_PORT}`;
  }

  return Object.freeze({
    API_ORIGIN: apiOrigin,
    API_BASE_URL: `${apiOrigin}/api`,
  });
}

const viteEnv = import.meta.env || {};
const browserHostname =
  typeof window === "undefined" ? undefined : window.location.hostname;

export const { API_ORIGIN, API_BASE_URL } = resolveApiConfig({
  configuredUrl: viteEnv.VITE_API_URL,
  isProduction: viteEnv.PROD === true,
  browserHostname,
});
