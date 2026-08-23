import { Check, Clock3, ShieldAlert } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { usePublicAuthConfig } from "../../auth/usePublicAuthConfig.js";
import { AuthCard, AuthShell, LogoutButton } from "../../components/auth/AuthComponents.jsx";

const CONTENT = {
  pending: { title: "Aguardando liberação", description: "Seu cadastro foi concluído.\n\nO LeadHunt utiliza uma configuração individual para cada operação. Entre em contato para solicitar a liberação do seu acesso.", cta: "Solicitar acesso", contact: "accessRequestUrl" },
  suspended: { title: "Acesso temporariamente suspenso", description: "O acesso operacional desta conta está temporariamente suspenso. Entre em contato com o suporte se precisar de ajuda.", cta: "Falar com o suporte", contact: "supportUrl" },
  inactive: { title: "Conta indisponível", description: "Esta conta está indisponível no momento. Sua identidade permanece autenticada, mas as operações estão bloqueadas.", cta: "Falar com o suporte", contact: "supportUrl" },
};

export default function AccountStatePage({ state }) {
  const auth = useAuth(); const publicConfig = usePublicAuthConfig(); const content = CONTENT[state]; const url = publicConfig.config?.contact?.[content.contact] || null;
  return <AuthShell><AuthCard title={content.title} description={content.description}><div className="space-y-6">{state === "pending" && <ol className="space-y-3 rounded-2xl bg-slate-50 p-4 text-sm"><li className="flex items-center gap-3"><Check className="text-emerald-600" />Conta criada</li><li className="flex items-center gap-3"><Check className="text-emerald-600" />E-mail verificado</li><li className="flex items-center gap-3 font-bold"><Clock3 className="text-blue-600" />Liberação aguardando</li></ol>}{state !== "pending" && <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900"><ShieldAlert />{auth.workspace?.name}</div>}<div className="flex flex-col gap-3 sm:flex-row">{url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-slate-950 px-4 py-2 font-bold text-white">{content.cta}</a> : <button type="button" disabled className="min-h-11 flex-1 rounded-xl bg-slate-200 px-4 py-2 font-bold text-slate-500">Canal de contato indisponível</button>}<LogoutButton /></div></div></AuthCard></AuthShell>;
}
