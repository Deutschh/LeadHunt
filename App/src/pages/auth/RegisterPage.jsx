import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createAuthHttpClient } from "../../auth/authHttpClient.js";
import { createVerificationNavigationState, expectAcceptedResponse, normalizeEmail, resetLegalConsentsForError, sanitizeAuthError, validateRegisterForm } from "../../auth/authUiModel.js";
import { usePublicAuthConfig } from "../../auth/usePublicAuthConfig.js";
import { AuthCard, AuthShell, Field, GeneralAlert, PasswordField, SubmitButton } from "../../components/auth/AuthComponents.jsx";

const client = createAuthHttpClient();

export default function RegisterPage() {
  const navigate = useNavigate();
  const publicConfig = usePublicAuthConfig();
  const [values, setValues] = useState({ name: "", email: "", password: "", passwordConfirmation: "", termsAccepted: false, privacyPolicyAccepted: false });
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState(null);
  const [busy, setBusy] = useState(false);
  const registration = publicConfig.config?.registration;
  const enabled = publicConfig.status === "ready" && registration?.available === true;

  const submit = async (event) => {
    event.preventDefault();
    if (busy || !enabled) return;
    const errors = validateRegisterForm(values);
    setFieldErrors(errors); setGeneralError(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      expectAcceptedResponse(await client.register({ name: values.name.trim(), email: normalizeEmail(values.email), password: values.password, termsAccepted: true, termsVersion: registration.terms.version, privacyPolicyAccepted: true, privacyPolicyVersion: registration.privacyPolicy.version }), "verify_email");
      navigate("/verify-email", {
        replace: true,
        state: createVerificationNavigationState(
          normalizeEmail(values.email),
          publicConfig.config.emailVerification.resendCooldownSeconds,
        ),
      });
    } catch (error) {
      const safe = sanitizeAuthError(error, ["name", "email", "password", "termsAccepted", "privacyPolicyAccepted"]);
      setFieldErrors(safe.fieldErrors); setGeneralError(safe.message);
      if (safe.code === "LEGAL_VERSION_MISMATCH") {
        setValues((current) =>
          resetLegalConsentsForError(current, safe.code),
        );
        publicConfig.retry();
      }
    } finally { setBusy(false); }
  };

  const update = (field, value) => setValues((current) => ({ ...current, [field]: value }));
  return <AuthShell><AuthCard title="Criar conta" description="Preencha seus dados para iniciar o cadastro."><form onSubmit={submit} className="space-y-5"><GeneralAlert message={!enabled && publicConfig.status !== "loading" ? "O cadastro está temporariamente indisponível porque os documentos legais não puderam ser carregados." : generalError} /><Field id="register-name" label="Nome" autoComplete="name" value={values.name} onChange={(e) => update("name", e.target.value)} error={fieldErrors.name} /><Field id="register-email" label="E-mail" type="email" autoComplete="email" value={values.email} onChange={(e) => update("email", e.target.value)} error={fieldErrors.email} /><PasswordField id="register-password" label="Senha" autoComplete="new-password" value={values.password} onChange={(e) => update("password", e.target.value)} error={fieldErrors.password} /><PasswordField id="register-confirm" label="Confirmar senha" autoComplete="new-password" value={values.passwordConfirmation} onChange={(e) => update("passwordConfirmation", e.target.value)} error={fieldErrors.passwordConfirmation} />
  <label className="flex gap-3 text-sm text-slate-700"><input type="checkbox" checked={values.termsAccepted} onChange={(e) => update("termsAccepted", e.target.checked)} /> <span>Aceito os {registration?.terms?.url ? <a href={registration.terms.url} target="_blank" rel="noreferrer" className="font-bold text-blue-700">Termos</a> : "Termos"}.</span></label>{fieldErrors.termsAccepted && <p className="text-sm text-red-600">{fieldErrors.termsAccepted}</p>}
  <label className="flex gap-3 text-sm text-slate-700"><input type="checkbox" checked={values.privacyPolicyAccepted} onChange={(e) => update("privacyPolicyAccepted", e.target.checked)} /> <span>Aceito a {registration?.privacyPolicy?.url ? <a href={registration.privacyPolicy.url} target="_blank" rel="noreferrer" className="font-bold text-blue-700">Política de Privacidade</a> : "Política de Privacidade"}.</span></label>{fieldErrors.privacyPolicyAccepted && <p className="text-sm text-red-600">{fieldErrors.privacyPolicyAccepted}</p>}
  <SubmitButton busy={busy} disabled={!enabled}>Criar conta</SubmitButton><p className="text-center text-sm text-slate-600">Já possui conta? <Link className="font-bold text-blue-700" to="/login">Entrar</Link></p></form></AuthCard></AuthShell>;
}
