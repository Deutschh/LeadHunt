import assert from "node:assert/strict";
import test from "node:test";
import { AuthHttpError } from "../src/auth/authHttpClient.js";
import {
  createAuthSessionController,
  normalizeMeResponse,
  normalizeSessionResponse,
} from "../src/auth/authSessionController.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function session(accessToken, expiresIn = 900) {
  return { accessToken, tokenType: "Bearer", expiresIn };
}

function identity(overrides = {}) {
  return {
    user: { name: "Maria Silva", email: "maria@example.com", ignored: true },
    membership: { role: "owner", ignored: true },
    workspace: {
      name: "Maria Silva",
      accountStatus: "pending",
      isActive: true,
      timezone: "America/Sao_Paulo",
      releaseChannel: "stable",
      minProfiles: 2,
      maxProfiles: 2,
      ignored: true,
      ...overrides,
    },
    ignored: true,
  };
}

function httpError(status, code) {
  return new AuthHttpError({
    status,
    code,
    message: code,
    retryable: status === 503,
  });
}

function createClient(overrides = {}) {
  return {
    refresh: async () => session("bootstrap-token"),
    login: async () => session("login-token"),
    logout: async () => undefined,
    me: async () => identity(),
    request: async () => ({ ok: true }),
    ...overrides,
  };
}

test("contrato de sessão aceita expiresIn positivo diferente de 600", () => {
  assert.deepEqual(normalizeSessionResponse(session("token", 321)), {
    accessToken: "token",
  });

  for (const payload of [
    session("", 321),
    { ...session("token", 321), tokenType: "JWT" },
    session("token", 0),
    session("token", 1.5),
  ]) {
    assert.throws(() => normalizeSessionResponse(payload));
  }
});

test("/me é normalizado sem extras e valida enums, boolean e limites", () => {
  assert.deepEqual(normalizeMeResponse(identity()), {
    user: { name: "Maria Silva", email: "maria@example.com" },
    membership: { role: "owner" },
    workspace: {
      name: "Maria Silva",
      accountStatus: "pending",
      isActive: true,
      timezone: "America/Sao_Paulo",
      releaseChannel: "stable",
      minProfiles: 2,
      maxProfiles: 2,
    },
  });

  for (const payload of [
    identity({ releaseChannel: "unknown" }),
    identity({ minProfiles: 3, maxProfiles: 2 }),
    identity({ minProfiles: 0 }),
    identity({ isActive: "true" }),
    { ...identity(), membership: { role: "admin" } },
  ]) {
    assert.throws(() => normalizeMeResponse(payload));
  }
});

test("bootstrap autentica pending/suspended/inactive e mantém token fora do snapshot", async () => {
  for (const workspace of [
    { accountStatus: "pending", isActive: true },
    { accountStatus: "suspended", isActive: true },
    { accountStatus: "active", isActive: false },
  ]) {
    let bearer;
    const controller = createAuthSessionController({
      client: createClient({
        me: async () => identity(workspace),
        request: async (_path, options) => {
          bearer = options.accessToken;
          return { ok: true };
        },
      }),
    });

    await controller.start();
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.status, "authenticated");
    assert.equal(snapshot.workspace.accountStatus, workspace.accountStatus);
    assert.equal(snapshot.workspace.isActive, workspace.isActive);
    assert.equal("accessToken" in snapshot, false);
    await controller.apiRequest("/leads");
    assert.equal(bearer, "bootstrap-token");
    controller.dispose();
  }
});

