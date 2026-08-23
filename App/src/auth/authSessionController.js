import {
  AuthHttpError,
  AuthProtocolError,
} from "./authHttpClient.js";

const VALID_ROLES = new Set(["owner", "member"]);
const VALID_ACCOUNT_STATUSES = new Set([
  "pending",
  "active",
  "suspended",
]);
const VALID_RELEASE_CHANNELS = new Set([
  "internal",
  "canary",
  "beta",
  "stable",
]);

const INITIAL_STATE = Object.freeze({
  status: "bootstrapping",
  user: null,
  membership: null,
  workspace: null,
  error: null,
});

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function protocolError(code) {
  return new AuthProtocolError(code);
}

export function normalizeSessionResponse(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !isNonEmptyString(payload.accessToken) ||
    payload.tokenType !== "Bearer" ||
    !Number.isInteger(payload.expiresIn) ||
    payload.expiresIn <= 0
  ) {
    throw protocolError("INVALID_SESSION_RESPONSE");
  }

  return Object.freeze({ accessToken: payload.accessToken });
}

export function normalizeMeResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw protocolError("INVALID_ME_RESPONSE");
  }

  const { user, membership, workspace } = payload;
  if (
    !user ||
    typeof user !== "object" ||
    Array.isArray(user) ||
    !isNonEmptyString(user.name) ||
    !isNonEmptyString(user.email) ||
    !membership ||
    typeof membership !== "object" ||
    Array.isArray(membership) ||
    !VALID_ROLES.has(membership.role) ||
    !workspace ||
    typeof workspace !== "object" ||
    Array.isArray(workspace) ||
    !isNonEmptyString(workspace.name) ||
    !VALID_ACCOUNT_STATUSES.has(workspace.accountStatus) ||
    typeof workspace.isActive !== "boolean" ||
    !isNonEmptyString(workspace.timezone) ||
    !VALID_RELEASE_CHANNELS.has(workspace.releaseChannel) ||
    !Number.isInteger(workspace.minProfiles) ||
    workspace.minProfiles <= 0 ||
    !Number.isInteger(workspace.maxProfiles) ||
    workspace.maxProfiles <= 0 ||
    workspace.minProfiles > workspace.maxProfiles
  ) {
    throw protocolError("INVALID_ME_RESPONSE");
  }

  return Object.freeze({
    user: Object.freeze({ name: user.name, email: user.email }),
    membership: Object.freeze({ role: membership.role }),
    workspace: Object.freeze({
      name: workspace.name,
      accountStatus: workspace.accountStatus,
      isActive: workspace.isActive,
      timezone: workspace.timezone,
      releaseChannel: workspace.releaseChannel,
      minProfiles: workspace.minProfiles,
      maxProfiles: workspace.maxProfiles,
    }),
  });
}

function publicError(error) {
  if (error instanceof AuthHttpError) {
    return Object.freeze({
      code: error.code,
      message: error.message,
      retryable: error.retryable === true,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    });
  }

  return Object.freeze({
    code: "INTERNAL_AUTH_ERROR",
    message: "Não foi possível carregar a sessão.",
    retryable: true,
  });
}

function invalidLocalSession() {
  return new AuthHttpError({
    status: 401,
    code: "INVALID_SESSION",
    message: "Sessão inválida ou expirada.",
  });
}

function staleOperation() {
  return new AuthHttpError({
    code: "STALE_AUTH_OPERATION",
    message: "A operação pertence a uma sessão anterior.",
  });
}

