import { Building2, CheckCircle2, Clock3, Search, ShieldAlert } from "lucide-react";
import { createElement, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdmin } from "./AdminProvider.jsx";
import {
  AccountStatusBadge,
  AdminEmptyState,
  AdminNotice,
  AdminPagination,
  ReleaseChannelBadge,
} from "./AdminUi.jsx";
import { formatAdminDate } from "./adminUiModel.js";
import {
  LoadError,
  LoadingState,
  SectionCard,
} from "../sections/commercial-settings/CommercialSettingsUi.jsx";

const SUMMARY_CARDS = Object.freeze([
  { key: "total", label: "Total", icon: Building2, tone: "bg-slate-950 text-white" },
  { key: "pending", label: "Pending", icon: Clock3, tone: "bg-amber-50 text-amber-700" },
  { key: "active", label: "Active", icon: CheckCircle2, tone: "bg-green-50 text-green-700" },
  { key: "suspended", label: "Suspended", icon: ShieldAlert, tone: "bg-red-50 text-red-700" },
]);

function Summary({ resource, onRetry }) {
  if (!resource.data && resource.status === "loading") {
    return <SectionCard><LoadingState label="Carregando resumo das contas..." /></SectionCard>;
  }
  if (!resource.data && resource.status === "error") {
    return <LoadError message="Não foi possível carregar o resumo das contas." onRetry={onRetry} />;
  }
  if (!resource.data) return null;
  return (
    <div className="space-y-3">
      {resource.status === "error" && <AdminNotice tone="error" message="O resumo não pôde ser atualizado. Os valores anteriores foram preservados." />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        {SUMMARY_CARDS.map(({ key, label, icon, tone }) => (
          <article key={key} className="rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
            <div className={`mb-4 grid h-11 w-11 place-items-center rounded-2xl ${tone}`}>{createElement(icon, { size: 21 })}</div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">{resource.data[key].toLocaleString("pt-BR")}</p>
          </article>
        ))}
      </div>
      {resource.status === "error" && <button type="button" onClick={onRetry} className="text-sm font-black text-blue-700 hover:underline">Tentar atualizar o resumo</button>}
    </div>
  );
}

function Owner({ owner }) {
  if (!owner) return <span className="text-slate-400">Sem owner</span>;
  return <span><span className="block font-bold text-slate-700">{owner.name}</span><span className="block text-xs text-slate-400">{owner.email}</span></span>;
}

function WorkspaceCard({ workspace }) {
  return (
    <article className="rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-black text-slate-800">{workspace.workspaceName}</h2><p className="mt-1 text-xs font-bold text-slate-400">ID {workspace.workspaceId}</p></div><AccountStatusBadge status={workspace.accountStatus} /></div>
      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs font-black uppercase text-slate-400">Owner</dt><dd className="mt-1"><Owner owner={workspace.owner} /></dd></div><div><dt className="text-xs font-black uppercase text-slate-400">Canal</dt><dd className="mt-1"><ReleaseChannelBadge channel={workspace.releaseChannel} /></dd></div><div><dt className="text-xs font-black uppercase text-slate-400">Máx. perfis</dt><dd className="mt-1 font-bold">{workspace.maxProfiles}</dd></div><div><dt className="text-xs font-black uppercase text-slate-400">Último login</dt><dd className="mt-1 font-bold" title={workspace.lastLoginAt || undefined}>{formatAdminDate(workspace.lastLoginAt, "Nunca acessou")}</dd></div></dl>
      <p className="mt-4 text-xs font-medium text-slate-400" title={workspace.createdAt}>Cadastrada em {formatAdminDate(workspace.createdAt)}</p>
      <Link to={`/admin/workspaces/${workspace.workspaceId}`} className="mt-5 flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-blue-700">Abrir detalhes</Link>
    </article>
  );
}

function WorkspaceTable({ workspaces }) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table className="w-full min-w-[1050px]"><thead><tr className="border-b border-slate-100 text-left text-[11px] font-black uppercase tracking-widest text-slate-400"><th className="pb-4">Conta / owner</th><th className="pb-4">Status</th><th className="pb-4">Canal</th><th className="pb-4">Máx. perfis</th><th className="pb-4">Último login</th><th className="pb-4">Cadastro</th><th className="pb-4"><span className="sr-only">Ação</span></th></tr></thead>
        <tbody>{workspaces.map((workspace) => <tr key={workspace.workspaceId} className="border-b border-slate-50 last:border-0"><td className="py-4 pr-5"><span className="block font-black text-slate-800">{workspace.workspaceName}</span><Owner owner={workspace.owner} /></td><td className="py-4 pr-5"><AccountStatusBadge status={workspace.accountStatus} /></td><td className="py-4 pr-5"><ReleaseChannelBadge channel={workspace.releaseChannel} /></td><td className="py-4 pr-5 font-bold text-slate-700">{workspace.maxProfiles}</td><td className="py-4 pr-5 text-sm font-semibold text-slate-600" title={workspace.lastLoginAt || undefined}>{formatAdminDate(workspace.lastLoginAt, "Nunca acessou")}</td><td className="py-4 pr-5 text-sm font-semibold text-slate-600" title={workspace.createdAt}>{formatAdminDate(workspace.createdAt)}</td><td className="py-4 text-right"><Link to={`/admin/workspaces/${workspace.workspaceId}`} className="inline-flex min-h-10 items-center rounded-xl bg-slate-100 px-4 text-sm font-black text-slate-700 hover:bg-slate-200">Abrir detalhes</Link></td></tr>)}</tbody>
      </table>
    </div>
  );
}