test("bootstrap separa 401, indisponibilidade e /me malformado", async () => {
  const cases = [
    {
      client: createClient({
        refresh: async () => {
          throw httpError(401, "INVALID_SESSION");
        },
      }),
      expected: "anonymous",
    },
    {
      client: createClient({
        refresh: async () => {
          throw httpError(503, "AUTH_TEMPORARILY_UNAVAILABLE");
        },
      }),
      expected: "unavailable",
    },
    {
      client: createClient({
        refresh: async () => {
          throw httpError(0, "NETWORK_ERROR");
        },
      }),
      expected: "unavailable",
    },
    {
      client: createClient({
        me: async () => {
          throw httpError(401, "INVALID_ACCESS_TOKEN");
        },
      }),
      expected: "anonymous",
    },
    {
      client: createClient({
        me: async () => {
          throw httpError(503, "AUTH_TEMPORARILY_UNAVAILABLE");
        },
      }),
      expected: "unavailable",
    },
    {
      client: createClient({
        me: async () => {
          throw httpError(0, "NETWORK_ERROR");
        },
      }),
      expected: "unavailable",
    },
    {
      client: createClient({ me: async () => ({ malformed: true }) }),
      expected: "unavailable",
    },
  ];

  for (const item of cases) {
    const controller = createAuthSessionController({ client: item.client });
    await controller.start();
    assert.equal(controller.getSnapshot().status, item.expected);
    controller.dispose();
  }
});

test("múltiplos 401 compartilham um refresh e fazem retry único", async () => {
  let refreshCalls = 0;
  let operationCalls = 0;
  const refreshGate = deferred();
  const controller = createAuthSessionController({
    client: createClient({
      refresh: async () => {
        refreshCalls += 1;
        return refreshCalls === 1
          ? session("token-a")
          : refreshGate.promise;
      },
      request: async (_path, options) => {
        operationCalls += 1;
        if (options.accessToken === "token-a") {
          throw httpError(401, "INVALID_ACCESS_TOKEN");
        }
        return { ok: true };
      },
    }),
  });
  await controller.start();

  const requests = Array.from({ length: 5 }, () =>
    controller.apiRequest("/leads"),
  );
  await Promise.resolve();
  refreshGate.resolve(session("token-b"));

  assert.deepEqual(await Promise.all(requests), Array(5).fill({ ok: true }));
  assert.equal(refreshCalls, 2);
  assert.equal(operationCalls, 10);
});

test("retry 401 encerra sessão sem loop e 403 não provoca logout", async () => {
  let refreshCalls = 0;
  const controller = createAuthSessionController({
    client: createClient({
      refresh: async () => session(`token-${++refreshCalls}`),
      request: async (path) => {
        if (path === "/forbidden") {
          throw httpError(403, "ACCOUNT_PENDING");
        }
        throw httpError(401, "INVALID_ACCESS_TOKEN");
      },
    }),
  });
  await controller.start();

  await assert.rejects(controller.apiRequest("/forbidden"));
  assert.equal(controller.getSnapshot().status, "authenticated");

  await assert.rejects(controller.apiRequest("/leads"));
  assert.equal(refreshCalls, 2);
  assert.equal(controller.getSnapshot().status, "anonymous");
});

test("403 comercial reconcilia /me single-flight sem repetir operações", async () => {
  let meCalls = 0;
  let refreshCalls = 0;
  let operationCalls = 0;
  const reconciliationGate = deferred();
  const reconciliationStarted = deferred();
  const controller = createAuthSessionController({
    client: createClient({
      refresh: async () => session(`token-${++refreshCalls}`),
      me: async () => {
        meCalls += 1;
        if (meCalls === 1) {
          return identity({ accountStatus: "active" });
        }
        reconciliationStarted.resolve();
        return reconciliationGate.promise;
      },
      request: async () => {
        operationCalls += 1;
        throw httpError(403, "ACCOUNT_SUSPENDED");
      },
    }),
  });
  await controller.start();

  const requests = Array.from({ length: 3 }, () =>
    controller.apiRequest("/leads"),
  );
  await reconciliationStarted.promise;
  reconciliationGate.resolve(identity({ accountStatus: "suspended" }));
  const results = await Promise.allSettled(requests);

  assert.equal(results.every((item) => item.status === "rejected"), true);
  assert.equal(results.every((item) => item.reason.code === "ACCOUNT_SUSPENDED"), true);
  assert.equal(operationCalls, 3);
  assert.equal(meCalls, 2);
  assert.equal(refreshCalls, 1);
  assert.equal(controller.getSnapshot().status, "authenticated");
  assert.equal(
    controller.getSnapshot().workspace.accountStatus,
    "suspended",
  );
});

