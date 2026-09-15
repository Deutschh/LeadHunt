import assert from "node:assert/strict";
import test from "node:test";
import { AdminApiError } from "../src/admin/adminApi.js";
import { createAdminController } from "../src/admin/adminController.js";
import { AuthHttpError } from "../src/auth/authHttpClient.js";
import { createAuthSessionController } from "../src/auth/authSessionController.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createApi(overrides = {}) {
  return {
    checkAdminAccess: async () => ({ admin: true }),
    listWorkspaces: async (filters) => ({ filters }),
    getWorkspaceDetails: async (workspaceId) => ({ workspaceId }),
    getWorkspaceAudit: async (workspaceId, pagination) => ({
      workspaceId,
      pagination,
    }),
    activateWorkspace: async () => ({}),
    suspendWorkspace: async () => ({}),
    reactivateWorkspace: async () => ({}),
    updateMaxProfiles: async () => ({}),
    updateReleaseChannel: async () => ({}),
    ...overrides,
  };
}

function httpError(status, code) {
  return new AdminApiError({ status, code, message: code });
}

test("ADMIN_ACCESS_DENIED rebaixa, cancela e limpa todos os recursos", async () => {
  const pendingList = deferred();
  let listCalls = 0;
  let listSignal;
  const controller = createAdminController({
    api: createApi({
      listWorkspaces: async (_filters, options) => {
        listCalls += 1;
        if (listCalls === 1) return { workspaces: ["persistido"] };
        listSignal = options.signal;
        return pendingList.promise;
      },
      updateReleaseChannel: async () => {
        throw httpError(403, "ADMIN_ACCESS_DENIED");
      },
    }),
  });
  await controller.startSession(1);
  await controller.loadWorkspaces();
  await controller.loadWorkspaceDetails("22");
  await controller.loadWorkspaceAudit("22");
  const lateList = controller.loadWorkspaces({ page: 2 }).catch((error) => error);

  await assert.rejects(
    controller.updateReleaseChannel("22", {}),
    (error) => error.code === "ADMIN_ACCESS_DENIED",
  );
  assert.equal(listSignal.aborted, true);
  assert.deepEqual(controller.getSnapshot(), {
    accessStatus: "notAdmin",
    accessError: null,
    filters: { page: 1, pageSize: 25 },
    workspaces: { status: "idle", data: null, error: null },
    selectedWorkspaceId: null,
    details: { status: "idle", data: null, error: null },
    auditPagination: { page: 1, pageSize: 25 },
    audit: { status: "idle", data: null, error: null },
  });
  pendingList.resolve({ workspaces: ["stale"] });
  assert.equal((await lateList).code, "STALE_ADMIN_OPERATION");
  assert.equal(controller.getSnapshot().workspaces.data, null);
});

test("outro 403 é erro normal e preserva estado Admin e dados", async () => {
  const controller = createAdminController({
    api: createApi({
      updateMaxProfiles: async () => {
        throw httpError(403, "FUTURE_ADMIN_POLICY");
      },
    }),
  });
  await controller.startSession(2);
  await controller.loadWorkspaces({ status: "active" });
  const before = controller.getSnapshot().workspaces.data;
  await assert.rejects(
    controller.updateMaxProfiles("22", {}),
    (error) => error.code === "FUTURE_ADMIN_POLICY",
  );
  assert.equal(controller.getSnapshot().accessStatus, "admin");
  assert.equal(controller.getSnapshot().workspaces.data, before);
});

test("logout A e login B descartam respostas da sessão anterior", async () => {
  const accessA = deferred();
  const accessB = deferred();
  const listA = deferred();
  let accessCalls = 0;
  const controller = createAdminController({
    api: createApi({
      checkAdminAccess: async () => (++accessCalls === 1 ? accessA.promise : accessB.promise),
      listWorkspaces: async () => listA.promise,
    }),
  });

  const startA = controller.startSession(10).catch((error) => error);
  controller.endSession();
  const startB = controller.startSession(11);
  accessB.resolve({ admin: true });
  await startB;
  accessA.resolve({ admin: true });
  assert.equal((await startA).code, "STALE_ADMIN_OPERATION");
  assert.equal(controller.getSnapshot().accessStatus, "admin");

  const staleList = controller.loadWorkspaces().catch((error) => error);
  controller.endSession();
  await controller.startSession(12);
  listA.resolve({ workspaces: ["A"] });
  assert.equal((await staleList).code, "STALE_ADMIN_OPERATION");
  assert.equal(controller.getSnapshot().workspaces.data, null);
});

