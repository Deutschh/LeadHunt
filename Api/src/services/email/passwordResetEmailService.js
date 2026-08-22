function createPasswordResetEmailService({ provider, passwordResetUrl }) {
  async function sendPasswordResetEmail({
    to,
    token,
    expiresInMinutes,
    idempotencyKey,
  }) {
    if (provider.available === false) {
      await provider.sendEmail();
      return;
    }

    const resetUrl = new URL(passwordResetUrl);
    resetUrl.searchParams.set("token", token);
    const link = resetUrl.toString();
    const htmlLink = link.replaceAll("&", "&amp;");
    const subject = "Redefina sua senha do LeadHunt";
    const text = [
      "Use o link abaixo para redefinir sua senha do LeadHunt:",
      "",
      link,
      "",
      `O link expira em ${expiresInMinutes} minutos.`,
      "Se você não solicitou esta alteração, ignore esta mensagem.",
    ].join("\n");
    const html = [
      "<p>Use o link abaixo para redefinir sua senha do LeadHunt:</p>",
      `<p><a href="${htmlLink}">Redefinir senha</a></p>`,
      `<p>O link expira em ${expiresInMinutes} minutos.</p>`,
      "<p>Se você não solicitou esta alteração, ignore esta mensagem.</p>",
    ].join("");

    await provider.sendEmail({
      to,
      subject,
      text,
      html,
      idempotencyKey,
    });
  }

  return Object.freeze({ sendPasswordResetEmail });
}

module.exports = { createPasswordResetEmailService };
