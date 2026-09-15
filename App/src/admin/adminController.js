import {
  AdminApiError,
  isAdminAccessDenied,
  toAdminApiError,
} from "./adminApi.js";
import {
  normalizeAdminWorkspaceId,
  normalizeAuditPagination,
  normalizeWorkspaceFilters,
} from "./adminModels.js";

const DEFAULT_FILTERS = Object.freeze({ page: 1, pageSize: 25 });
const DEFAULT_AUDIT_PAGINATION = Object.freeze({ page: 1, pageSize: 25 });
const SUMMARY_STATUSES = Object.freeze(["pending", "active", "suspended"]);

function resource(status = "idle", data = null, error = null) {
  return Object.freeze({ status, data, error });
}

function initialState(accessStatus = "unknown") {
  return Object.freeze({
    accessStatus,
    accessError: null,
    summary: resource(),
    filters: DEFAULT_FILTERS,
    workspaces: resource(),
    selectedWorkspaceId: null,
    details: resource(),
    auditPagination: DEFAULT_AUDIT_PAGINATION,
    audit: resource(),
  });
}

function staleAdminOperation() {
  return new AdminApiError({
    code: "STALE_ADMIN_OPERATION",
    message: "A operação pertence a uma sessão ou seleção anterior.",
  });
}

function isSilentCancellation(error) {
  return ["REQUEST_ABORTED", "STALE_AUTH_OPERATION", "STALE_ADMIN_OPERATION"].includes(
    error?.code,
  );
}

