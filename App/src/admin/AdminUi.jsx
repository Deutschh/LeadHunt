import { AlertCircle, ChevronLeft, ChevronRight, LoaderCircle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef } from "react";
import {
  getFocusableElements,
  getTrappedFocusTarget,
  isolateApplicationRoot,
} from "./adminFocusTrap.js";
import { ACCOUNT_STATUS_META, RELEASE_CHANNEL_LABELS } from "./adminUiModel.js";

const STATUS_TONES = Object.freeze({
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  red: "bg-red-50 text-red-700 ring-red-200",
});

export function AccountStatusBadge({ status }) {
  const meta = ACCOUNT_STATUS_META[status];
  if (!meta) return null;
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase ring-1 ring-inset ${STATUS_TONES[meta.tone]}`}>
      {meta.label}
    </span>
  );
}

export function ReleaseChannelBadge({ channel }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600 ring-1 ring-inset ring-slate-200">
      {RELEASE_CHANNEL_LABELS[channel] || channel}
    </span>
  );
}

export function AdminNotice({ tone = "success", message, onDismiss }) {
  if (!message) return null;
  const classes = tone === "success"
    ? "border-green-200 bg-green-50 text-green-700"
    : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-red-200 bg-red-50 text-red-700";
  return (
    <div role={tone === "success" ? "status" : "alert"} aria-live="polite" className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-bold ${classes}`}>
      <span>{message}</span>
      {onDismiss && <button type="button" onClick={onDismiss} aria-label="Fechar aviso" className="rounded-lg p-1 hover:bg-black/5"><X size={16} /></button>}
    </div>
  );
}

export function AdminEmptyState({ title, description, action }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
      <p className="font-black text-slate-700">{title}</p>
      {description && <p className="mx-auto mt-2 max-w-lg text-sm font-medium text-slate-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function AdminPagination({ pagination, onPageChange, busy = false }) {
  const { page, totalPages } = pagination;
  return (
    <nav className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-5 sm:flex-row" aria-label="Paginação">
      <p className="text-sm font-bold text-slate-400">Página {page} de {Math.max(totalPages, 1)}</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy || page <= 1} onClick={() => onPageChange(page - 1)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} />Anterior</button>
        <button type="button" disabled={busy || totalPages === 0 || page >= totalPages} onClick={() => onPageChange(page + 1)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">Próxima<ChevronRight size={16} /></button>
      </div>
    </nav>
  );
}

export function AdminDialog({ title, description, busy, onClose, initialFocusRef, children }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  }, [busy, onClose]);

  useEffect(() => {
    openerRef.current = document.activeElement;
    const root = document.getElementById("root");
    const dialog = dialogRef.current;
    const first = initialFocusRef?.current || getFocusableElements(dialog)[0] || dialog;
    first?.focus();
    const restoreRoot = isolateApplicationRoot(root);

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = getFocusableElements(dialog);
      const target = getTrappedFocusTarget(elements, document.activeElement, event.shiftKey);
      if (target || elements.length === 0) {
        event.preventDefault();
        (target || dialog)?.focus();
      }
    };
    const handleFocusIn = (event) => {
      if (!dialog?.contains(event.target)) {
        (getFocusableElements(dialog)[0] || dialog)?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      restoreRoot();
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [initialFocusRef]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl outline-none">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-8 sm:py-5">
          <div><h2 id={titleId} className="text-xl font-black text-slate-800">{title}</h2>{description && <p className="mt-1 text-sm font-medium text-slate-400">{description}</p>}</div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar dialog" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><X size={20} /></button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function BusyLabel({ busy, busyText, children }) {
  return <>{busy && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}{busy ? busyText : children}</>;
}

export function DataItem({ label, children }) {
  return <div><dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm font-bold text-slate-700">{children}</dd></div>;
}

export function ErrorIcon() {
  return <AlertCircle size={18} aria-hidden="true" />;
}
