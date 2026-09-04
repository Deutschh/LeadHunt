import React from "react";
import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";

export function SectionCard({ children, className = "" }) {
  return (
    <section
      className={`rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-8 ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionHeader({ icon: Icon, title, description, actions }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="shrink-0 rounded-2xl bg-blue-600 p-3 text-white shadow-lg shadow-blue-200">
          {React.createElement(Icon, { size: 22 })}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-800">{title}</h2>
          <p className="mt-1 text-sm font-medium leading-relaxed text-slate-400">
            {description}
          </p>
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

export function ReadOnlyNotice() {
  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
      Você possui acesso somente para leitura. Alterações são exclusivas do
      owner do workspace.
    </div>
  );
}

export function InlineError({ message }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600"
    >
      <AlertCircle className="mt-0.5 shrink-0" size={17} />
      <span>{message}</span>
    </div>
  );
}

export function LoadingState({ label }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-3 text-sm font-bold text-slate-400">
      <LoaderCircle className="animate-spin" size={20} />
      {label}
    </div>
  );
}

export function LoadError({ message, onRetry }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-3xl border border-red-100 bg-red-50/60 p-6 text-center">
      <AlertCircle className="mb-3 text-red-500" size={28} />
      <p className="mb-4 text-sm font-bold text-red-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-black uppercase text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <RotateCcw size={14} /> Tentar novamente
      </button>
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  helper,
  multiline = false,
  rows = 4,
  readOnly = false,
  placeholder,
}) {
  const className = `input-premium ${readOnly ? "cursor-default text-slate-500" : ""} ${
    error ? "border-red-300 focus:border-red-400" : ""
  }`;
  const common = {
    id,
    value,
    onChange: (event) => onChange?.(event.target.value),
    readOnly,
    placeholder,
    "aria-invalid": error ? "true" : undefined,
    "aria-describedby": error || helper ? `${id}-help` : undefined,
    className,
  };

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="ml-2 block text-[10px] font-black uppercase tracking-widest text-slate-400"
      >
        {label}
      </label>
      {multiline ? (
        <textarea {...common} rows={rows} className={`${className} resize-y`} />
      ) : (
        <input {...common} type="text" />
      )}
      {(error || helper) && (
        <p
          id={`${id}-help`}
          className={`ml-2 text-xs font-semibold ${error ? "text-red-500" : "text-slate-400"}`}
        >
          {error || helper}
        </p>
      )}
    </div>
  );
}

export function TagList({ items, emptyLabel }) {
  if (!items?.length) {
    return <span className="text-xs font-medium text-slate-300">{emptyLabel}</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
