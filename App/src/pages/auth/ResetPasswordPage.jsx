import { useLayoutEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createAuthHttpClient } from "../../auth/authHttpClient.js";
import { captureResetToken, expectAcceptedResponse, sanitizeAuthError, validateResetForm } from "../../auth/authUiModel.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { AuthCard, AuthShell, GeneralAlert, PasswordField, SubmitButton } from "../../components/auth/AuthComponents.jsx";

const client = createAuthHttpClient();
export default function ResetPasswordPage() {
  const auth = useAuth(); const navigate = useNavigate();
  const [capture] = useState(() => captureResetToken(window.location.search));
  const [values, setValues] = useState({ password: "", passwordConfirmation: "" }); const [fieldErrors, setFieldErrors] = useState({}); const [generalError, setGeneralError] = useState(null); const [busy, setBusy] = useState(false);
  useLayoutEffect(() => { const url = new URL(window.location.href); url.searchParams.delete("token"); window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`); }, []);
  const submit = async (event) => { event.preventDefault(); if (busy || !capture.token) return; const errors = validateResetForm(values); setFieldErrors(errors); setGeneralError(null); if (Object.keys(errors).length) return; setBusy(true); try { const result = expectAcceptedResponse(await client.resetPassword({ token: capture.token, password: values.password })); if (auth.status === "authenticated") { try { await auth.logout(); } catch { /* logout local permanece definitivo */ } } navigate("/login", { replace: true, state: { message: result.message } }); } catch (error) { const safe = sanitizeAuthError(error, ["password"]); setFieldErrors(safe.fieldErrors); setGeneralError(safe.message); } finally { setBusy(false); } };
  return <AuthShell><AuthCard title="Redefinir senha" description="Crie uma nova senha para sua conta."><form onSubmit={submit} className="space-y-5"><GeneralAlert message={!capture.token ? "Este link de recuperação é inválido ou está incompleto." : generalError} /><PasswordField id="reset-password" label="Nova senha" autoComplete="new-password" value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} error={fieldErrors.password} /><PasswordField id="reset-confirm" label="Confirmar nova senha" autoComplete="new-password" value={values.passwordConfirmation} onChange={(e) => setValues({ ...values, passwordConfirmation: e.target.value })} error={fieldErrors.passwordConfirmation} /><SubmitButton busy={busy} disabled={!capture.token}>Redefinir senha</SubmitButton><p className="text-center text-sm"><Link to="/login" className="font-bold text-blue-700">Voltar para o login</Link></p></form></AuthCard></AuthShell>;
}
