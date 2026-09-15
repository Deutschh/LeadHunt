import {
  AdminContractError,
  AdminInputError,
  normalizeAdminMeResponse,
  normalizeAdminWorkspaceDetails,
  normalizeAdminWorkspaceId,
  normalizeAuditPagination,
  normalizeMaxProfilesMutationResponse,
  normalizeProfileLimit,
  normalizeReason,
  normalizeReleaseChannel,
  normalizeReleaseChannelMutationResponse,
  normalizeStatusMutationResponse,
  normalizeWorkspaceAuditResponse,
  normalizeWorkspaceFilters,
  normalizeWorkspaceListResponse,
} from "./adminModels.js";

export class AdminApiError extends Error {
  constructor({ status = 0, code, message, fieldErrors, retryable = false }) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.retryable = retryable;
  }
}

function sanitizedFieldErrors(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value)
    .slice(0, 50)
    .filter(([, detail]) =>
      typeof detail === "string" ||
      (Array.isArray(detail) && detail.every((item) => typeof item === "string")),
    )
    .map(([field, detail]) => [field, Array.isArray(detail) ? [...detail] : detail]);
  return entries.length ? Object.freeze(Object.fromEntries(entries)) : undefined;
}

export function toAdminApiError(error) {
  if (error instanceof AdminApiError) return error;
  const protocol = error instanceof AdminContractError;
  const input = error instanceof AdminInputError;
  const status = input ? 400 : Number.isInteger(error?.status) ? error.status : 0;
  const code = protocol
    ? "INVALID_ADMIN_RESPONSE"
    : input
      ? "VALIDATION_ERROR"
      : typeof error?.code === "string" && error.code
        ? error.code
        : "ADMIN_REQUEST_FAILED";
  const message =
    protocol || (!input && !(typeof error?.message === "string" && error.message))
      ? "Não foi possível processar a resposta administrativa."
      : error.message;
  return new AdminApiError({
    status,
    code,
    message,
    fieldErrors: sanitizedFieldErrors(error?.fieldErrors),
    retryable: protocol || error?.retryable === true,
  });
}

