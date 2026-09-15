import { ArrowLeft, Building2, Settings2, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAdmin } from "./AdminProvider.jsx";
import AdminAuditHistory from "./AdminAuditHistory.jsx";
import { AdminMutationDialog } from "./AdminMutationDialogs.jsx";
import {
  AccountStatusBadge,
  AdminNotice,
  DataItem,
  ReleaseChannelBadge,
} from "./AdminUi.jsx";
import { deriveWorkspacePeople, formatAdminDate, getStatusAction } from "./adminUiModel.js";
import {
  LoadError,
  LoadingState,
  SectionCard,
  SectionHeader,
} from "../sections/commercial-settings/CommercialSettingsUi.jsx";

function ActiveBadge({ active }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase ring-1 ring-inset ${active ? "bg-green-50 text-green-700 ring-green-200" : "bg-red-50 text-red-700 ring-red-200"}`}>{active ? "Ativo" : "Inativo"}</span>;
}

function Members({ members }) {
  if (members.length === 0) {
    return <p className="rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-400">Este workspace não possui membros.</p>;
  }
  return <>
    <div className="grid gap-4 lg:hidden">{members.map((member) => <article key={member.userId} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-800">{member.name}</p><p className="text-sm text-slate-400">{member.email}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600">{member.role}</span></div><dl className="mt-4 grid grid-cols-2 gap-3"><DataItem label="Último login"><span title={member.lastLoginAt || undefined}>{formatAdminDate(member.lastLoginAt, "Nunca acessou")}</span></DataItem><DataItem label="Membro desde"><span title={member.createdAt}>{formatAdminDate(member.createdAt)}</span></DataItem></dl></article>)}</div>
    <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[760px]"><thead><tr className="border-b border-slate-100 text-left text-[11px] font-black uppercase tracking-widest text-slate-400"><th className="pb-4">Membro</th><th className="pb-4">Role</th><th className="pb-4">Último login</th><th className="pb-4">Membro desde</th></tr></thead><tbody>{members.map((member) => <tr key={member.userId} className="border-b border-slate-50 last:border-0"><td className="py-4 pr-5"><span className="block font-black text-slate-800">{member.name}</span><span className="text-sm text-slate-400">{member.email}</span></td><td className="py-4 pr-5"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600">{member.role}</span></td><td className="py-4 pr-5 text-sm font-semibold text-slate-600" title={member.lastLoginAt || undefined}>{formatAdminDate(member.lastLoginAt, "Nunca acessou")}</td><td className="py-4 text-sm font-semibold text-slate-600" title={member.createdAt}>{formatAdminDate(member.createdAt)}</td></tr>)}</tbody></table></div>
  </>;
}

function ReadOnlyDetails({ details }) {
  const { owner, lastLoginAt } = deriveWorkspacePeople(details);
  return <>
    <div className="grid gap-5 md:grid-cols-2">
      <SectionCard><SectionHeader icon={Building2} title="Identificação" description="Dados básicos para suporte e rastreio." /><dl className="grid gap-5 sm:grid-cols-2"><DataItem label="Nome">{details.workspaceName}</DataItem><DataItem label="Workspace ID"><span className="select-all font-mono">{details.workspaceId}</span></DataItem><DataItem label="Owner">{owner ? <><span className="block">{owner.name}</span><span className="block text-xs text-slate-400">{owner.email}</span></> : "Sem owner"}</DataItem><DataItem label="Timezone">{details.timezone}</DataItem><DataItem label="Criado em"><span title={details.createdAt}>{formatAdminDate(details.createdAt)}</span></DataItem></dl></SectionCard>
      <SectionCard><SectionHeader icon={ShieldCheck} title="Conta" description="Estado administrativo e disponibilidade." /><dl className="grid gap-5 sm:grid-cols-2"><DataItem label="Status"><AccountStatusBadge status={details.accountStatus} /></DataItem><DataItem label="Kill switch"><ActiveBadge active={details.isActive} /></DataItem><DataItem label="Ativada em"><span title={details.activatedAt || undefined}>{formatAdminDate(details.activatedAt, "Não ativada")}</span></DataItem><DataItem label="Último login"><span title={lastLoginAt || undefined}>{formatAdminDate(lastLoginAt, "Nunca acessou")}</span></DataItem></dl></SectionCard>
    </div>
    <SectionCard><SectionHeader icon={Settings2} title="Configuração" description="Parâmetros técnicos atualmente aplicados." /><dl className="grid gap-5 sm:grid-cols-3"><DataItem label="Release channel"><ReleaseChannelBadge channel={details.releaseChannel} /></DataItem><DataItem label="Mínimo de perfis">{details.minProfiles}</DataItem><DataItem label="Máximo de perfis">{details.maxProfiles}</DataItem></dl></SectionCard>
    <SectionCard><SectionHeader icon={Users} title="Membros" description={`${details.members.length} membro${details.members.length === 1 ? "" : "s"} vinculado${details.members.length === 1 ? "" : "s"}.`} /><Members members={details.members} /></SectionCard>
  </>;
}

export default function AdminWorkspaceDetailsPage() {
  const { workspaceId } = useParams();
  const admin = useAdmin();
  const { details, filters, workspaces, loadWorkspaceAudit, loadWorkspaceDetails, loadWorkspaceSummary, loadWorkspaces } = admin;
  const [dialog, setDialog] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    void loadWorkspaceDetails(workspaceId).catch(() => undefined);
  }, [loadWorkspaceDetails, workspaceId]);

  const data = details.data?.workspaceId === workspaceId ? details.data : null;
  const notFound = details.error && [400, 404].includes(details.error.status);

  if (!data && details.status === "loading") return <LoadingState label="Carregando detalhes da conta..." />;
  if (!data && notFound) return <SectionCard><div className="py-8 text-center"><h1 className="text-2xl font-black text-slate-800">Conta não encontrada</h1><p className="mt-2 text-sm font-medium text-slate-400">O identificador informado não corresponde a uma conta disponível.</p><Link to="/admin" className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Voltar para contas</Link></div></SectionCard>;
  if (!data && details.status === "error") return <LoadError message="Não foi possível carregar os detalhes da conta." onRetry={() => void loadWorkspaceDetails(workspaceId).catch(() => undefined)} />;
  if (!data) return <LoadingState label="Preparando detalhes da conta..." />;

  const refreshAfterMutation = async (statusChanged) => {
    const tasks = [
      loadWorkspaceDetails(workspaceId),
      loadWorkspaceAudit(workspaceId, { page: 1, pageSize: 25 }),
    ];
    if (workspaces.data) tasks.push(loadWorkspaces(filters));
    if (statusChanged) tasks.push(loadWorkspaceSummary());
    await Promise.allSettled(tasks);
  };
  const handleSuccess = async ({ kind, message }) => {
    setDialog(null);
    setSuccess(message);
    await refreshAfterMutation(["activate", "suspend", "reactivate"].includes(kind));
  };
  const handleConflictRefresh = async () => {
    setDialog(null);
    setSuccess(null);
    await refreshAfterMutation(false);
  };
  const statusAction = getStatusAction(data.accountStatus);

  return <div className="space-y-7">
    <header><Link to="/admin" className="inline-flex items-center gap-2 text-sm font-black text-slate-500 hover:text-slate-900"><ArrowLeft size={17} />Voltar para contas</Link><div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">Workspace <span className="select-all font-mono">{data.workspaceId}</span></p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{data.workspaceName}</h1></div><div className="flex flex-wrap gap-2"><AccountStatusBadge status={data.accountStatus} /><ReleaseChannelBadge channel={data.releaseChannel} /></div></div></header>
    {details.status === "error" && <div className="space-y-3"><AdminNotice tone="error" message="Os detalhes não puderam ser atualizados. Os dados anteriores foram preservados." /><button type="button" onClick={() => void loadWorkspaceDetails(workspaceId).catch(() => undefined)} className="text-sm font-black text-blue-700 hover:underline">Tentar atualizar os detalhes</button></div>}
    {success && <AdminNotice message={success} onDismiss={() => setSuccess(null)} />}
    <div className="grid gap-7 xl:grid-cols-12">
      <div className="space-y-7 xl:col-span-8"><ReadOnlyDetails details={data} /><AdminAuditHistory workspaceId={workspaceId} /></div>
      <aside className="xl:col-span-4"><SectionCard><SectionHeader icon={SlidersHorizontal} title="Ações administrativas" description="Toda mudança exige confirmação e justificativa." /><div className="space-y-3"><button type="button" onClick={() => setDialog(statusAction.action)} className={`flex min-h-12 w-full items-center justify-center rounded-2xl px-5 text-sm font-black text-white ${statusAction.action === "suspend" ? "bg-red-600 hover:bg-red-700" : "bg-slate-950 hover:bg-blue-700"}`}>{statusAction.label}</button><button type="button" onClick={() => setDialog("maxProfiles")} className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-100 px-5 text-sm font-black text-slate-700 hover:bg-slate-200">Alterar máximo de perfis</button><button type="button" onClick={() => setDialog("releaseChannel")} className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-100 px-5 text-sm font-black text-slate-700 hover:bg-slate-200">Alterar release channel</button></div></SectionCard></aside>
    </div>
    {dialog && <AdminMutationDialog kind={dialog} details={data} onClose={() => setDialog(null)} onSuccess={handleSuccess} onConflictRefresh={handleConflictRefresh} />}
  </div>;
}
