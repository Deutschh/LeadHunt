import React, { useState } from "react";
import { Plus, Sparkles, Eye, Layers, MapPin } from "lucide-react";

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

export default function Laboratory() {
  const [previews] = useState(mockPreviews);

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

        <button className="bg-black text-white px-6 py-4 rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl hover:scale-105 active:scale-95 transition-all">
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
            <PreviewCard key={preview.id} preview={preview} />
          ))}
        </div>
      ) : (
        <div className="bg-white/60 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center">
          <p className="text-slate-400 font-bold">
            Nenhum preview criado ainda.
          </p>
        </div>
      )}
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

function PreviewCard({ preview }) {
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

        <div className="flex items-center gap-2 mb-3">
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
            {preview.city}
          </p>

          <p className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <Layers size={13} />
            {preview.template_key}
          </p>
        </div>

        <button className="w-full bg-slate-950 text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-black transition-all">
          <Eye size={17} />
          Abrir Preview
        </button>
      </div>
    </div>
  );
}