test("reconciliação comercial aplica precedência inactive sem logout", async () => {
  let meCalls = 0;
  const controller = createAuthSessionController({
    client: createClient({
      me: async () => {
        meCalls += 1;
        return identity(
          meCalls === 1
            ? { accountStatus: "active", isActive: true }
            : { accountStatus: "active", isActive: false },
        );
      },
      request: async () => {
        throw httpError(403, "ACCOUNT_INACTIVE");
      },
    }),
  });
  await controller.start();

  await assert.rejects(controller.apiRequest("/leads"), (error) => {
    assert.equal(error.code, "ACCOUNT_INACTIVE");
    return true;
  });
  assert.equal(controller.getSnapshot().status, "authenticated");
  assert.equal(controller.getSnapshot().workspace.isActive, false);
});

test("403 comercial no retry após refresh também reconcilia sem novo retry", async () => {
  let refreshCalls = 0;
  let operationCalls = 0;
  let meCalls = 0;
  const controller = createAuthSessionController({
    client: createClient({
      refresh: async () => session(`token-${++refreshCalls}`),
      me: async () => {
        meCalls += 1;
        return identity({
          accountStatus: meCalls === 1 ? "active" : "suspended",
        });
      },
      request: async (_path, options) => {
        operationCalls += 1;
        if (options.accessToken === "token-1") {
          throw httpError(401, "INVALID_ACCESS_TOKEN");
        }
        throw httpError(403, "ACCOUNT_SUSPENDED");
      },
    }),
  });
  await controller.start();

  await assert.rejects(controller.apiRequest("/leads"), (error) => {
    assert.equal(error.code, "ACCOUNT_SUSPENDED");
    return true;
  });

  assert.equal(refreshCalls, 2);
  assert.equal(operationCalls, 2);
  assert.equal(meCalls, 2);
  assert.equal(controller.getSnapshot().status, "authenticated");
  assert.equal(
    controller.getSnapshot().workspace.accountStatus,
    "suspended",
  );
});

test("feature 500/503 preserva sessão e /me 503 na reconciliação gera unavailable", async () => {
  let featureStatus = 500;
  const featureController = createAuthSessionController({
    client: createClient({
      me: async () => identity({ accountStatus: "active" }),
      request: async () => {
        throw httpError(
          featureStatus,
          featureStatus === 503
            ? "FEATURE_TEMPORARILY_UNAVAILABLE"
            : "INTERNAL_ERROR",
        );
      },
    }),
  });
  await featureController.start();
  await assert.rejects(featureController.apiRequest("/leads"));
  assert.equal(featureController.getSnapshot().status, "authenticated");
  featureStatus = 503;
  await assert.rejects(featureController.apiRequest("/leads"));
  assert.equal(featureController.getSnapshot().status, "authenticated");

  let meCalls = 0;
  const authController = createAuthSessionController({
    client: createClient({
      me: async () => {
        meCalls += 1;
        if (meCalls === 1) {
          return identity({ accountStatus: "active" });
        }
        throw httpError(503, "AUTH_TEMPORARILY_UNAVAILABLE");
      },
      request: async () => {
        throw httpError(403, "ACCOUNT_PENDING");
      },
    }),
  });
  await authController.start();
  await assert.rejects(authController.apiRequest("/leads"));
  assert.equal(authController.getSnapshot().status, "unavailable");
});

