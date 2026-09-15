import { History } from "lucide-react";
import { useEffect } from "react";
import { useAdmin } from "./AdminProvider.jsx";
import {
  AccountStatusBadge,
  AdminEmptyState,
  AdminNotice,
  AdminPagination,
  ReleaseChannelBadge,
} from "./AdminUi.jsx";
import {
  formatAdminDate,
  getAuditActionLabel,
  getSnapshotRows,
} from "./adminUiModel.js";
import {
  LoadError,
  LoadingState,
  SectionCard,
  SectionHeader,
} from "../sections/commercial-settings/CommercialSettingsUi.jsx";

function SnapshotValue({ field, value }) {
  if (value === null) return <span className="text-slate-400">Não registrado</span>;
  if (field === "accountStatus") return <AccountStatusBadge status={value} />;
  if (field === "releaseChannel") return <ReleaseChannelBadge channel={value} />;
  if (field === "activatedAt") return <span title={value}>{formatAdminDate(value)}</span>;
  if (field === "isActive") return value ? "Ativo" : "Inativo";
  return String(value);
}

function AuditEvent({ event }) {
  const rows = getSnapshotRows(event.beforeState, event.afterState);
  return <article className="rounded-[1.75rem] border border-slate-100 bg-slate-50/50 p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-black text-slate-800">{getAuditActionLabel(event.action)}</h3><p className="mt-1 text-xs font-bold text-slate-400">por {event.actor.name} · {event.actor.email}</p></div><time dateTime={event.createdAt} title={event.createdAt} className="text-xs font-bold text-slate-400">{formatAdminDate(event.createdAt)}</time></div>
    <p className="mt-4 whitespace-pre-line text-sm font-medium leading-relaxed text-slate-600">{event.reason}</p>
    {rows.length > 0 && <dl className="mt-4 space-y-3 border-t border-slate-200 pt-4">{rows.map((row) => <div key={row.field} className="grid gap-2 text-sm sm:grid-cols-[150px_1fr_auto_1fr] sm:items-center"><dt className="font-black text-slate-500">{row.label}</dt><dd className="font-semibold text-slate-600"><SnapshotValue field={row.field} value={row.before} /></dd><span aria-hidden="true" className="text-slate-300">→</span><dd className="font-semibold text-slate-800"><SnapshotValue field={row.field} value={row.after} /></dd></div>)}</dl>}
  </article>;
}

export default function AdminAuditHistory({ workspaceId }) {
  const { audit, auditPagination, loadWorkspaceAudit } = useAdmin();
  useEffect(() => {
    void loadWorkspaceAudit(workspaceId, { page: 1, pageSize: 25 }).catch(() => undefined);
  }, [loadWorkspaceAudit, workspaceId]);

  const data = audit.data?.workspaceId === workspaceId ? audit.data : null;
  return <SectionCard>
    <SectionHeader icon={History} title="Histórico administrativo" description="Alterações administrativas registradas para esta conta." />
    {audit.status === "error" && data && <div className="mb-5 space-y-3"><AdminNotice tone="error" message="O histórico não pôde ser atualizado. Os eventos anteriores foram preservados." /><button type="button" onClick={() => void loadWorkspaceAudit(workspaceId, auditPagination).catch(() => undefined)} className="text-sm font-black text-blue-700 hover:underline">Tentar atualizar o histórico</button></div>}
    {!data && audit.status === "loading" && <LoadingState label="Carregando histórico..." />}
    {!data && audit.status === "error" && <LoadError message="Não foi possível carregar o histórico." onRetry={() => void loadWorkspaceAudit(workspaceId, auditPagination).catch(() => undefined)} />}
    {data && data.auditEvents.length === 0 && <AdminEmptyState title="Nenhuma ação administrativa registrada" description="As alterações futuras desta conta aparecerão aqui." />}
    {data && data.auditEvents.length > 0 && <><div className="space-y-4">{data.auditEvents.map((event) => <AuditEvent key={event.id} event={event} />)}</div><div className="mt-6"><AdminPagination pagination={data.pagination} busy={audit.status === "loading"} onPageChange={(page) => void loadWorkspaceAudit(workspaceId, { page, pageSize: 25 }).catch(() => undefined)} /></div></>}
  </SectionCard>;
}
