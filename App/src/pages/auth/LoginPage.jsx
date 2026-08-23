import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { getAccountDestination, sanitizeReturnTo } from "../../auth/authFlow.js";
import { normalizeEmail, sanitizeAuthError, validateLoginForm } from "../../auth/authUiModel.js";
import { AuthCard, AuthShell, Field, GeneralAlert, PasswordField, SubmitButton } from "../../components/auth/AuthComponents.jsx";

export default function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: location.state?.email || "", password: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState(null);
  const [busy, setBusy] = useState(false);
  const notice = typeof location.state?.message === "string" ? location.state.message : null;

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const errors = validateLoginForm(values);
    setFieldErrors(errors);
    setGeneralError(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const identity = await auth.login(normalizeEmail(values.email), values.password);
      if (!identity) return;
      navigate(getAccountDestination({ status: "authenticated", workspace: identity.workspace }, sanitizeReturnTo(location.state?.returnTo)), { replace: true });
    } catch (error) {
      const safe = sanitizeAuthError(error, ["email", "password"]);
      setFieldErrors(safe.fieldErrors);
      setGeneralError(safe.code === "INVALID_CREDENTIALS" ? "E-mail ou senha inválidos." : safe.message);
    } finally { setBusy(false); }
  };

  return <AuthShell><AuthCard title="Entrar" description="Acesse sua conta LeadHunt."><form onSubmit={submit} className="space-y-5"><GeneralAlert message={notice} tone="info" /><GeneralAlert message={generalError} /><Field id="login-email" label="E-mail" type="email" autoComplete="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} error={fieldErrors.email} /><PasswordField id="login-password" label="Senha" autoComplete="current-password" value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} error={fieldErrors.password} /><SubmitButton busy={busy}>Entrar</SubmitButton><div className="flex flex-wrap justify-between gap-3 text-sm font-semibold"><Link className="text-blue-700 hover:underline" to="/forgot-password">Esqueci minha senha</Link><Link className="text-blue-700 hover:underline" to="/register">Criar conta</Link></div></form></AuthCard></AuthShell>;
}