test("reconciliação ignora /me de token antigo e relê com a revisão atual", async () => {
  let refreshCalls = 0;
  let meCalls = 0;
  const oldMeGate = deferred();
  const oldMeStarted = deferred();
  const controller = createAuthSessionController({
    client: createClient({
      refresh: async () => session(`token-${++refreshCalls}`),
      me: async (token) => {
        meCalls += 1;
        if (meCalls === 2) {
          oldMeStarted.resolve();
          return oldMeGate.promise;
        }
        return identity({
          accountStatus: token === "token-2" ? "suspended" : "active",
        });
      },
      request: async (path, options) => {
        if (path === "/blocked") {
          throw httpError(403, "ACCOUNT_SUSPENDED");
        }
        if (options.accessToken === "token-1") {
          throw httpError(401, "INVALID_ACCESS_TOKEN");
        }
        return { ok: true };
      },
    }),
  });
  await controller.start();

  const blocked = controller.apiRequest("/blocked");
  await oldMeStarted.promise;
  await controller.apiRequest("/rotate");
  oldMeGate.resolve(identity({ accountStatus: "pending" }));
  await assert.rejects(blocked);

  assert.equal(refreshCalls, 2);
  assert.equal(meCalls, 3);
  assert.equal(
    controller.getSnapshot().workspace.accountStatus,
    "suspended",
  );
});

test("refresh 503 preserva contexto anterior como unavailable", async () => {
  let refreshCalls = 0;
  const controller = createAuthSessionController({
    client: createClient({
      refresh: async () => {
        refreshCalls += 1;
        if (refreshCalls === 1) {
          return session("token-a");
        }
        throw httpError(503, "AUTH_TEMPORARILY_UNAVAILABLE");
      },
      request: async () => {
        throw httpError(401, "INVALID_ACCESS_TOKEN");
      },
    }),
  });
  await controller.start();
  const previous = controller.getSnapshot();

  await assert.rejects(controller.apiRequest("/leads"));
  const unavailable = controller.getSnapshot();
  assert.equal(unavailable.status, "unavailable");
  assert.deepEqual(unavailable.user, previous.user);
  assert.deepEqual(unavailable.membership, previous.membership);
  assert.deepEqual(unavailable.workspace, previous.workspace);
  await assert.rejects(controller.apiRequest("/leads"));
});

test("logout local vence refresh pendente e respeita a fila de cookie", async () => {
  let refreshCalls = 0;
  const refreshGate = deferred();
  const refreshStarted = deferred();
  const order = [];
  const controller = createAuthSessionController({
    client: createClient({
      refresh: async () => {
        refreshCalls += 1;
        if (refreshCalls === 1) {
          return session("token-a");
        }
        order.push("refresh-start");
        refreshStarted.resolve();
        const result = await refreshGate.promise;
        order.push("refresh-end");
        return result;
      },
      request: async () => {
        throw httpError(401, "INVALID_ACCESS_TOKEN");
      },
      logout: async () => {
        order.push("logout");
      },
    }),
  });
  await controller.start();

  const request = controller.apiRequest("/leads").catch(() => undefined);
  await refreshStarted.promise;
  const logout = controller.logout();
  assert.equal(controller.getSnapshot().status, "anonymous");
  refreshGate.resolve(session("token-b"));
  await Promise.all([request, logout]);

  assert.deepEqual(order, ["refresh-start", "refresh-end", "logout"]);
  assert.equal(controller.getSnapshot().status, "anonymous");
});

test("login mais novo não é sobrescrito pelo bootstrap antigo", async () => {
  const bootstrapGate = deferred();
  const controller = createAuthSessionController({
    client: createClient({
      refresh: async () => bootstrapGate.promise,
      login: async () => session("login-token", 1200),
      me: async (token) =>
        identity({ accountStatus: token === "login-token" ? "active" : "pending" }),
    }),
  });

  const bootstrap = controller.start();
  const login = controller.login("maria@example.com", "password");
  bootstrapGate.resolve(session("bootstrap-token"));
  await Promise.allSettled([bootstrap, login]);

  assert.equal(controller.getSnapshot().status, "authenticated");
  assert.equal(controller.getSnapshot().workspace.accountStatus, "active");
});

