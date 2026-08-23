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

test("public-config usa transporte dedicado sem credenciais e métodos Auth preservam contratos", async () => {
  const authenticated = fakeAxios(async () => ({ data: { ok: true } }));
  const publicTransport = fakeAxios(async () => ({ data: { registration: {} } }));
  const client = createAuthHttpClient({
    axiosInstance: authenticated,
    publicAxiosInstance: publicTransport,
  });

  await client.getPublicConfig();
  await client.register({ email: "user@example.com" });
  await client.verifyEmail({ email: "user@example.com", code: "123456" });
  await client.resendVerification({ email: "user@example.com" });
  await client.forgotPassword({ email: "user@example.com" });
  await client.resetPassword({ token: "opaque", password: "new-password" });

  assert.equal(publicTransport.calls.length, 1);
  assert.equal(publicTransport.calls[0].url, "/auth/public-config");
  assert.equal(publicTransport.calls[0].headers.Authorization, undefined);
  assert.equal(authenticated.calls.length, 5);
  assert.deepEqual(
    authenticated.calls.map((call) => call.url),
    [
      "/auth/register",
      "/auth/email/verify",
      "/auth/email/resend",
      "/auth/password/forgot",
      "/auth/password/reset",
    ],
  );
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
        headers: { "retry-after": "60" },
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
      assert.equal(error.retryAfterSeconds, 60);
      const serialized = JSON.stringify(error);
      assert.equal(serialized.includes("secret-password"), false);
      assert.equal(serialized.includes("Bearer secret"), false);
      assert.equal(serialized.includes("secret detail"), false);
      return true;
    },
  );
});