export function createAdminController({ api }) {
  if (
    !api ||
    typeof api.checkAdminAccess !== "function" ||
    typeof api.listWorkspaces !== "function" ||
    typeof api.getWorkspaceDetails !== "function" ||
    typeof api.getWorkspaceAudit !== "function"
  ) {
    throw new TypeError("API administrativa é obrigatória.");
  }

  let state = initialState();
  let sessionVersion = null;
  let sessionGeneration = 0;
  const listeners = new Set();
  const generations = { access: 0, summary: 0, workspaces: 0, details: 0, audit: 0 };
  const abortControllers = { access: null, summary: null, workspaces: null, details: null, audit: null };

  function getSnapshot() {
    return state;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function publish(patch) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener();
  }

  function abortResource(name) {
    generations[name] += 1;
    abortControllers[name]?.abort();
    abortControllers[name] = null;
  }

  function abortAll() {
    for (const name of Object.keys(abortControllers)) abortResource(name);
  }

  function currentSession(capturedVersion, capturedGeneration) {
    return (
      sessionVersion === capturedVersion && sessionGeneration === capturedGeneration
    );
  }

  function beginResource(name) {
    abortResource(name);
    const abortController = new AbortController();
    abortControllers[name] = abortController;
    return {
      abortController,
      requestGeneration: generations[name],
      capturedVersion: sessionVersion,
      capturedSessionGeneration: sessionGeneration,
    };
  }

  function currentResource(name, request) {
    return (
      currentSession(
        request.capturedVersion,
        request.capturedSessionGeneration,
      ) &&
      generations[name] === request.requestGeneration &&
      abortControllers[name] === request.abortController
    );
  }

  function clearAdminState(accessStatus, accessError = null) {
    state = Object.freeze({
      ...initialState(accessStatus),
      accessError,
    });
    for (const listener of listeners) listener();
  }

  function revokeAdmin() {
    abortAll();
    clearAdminState("notAdmin");
  }

  function handleAdminError(error) {
    const normalized = toAdminApiError(error);
    if (isAdminAccessDenied(normalized)) revokeAdmin();
    return normalized;
  }

  function requireAdminSession() {
    if (sessionVersion === null || state.accessStatus !== "admin") {
      throw new AdminApiError({
        status: 403,
        code: "ADMIN_ACCESS_REQUIRED",
        message: "O acesso administrativo ainda não foi confirmado.",
      });
    }
  }

  async function checkAccess() {
    if (sessionVersion === null) throw staleAdminOperation();
    const request = beginResource("access");
    publish({ accessStatus: "checking", accessError: null });
    try {
      await api.checkAdminAccess({ signal: request.abortController.signal });
      if (!currentResource("access", request)) throw staleAdminOperation();
      publish({ accessStatus: "admin", accessError: null });
      return true;
    } catch (error) {
      if (!currentResource("access", request)) throw staleAdminOperation();
      const normalized = toAdminApiError(error);
      if (isAdminAccessDenied(normalized)) {
        revokeAdmin();
        return false;
      }
      if (!isSilentCancellation(normalized)) {
        publish({ accessStatus: "error", accessError: normalized });
      }
      throw normalized;
    } finally {
      if (currentResource("access", request)) abortControllers.access = null;
    }
  }

  function startSession(nextSessionVersion) {
    if (!Number.isSafeInteger(nextSessionVersion) || nextSessionVersion < 1) {
      throw new TypeError("sessionVersion administrativa inválida.");
    }
    abortAll();
    sessionVersion = nextSessionVersion;
    sessionGeneration += 1;
    clearAdminState("checking");
    return checkAccess();
  }

  function endSession() {
    abortAll();
    sessionVersion = null;
    sessionGeneration += 1;
    clearAdminState("unknown");
  }

  async function loadWorkspaces(filters = {}) {
    requireAdminSession();
    let normalizedFilters;
    try {
      normalizedFilters = normalizeWorkspaceFilters(filters);
    } catch (error) {
      throw toAdminApiError(error);
    }
    const request = beginResource("workspaces");
    publish({
      filters: normalizedFilters,
      workspaces: resource("loading", state.workspaces.data),
    });
    try {
      const data = await api.listWorkspaces(normalizedFilters, {
        signal: request.abortController.signal,
      });
      if (!currentResource("workspaces", request)) throw staleAdminOperation();
      publish({ workspaces: resource("ready", data) });
      return data;
    } catch (error) {
      if (!currentResource("workspaces", request)) throw staleAdminOperation();
      const normalized = handleAdminError(error);
      if (!isSilentCancellation(normalized) && !isAdminAccessDenied(normalized)) {
        publish({ workspaces: resource("error", state.workspaces.data, normalized) });
      }
      throw normalized;
    } finally {
      if (currentResource("workspaces", request)) abortControllers.workspaces = null;
    }
  }

  async function loadWorkspaceSummary() {
    requireAdminSession();
    const request = beginResource("summary");
    const previousData = state.summary.data;
    publish({ summary: resource("loading", previousData) });
    try {
      const responses = await Promise.all(
        SUMMARY_STATUSES.map((status) =>
          api.listWorkspaces(
            { page: 1, pageSize: 1, status },
            { signal: request.abortController.signal },
          ),
        ),
      );
      if (!currentResource("summary", request)) throw staleAdminOperation();
      const counts = Object.fromEntries(
        SUMMARY_STATUSES.map((status, index) => [
          status,
          responses[index].pagination.totalItems,
        ]),
      );
      const data = Object.freeze({
        total: counts.pending + counts.active + counts.suspended,
        pending: counts.pending,
        active: counts.active,
        suspended: counts.suspended,
      });
      publish({ summary: resource("ready", data) });
      return data;
    } catch (error) {
      if (!currentResource("summary", request)) throw staleAdminOperation();
      request.abortController.abort();
      const normalized = handleAdminError(error);
      if (!isSilentCancellation(normalized) && !isAdminAccessDenied(normalized)) {
        publish({ summary: resource("error", previousData, normalized) });
      }
      throw normalized;
    } finally {
      if (currentResource("summary", request)) abortControllers.summary = null;
    }
  }

  function selectWorkspace(workspaceId) {
    requireAdminSession();
    let id;
    try {
      id = normalizeAdminWorkspaceId(workspaceId);
    } catch (error) {
      throw toAdminApiError(error);
    }
    if (state.selectedWorkspaceId === id) return id;
    abortResource("details");
    abortResource("audit");
    publish({
      selectedWorkspaceId: id,
      details: resource(),
      auditPagination: DEFAULT_AUDIT_PAGINATION,
      audit: resource(),
    });
    return id;
  }

  async function loadWorkspaceDetails(workspaceId) {
    const id = selectWorkspace(workspaceId);
    const request = beginResource("details");
    publish({ details: resource("loading", state.details.data) });
    try {
      const data = await api.getWorkspaceDetails(id, {
        signal: request.abortController.signal,
      });
      if (
        !currentResource("details", request) ||
        state.selectedWorkspaceId !== id
      ) {
        throw staleAdminOperation();
      }
      publish({ details: resource("ready", data) });
      return data;
    } catch (error) {
      if (
        !currentResource("details", request) ||
        state.selectedWorkspaceId !== id
      ) {
        throw staleAdminOperation();
      }
      const normalized = handleAdminError(error);
      if (!isSilentCancellation(normalized) && !isAdminAccessDenied(normalized)) {
        publish({ details: resource("error", state.details.data, normalized) });
      }
      throw normalized;
    } finally {
      if (currentResource("details", request)) abortControllers.details = null;
    }
  }

  async function loadWorkspaceAudit(workspaceId, pagination = {}) {
    const id = selectWorkspace(workspaceId);
    let normalizedPagination;
    try {
      normalizedPagination = normalizeAuditPagination(pagination);
    } catch (error) {
      throw toAdminApiError(error);
    }
    const request = beginResource("audit");
    publish({
      auditPagination: normalizedPagination,
      audit: resource("loading", state.audit.data),
    });
    try {
      const data = await api.getWorkspaceAudit(id, normalizedPagination, {
        signal: request.abortController.signal,
      });
      if (!currentResource("audit", request) || state.selectedWorkspaceId !== id) {
        throw staleAdminOperation();
      }
      publish({ audit: resource("ready", data) });
      return data;
    } catch (error) {
      if (!currentResource("audit", request) || state.selectedWorkspaceId !== id) {
        throw staleAdminOperation();
      }
      const normalized = handleAdminError(error);
      if (!isSilentCancellation(normalized) && !isAdminAccessDenied(normalized)) {
        publish({ audit: resource("error", state.audit.data, normalized) });
      }
      throw normalized;
    } finally {
      if (currentResource("audit", request)) abortControllers.audit = null;
    }
  }

  async function mutation(method, args) {
    requireAdminSession();
    const capturedVersion = sessionVersion;
    const capturedGeneration = sessionGeneration;
    try {
      const result = await api[method](...args);
      if (!currentSession(capturedVersion, capturedGeneration)) {
        throw staleAdminOperation();
      }
      return result;
    } catch (error) {
      if (!currentSession(capturedVersion, capturedGeneration)) {
        throw staleAdminOperation();
      }
      const normalized = handleAdminError(error);
      throw normalized;
    }
  }

  return Object.freeze({
    activateWorkspace: (...args) => mutation("activateWorkspace", args),
    endSession,
    getSnapshot,
    loadWorkspaceAudit,
    loadWorkspaceDetails,
    loadWorkspaceSummary,
    loadWorkspaces,
    reactivateWorkspace: (...args) => mutation("reactivateWorkspace", args),
    retryAccess: checkAccess,
    selectWorkspace,
    startSession,
    subscribe,
    suspendWorkspace: (...args) => mutation("suspendWorkspace", args),
    updateMaxProfiles: (...args) => mutation("updateMaxProfiles", args),
    updateReleaseChannel: (...args) => mutation("updateReleaseChannel", args),
  });
}
