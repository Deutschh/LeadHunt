import { useState } from "react";
import { Link } from "react-router-dom";
import { createAuthHttpClient } from "../../auth/authHttpClient.js";
import { expectAcceptedResponse, normalizeEmail, sanitizeAuthError, validateForgotForm } from "../../auth/authUiModel.js";
import { AuthCard, AuthShell, Field, GeneralAlert, SubmitButton } from "../../components/auth/AuthComponents.jsx";

const client = createAuthHttpClient();
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(""); const [fieldErrors, setFieldErrors] = useState({}); const [message, setMessage] = useState(null); const [busy, setBusy] = useState(false);
  const submit = async (event) => { event.preventDefault(); if (busy) return; const errors = validateForgotForm({ email }); setFieldErrors(errors); setMessage(null); if (Object.keys(errors).length) return; setBusy(true); try { const result = expectAcceptedResponse(await client.forgotPassword({ email: normalizeEmail(email) })); setMessage(result.message); } catch (error) { const safe = sanitizeAuthError(error, ["email"]); setFieldErrors(safe.fieldErrors); setMessage(safe.message); } finally { setBusy(false); } };
  return <AuthShell><AuthCard title="Recuperar senha" description="Informe seu e-mail para receber as instruções de recuperação."><form onSubmit={submit} className="space-y-5"><GeneralAlert message={message} tone={message?.startsWith("Se ") ? "info" : "error"} /><Field id="forgot-email" label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} /><SubmitButton busy={busy}>Enviar instruções</SubmitButton><p className="text-center text-sm"><Link to="/login" className="font-bold text-blue-700">Voltar para o login</Link></p></form></AuthCard></AuthShell>;
}