test("resposta /me do token A não sobrescreve contexto do token B", async () => {
  let refreshCalls = 0;
  let meCalls = 0;
  const oldMeGate = deferred();
  const controller = createAuthSessionController({
    client: createClient({
      refresh: async () => session(`token-${++refreshCalls}`),
      me: async (token) => {
        meCalls += 1;
        if (meCalls === 2) {
          return oldMeGate.promise;
        }
        return identity({
          accountStatus: token === "token-2" ? "active" : "pending",
        });
      },
      request: async (_path, options) => {
        if (options.accessToken === "token-1") {
          throw httpError(401, "INVALID_ACCESS_TOKEN");
        }
        return { ok: true };
      },
    }),
  });
  await controller.start();

  const oldReload = controller.reloadMe();
  await Promise.resolve();
  await controller.apiRequest("/leads");
  await controller.reloadMe();
  oldMeGate.resolve(identity({ accountStatus: "suspended" }));
  await oldReload;

  assert.equal(controller.getSnapshot().workspace.accountStatus, "active");
});

test("resposta operacional 200 sobrevive à rotação na mesma epoch", async () => {
  const requestAGate = deferred();
  const requestAStarted = deferred();
  let refreshCalls = 0;
  const controller = createAuthSessionController({
    client: createClient({
      refresh: async () => session(`token-${++refreshCalls}`),
      request: async (path, options) => {
        if (path === "/request-a") {
          requestAStarted.resolve();
          return requestAGate.promise;
        }
        if (options.accessToken === "token-1") {
          throw httpError(401, "INVALID_ACCESS_TOKEN");
        }
        return { request: "b", token: options.accessToken };
      },
    }),
  });
  await controller.start();

  const requestA = controller.apiRequest("/request-a");
  await requestAStarted.promise;
  assert.deepEqual(await controller.apiRequest("/request-b"), {
    request: "b",
    token: "token-2",
  });
  requestAGate.resolve({ request: "a" });

  assert.deepEqual(await requestA, { request: "a" });
  assert.equal(refreshCalls, 2);
});

test("resposta operacional continua stale quando a authEpoch muda", async () => {
  const requestGate = deferred();
  const requestStarted = deferred();
  const controller = createAuthSessionController({
    client: createClient({
      request: async () => {
        requestStarted.resolve();
        return requestGate.promise;
      },
    }),
  });
  await controller.start();

  const request = controller.apiRequest("/leads");
  await requestStarted.promise;
  const logout = controller.logout();
  requestGate.resolve({ ok: true });

  await assert.rejects(request, (error) => {
    assert.equal(error.code, "STALE_AUTH_OPERATION");
    return true;
  });
  await logout;
  assert.equal(controller.getSnapshot().status, "anonymous");
});

test("operação stale na fila não inicia I/O e nova geração continua utilizável", async () => {
  const blockingRefresh = deferred();
  const refreshStarted = deferred();
  let refreshCalls = 0;
  let loginCalls = 0;
  const controller = createAuthSessionController({
    client: createClient({
      refresh: async () => {
        refreshCalls += 1;
        if (refreshCalls === 1) {
          refreshStarted.resolve();
          return blockingRefresh.promise;
        }
        return session("second-token");
      },
      login: async () => {
        loginCalls += 1;
        return session("login-token");
      },
    }),
  });

  const firstStart = controller.start();
  await refreshStarted.promise;
  const staleLogin = controller.login("maria@example.com", "password");
  controller.dispose();
  blockingRefresh.resolve(session("stale-token"));
  await Promise.allSettled([firstStart, staleLogin]);

  assert.equal(loginCalls, 0);

  await controller.start();
  assert.equal(controller.getSnapshot().status, "authenticated");
  assert.equal(refreshCalls, 2);
  assert.equal(loginCalls, 0);
});
