import assert from "node:assert/strict";
import test from "node:test";
import { createAccountApi } from "../src/account/accountApi.js";

test("cliente de conta usa apiRequest e envia somente payloads aprovados", async () => {
  const calls = [];
  const api = createAccountApi(async (path, options) => {
    calls.push({ path, options });
    if (path.endsWith("/profile")) {
      return { user: { name: options.data.name, email: "user@example.com" } };
    }
    return { message: "Senha alterada com sucesso. Faça login novamente." };
  });

  await api.updateProfile({ name: "  Guilherme Deutsch  " });
  await api.changePassword({
    currentPassword: "senha atual segura",
    newPassword: "nova senha bem segura",
  });
  assert.deepEqual(calls, [
    {
      path: "/account/profile",
      options: { method: "PATCH", data: { name: "Guilherme Deutsch" }, signal: undefined },
    },
    {
      path: "/account/password",
      options: {
        method: "PATCH",
        data: {
          currentPassword: "senha atual segura",
          newPassword: "nova senha bem segura",
        },
        signal: undefined,
      },
    },
  ]);
});

test("payload inválido falha antes de qualquer I/O", async () => {
  let calls = 0;
  const api = createAccountApi(async () => { calls += 1; });
  await assert.rejects(api.updateProfile({ name: "X", userId: "8" }));
  await assert.rejects(api.changePassword({
    currentPassword: "senha atual segura",
    newPassword: "senha atual segura",
  }));
  assert.equal(calls, 0);
});
