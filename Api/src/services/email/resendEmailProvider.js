class EmailProviderError extends Error {
  constructor() {
    super("Falha no provider de e-mail.");
    this.name = "EmailProviderError";
  }
}

function createResendEmailProvider({ apiKey, from, fetchImpl = global.fetch }) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch não está disponível para o provider de e-mail.");
  }

  async function sendEmail({ to, subject, text, html, idempotencyKey }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
          html,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new EmailProviderError();
      }
    } catch (error) {
      if (error instanceof EmailProviderError) {
        throw error;
      }

      throw new EmailProviderError();
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({ sendEmail });
}

module.exports = {
  EmailProviderError,
  createResendEmailProvider,
};
