import React, { useState } from "react";
import { Plus, Sparkles, Eye, Layers, MapPin, X, Wand2 } from "lucide-react";
import EstheticPremium from "../templates/esthetic/EstheticPremium";

const mockPreviews = [
  {
    id: 1,
    project_name: "Clínica Essence",
    niche: "Clínica de Estética",
    city: "Sorocaba",
    template_key: "esthetic-premium",
    status: "draft",
  },
  {
    id: 2,
    project_name: "Almeida Advocacia",
    niche: "Escritório de Advocacia",
    city: "Campinas",
    template_key: "lawyer-premium",
    status: "draft",
  },
];

const initialForm = {
  project_name: "",
  niche: "Clínica de Estética",
  city: "",
  template_key: "esthetic-premium",
  whatsapp: "",
  instagram: "",
  primary_color: "#ffffff",
  headline: "",
  subheadline: "",
};

export default function Laboratory() {
  const [previews, setPreviews] = useState(mockPreviews);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [selectedPreview, setSelectedPreview] = useState(null);

  const handleCreatePreview = () => {
    if (!form.project_name.trim()) {
      alert("Informe o nome da empresa.");
      return;
    }

    const newPreview = {
      id: Date.now(),
      ...form,
      status: "draft",
    };

    setPreviews((prev) => [newPreview, ...prev]);
    setForm(initialForm);
    setShowModal(false);
  };

  if (selectedPreview) {
    return (
      <EstheticPremium
        preview={selectedPreview}
        onBack={() => setSelectedPreview(null)}
      />
    );
  }

  return (
    <div className="p-10 max-w-[1600px] mx-auto w-full animate-in fade-in duration-700">
      <div className="flex items-center justify-between mb-10">
        <div>
          <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-600 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-4">
            <Sparkles size={14} />
            Laboratório Velaris
          </div>

          <h1 className="text-4xl font-black tracking-tight text-slate-950">
            Gerador de Previews
          </h1>

          <p className="text-slate-400 font-medium mt-2 max-w-xl">
            Crie, organize e reutilize previews comerciais para enviar aos leads
            com mais velocidade.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bg-black text-white px-6 py-4 rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl hover:scale-105 active:scale-95 transition-all"
        >
          <Plus size={18} />
          Novo Preview
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        <LabStat label="Previews criados" value={previews.length} />
        <LabStat label="Templates ativos" value="3" />
        <LabStat label="Nicho principal" value="Estética" />
      </div>

      {previews.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {previews.map((preview) => (
            <PreviewCard
              key={preview.id}
              preview={preview}
              onOpen={() => setSelectedPreview(preview)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white/60 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center">
          <p className="text-slate-400 font-bold">
            Nenhum preview criado ainda.
          </p>
        </div>
      )}

      {showModal && (
        <CreatePreviewModal
          form={form}
          setForm={setForm}
          onClose={() => setShowModal(false)}
          onCreate={handleCreatePreview}
        />
      )}
    </div>
  );
}

function CreatePreviewModal({ form, setForm, onClose, onCreate }) {
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

function LabStat({ label, value }) {
  return (
    <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
        {label}
      </p>
      <p className="text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function PreviewCard({ preview, onOpen }) {
  return (
    <div className="bg-white rounded-[3rem] p-7 border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 overflow-hidden relative group">
      <div className="absolute -right-10 -top-10 w-32 h-32 bg-purple-50 rounded-full group-hover:scale-[2] transition-transform duration-700" />

      <div className="relative z-10">
        <div className="h-44 rounded-[2rem] bg-slate-950 mb-6 overflow-hidden relative border border-slate-900">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-transparent to-white/10" />

          <div className="absolute top-5 left-5">
            <div className="w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center font-black">
              {preview.project_name.charAt(0)}
            </div>
          </div>

          <div className="absolute bottom-5 left-5 right-5">
            <p className="text-white text-xl font-black leading-tight">
              {preview.project_name}
            </p>
            <p className="text-white/50 text-xs font-bold mt-1">
              Preview comercial
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="bg-purple-50 text-purple-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
            {preview.niche}
          </span>

          <span className="bg-slate-50 text-slate-500 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
            {preview.status}
          </span>
        </div>

        <h3 className="text-xl font-black text-slate-950 mb-2">
          {preview.project_name}
        </h3>

        <div className="space-y-2 mb-6">
          <p className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <MapPin size={13} />
            {preview.city || "Cidade não informada"}
          </p>

          <p className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <Layers size={13} />
            {preview.template_key}
          </p>
        </div>

        <button
          onClick={onOpen}
          className="w-full bg-slate-950 cursor-pointer text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-black transition-all"
        >
          <Eye size={17} /> Abrir Preview
        </button>
      </div>
    </div>
  );
}
