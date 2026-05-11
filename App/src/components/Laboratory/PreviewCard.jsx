import React from "react";
import { Eye, Layers, MapPin } from "lucide-react";

export default function PreviewCard({ preview, onOpen }) {
  return (
    <div className="bg-white rounded-[3rem] p-7 border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 overflow-hidden relative group">
      <div className="absolute -right-10 -top-10 w-32 h-32 bg-purple-50 rounded-full group-hover:scale-[2] transition-transform duration-700" />

      <div className="relative z-10">
        <div className="h-44 rounded-[2rem] bg-slate-950 mb-6 overflow-hidden relative border border-slate-900">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-transparent to-white/10" />

          <div className="absolute top-5 left-5">
            <div className="w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center font-black">
              {preview.project_name?.charAt(0) || "P"}
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