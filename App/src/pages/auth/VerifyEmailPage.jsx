import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createAuthHttpClient } from "../../auth/authHttpClient.js";
import { canResendVerification, decrementResendCountdown, expectAcceptedResponse, expectVerifyResponse, getInitialResendCountdown, normalizeEmail, resolveResendCountdown, sanitizeAuthError, validateVerifyForm } from "../../auth/authUiModel.js";
import { usePublicAuthConfig } from "../../auth/usePublicAuthConfig.js";
import { AuthCard, AuthShell, Field, GeneralAlert, SubmitButton } from "../../components/auth/AuthComponents.jsx";

const client = createAuthHttpClient();

export default function VerifyEmailPage() {
  const location = useLocation(); const navigate = useNavigate();
  const publicConfig = usePublicAuthConfig();
  const [values, setValues] = useState({ email: location.state?.email || "", code: "" });
  const [fieldErrors, setFieldErrors] = useState({}); const [generalError, setGeneralError] = useState(null);
  const [busy, setBusy] = useState(false); const [resendBusy, setResendBusy] = useState(false); const [countdown, setCountdown] = useState(() => getInitialResendCountdown(location.state));
  useEffect(() => { if (countdown <= 0) return undefined; const timer = setTimeout(() => setCountdown(decrementResendCountdown), 1000); return () => clearTimeout(timer); }, [countdown]);

  const submit = async (event) => {
    event.preventDefault(); if (busy) return;
    const errors = validateVerifyForm(values); setFieldErrors(errors); setGeneralError(null); if (Object.keys(errors).length) return;
    setBusy(true);
    try { expectVerifyResponse(await client.verifyEmail({ email: normalizeEmail(values.email), code: values.code })); navigate("/login", { replace: true, state: { email: normalizeEmail(values.email), message: "E-mail verificado. Entre para continuar." } }); }
    catch (error) { const safe = sanitizeAuthError(error, ["email", "code"]); setFieldErrors(safe.fieldErrors); setGeneralError(safe.message); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    if (!canResendVerification({ countdown, busy: resendBusy, email: values.email })) return; setResendBusy(true); setGeneralError(null);
    try { const result = expectAcceptedResponse(await client.resendVerification({ email: normalizeEmail(values.email) }), "verify_email"); setCountdown(resolveResendCountdown(result.retryAfterSeconds, publicConfig.config?.emailVerification?.resendCooldownSeconds)); setGeneralError(result.message); }
    catch (error) { const safe = sanitizeAuthError(error, ["email"]); setGeneralError(safe.message); if (safe.retryAfterSeconds) setCountdown(safe.retryAfterSeconds); }
    finally { setResendBusy(false); }
  };
  return <AuthShell><AuthCard title="Verifique seu e-mail" description="Digite o código de seis dígitos enviado para seu e-mail."><form onSubmit={submit} className="space-y-5"><GeneralAlert message={generalError} tone={generalError?.startsWith("Se ") ? "info" : "error"} /><Field id="verify-email" label="E-mail" type="email" autoComplete="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} error={fieldErrors.email} /><Field id="verify-code" label="Código" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={values.code} onChange={(e) => setValues({ ...values, code: e.target.value.replace(/\D/g, "").slice(0, 6) })} error={fieldErrors.code} /><SubmitButton busy={busy}>Verificar</SubmitButton><button type="button" onClick={() => void resend()} disabled={!canResendVerification({ countdown, busy: resendBusy, email: values.email })} className="min-h-11 w-full rounded-xl border border-slate-300 font-bold text-slate-700 disabled:opacity-50">{countdown > 0 ? `Reenviar em ${countdown}s` : "Reenviar código"}</button><p className="text-center text-sm"><Link to="/register" className="font-bold text-blue-700">Voltar e corrigir o e-mail</Link></p></form></AuthCard></AuthShell>;
}
