import axios from "axios";
import { API_BASE_URL } from "../config/apiConfig.js";

const AUTH_PATH_PREFIX = "/auth/";
const SAFE_FIELD_ERRORS_LIMIT = 50;

export class AuthHttpError extends Error {
  constructor({
    status = 0,
    code,
    message,
    fieldErrors,
    retryable = false,
    retryAfterSeconds,
  }) {
    super(message);
    this.name = "AuthHttpError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class AuthProtocolError extends AuthHttpError {
  constructor(code = "INVALID_AUTH_RESPONSE") {
    super({
      status: 0,
      code,
      message: "A resposta de autenticação recebida é inválida.",
      retryable: true,
    });
    this.name = "AuthProtocolError";
  }
}

function sanitizeFieldErrors(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).slice(0, SAFE_FIELD_ERRORS_LIMIT);
  const sanitized = {};

  for (const [field, detail] of entries) {
    if (typeof detail === "string") {
      sanitized[field] = detail;
    } else if (
      Array.isArray(detail) &&
      detail.every((item) => typeof item === "string")
    ) {
      sanitized[field] = [...detail];
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function readRetryAfterSeconds(headers) {
  const rawValue =
    typeof headers?.get === "function"
      ? headers.get("retry-after")
      : headers?.["retry-after"];
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 86_400
    ? parsed
    : undefined;
}

function toSafeHttpError(error) {
  if (error instanceof AuthHttpError) {
    return error;
  }

  if (axios.isCancel(error)) {
    return new AuthHttpError({
      code: "REQUEST_ABORTED",
      message: "A operação foi cancelada.",
      retryable: true,
    });
  }

  if (!axios.isAxiosError(error) || !error.response) {
    return new AuthHttpError({
      code: "NETWORK_ERROR",
      message: "Não foi possível conectar ao servidor.",
      retryable: true,
    });
  }

  const status = Number.isInteger(error.response.status)
    ? error.response.status
    : 0;
  const responseBody = error.response.data;
  const safeBody =
    responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
      ? responseBody
      : {};

  return new AuthHttpError({
    status,
    code:
      typeof safeBody.code === "string" && safeBody.code.length > 0
        ? safeBody.code
        : status >= 500
          ? "AUTH_TEMPORARILY_UNAVAILABLE"
          : "HTTP_ERROR",
    message:
      typeof safeBody.error === "string" && safeBody.error.length > 0
        ? safeBody.error
        : status >= 500
          ? "Autenticação temporariamente indisponível."
          : "Não foi possível concluir a operação.",
    fieldErrors: sanitizeFieldErrors(safeBody.fieldErrors),
    retryable: status === 503 || status === 0,
    retryAfterSeconds: readRetryAfterSeconds(error.response.headers),
  });
}

export function validateRelativeApiPath(path) {
  const containsControlCharacter =
    typeof path === "string" &&
    [...path].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 31 || codePoint === 127;
    });

  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(path) ||
    containsControlCharacter
  ) {
    throw new AuthProtocolError("INVALID_API_PATH");
  }

  return path;
}

export function createAuthHttpClient({
  baseURL = API_BASE_URL,
  axiosInstance,
  publicAxiosInstance,
} = {}) {
  const transport =
    axiosInstance ||
    axios.create({
      baseURL,
      withCredentials: true,
      timeout: 10_000,
      allowAbsoluteUrls: false,
    });
  const publicTransport =
    publicAxiosInstance ||
    axios.create({
      baseURL,
      withCredentials: false,
      timeout: 10_000,
      allowAbsoluteUrls: false,
    });

  async function send({
    path,
    method = "GET",
    data,
    accessToken,
    signal,
    selectedTransport = transport,
  }) {
    validateRelativeApiPath(path);

    const headers = {};
    if (accessToken !== undefined) {
      if (typeof accessToken !== "string" || accessToken.length === 0) {
        throw new AuthProtocolError("INVALID_MEMORY_ACCESS_TOKEN");
      }
      headers.Authorization = `Bearer ${accessToken}`;
    }

    try {
      const response = await selectedTransport.request({
        url: path,
        method,
        data,
        headers,
        signal,
      });
      return response.data;
    } catch (error) {
      throw toSafeHttpError(error);
    }
  }

  function login(credentials, options = {}) {
    return send({
      path: "/auth/login",
      method: "POST",
      data: credentials,
      signal: options.signal,
    });
  }

  function getPublicConfig(options = {}) {
    return send({
      path: "/auth/public-config",
      signal: options.signal,
      selectedTransport: publicTransport,
    });
  }

  function register(payload, options = {}) {
    return send({
      path: "/auth/register",
      method: "POST",
      data: payload,
      signal: options.signal,
    });
  }

  function verifyEmail(payload, options = {}) {
    return send({
      path: "/auth/email/verify",
      method: "POST",
      data: payload,
      signal: options.signal,
    });
  }

  function resendVerification(payload, options = {}) {
    return send({
      path: "/auth/email/resend",
      method: "POST",
      data: payload,
      signal: options.signal,
    });
  }

  function forgotPassword(payload, options = {}) {
    return send({
      path: "/auth/password/forgot",
      method: "POST",
      data: payload,
      signal: options.signal,
    });
  }

  function resetPassword(payload, options = {}) {
    return send({
      path: "/auth/password/reset",
      method: "POST",
      data: payload,
      signal: options.signal,
    });
  }

  function refresh(options = {}) {
    return send({
      path: "/auth/refresh",
      method: "POST",
      signal: options.signal,
    });
  }

  function logout(options = {}) {
    return send({
      path: "/auth/logout",
      method: "POST",
      signal: options.signal,
    });
  }

  function me(accessToken, options = {}) {
    return send({
      path: "/auth/me",
      accessToken,
      signal: options.signal,
    });
  }

  function request(path, options = {}) {
    const validatedPath = validateRelativeApiPath(path);
    if (validatedPath.startsWith(AUTH_PATH_PREFIX)) {
      throw new AuthProtocolError("AUTH_ENDPOINT_REQUIRES_DEDICATED_METHOD");
    }

    return send({
      path: validatedPath,
      method: options.method,
      data: options.data,
      accessToken: options.accessToken,
      signal: options.signal,
    });
  }

  return Object.freeze({
    forgotPassword,
    getPublicConfig,
    login,
    logout,
    me,
    refresh,
    register,
    request,
    resendVerification,
    resetPassword,
    verifyEmail,
  });
}
