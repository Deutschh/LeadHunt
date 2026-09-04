import {
  Archive,
  ArchiveRestore,
  Package,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  EMPTY_SERVICE_FORM,
  buildServiceCreatePayload,
  buildServicePatch,
  buildServiceStatusPatch,
  serviceToForm,
} from "./commercialSettingsModel.js";
import {
  InlineError,
  LoadError,
  LoadingState,
  ReadOnlyNotice,
  SectionCard,
  SectionHeader,
  TagList,
  TextField,
} from "./CommercialSettingsUi.jsx";

const TYPE_LABELS = Object.freeze({
  universal: "Universal",
  nichado: "Por nicho",
});

function ServiceModal({ service, saving, onClose, onCreate, onUpdate }) {
  const [form, setForm] = useState(() =>
    service ? serviceToForm(service) : { ...EMPTY_SERVICE_FORM },
  );
  const [errors, setErrors] = useState({});
  const [actionError, setActionError] = useState(null);
  const editing = Boolean(service);

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setActionError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validation = editing
      ? buildServicePatch(form, service)
      : buildServiceCreatePayload(form);

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
      if (editing) await onUpdate(service.id, validation.value);
      else await onCreate(validation.value);
      window.alert(editing ? "Produto/serviço atualizado." : "Produto/serviço criado.");
      onClose();
    } catch (error) {
      setActionError(error.message || "Não foi possível salvar o serviço.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-modal-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-8 sm:py-5">
          <div>
            <h3 id="service-modal-title" className="text-xl font-black text-slate-800">
              {editing ? "Editar produto/serviço" : "Adicionar produto/serviço"}
            </h3>
            <p className="mt-1 text-xs font-bold text-slate-400">
              Preencha os dados comerciais da oferta.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar formulário"
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-5 py-6 sm:px-8">
          <InlineError message={actionError} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <TextField
              id="service-name"
              label="Nome"
              value={form.name}
              onChange={(value) => setField("name", value)}
              error={errors.name}
              placeholder="Ex: Automação comercial"
            />
            <div className="space-y-2">
              <label
                htmlFor="service-type"
                className="ml-2 block text-[10px] font-black uppercase tracking-widest text-slate-400"
              >
                Tipo
              </label>
              <select
                id="service-type"
                value={form.type}
                onChange={(event) => setField("type", event.target.value)}
                aria-invalid={errors.type ? "true" : undefined}
                className="input-premium"
              >
                <option value="universal">Universal</option>
                <option value="nichado">Por nicho</option>
              </select>
              {errors.type && (
                <p className="ml-2 text-xs font-semibold text-red-500">{errors.type}</p>
              )}
            </div>
            <div className="md:col-span-2">
              <TextField
                id="service-problem-category"
                label="Categoria do problema"
                value={form.problemCategory}
                onChange={(value) => setField("problemCategory", value)}
                error={errors.problemCategory}
                placeholder="Ex: Eficiência operacional"
              />
            </div>
            <div className="md:col-span-2">
              <TextField
                id="service-description"
                label="Descrição"
                value={form.description}
                onChange={(value) => setField("description", value)}
                error={errors.description}
                multiline
                rows={4}
                placeholder="Descreva a oferta e seu objetivo"
              />
            </div>
            <div className="md:col-span-2">
              <TextField
                id="service-how-it-works"
                label="Como funciona"
                value={form.howItWorks}
                onChange={(value) => setField("howItWorks", value)}
                error={errors.howItWorks}
                multiline
                rows={5}
                placeholder="Explique como a solução é entregue"
              />
            </div>
            <TextField
              id="service-problems-solved"
              label="Problemas resolvidos"
              value={form.problemsSolved}
              onChange={(value) => setField("problemsSolved", value)}
              error={errors.problemsSolved}
              helper="Digite um item por linha."
              multiline
              rows={5}
              placeholder={"Processos manuais\nRetrabalho"}
            />
            <TextField
              id="service-target-niches"
              label="Nichos-alvo"
              value={form.targetNiches}
              onChange={(value) => setField("targetNiches", value)}
              error={errors.targetNiches}
              helper="Digite um nicho por linha."
              multiline
              rows={5}
              placeholder={"Clínicas\nEscritórios"}
            />
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-2xl bg-slate-100 px-6 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 rounded-2xl bg-black px-6 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-b-transparent" />
              ) : (
                <Save size={17} />
              )}
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ServiceCard({ service, canManage, saving, onEdit, onToggleStatus }) {
  const handleToggle = async () => {
    const nextActive = !service.isActive;
    const verb = nextActive ? "reativar" : "arquivar";
    if (!window.confirm(`Deseja ${verb} este produto/serviço?`)) return;

    try {
      await onToggleStatus(service.id, buildServiceStatusPatch(nextActive));
      window.alert(nextActive ? "Produto/serviço reativado." : "Produto/serviço arquivado.");
    } catch (error) {
      window.alert(error.message || "Não foi possível alterar o status do serviço.");
    }
  };

  return (
    <article className="rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-black text-slate-800">{service.name}</h3>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase text-blue-600">
              {TYPE_LABELS[service.type]}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                service.isActive
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {service.isActive ? "Ativo" : "Arquivado"}
            </span>
          </div>
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">
            {service.problemCategory}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => onEdit(service)}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-600 transition hover:bg-blue-100 disabled:opacity-50"
            >
              <Pencil size={14} /> Editar
            </button>
            <button
              type="button"
              onClick={handleToggle}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
            >
              {service.isActive ? <Archive size={14} /> : <ArchiveRestore size={14} />}
              {service.isActive ? "Arquivar" : "Reativar"}
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Descrição
          </p>
          <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-slate-600">
            {service.description}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Como funciona
          </p>
          <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-slate-600">
            {service.howItWorks}
          </p>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Problemas resolvidos
          </p>
          <TagList items={service.problemsSolved} emptyLabel="Nenhum item informado" />
        </div>
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Nichos-alvo
          </p>
          <TagList items={service.targetNiches} emptyLabel="Nenhum nicho informado" />
        </div>
      </div>
    </article>
  );
}

