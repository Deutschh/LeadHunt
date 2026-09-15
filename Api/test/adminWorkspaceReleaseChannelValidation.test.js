const assert = require("node:assert/strict");
const test = require("node:test");
const {
  RELEASE_CHANNELS,
  validateAdminWorkspaceReleaseChannelBody,
} = require("../src/validation/adminWorkspaceReleaseChannelValidation");

test("aceita exatamente os quatro canais e normaliza somente reason", () => {
  for (const releaseChannel of RELEASE_CHANNELS) {
    const result = validateAdminWorkspaceReleaseChannelBody({
      releaseChannel,
      expectedReleaseChannel: "stable",
      reason: "  Linha 1\r\nLinha 2  ",
    });
    assert.deepEqual(result.value, {
      releaseChannel,
      expectedReleaseChannel: "stable",
      reason: "Linha 1\nLinha 2",
    });
  }
});

test("rejeita capitalização, vazio, desconhecido e tipos incorretos", () => {
  for (const value of ["Stable", "CANARY", "", " stable ", "preview", null, 1, true]) {
    const desired = validateAdminWorkspaceReleaseChannelBody({
      releaseChannel: value,
      expectedReleaseChannel: "stable",
      reason: "Justificativa",
    });
    assert.ok(desired.error?.fieldErrors?.releaseChannel, String(value));

    const expected = validateAdminWorkspaceReleaseChannelBody({
      releaseChannel: "canary",
      expectedReleaseChannel: value,
      reason: "Justificativa",
    });
    assert.ok(expected.error?.fieldErrors?.expectedReleaseChannel, String(value));
  }
});

test("rejeita ausências, reason inválida e propriedades extras/especiais", () => {
  for (const body of [
    undefined,
    null,
    [],
    {},
    { releaseChannel: "canary", expectedReleaseChannel: "stable" },
    { releaseChannel: "canary", reason: "A" },
    { expectedReleaseChannel: "stable", reason: "A" },
    { releaseChannel: "canary", expectedReleaseChannel: "stable", reason: " " },
    {
      releaseChannel: "canary",
      expectedReleaseChannel: "stable",
      reason: "😀".repeat(501),
    },
  ]) {
    assert.equal(
      validateAdminWorkspaceReleaseChannelBody(body).error?.code,
      "VALIDATION_ERROR",
    );
  }

  for (const field of [
    "actor_user_id",
    "account_status",
    "workspaceId",
    "__proto__",
    "constructor",
    "toString",
  ]) {
    const body = JSON.parse(
      `{"releaseChannel":"canary","expectedReleaseChannel":"stable","reason":"A","${field}":"x"}`,
    );
    const result = validateAdminWorkspaceReleaseChannelBody(body);
    assert.equal(result.error?.fieldErrors?.[field], "unknown_field", field);
  }
});
