const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EmailProviderError,
  createResendEmailProvider,
} = require("../src/services/email/resendEmailProvider");
const {
  createVerificationEmailService,
} = require("../src/services/email/verificationEmailService");

test("Resend usa fetch e idempotency key sem SDK", async () => {
  const calls = [];
  const provider = createResendEmailProvider({
    apiKey: "secret-api-key",
    from: "LeadHunt <no-reply@example.com>",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true };
    },
  });
  const service = createVerificationEmailService({ provider });

  await service.sendVerificationEmail({
    to: "maria@example.com",
    code: "123456",
    expiresInMinutes: 10,
    idempotencyKey: "email-verification-10",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(
    calls[0].options.headers["Idempotency-Key"],
    "email-verification-10",
  );
  assert.equal(calls[0].options.method, "POST");
  const payload = JSON.parse(calls[0].options.body);
  assert.deepEqual(payload.to, ["maria@example.com"]);
  assert.match(payload.text, /123456/);
  assert.match(payload.text, /10 minutos/);
});

test("provider converte falhas externas em erro sanitizado", async () => {
  const provider = createResendEmailProvider({
    apiKey: "secret-api-key",
    from: "LeadHunt <no-reply@example.com>",
    fetchImpl: async () => ({ ok: false, status: 401 }),
  });

  await assert.rejects(
    provider.sendEmail({
      to: "maria@example.com",
      subject: "subject",
      text: "text",
      html: "html",
      idempotencyKey: "key",
    }),
    (error) => {
      assert.equal(error instanceof EmailProviderError, true);
      assert.equal(error.message.includes("401"), false);
      assert.equal(error.message.includes("secret-api-key"), false);
      return true;
    },
  );
});
