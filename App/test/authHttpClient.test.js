import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthHttpError,
  AuthProtocolError,
  createAuthHttpClient,
} from "../src/auth/authHttpClient.js";

function fakeAxios(handler) {
  const calls = [];
  return {
    calls,
    request: async (config) => {
      calls.push(config);
      return handler(config);
    },
  };
}

test("cliente adiciona Bearer da memória e encaminha AbortSignal", async () => {
  const axiosInstance = fakeAxios(async () => ({ data: { ok: true } }));
  const client = createAuthHttpClient({ axiosInstance });
  const abortController = new AbortController();

  const result = await client.request("/leads", {
    accessToken: "memory-token",
    signal: abortController.signal,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(axiosInstance.calls.length, 1);
  assert.equal(
    axiosInstance.calls[0].headers.Authorization,
    "Bearer memory-token",
  );
  assert.equal(axiosInstance.calls[0].signal, abortController.signal);
});

test("URL absoluta ou scheme-relative é rejeitada antes de receber Bearer", async () => {
  const axiosInstance = fakeAxios(async () => ({ data: {} }));
  const client = createAuthHttpClient({ axiosInstance });

  for (const path of [
    "https://evil.example/path",
    "http://evil.example/path",
    "//evil.example/path",
  ]) {
    await assert.rejects(
      async () => client.request(path, { accessToken: "sensitive-token" }),
      (error) =>
        error instanceof AuthProtocolError && error.code === "INVALID_API_PATH",
    );
  }

  assert.equal(axiosInstance.calls.length, 0);
});

test("endpoints Auth exigem métodos dedicados e não entram no cliente autenticado", async () => {
  const axiosInstance = fakeAxios(async () => ({ data: {} }));
  const client = createAuthHttpClient({ axiosInstance });

  await assert.rejects(
    async () =>
      client.request("/auth/refresh", { accessToken: "memory-token" }),
    (error) =>
      error instanceof AuthProtocolError &&
      error.code === "AUTH_ENDPOINT_REQUIRES_DEDICATED_METHOD",
  );
  assert.equal(axiosInstance.calls.length, 0);
});

test("erro Axios é reduzido ao contrato sanitizado", async () => {
  const axiosInstance = fakeAxios(async () => {
    throw {
      isAxiosError: true,
      config: {
        headers: { Authorization: "Bearer secret" },
        data: { password: "secret-password" },
      },
      response: {
        status: 403,
        data: {
          error: "Esta conta está suspensa.",
          code: "ACCOUNT_SUSPENDED",
          fieldErrors: { email: "Inválido" },
          internal: "secret detail",
        },
      },
    };
  });
  const client = createAuthHttpClient({ axiosInstance });

  await assert.rejects(
    client.request("/leads", { accessToken: "memory-token" }),
    (error) => {
      assert.equal(error instanceof AuthHttpError, true);
      assert.equal(error.status, 403);
      assert.equal(error.code, "ACCOUNT_SUSPENDED");
      assert.deepEqual(error.fieldErrors, { email: "Inválido" });
      const serialized = JSON.stringify(error);
      assert.equal(serialized.includes("secret-password"), false);
      assert.equal(serialized.includes("Bearer secret"), false);
      assert.equal(serialized.includes("secret detail"), false);
      return true;
    },
  );
});
