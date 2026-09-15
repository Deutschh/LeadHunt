import { Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAdmin } from "./AdminProvider.jsx";
import { AdminDialog, AdminNotice, BusyLabel } from "./AdminUi.jsx";
import { getConflictMessage, getStatusAction } from "./adminUiModel.js";
import { normalizeReason } from "./adminModels.js";

const RELEASE_CHANNELS = Object.freeze(["internal", "canary", "beta", "stable"]);
const STATUS_DIALOGS = Object.freeze({
  activate: Object.freeze({ title: "Ativar conta", description: "Confirme a primeira ativação desta conta.", success: "Conta ativada com sucesso." }),
  suspend: Object.freeze({ title: "Suspender conta", description: "Confirme a suspensão administrativa desta conta.", success: "Conta suspensa com sucesso." }),
  reactivate: Object.freeze({ title: "Reativar conta", description: "Confirme a reativação desta conta.", success: "Conta reativada com sucesso." }),
});

function fieldMessage(error, field) {
  const detail = error?.fieldErrors?.[field];
  if (detail === "required") return "Informe uma justificativa.";
  if (detail === "too_long") return "Use no máximo 500 caracteres e 2.000 bytes.";
  if (detail) return "Revise este campo.";
  return null;
}

export function AdminMutationDialog({ kind, details, onClose, onSuccess, onConflictRefresh }) {
  const admin = useAdmin();
  const [reason, setReason] = useState("");
  const [maxProfiles, setMaxProfiles] = useState(String(details.maxProfiles));
  const [releaseChannel, setReleaseChannel] = useState(details.releaseChannel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const initialFocusRef = useRef(null);
  const requestRef = useRef(null);
  const statusConfig = STATUS_DIALOGS[kind];
  const title = statusConfig?.title || (kind === "maxProfiles" ? "Alterar máximo de perfis" : "Alterar release channel");
  const description = statusConfig?.description || (kind === "maxProfiles" ? "Defina o novo limite técnico desta conta." : "Selecione o canal técnico desta conta.");

  useEffect(() => () => requestRef.current?.abort(), []);

  const parsedMaxProfiles = useMemo(() => {
    if (!/^\d+$/u.test(maxProfiles)) return null;
    const value = Number(maxProfiles);
    return Number.isInteger(value) ? value : null;
  }, [maxProfiles]);
  const unchanged = kind === "maxProfiles"
    ? parsedMaxProfiles === details.maxProfiles
    : kind === "releaseChannel"
      ? releaseChannel === details.releaseChannel
      : false;

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setConflict(null);
    let normalizedReason;
    try {
      normalizedReason = normalizeReason(reason);
    } catch (validationError) {
      setError(validationError);
      return;
    }
    if (kind === "maxProfiles" && (parsedMaxProfiles === null || parsedMaxProfiles < details.minProfiles || parsedMaxProfiles > 32767)) {
      setError({ fieldErrors: { maxProfiles: `Use um inteiro entre ${details.minProfiles} e 32767.` } });
      return;
    }
    const abortController = new AbortController();
    requestRef.current = abortController;
    setBusy(true);
    try {
      if (kind === "activate") await admin.activateWorkspace(details.workspaceId, { reason: normalizedReason }, { signal: abortController.signal });
      else if (kind === "suspend") await admin.suspendWorkspace(details.workspaceId, { reason: normalizedReason }, { signal: abortController.signal });
      else if (kind === "reactivate") await admin.reactivateWorkspace(details.workspaceId, { reason: normalizedReason }, { signal: abortController.signal });
      else if (kind === "maxProfiles") await admin.updateMaxProfiles(details.workspaceId, { maxProfiles: parsedMaxProfiles, expectedMaxProfiles: details.maxProfiles, reason: normalizedReason }, { signal: abortController.signal });
      else if (kind === "releaseChannel") await admin.updateReleaseChannel(details.workspaceId, { releaseChannel, expectedReleaseChannel: details.releaseChannel, reason: normalizedReason }, { signal: abortController.signal });
      else throw new Error("Ação administrativa inválida.");
      const success = statusConfig?.success || (kind === "maxProfiles" ? "Máximo de perfis atualizado com sucesso." : "Release channel atualizado com sucesso.");
      void onSuccess({ kind, message: success });
    } catch (mutationError) {
      const conflictMessage = mutationError.status === 409
        ? getConflictMessage(mutationError.code)
        : null;
      if (conflictMessage) setConflict(conflictMessage);
      else if (mutationError.code !== "REQUEST_ABORTED" && mutationError.code !== "STALE_ADMIN_OPERATION") setError(mutationError);
    } finally {
      if (requestRef.current === abortController) requestRef.current = null;
      setBusy(false);
    }
  };

  const maxError = error?.fieldErrors?.maxProfiles;
  const reasonError = fieldMessage(error, "reason");
  const canSubmit = reason.trim().length > 0 && !unchanged && !busy;

  return <AdminDialog title={title} description={description} busy={busy} onClose={onClose} initialFocusRef={initialFocusRef}>
    <form onSubmit={submit} className="overflow-y-auto px-5 py-6 sm:px-8">
      {conflict && <div className="mb-5 space-y-3"><AdminNotice tone="warning" message={conflict} /><button type="button" onClick={() => void onConflictRefresh()} className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-black text-amber-900">Atualizar dados</button></div>}
      {error && !conflict && <div className="mb-5"><AdminNotice tone="error" message={reasonError || maxError || error.message || "Não foi possível concluir a ação."} /></div>}
      {statusConfig && <dl className="mb-5 grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4"><div><dt className="text-xs font-black uppercase text-slate-400">Status atual</dt><dd className="mt-1 font-black text-slate-700">{details.accountStatus}</dd></div><div><dt className="text-xs font-black uppercase text-slate-400">Novo status</dt><dd className="mt-1 font-black text-slate-700">{getStatusAction(details.accountStatus)?.next}</dd></div></dl>}
      {kind === "maxProfiles" && <div className="mb-5 grid grid-cols-2 gap-4"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Valor atual</p><p className="mt-1 text-xl font-black">{details.maxProfiles}</p><p className="mt-1 text-xs text-slate-400">Mínimo: {details.minProfiles}</p></div><label className="space-y-2"><span className="block text-xs font-black uppercase text-slate-400">Novo valor</span><input ref={initialFocusRef} type="number" min={details.minProfiles} max="32767" step="1" value={maxProfiles} disabled={busy} onChange={(event) => { setMaxProfiles(event.target.value); setError(null); setConflict(null); }} aria-invalid={Boolean(maxError)} aria-describedby={maxError ? "admin-max-profiles-error" : undefined} className="input-premium disabled:opacity-50" />{maxError && <span id="admin-max-profiles-error" className="block text-xs font-bold text-red-600">{maxError}</span>}</label></div>}
      {kind === "releaseChannel" && <div className="mb-5 grid grid-cols-2 gap-4"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Canal atual</p><p className="mt-1 text-xl font-black capitalize">{details.releaseChannel}</p></div><label className="space-y-2"><span className="block text-xs font-black uppercase text-slate-400">Novo canal</span><select ref={initialFocusRef} value={releaseChannel} disabled={busy} onChange={(event) => { setReleaseChannel(event.target.value); setError(null); setConflict(null); }} className="input-premium cursor-pointer disabled:opacity-50">{RELEASE_CHANNELS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}</select></label></div>}
      <label className="block space-y-2"><span className="block text-xs font-black uppercase tracking-widest text-slate-400">Justificativa</span><textarea ref={statusConfig ? initialFocusRef : undefined} value={reason} disabled={busy} onChange={(event) => { setReason(event.target.value); setError(null); setConflict(null); }} rows="5" aria-invalid={Boolean(reasonError)} aria-describedby={reasonError ? "admin-reason-error admin-reason-help" : "admin-reason-help"} className="input-premium resize-y disabled:opacity-50" placeholder="Descreva o motivo desta alteração" />{reasonError && <span id="admin-reason-error" className="block text-xs font-bold text-red-600">{reasonError}</span>}<span id="admin-reason-help" className="block text-right text-xs font-bold text-slate-400">{[...reason].length}/500</span></label>
      <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={busy} className="rounded-2xl bg-slate-100 px-6 py-3 text-sm font-black text-slate-600 hover:bg-slate-200 disabled:opacity-50">Cancelar</button><button type="submit" disabled={!canSubmit} className={`flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 ${kind === "suspend" ? "bg-red-600 hover:bg-red-700" : "bg-slate-950 hover:bg-blue-700"}`}><BusyLabel busy={busy} busyText="Salvando..."><Save size={17} />Confirmar</BusyLabel></button></div>
    </form>
  </AdminDialog>;
}
