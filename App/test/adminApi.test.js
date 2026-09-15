import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminApiError,
  createAdminApi,
  isAdminAccessDenied,
} from "../src/admin/adminApi.js";

const NOW = "2026-09-15T12:00:00.000Z";

function apiWith(handler) {
  const calls = [];
  const api = createAdminApi(async (path, options) => {
    calls.push({ path, options });
    return handler(path, options);
  });
  return { api, calls };
}

function statusResponse(accountStatus = "active") {
  return {
    workspace: { workspaceId: "22", accountStatus, activatedAt: NOW },
  };
}

test("cliente usa somente apiRequest e monta filtros allowlisted", async () => {
  const { api, calls } = apiWith((path) => {
    if (path === "/admin/me") return { admin: true };
    return {
      workspaces: [],
      pagination: { page: 2, pageSize: 100, totalItems: 0, totalPages: 0 },
    };
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await api.checkAdminAccess({ signal }), { admin: true });
  await api.listWorkspaces(
    { page: 2, pageSize: 100, status: "active", search: "A&B" },
    { signal },
  );
  assert.equal(calls[0].path, "/admin/me");
  assert.equal(calls[0].options.signal, signal);
  assert.equal(
    calls[1].path,
    "/admin/workspaces?page=2&pageSize=100&status=active&search=A%26B",
  );
  assert.equal(JSON.stringify(calls).includes("Authorization"), false);
});

test("mutações enviam somente os payloads explícitos aprovados", async () => {
  const { api, calls } = apiWith((path) => {
    if (path.endsWith("/max-profiles")) {
      return { workspace: { workspaceId: "22", minProfiles: 2, maxProfiles: 4 } };
    }
    if (path.endsWith("/release-channel")) {
      return { workspace: { workspaceId: "22", releaseChannel: "canary" } };
    }
    return statusResponse(path.endsWith("/suspend") ? "suspended" : "active");
  });

  await api.activateWorkspace("22", { reason: "  Ativar\r\nconta  " });
  await api.suspendWorkspace("22", { reason: "Suspender" });
  await api.reactivateWorkspace("22", { reason: "Reativar" });
  await api.updateMaxProfiles("22", {
    maxProfiles: 4,
    expectedMaxProfiles: 2,
    reason: "Ajustar",
  });
  await api.updateReleaseChannel("22", {
    releaseChannel: "canary",
    expectedReleaseChannel: "stable",
    reason: "Liberar",
  });

  assert.deepEqual(
    calls.map(({ path, options }) => [path, options.method, options.data]),
    [
      ["/admin/workspaces/22/activate", "POST", { reason: "Ativar\nconta" }],
      ["/admin/workspaces/22/suspend", "POST", { reason: "Suspender" }],
      ["/admin/workspaces/22/reactivate", "POST", { reason: "Reativar" }],
      [
        "/admin/workspaces/22/max-profiles",
        "PATCH",
        { maxProfiles: 4, expectedMaxProfiles: 2, reason: "Ajustar" },
      ],
      [
        "/admin/workspaces/22/release-channel",
        "PATCH",
        {
          releaseChannel: "canary",
          expectedReleaseChannel: "stable",
          reason: "Liberar",
        },
      ],
    ],
  );
  assert.equal(
    JSON.stringify(calls).includes("actor_user_id") ||
      JSON.stringify(calls).includes("is_admin"),
    false,
  );
});

test("cada mutação de status exige seu estado final específico", async () => {
  const cases = [
    { method: "activateWorkspace", valid: "active", invalid: ["suspended", "pending"] },
    { method: "suspendWorkspace", valid: "suspended", invalid: ["active", "pending"] },
    { method: "reactivateWorkspace", valid: "active", invalid: ["suspended", "pending"] },
  ];

  for (const item of cases) {
    const validApi = apiWith(() => statusResponse(item.valid)).api;
    const result = await validApi[item.method]("22", { reason: "Teste" });
    assert.equal(result.workspace.workspaceId, "22");
    assert.equal(result.workspace.accountStatus, item.valid);
    assert.equal(result.workspace.activatedAt, NOW);

    for (const invalidStatus of item.invalid) {
      const invalidApi = apiWith(() => statusResponse(invalidStatus)).api;
      await assert.rejects(
        invalidApi[item.method]("22", { reason: "Teste" }),
        (error) => error.code === "INVALID_ADMIN_RESPONSE",
      );
    }
  }
});

test("reason com controle C1 falha antes de chamar apiRequest", async () => {
  const { api, calls } = apiWith(() => statusResponse("active"));
  for (const character of ["\u0080", "\u0085", "\u009f"]) {
    await assert.rejects(
      api.activateWorkspace("22", { reason: `Antes${character}depois` }),
      (error) => error.code === "VALIDATION_ERROR",
    );
  }
  assert.equal(calls.length, 0);
});

test("IDs e contratos divergentes falham antes de produzir resposta útil", async () => {
  const { api, calls } = apiWith(() => ({
    workspaceId: "23",
    workspaceName: "Conta",
    accountStatus: "active",
    isActive: true,
    releaseChannel: "stable",
    minProfiles: 2,
    maxProfiles: 2,
    createdAt: NOW,
    activatedAt: NOW,
    timezone: "UTC",
    updatedAt: NOW,
    members: [],
  }));
  await assert.rejects(api.getWorkspaceDetails("22"), (error) => {
    assert.equal(error.code, "INVALID_ADMIN_RESPONSE");
    return true;
  });
  await assert.rejects(api.getWorkspaceDetails("9223372036854775808"), (error) => {
    assert.equal(error.code, "VALIDATION_ERROR");
    return true;
  });
  assert.equal(calls.length, 1);
});

test("somente 403 ADMIN_ACCESS_DENIED é classificado como revogação", async () => {
  for (const item of [
    { status: 403, code: "ADMIN_ACCESS_DENIED", denied: true },
    { status: 403, code: "FUTURE_ADMIN_POLICY", denied: false },
    { status: 409, code: "ADMIN_WORKSPACE_STATUS_CONFLICT", denied: false },
    { status: 409, code: "ADMIN_WORKSPACE_MAX_PROFILES_CONFLICT", denied: false },
    { status: 409, code: "ADMIN_WORKSPACE_RELEASE_CHANNEL_CONFLICT", denied: false },
  ]) {
    const { api } = apiWith(() => {
      throw Object.assign(new Error("Erro sanitizado"), item);
    });
    await assert.rejects(api.checkAdminAccess(), (error) => {
      assert.equal(error instanceof AdminApiError, true);
      assert.equal(error.code, item.code);
      assert.equal(isAdminAccessDenied(error), item.denied);
      return true;
    });
  }
});

test("erros HTTP preservam códigos distintos sem retry silencioso", async () => {
  for (const item of [
    { status: 400, code: "VALIDATION_ERROR" },
    { status: 401, code: "INVALID_ACCESS_TOKEN" },
    { status: 403, code: "ADMIN_ACCESS_DENIED" },
    { status: 404, code: "NOT_FOUND" },
    { status: 409, code: "ADMIN_WORKSPACE_STATUS_CONFLICT" },
    { status: 409, code: "ADMIN_WORKSPACE_MAX_PROFILES_CONFLICT" },
    { status: 409, code: "ADMIN_WORKSPACE_RELEASE_CHANNEL_CONFLICT" },
    { status: 500, code: "INTERNAL_ERROR" },
  ]) {
    let calls = 0;
    const { api } = apiWith(() => {
      calls += 1;
      throw Object.assign(new Error("Erro sanitizado"), item);
    });
    await assert.rejects(api.checkAdminAccess(), (error) => {
      assert.equal(error.status, item.status);
      assert.equal(error.code, item.code);
      return true;
    });
    assert.equal(calls, 1);
  }
});
