import { KeyRound, Save, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider.jsx";
import { getAccountDestination } from "../auth/authFlow.js";
import {
  GeneralAlert,
  LeadHuntBrand,
  LogoutButton,
  PasswordField,
  SubmitButton,
} from "../components/auth/AuthComponents.jsx";
import {
  SectionCard,
  SectionHeader,
  TextField,
} from "../sections/commercial-settings/CommercialSettingsUi.jsx";
import { createAccountApi } from "./accountApi.js";
import {
  normalizeAccountName,
  sanitizeAccountError,
  validatePasswordForm,
} from "./accountModel.js";

export default function AccountPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const api = useMemo(() => createAccountApi(auth.apiRequest), [auth.apiRequest]);
  const [name, setName] = useState(auth.user?.name || "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileErrors, setProfileErrors] = useState({});
  const [profileNotice, setProfileNotice] = useState(null);
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    passwordConfirmation: "",
  });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordNotice, setPasswordNotice] = useState(null);

  useEffect(() => {
    setName(auth.user?.name || "");
  }, [auth.sessionVersion, auth.user?.name]);

  const submitProfile = async (event) => {
    event.preventDefault();
    if (profileBusy) return;
    const normalizedName = normalizeAccountName(name);
    if (normalizedName === null) {
      setProfileErrors({ name: "Informe um nome válido entre 2 e 120 caracteres." });
      return;
    }
    setProfileBusy(true);
    setProfileErrors({});
    setProfileNotice(null);
    try {
      await api.updateProfile({ name: normalizedName });
      await auth.reloadMe();
      setProfileNotice("Nome atualizado com sucesso.");
    } catch (error) {
      const safe = sanitizeAccountError(error, ["name"]);
      setProfileErrors(safe.fieldErrors);
      setProfileNotice(safe.message);
    } finally {
      setProfileBusy(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    if (passwordBusy) return;
    const errors = validatePasswordForm(passwords);
    setPasswordErrors(errors);
    setPasswordNotice(null);
    if (Object.keys(errors).length > 0) return;
    setPasswordBusy(true);
    try {
      const result = await api.changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      try {
        await auth.logout();
      } catch {
        // O controller já encerrou a sessão local antes da chamada remota.
      }
      navigate("/login", { replace: true, state: { message: result.message } });
    } catch (error) {
      const safe = sanitizeAccountError(error, ["currentPassword", "newPassword"]);
      setPasswordErrors(safe.fieldErrors);
      setPasswordNotice(safe.message);
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] text-slate-900">
      <header className="border-b border-white/70 bg-white/85 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-[1000px] items-center justify-between gap-4">
          <Link to={getAccountDestination(auth)}><LeadHuntBrand compact /></Link>
          <Link to={getAccountDestination(auth)} className="text-sm font-black text-slate-500 hover:text-slate-900">Voltar ao LeadHunt</Link>
        </div>
      </header>
      <main className="mx-auto max-w-[900px] space-y-6 px-4 pb-20 pt-8 sm:px-6 lg:pt-10">
        <div><p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">Conta</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Minha conta</h1><p className="mt-2 font-medium text-slate-500">Gerencie seus dados pessoais e a segurança da sua sessão.</p></div>

        <SectionCard>
          <SectionHeader icon={UserRound} title="Informações pessoais" description="Dados usados para identificar você no LeadHunt." />
          <form onSubmit={submitProfile} className="space-y-5">
            <GeneralAlert message={profileNotice} tone={profileNotice === "Nome atualizado com sucesso." ? "info" : "error"} />
            <TextField id="account-name" label="Nome" value={name} onChange={setName} error={profileErrors.name} placeholder="Seu nome" />
            <TextField id="account-email" label="E-mail" value={auth.user?.email || ""} readOnly helper="A alteração de e-mail não está disponível nesta versão." />
            <button type="submit" disabled={profileBusy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 font-black text-white hover:bg-blue-700 disabled:opacity-50"><Save size={18} />{profileBusy ? "Salvando..." : "Salvar nome"}</button>
          </form>
        </SectionCard>

        <SectionCard>
          <SectionHeader icon={KeyRound} title="Segurança" description="Altere sua senha informando a credencial atual." />
          <form onSubmit={submitPassword} className="space-y-5">
            <GeneralAlert message={passwordNotice} />
            <PasswordField id="account-current-password" label="Senha atual" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} error={passwordErrors.currentPassword} />
            <PasswordField id="account-new-password" label="Nova senha" autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} error={passwordErrors.newPassword} />
            <PasswordField id="account-confirm-password" label="Confirmar nova senha" autoComplete="new-password" value={passwords.passwordConfirmation} onChange={(event) => setPasswords({ ...passwords, passwordConfirmation: event.target.value })} error={passwordErrors.passwordConfirmation} />
            <SubmitButton busy={passwordBusy}>Alterar senha</SubmitButton>
          </form>
        </SectionCard>

        <SectionCard>
          <SectionHeader icon={ShieldCheck} title="Sessão" description="Encerre com segurança o acesso neste navegador." />
          <LogoutButton />
        </SectionCard>
      </main>
    </div>
  );
}