export function createAuthSessionController({ client }) {
  if (!client) {
    throw new TypeError("client é obrigatório.");
  }

  let active = false;
  let authEpoch = 0;
  let tokenRevision = 0;
  let accessToken = null;
  let state = INITIAL_STATE;
  let refreshFlight = null;
  let bootstrapFlight = null;
  let cookieMutationTail = Promise.resolve();
  const listeners = new Set();
  const ownedAbortControllers = new Set();

  function getSnapshot() {
    return state;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function emit() {
    for (const listener of listeners) {
      listener();
    }
  }

  function isCurrent(epoch, revision) {
    return (
      active &&
      authEpoch === epoch &&
      (revision === undefined || tokenRevision === revision)
    );
  }

  function publish(nextState, epoch) {
    if (!isCurrent(epoch)) {
      return false;
    }

    state = Object.freeze(nextState);
    emit();
    return true;
  }

  function setAccessToken(token) {
    accessToken = token;
    tokenRevision += 1;
    return tokenRevision;
  }

  function clearAccessToken() {
    if (accessToken !== null) {
      accessToken = null;
      tokenRevision += 1;
    }
  }

  function abortOwnedRequests() {
    for (const abortController of ownedAbortControllers) {
      abortController.abort();
    }
    ownedAbortControllers.clear();
  }

  async function ownedRequest(operation, externalSignal) {
    const abortController = new AbortController();
    ownedAbortControllers.add(abortController);

    const abortFromExternal = () => abortController.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        abortController.abort();
      } else {
        externalSignal.addEventListener("abort", abortFromExternal, {
          once: true,
        });
      }
    }

    try {
      return await operation(abortController.signal);
    } finally {
      ownedAbortControllers.delete(abortController);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  }

  function enqueueCookieMutation(epoch, operation) {
    const runIfCurrent = () => {
      if (!isCurrent(epoch)) {
        throw staleOperation();
      }

      return operation();
    };
    const queued = cookieMutationTail.then(runIfCurrent, runIfCurrent);
    cookieMutationTail = queued.catch(() => undefined);
    return queued;
  }

  function publishAnonymous(epoch, error = null) {
    clearAccessToken();
    return publish(
      {
        status: "anonymous",
        user: null,
        membership: null,
        workspace: null,
        error,
      },
      epoch,
    );
  }

  function publishUnavailable(epoch, error) {
    const previousIdentity = {
      user: state.user,
      membership: state.membership,
      workspace: state.workspace,
    };
    clearAccessToken();
    return publish(
      {
        status: "unavailable",
        ...previousIdentity,
        error: publicError(error),
      },
      epoch,
    );
  }

  function handleAuthFailure(error, epoch, { anonymousOn401 = true } = {}) {
    if (!isCurrent(epoch)) {
      return;
    }

    if (error instanceof AuthHttpError && error.status === 401) {
      if (anonymousOn401) {
        publishAnonymous(epoch);
      }
      return;
    }

    publishUnavailable(epoch, error);
  }

  async function refreshAccessToken(epoch) {
    if (!isCurrent(epoch)) {
      throw staleOperation();
    }

    if (refreshFlight?.epoch === epoch) {
      return refreshFlight.promise;
    }

    const promise = enqueueCookieMutation(epoch, () =>
      ownedRequest((signal) => client.refresh({ signal })),
    )
      .then((payload) => {
        if (!isCurrent(epoch)) {
          throw staleOperation();
        }

        const session = normalizeSessionResponse(payload);
        const revision = setAccessToken(session.accessToken);
        return Object.freeze({ revision });
      })
      .catch((error) => {
        if (isCurrent(epoch)) {
          handleAuthFailure(error, epoch);
        }
        throw error;
      })
      .finally(() => {
        if (refreshFlight?.promise === promise) {
          refreshFlight = null;
        }
      });

    refreshFlight = { epoch, promise };
    return promise;
  }

  async function loadIdentity(epoch, revision, { anonymousOn401 = true } = {}) {
    if (!isCurrent(epoch, revision) || accessToken === null) {
      return { stale: true };
    }

    const tokenAtStart = accessToken;
    try {
      const payload = await ownedRequest((signal) =>
        client.me(tokenAtStart, { signal }),
      );

      if (!isCurrent(epoch, revision)) {
        return { stale: true };
      }

      const identity = normalizeMeResponse(payload);
      publish(
        {
          status: "authenticated",
          ...identity,
          error: null,
        },
        epoch,
      );
      return { identity };
    } catch (error) {
      if (!isCurrent(epoch, revision)) {
        return { stale: true };
      }

      handleAuthFailure(error, epoch, { anonymousOn401 });
      return { error };
    }
  }

  async function runBootstrap(epoch) {
    try {
      const refreshed = await refreshAccessToken(epoch);
      if (!isCurrent(epoch, refreshed.revision)) {
        return;
      }
      await loadIdentity(epoch, refreshed.revision);
    } catch {
      // refreshAccessToken already publishes the sanitized final state.
    }
  }

  function beginGeneration({ preserveIdentity = false } = {}) {
    abortOwnedRequests();
    authEpoch += 1;
    clearAccessToken();
    refreshFlight = null;
    bootstrapFlight = null;

    const epoch = authEpoch;
    publish(
      {
        status: "bootstrapping",
        user: preserveIdentity ? state.user : null,
        membership: preserveIdentity ? state.membership : null,
        workspace: preserveIdentity ? state.workspace : null,
        error: null,
      },
      epoch,
    );
    return epoch;
  }

  function start() {
    if (active) {
      return bootstrapFlight?.promise || Promise.resolve();
    }

    active = true;
    const epoch = beginGeneration();
    const promise = runBootstrap(epoch).finally(() => {
      if (bootstrapFlight?.promise === promise) {
        bootstrapFlight = null;
      }
    });
    bootstrapFlight = { epoch, promise };
    return promise;
  }

  function retryBootstrap() {
    if (!active) {
      return Promise.reject(staleOperation());
    }

    const epoch = beginGeneration({ preserveIdentity: true });
    const promise = runBootstrap(epoch).finally(() => {
      if (bootstrapFlight?.promise === promise) {
        bootstrapFlight = null;
      }
    });
    bootstrapFlight = { epoch, promise };
    return promise;
  }

  async function login(email, password) {
    if (!active) {
      throw staleOperation();
    }

    const epoch = beginGeneration();
    try {
      const payload = await enqueueCookieMutation(epoch, () =>
        ownedRequest((signal) =>
          client.login({ email, password }, { signal }),
        ),
      );
      if (!isCurrent(epoch)) {
        throw staleOperation();
      }

      const session = normalizeSessionResponse(payload);
      const revision = setAccessToken(session.accessToken);
      const loaded = await loadIdentity(epoch, revision);
      if (loaded.error) {
        throw loaded.error;
      }
      return loaded.identity || null;
    } catch (error) {
      if (isCurrent(epoch)) {
        handleAuthFailure(error, epoch);
      }
      throw error;
    }
  }

  async function logout() {
    if (!active) {
      return;
    }

    abortOwnedRequests();
    authEpoch += 1;
    const epoch = authEpoch;
    refreshFlight = null;
    bootstrapFlight = null;
    publishAnonymous(epoch);

    return enqueueCookieMutation(epoch, () =>
      ownedRequest((signal) => client.logout({ signal })),
    );
  }

  async function reloadMe() {
    if (!active || accessToken === null) {
      throw invalidLocalSession();
    }

    const epoch = authEpoch;
    const revision = tokenRevision;
    const first = await loadIdentity(epoch, revision, {
      anonymousOn401: false,
    });

    if (first.stale || !first.error) {
      return first.identity || null;
    }

    if (!(first.error instanceof AuthHttpError) || first.error.status !== 401) {
      throw first.error;
    }

    const refreshed = await refreshAccessToken(epoch);
    const second = await loadIdentity(epoch, refreshed.revision);
    if (second.error) {
      throw second.error;
    }
    return second.identity || null;
  }

  async function apiRequest(path, options = {}) {
    if (!active || state.status !== "authenticated" || accessToken === null) {
      throw invalidLocalSession();
    }

    const epoch = authEpoch;
    let revision = tokenRevision;
    let requestToken = accessToken;

    const perform = () =>
      ownedRequest(
        (signal) =>
          client.request(path, {
            ...options,
            accessToken: requestToken,
            signal,
          }),
        options.signal,
      );

    try {
      const result = await perform();
      if (!isCurrent(epoch)) {
        throw staleOperation();
      }
      return result;
    } catch (error) {
      if (
        !(error instanceof AuthHttpError) ||
        error.status !== 401 ||
        !isCurrent(epoch)
      ) {
        throw error;
      }

      if (tokenRevision === revision) {
        const refreshed = await refreshAccessToken(epoch);
        revision = refreshed.revision;
      } else {
        revision = tokenRevision;
      }

      if (!isCurrent(epoch, revision) || accessToken === null) {
        throw staleOperation();
      }
      requestToken = accessToken;

      try {
        const result = await perform();
        if (!isCurrent(epoch)) {
          throw staleOperation();
        }
        return result;
      } catch (retryError) {
        if (
          retryError instanceof AuthHttpError &&
          retryError.status === 401 &&
          isCurrent(epoch, revision)
        ) {
          publishAnonymous(epoch);
        }
        throw retryError;
      }
    }
  }

  function dispose() {
    if (!active) {
      return;
    }

    active = false;
    authEpoch += 1;
    abortOwnedRequests();
    clearAccessToken();
    refreshFlight = null;
    bootstrapFlight = null;
  }

  return Object.freeze({
    apiRequest,
    dispose,
    getSnapshot,
    login,
    logout,
    reloadMe,
    retryBootstrap,
    start,
    subscribe,
  });
}
