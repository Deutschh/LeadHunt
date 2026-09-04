import { Pencil, Plus, Save, Target, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import {
  EMPTY_STRATEGY_FORM,
  buildNicheStrategyPayload,
} from "./commercialSettingsModel.js";
import {
  InlineError,
  LoadError,
  LoadingState,
  ReadOnlyNotice,
  SectionCard,
  SectionHeader,
  TextField,
} from "./CommercialSettingsUi.jsx";

export default function NicheStrategiesSection({
  resource,
  canManage,
  saving,
  onUpsert,
  onDelete,
  onRetry,
}) {
  const formRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_STRATEGY_FORM });
  const [errors, setErrors] = useState({});
  const [actionError, setActionError] = useState(null);

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setActionError(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...EMPTY_STRATEGY_FORM });
    setErrors({});
    setActionError(null);
  };

  const startEdit = (strategy) => {
    setEditingId(strategy.id);
    setForm({
      nicheName: strategy.nicheName,
      hook: strategy.hook,
      callToAction: strategy.callToAction,
    });
    setErrors({});
    setActionError(null);
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validation = buildNicheStrategyPayload(form);
    if (validation.errors) {
      setErrors(validation.errors);
      setActionError("Revise os campos destacados.");
      return;
    }

    try {
      setActionError(null);
      await onUpsert(validation.value);
      window.alert(editingId ? "Estratégia atualizada." : "Estratégia salva.");
      resetForm();
    } catch (error) {
      setActionError(error.message || "Não foi possível salvar a estratégia.");
    }
  };

  const handleDelete = async (strategy) => {
    if (!window.confirm("Deseja realmente remover esta estratégia?")) return;
    try {
      await onDelete(strategy.id);
      if (editingId === strategy.id) resetForm();
      window.alert("Estratégia excluída.");
    } catch (error) {
      window.alert(error.message || "Não foi possível excluir a estratégia.");
    }
  };

  return (
    <SectionCard>
      <SectionHeader
        icon={Target}
        title="Estratégias de nicho"
        description="Configure ganchos e chamadas para ação por nicho comercial."
      />

      {!canManage && !resource.loading && !resource.error && <ReadOnlyNotice />}

      {resource.loading ? (
        <LoadingState label="Carregando estratégias..." />
      ) : resource.error ? (
        <LoadError message={resource.error} onRetry={onRetry} />
      ) : (
        <>
          {canManage && (
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              className={`mb-8 rounded-[1.75rem] border p-5 sm:p-6 ${
                editingId
                  ? "border-blue-200 bg-blue-50/50"
                  : "border-slate-100 bg-slate-50"
              }`}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <h3 className="font-black text-slate-800">
                  {editingId ? "Editar estratégia" : "Nova estratégia"}
                </h3>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-[10px] font-black uppercase text-red-500 disabled:opacity-50"
                  >
                    <X size={12} /> Cancelar edição
                  </button>
                )}
              </div>
              <InlineError message={actionError} />
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <TextField
                  id="strategy-niche-name"
                  label="Nicho"
                  value={form.nicheName}
                  onChange={(value) => setField("nicheName", value)}
                  error={errors.nicheName}
                  readOnly={Boolean(editingId)}
                  placeholder="Ex: Dentistas"
                />
                <TextField
                  id="strategy-call-to-action"
                  label="CTA"
                  value={form.callToAction}
                  onChange={(value) => setField("callToAction", value)}
                  error={errors.callToAction}
                  placeholder="Ex: Podemos conversar?"
                />
                <div className="md:col-span-2">
                  <TextField
                    id="strategy-hook"
                    label="Hook"
                    value={form.hook}
                    onChange={(value) => setField("hook", value)}
                    error={errors.hook}
                    multiline
                    rows={5}
                    placeholder="Descreva o foco comercial para este nicho"
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
                >
                  {saving ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-b-transparent" />
                  ) : editingId ? (
                    <Save size={17} />
                  ) : (
                    <Plus size={17} />
                  )}
                  {saving ? "Salvando..." : editingId ? "Atualizar" : "Salvar estratégia"}
                </button>
              </div>
            </form>
          )}

          {resource.data.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
              <Target className="mx-auto mb-3 text-slate-300" size={34} />
              <p className="font-black text-slate-600">
                Nenhuma estratégia de nicho cadastrada
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {resource.data.map((strategy) => (
                <article
                  key={strategy.id}
                  className={`rounded-[1.5rem] border p-5 transition ${
                    editingId === strategy.id
                      ? "border-blue-300 bg-blue-50"
                      : "border-slate-100 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-800">{strategy.nicheName}</h3>
                      <p className="mt-2 whitespace-pre-line text-sm font-medium leading-relaxed text-slate-500">
                        {strategy.hook}
                      </p>
                      <p className="mt-3 text-xs font-bold text-blue-600">
                        CTA: {strategy.callToAction}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(strategy)}
                          disabled={saving}
                          aria-label={`Editar estratégia de ${strategy.nicheName}`}
                          className="rounded-xl bg-blue-50 p-2.5 text-blue-600 transition hover:bg-blue-100 disabled:opacity-50"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(strategy)}
                          disabled={saving}
                          aria-label={`Excluir estratégia de ${strategy.nicheName}`}
                          className="rounded-xl bg-red-50 p-2.5 text-red-500 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