export function isAdminAccessDenied(error) {
  return (
    error instanceof AdminApiError &&
    error.status === 403 &&
    error.code === "ADMIN_ACCESS_DENIED"
  );
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertInputFields(value, fields) {
  if (!isPlainObject(value)) throw new AdminInputError({ body: "must_be_object" });
  const keys = Object.keys(value);
  const unknown = keys.find((field) => !fields.includes(field));
  if (unknown) throw new AdminInputError({ [unknown]: "unknown_field" });
  const missing = fields.find((field) => !Object.hasOwn(value, field));
  if (missing) throw new AdminInputError({ [missing]: "required" });
}

function assertSameWorkspace(response, workspaceId) {
  const responseWorkspaceId = response.workspace?.workspaceId ?? response.workspaceId;
  if (responseWorkspaceId !== workspaceId) throw new AdminContractError();
  return response;
}

export function createAdminApi(apiRequest) {
  if (typeof apiRequest !== "function") {
    throw new TypeError("apiRequest é obrigatório.");
  }

  async function request(path, options, normalize) {
    try {
      return normalize(await apiRequest(path, options));
    } catch (error) {
      throw toAdminApiError(error);
    }
  }

  function checkAdminAccess(options = {}) {
    return request(
      "/admin/me",
      { method: "GET", signal: options.signal },
      normalizeAdminMeResponse,
    );
  }

  function listWorkspaces(filters = {}, options = {}) {
    try {
      const normalized = normalizeWorkspaceFilters(filters);
      const query = new URLSearchParams({
        page: String(normalized.page),
        pageSize: String(normalized.pageSize),
      });
      if (normalized.status !== undefined) query.set("status", normalized.status);
      if (normalized.search !== undefined) query.set("search", normalized.search);
      return request(
        `/admin/workspaces?${query.toString()}`,
        { method: "GET", signal: options.signal },
        normalizeWorkspaceListResponse,
      );
    } catch (error) {
      return Promise.reject(toAdminApiError(error));
    }
  }

  function getWorkspaceDetails(workspaceId, options = {}) {
    try {
      const id = normalizeAdminWorkspaceId(workspaceId);
      return request(
        `/admin/workspaces/${id}`,
        { method: "GET", signal: options.signal },
        (response) => assertSameWorkspace(normalizeAdminWorkspaceDetails(response), id),
      );
    } catch (error) {
      return Promise.reject(toAdminApiError(error));
    }
  }

  function getWorkspaceAudit(workspaceId, pagination = {}, options = {}) {
    try {
      const id = normalizeAdminWorkspaceId(workspaceId);
      const normalized = normalizeAuditPagination(pagination);
      const query = new URLSearchParams({
        page: String(normalized.page),
        pageSize: String(normalized.pageSize),
      });
      return request(
        `/admin/workspaces/${id}/audit?${query.toString()}`,
        { method: "GET", signal: options.signal },
        (response) => assertSameWorkspace(normalizeWorkspaceAuditResponse(response), id),
      );
    } catch (error) {
      return Promise.reject(toAdminApiError(error));
    }
  }

  function statusMutation(
    action,
    expectedStatus,
    workspaceId,
    payload,
    options = {},
  ) {
    try {
      const id = normalizeAdminWorkspaceId(workspaceId);
      assertInputFields(payload, ["reason"]);
      const data = { reason: normalizeReason(payload.reason) };
      return request(
        `/admin/workspaces/${id}/${action}`,
        { method: "POST", data, signal: options.signal },
        (response) => {
          const normalized = assertSameWorkspace(
            normalizeStatusMutationResponse(response),
            id,
          );
          if (normalized.workspace.accountStatus !== expectedStatus) {
            throw new AdminContractError();
          }
          return normalized;
        },
      );
    } catch (error) {
      return Promise.reject(toAdminApiError(error));
    }
  }

  function updateMaxProfiles(workspaceId, payload, options = {}) {
    try {
      const id = normalizeAdminWorkspaceId(workspaceId);
      assertInputFields(payload, ["maxProfiles", "expectedMaxProfiles", "reason"]);
      const data = {
        maxProfiles: normalizeProfileLimit(payload.maxProfiles, "maxProfiles"),
        expectedMaxProfiles: normalizeProfileLimit(
          payload.expectedMaxProfiles,
          "expectedMaxProfiles",
        ),
        reason: normalizeReason(payload.reason),
      };
      return request(
        `/admin/workspaces/${id}/max-profiles`,
        { method: "PATCH", data, signal: options.signal },
        (response) =>
          assertSameWorkspace(normalizeMaxProfilesMutationResponse(response), id),
      );
    } catch (error) {
      return Promise.reject(toAdminApiError(error));
    }
  }

  function updateReleaseChannel(workspaceId, payload, options = {}) {
    try {
      const id = normalizeAdminWorkspaceId(workspaceId);
      assertInputFields(payload, [
        "releaseChannel",
        "expectedReleaseChannel",
        "reason",
      ]);
      const data = {
        releaseChannel: normalizeReleaseChannel(
          payload.releaseChannel,
          "releaseChannel",
        ),
        expectedReleaseChannel: normalizeReleaseChannel(
          payload.expectedReleaseChannel,
          "expectedReleaseChannel",
        ),
        reason: normalizeReason(payload.reason),
      };
      return request(
        `/admin/workspaces/${id}/release-channel`,
        { method: "PATCH", data, signal: options.signal },
        (response) =>
          assertSameWorkspace(normalizeReleaseChannelMutationResponse(response), id),
      );
    } catch (error) {
      return Promise.reject(toAdminApiError(error));
    }
  }

  return Object.freeze({
    activateWorkspace: (workspaceId, payload, options) =>
      statusMutation("activate", "active", workspaceId, payload, options),
    checkAdminAccess,
    getWorkspaceAudit,
    getWorkspaceDetails,
    listWorkspaces,
    reactivateWorkspace: (workspaceId, payload, options) =>
      statusMutation("reactivate", "active", workspaceId, payload, options),
    suspendWorkspace: (workspaceId, payload, options) =>
      statusMutation("suspend", "suspended", workspaceId, payload, options),
    updateMaxProfiles,
    updateReleaseChannel,
  });
}
