function createVerificationEmailService({ provider }) {
  async function sendVerificationEmail({
    to,
    code,
    expiresInMinutes,
    idempotencyKey,
  }) {
    const subject = "Confirme seu e-mail no LeadHunt";
    const text = [
      "Use o código abaixo para confirmar seu e-mail no LeadHunt:",
      "",
      code,
      "",
      `O código expira em ${expiresInMinutes} minutos.`,
      "Se você não iniciou este cadastro, ignore esta mensagem.",
    ].join("\n");
    const html = [
      "<p>Use o código abaixo para confirmar seu e-mail no LeadHunt:</p>",
      `<p><strong>${code}</strong></p>`,
      `<p>O código expira em ${expiresInMinutes} minutos.</p>`,
      "<p>Se você não iniciou este cadastro, ignore esta mensagem.</p>",
    ].join("");

    await provider.sendEmail({
      to,
      subject,
      text,
      html,
      idempotencyKey,
    });
  }

  return Object.freeze({ sendVerificationEmail });
}

module.exports = { createVerificationEmailService };
