import React from "react";
import { ArrowLeft, Calendar, Sparkles, Star } from "lucide-react";

export default function EstheticPremium({ preview, onBack }) {
  const name = preview?.project_name || "Clínica Premium";
  const city = preview?.city || "sua região";
  const whatsapp = preview?.whatsapp || "";

  return (
    <div className="min-h-screen bg-[#08080b] text-white">
      <header className="px-8 py-6 flex items-center justify-between border-b border-white/10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-all font-bold text-sm"
        >
          <ArrowLeft size={18} />
          Voltar ao laboratório
        </button>

        <div className="text-sm font-black tracking-[0.3em] uppercase">
          {name}
        </div>
      </header>

      <section className="min-h-[calc(100vh-80px)] grid grid-cols-1 lg:grid-cols-2 gap-10 px-10 lg:px-20 py-20 items-center">
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-8">
            <Sparkles size={14} />
            Preview exclusivo
          </div>

          <h1 className="text-5xl lg:text-7xl font-black tracking-tight leading-[0.9] mb-8">
            Beleza que transmite confiança antes do primeiro contato.
          </h1>

          <p className="text-white/55 text-lg leading-relaxed max-w-xl mb-10">
            Uma presença visual pensada para organizar tratamentos, destacar
            resultados e transformar interesse em conversas reais em {city}.
          </p>

          <div className="flex flex-wrap gap-4">
            <a
              href={
                whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, "")}` : "#"
              }
              className="bg-white text-black px-7 py-4 rounded-full font-black text-sm hover:scale-105 active:scale-95 transition-all"
            >
              Agendar avaliação
            </a>

            <button className="border border-white/15 px-7 py-4 rounded-full font-black text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all">
              Ver tratamentos
            </button>
          </div>
        </div>

        <div className="relative">
          <div className="aspect-[4/5] rounded-[3rem] bg-gradient-to-br from-white/20 via-white/5 to-transparent border border-white/10 shadow-2xl overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.22),transparent_35%)]" />

            <div className="absolute inset-x-8 top-8 h-64 rounded-[2rem] bg-white/10 border border-white/10 flex items-center justify-center">
              <span className="text-white/30 font-black uppercase tracking-[0.2em]">
                Foto / Procedimento
              </span>
            </div>

            <div className="absolute left-8 right-8 bottom-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6">
              <div className="flex items-center gap-2 text-yellow-300 mb-3">
                <Star size={16} fill="currentColor" />
                <Star size={16} fill="currentColor" />
                <Star size={16} fill="currentColor" />
                <Star size={16} fill="currentColor" />
                <Star size={16} fill="currentColor" />
              </div>

              <h3 className="text-2xl font-black mb-2">{name}</h3>
              <p className="text-white/50 text-sm">
                Tratamentos personalizados, atendimento humanizado e estética
                com percepção premium.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-10 lg:px-20 pb-20 grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          ["Facial", "Cuidados para realçar sua melhor versão."],
          [
            "Corporal",
            "Procedimentos com clareza e apresentação profissional.",
          ],
          ["Resultados", "Antes e depois organizados para gerar confiança."],
        ].map(([title, text]) => (
          <div
            key={title}
            className="bg-white/[0.03] border border-white/10 rounded-[2rem] p-7"
          >
            <Calendar className="text-white/40 mb-5" size={22} />
            <h3 className="font-black text-xl mb-3">{title}</h3>
            <p className="text-white/45 text-sm leading-relaxed">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