test("negação tardia da sessão A não revoga o Admin da sessão B", async () => {
  const deniedA = deferred();
  const controller = createAdminController({
    api: createApi({ listWorkspaces: async () => deniedA.promise }),
  });
  await controller.startSession(13);
  const staleRequest = controller.loadWorkspaces().catch((error) => error);

  controller.endSession();
  await controller.startSession(14);
  deniedA.reject(httpError(403, "ADMIN_ACCESS_DENIED"));

  assert.equal((await staleRequest).code, "STALE_ADMIN_OPERATION");
  assert.equal(controller.getSnapshot().accessStatus, "admin");
});

test("filtros e workspace selecionado usam sempre a geração mais recente", async () => {
  const listA = deferred();
  const listB = deferred();
  const detailsA = deferred();
  const detailsB = deferred();
  let listCalls = 0;
  const controller = createAdminController({
    api: createApi({
      listWorkspaces: async () => (++listCalls === 1 ? listA.promise : listB.promise),
      getWorkspaceDetails: async (id) => (id === "22" ? detailsA.promise : detailsB.promise),
    }),
  });
  await controller.startSession(20);

  const oldList = controller.loadWorkspaces({ page: 1 }).catch((error) => error);
  const newList = controller.loadWorkspaces({ page: 2 });
  listB.resolve({ page: 2 });
  await newList;
  listA.resolve({ page: 1 });
  assert.equal((await oldList).code, "STALE_ADMIN_OPERATION");
  assert.deepEqual(controller.getSnapshot().workspaces.data, { page: 2 });

  const oldDetails = controller.loadWorkspaceDetails("22").catch((error) => error);
  const newDetails = controller.loadWorkspaceDetails("23");
  detailsB.resolve({ workspaceId: "23" });
  await newDetails;
  detailsA.resolve({ workspaceId: "22" });
  assert.equal((await oldDetails).code, "STALE_ADMIN_OPERATION");
  assert.equal(controller.getSnapshot().selectedWorkspaceId, "23");
  assert.equal(controller.getSnapshot().details.data.workspaceId, "23");
});

test("403 diferente durante /admin/me produz error, não notAdmin", async () => {
  const controller = createAdminController({
    api: createApi({
      checkAdminAccess: async () => {
        throw httpError(403, "FUTURE_ADMIN_POLICY");
      },
    }),
  });
  await assert.rejects(controller.startSession(30));
  assert.equal(controller.getSnapshot().accessStatus, "error");
  assert.equal(controller.getSnapshot().accessError.code, "FUTURE_ADMIN_POLICY");
});

test("refresh normal preserva sessionVersion, estado Admin e conclusão atual", async () => {
  let refreshCalls = 0;
  const auth = createAuthSessionController({
    client: {
      refresh: async () => ({
        accessToken: `token-${++refreshCalls}`,
        tokenType: "Bearer",
        expiresIn: 900,
      }),
      login: async () => undefined,
      logout: async () => undefined,
      me: async () => ({
        user: { name: "Admin", email: "admin@example.com" },
        membership: { role: "member" },
        workspace: {
          name: "Conta suspensa",
          accountStatus: "suspended",
          isActive: false,
          timezone: "America/Sao_Paulo",
          releaseChannel: "stable",
          minProfiles: 2,
          maxProfiles: 2,
        },
      }),
      request: async (path, options) => {
        if (path === "/admin/me") return { admin: true };
        if (options.accessToken === "token-1") {
          throw new AuthHttpError({
            status: 401,
            code: "INVALID_ACCESS_TOKEN",
            message: "Sessão expirada.",
          });
        }
        return { page: 1, token: options.accessToken };
      },
    },
  });
  await auth.start();
  const sessionVersion = auth.getSnapshot().sessionVersion;
  const controller = createAdminController({
    api: createApi({
      checkAdminAccess: (options) => auth.apiRequest("/admin/me", options),
      listWorkspaces: (_filters, options) =>
        auth.apiRequest("/admin/workspaces", options),
    }),
  });

  await controller.startSession(sessionVersion);
  const result = await controller.loadWorkspaces();

  assert.deepEqual(result, { page: 1, token: "token-2" });
  assert.equal(auth.getSnapshot().sessionVersion, sessionVersion);
  assert.equal(controller.getSnapshot().accessStatus, "admin");
  assert.equal(controller.getSnapshot().workspaces.status, "ready");
});
