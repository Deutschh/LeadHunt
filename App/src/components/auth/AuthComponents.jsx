import { Eye, EyeOff, LoaderCircle, LogOut, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider.jsx";

export function LeadHuntBrand({ compact = false, inverse = false }) {
  return (
    <div className="flex items-center gap-3" aria-label="LeadHunt">
      <span className={`${compact ? "h-9 w-9" : "h-11 w-11"} grid place-items-center rounded-xl bg-slate-950 text-base font-black text-white shadow-lg shadow-slate-950/15`}>
        L
      </span>
      <span className={`${compact ? "text-xl" : "text-2xl"} font-black tracking-tight ${inverse ? "text-white" : "text-slate-950"}`}>
        LeadHunt
      </span>
    </div>
  );
}

export function AuthShell({ children }) {
  return (
    <main className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[minmax(320px,0.9fr)_minmax(520px,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-slate-950 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative"><LeadHuntBrand inverse /></div>
        <div className="relative grid grid-cols-6 gap-3 opacity-80" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} className={`h-14 rounded-2xl border border-white/10 ${index % 4 === 0 ? "bg-blue-500/25" : "bg-white/5"}`} />
          ))}
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:px-14">
        <div className="w-full max-w-lg">
          <div className="mb-8 lg:hidden"><LeadHuntBrand compact /></div>
          {children}
        </div>
      </section>
    </main>
  );
}

export function AuthCard({ title, description, children }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-9">
      <header className="mb-7">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">{title}</h1>
        {description && <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-600">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, error, id, ...inputProps }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-800" htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="input-premium w-full" {...inputProps} />
      {error && <p id={`${id}-error`} className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function PasswordField({ label, error, id, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-800" htmlFor={id}>{label}</label>
      <div className="relative">
        <input id={id} type={visible ? "text" : "password"} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="input-premium w-full pr-12" {...inputProps} />
        <button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p id={`${id}-error`} className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function GeneralAlert({ message, tone = "error" }) {
  if (!message) return null;
  return <div role={tone === "error" ? "alert" : "status"} aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm ${tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{message}</div>;
}

export function SubmitButton({ busy, children, disabled }) {
  return (
    <button type="submit" disabled={busy || disabled} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
      {busy && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function LogoutButton() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const handleLogout = async () => {
    if (busy) return;
    setBusy(true);
    try { await auth.logout(); } catch { /* logout local permanece definitivo */ }
    navigate("/login", { replace: true });
  };
  return <button type="button" onClick={() => void handleLogout()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><LogOut size={17} />Sair</button>;
}

export function AuthStatusScreen({ unavailable = false }) {
  const auth = useAuth();
  return (
    <AuthShell>
      <AuthCard title={unavailable ? "Não foi possível conectar ao LeadHunt" : "Preparando seu acesso"} description={unavailable ? "O serviço está temporariamente indisponível. Sua sessão não foi classificada como encerrada." : "Estamos validando sua sessão com segurança."}>
        {unavailable ? (
          <button type="button" onClick={() => void auth.retryBootstrap()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white"><RotateCcw size={18} />Tentar novamente</button>
        ) : (
          <div role="status" aria-live="polite" className="flex items-center gap-3 text-slate-600"><LoaderCircle className="animate-spin" />Carregando sessão...</div>
        )}
      </AuthCard>
    </AuthShell>
  );
}
