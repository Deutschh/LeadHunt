import React from "react";
import { X, Wand2 } from "lucide-react";

export default function CreatePreviewModal({
  form,
  setForm,
  onClose,
  onCreate,
}) {
  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in duration-300 max-h-[90vh] flex flex-col">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-600 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest mb-3">
              <Wand2 size={13} />
              Novo Preview
            </div>

            <h2 className="text-2xl font-black text-slate-950">
              Criar preview comercial
            </h2>

            <p className="text-slate-400 text-sm font-medium mt-1">
              Preencha os dados principais para gerar o primeiro rascunho.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-3 rounded-2xl bg-slate-50 text-slate-400 hover:text-black transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-5 overflow-y-auto">
          <FormField label="Nome da empresa">
            <input
              value={form.project_name}
              onChange={(e) => updateField("project_name", e.target.value)}
              placeholder="Ex: Clínica Essence"
              className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold text-slate-800 focus:ring-2 focus:ring-purple-500"
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Nicho">
              <select
                value={form.niche}
                onChange={(e) => updateField("niche", e.target.value)}
                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold text-slate-800 focus:ring-2 focus:ring-purple-500"
              >
                <option>Clínica de Estética</option>
                <option>Escritório de Advocacia</option>
                <option>Arquitetura</option>
                <option>Restaurante</option>
                <option>Academia</option>
              </select>
            </FormField>

            <FormField label="Cidade">
              <input
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                placeholder="Ex: Sorocaba"
                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold text-slate-800 focus:ring-2 focus:ring-purple-500"
              />
            </FormField>
          </div>

          <FormField label="Template">
            <select
              value={form.template_key}
              onChange={(e) => updateField("template_key", e.target.value)}
              className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold text-slate-800 focus:ring-2 focus:ring-purple-500"
            >
              <option value="esthetic-premium">Estética Premium</option>
              <option value="lawyer-premium">Advocacia Premium</option>
              <option value="architecture-premium">Arquitetura Premium</option>
            </select>
          </FormField>

          <FormField label="Headline principal">
            <input
              value={form.headline}
              onChange={(e) => updateField("headline", e.target.value)}
              placeholder="Ex: Beleza que transmite confiança antes do primeiro contato"
              className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold text-slate-800 focus:ring-2 focus:ring-purple-500"
            />
          </FormField>

          <FormField label="Subheadline">
            <textarea
              value={form.subheadline}
              onChange={(e) => updateField("subheadline", e.target.value)}
              placeholder="Ex: Uma presença visual pensada para organizar tratamentos, destacar resultados e transformar interesse em conversas reais."
              className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 min-h-[110px] resize-none"
            />
          </FormField>

          <FormField label="Cor principal">
            <div className="flex gap-3">
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) => updateField("primary_color", e.target.value)}
                className="w-16 h-14 rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden cursor-pointer"
              />

              <input
                value={form.primary_color}
                onChange={(e) => updateField("primary_color", e.target.value)}
                placeholder="#ffffff"
                className="flex-1 p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold text-slate-800 focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="WhatsApp">
              <input
                value={form.whatsapp}
                onChange={(e) => updateField("whatsapp", e.target.value)}
                placeholder="5511999999999"
                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold text-slate-800 focus:ring-2 focus:ring-purple-500"
              />
            </FormField>

            <FormField label="Instagram">
              <input
                value={form.instagram}
                onChange={(e) => updateField("instagram", e.target.value)}
                placeholder="@empresa"
                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none font-bold text-slate-800 focus:ring-2 focus:ring-purple-500"
              />
            </FormField>
          </div>
        </div>

        <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl font-black text-slate-400 hover:text-black transition-all"
          >
            Cancelar
          </button>

          <button
            onClick={onCreate}
            className="flex-[2] bg-black text-white py-4 rounded-2xl font-black shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
          >
            Criar Preview
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div>
      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2 mb-2 block">
        {label}
      </label>
      {children}
    </div>
  );
}