export default function AdminWorkspacesPage() {
  const { filters, summary, workspaces, loadWorkspaceSummary, loadWorkspaces } = useAdmin();
  const [searchDraft, setSearchDraft] = useState(filters.search || "");

  useEffect(() => {
    if (summary.status === "idle") void loadWorkspaceSummary().catch(() => undefined);
    if (workspaces.status === "idle") void loadWorkspaces(filters).catch(() => undefined);
  }, [filters, loadWorkspaceSummary, loadWorkspaces, summary.status, workspaces.status]);

  useEffect(() => {
    const pagination = workspaces.data?.pagination;
    if (workspaces.status === "ready" && pagination?.totalPages > 0 && pagination.page > pagination.totalPages) {
      void loadWorkspaces({ ...filters, page: pagination.totalPages }).catch(() => undefined);
    }
  }, [filters, loadWorkspaces, workspaces.data, workspaces.status]);

  const applyFilters = (next) => void loadWorkspaces({ page: 1, pageSize: 25, ...(next.status ? { status: next.status } : {}), ...(next.search ? { search: next.search } : {}) }).catch(() => undefined);
  const submitSearch = (event) => { event.preventDefault(); applyFilters({ status: filters.status, search: searchDraft.trim() }); };
  const clearFilters = () => { setSearchDraft(""); applyFilters({}); };
  const hasFilters = Boolean(filters.status || filters.search);
  const data = workspaces.data;

  return (
    <div className="space-y-8">
      <header><p className="text-xs font-black uppercase tracking-[0.28em] text-blue-600">Admin LeadHunt</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Contas</h1><p className="mt-2 font-medium text-slate-500">Consulte e administre os workspaces cadastrados.</p></header>
      <Summary resource={summary} onRetry={() => void loadWorkspaceSummary().catch(() => undefined)} />
      <SectionCard className="min-w-0 overflow-hidden">
        <form onSubmit={submitSearch} className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]"><label className="relative"><span className="sr-only">Buscar por conta, nome ou e-mail</span><Search className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} className="input-premium pl-12" placeholder="Buscar conta, nome ou e-mail" /></label><label><span className="sr-only">Filtrar por status</span><select value={filters.status || ""} onChange={(event) => applyFilters({ status: event.target.value || undefined, search: searchDraft.trim() })} className="input-premium cursor-pointer"><option value="">Todos os status</option><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label><button type="submit" className="min-h-12 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white hover:bg-blue-700">Buscar</button></form>
        {workspaces.status === "error" && data && <div className="mb-5 space-y-3"><AdminNotice tone="error" message="A lista não pôde ser atualizada. Os dados anteriores foram preservados." /><button type="button" onClick={() => void loadWorkspaces(filters).catch(() => undefined)} className="text-sm font-black text-blue-700 hover:underline">Tentar atualizar a lista</button></div>}
        {!data && workspaces.status === "loading" && <LoadingState label="Carregando contas..." />}
        {!data && workspaces.status === "error" && <LoadError message="Não foi possível carregar as contas." onRetry={() => void loadWorkspaces(filters).catch(() => undefined)} />}
        {data && data.workspaces.length === 0 && <AdminEmptyState title={hasFilters ? "Nenhuma conta encontrada" : "Nenhuma conta cadastrada"} description={hasFilters ? "Tente remover ou ajustar os critérios da busca." : "As contas aparecerão aqui quando forem cadastradas."} action={hasFilters ? <button type="button" onClick={clearFilters} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Limpar filtros</button> : null} />}
        {data && data.workspaces.length > 0 && <><div className="grid gap-4 lg:hidden">{data.workspaces.map((workspace) => <WorkspaceCard key={workspace.workspaceId} workspace={workspace} />)}</div><WorkspaceTable workspaces={data.workspaces} /><div className="mt-6"><AdminPagination pagination={data.pagination} busy={workspaces.status === "loading"} onPageChange={(page) => void loadWorkspaces({ ...filters, page }).catch(() => undefined)} /></div></>}
      </SectionCard>
    </div>
  );
}
