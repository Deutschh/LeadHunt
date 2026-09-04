import { Building2, CheckCircle2, Save, TriangleAlert } from "lucide-react";
import { useState } from "react";
import {
  EMPTY_PROFILE_FORM,
  buildCommercialProfilePatch,
  profileToForm,
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

export default function CommercialProfileSection({
  resource,
  canManage,
  saving,
  onSave,
  onRetry,
}) {
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [actionError, setActionError] = useState(null);
  const form = draft || profileToForm(resource.data) || EMPTY_PROFILE_FORM;

  const setField = (field, value) => {
    setDraft((current) => ({ ...(current || form), [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setActionError(null);
  };

  const handleSave = async () => {
    const validation = buildCommercialProfilePatch(form, resource.data);
    if (validation.errors) {
      setErrors(validation.errors);
      setActionError("Revise os campos destacados.");
      return;
    }
    if (validation.unchanged) {
      setActionError("Nenhuma alteração para salvar.");
      return;
    }

    try {
      setActionError(null);
      const updated = await onSave(validation.value);
      setDraft(profileToForm(updated));
      setErrors({});
      window.alert("Perfil comercial salvo.");
    } catch (error) {
      setActionError(error.message || "Não foi possível salvar o perfil.");
    }
  };

  return (
    <SectionCard>
      <SectionHeader
        icon={Building2}
        title="Identidade comercial"
        description="Defina como sua operação se apresenta nas interações comerciais."
        actions={
          resource.data && (
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-widest ${
                resource.data.isComplete
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-amber-50 text-amber-600"
              }`}
            >
              {resource.data.isComplete ? (
                <CheckCircle2 size={14} />
              ) : (
                <TriangleAlert size={14} />
              )}
              {resource.data.isComplete ? "Identidade completa" : "Incompleta"}
            </span>
          )
        }
      />

      {resource.loading ? (
        <LoadingState label="Carregando identidade comercial..." />
      ) : resource.error ? (
        <LoadError message={resource.error} onRetry={onRetry} />
      ) : (
        <>
          {!canManage && <ReadOnlyNotice />}
          {!resource.data.isComplete && (
            <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
              Informe o nome do remetente e da empresa para completar a
              identidade básica. Isso não bloqueia o uso do LeadHunt.
            </div>
          )}
          <InlineError message={actionError} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <TextField
              id="commercial-sender-name"
              label="Nome do remetente"
              value={form.senderName}
              onChange={(value) => setField("senderName", value)}
              error={errors.senderName}
              readOnly={!canManage}
              placeholder="Como você deseja se apresentar"
            />
            <TextField
              id="commercial-business-name"
              label="Nome da empresa"
              value={form.businessName}
              onChange={(value) => setField("businessName", value)}
              error={errors.businessName}
              readOnly={!canManage}
              placeholder="Nome comercial da sua empresa"
            />
            <div className="md:col-span-2">
              <TextField
                id="commercial-business-description"
                label="Descrição da empresa"
                value={form.businessDescription}
                onChange={(value) => setField("businessDescription", value)}
                error={errors.businessDescription}
                readOnly={!canManage}
                multiline
                rows={4}
                placeholder="O que sua empresa faz e para quem"
              />
            </div>
            <div className="md:col-span-2">
              <TextField
                id="commercial-sales-context"
                label="Contexto comercial"
                value={form.salesContext}
                onChange={(value) => setField("salesContext", value)}
                error={errors.salesContext}
                readOnly={!canManage}
                multiline
                rows={5}
                placeholder="Contexto relevante para suas abordagens comerciais"
              />
            </div>
          </div>
          {canManage && (
            <div className="mt-7 flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-6 py-4 text-sm font-black text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
              >
                {saving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-b-transparent" />
                ) : (
                  <Save size={18} />
                )}
                {saving ? "Salvando..." : "Salvar identidade"}
              </button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