export default function ServiceCatalogSection({
  resource,
  canManage,
  saving,
  onCreate,
  onUpdate,
  onRetry,
}) {
  const [modalService, setModalService] = useState(undefined);
  const modalOpen = modalService !== undefined;

  return (
    <SectionCard>
      <SectionHeader
        icon={Package}
        title="Produtos e serviços"
        description="Gerencie as ofertas disponíveis no catálogo deste workspace."
        actions={
          canManage &&
          !resource.loading &&
          !resource.error &&
          resource.data.length > 0 && (
            <button
              type="button"
              onClick={() => setModalService(null)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 sm:w-auto"
            >
              <Plus size={16} /> Adicionar produto/serviço
            </button>
          )
        }
      />

      {!canManage && !resource.loading && !resource.error && <ReadOnlyNotice />}

      {resource.loading ? (
        <LoadingState label="Carregando catálogo..." />
      ) : resource.error ? (
        <LoadError message={resource.error} onRetry={onRetry} />
      ) : resource.data.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <Package className="mb-4 text-slate-300" size={38} />
          <h3 className="font-black text-slate-700">
            Nenhum produto ou serviço cadastrado
          </h3>
          <p className="mt-2 max-w-md text-sm font-medium text-slate-400">
            O catálogo deste workspace está vazio.
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setModalService(null)}
              className="mt-5 flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700"
            >
              <Plus size={17} /> Adicionar produto/serviço
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {resource.data.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              canManage={canManage}
              saving={saving}
              onEdit={setModalService}
              onToggleStatus={onUpdate}
            />
          ))}
        </div>
      )}

      {canManage && modalOpen && (
        <ServiceModal
          key={modalService?.id || "new"}
          service={modalService}
          saving={saving}
          onClose={() => setModalService(undefined)}
          onCreate={onCreate}
          onUpdate={onUpdate}
        />
      )}
    </SectionCard>
  );
}

