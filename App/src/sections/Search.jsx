import React, { useState } from "react";
import { Target, MapPin, Hash, Star, Rocket, Globe } from "lucide-react";

const SearchSection = ({ onStartSearch, loading }) => {
  // Lista de nichos estratégicos que configuramos no aiService
  const niches = [
    "Limpeza de Estofados",
    "Oficina Mecânica",
    "Estética Automotiva",
    "Clínica de Estética",
  ];

  const [config, setConfig] = useState({
    niche: niches[0], // Começa com o primeiro nicho da lista
    location: "",
    limit: 10,
    minRating: 4.0,
  });

  return (
    <div className="p-10 flex flex-col items-center justify-center min-h-full w-full animate-in zoom-in-95 duration-500">
      {/* HEADER CENTRALIZADO */}
      <div className="text-center mb-10">
        <h2 className="text-5xl font-black tracking-tighter text-black mb-3 italic">
          Busca Inteligente
        </h2>
        <p className="text-slate-500 font-medium max-w-md mx-auto">
          Selecione uma categoria e região para o robô mapear as melhores
          oportunidades.
        </p>
      </div>

      {/* CONTAINER ÚNICO (MAPA + FORM) */}
      <div className="bg-white/90 backdrop-blur-2xl border border-white w-full max-w-2xl rounded-[4rem] shadow-2xl overflow-hidden">
        {/* PARTE SUPERIOR: MAPA DECORATIVO (Mantido conforme seu design) */}
        <div className="relative w-full h-48 bg-slate-100/50 border-b border-white flex items-center justify-center overflow-hidden">
          <svg
            width="100%"
            height="100%"
            className="absolute inset-0 opacity-20"
          >
            <defs>
              <pattern
                id="dotGridSmall"
                x="0"
                y="0"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="2" cy="2" r="1" fill="black" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dotGridSmall)" />
          </svg>

          <div className="absolute w-40 h-40 border border-black/70 rounded-full animate-ping opacity-20"></div>
          <div className="absolute w-42 h-42 border border-black/50 rounded-full animate-pulse"></div>

          <div className="absolute top-10 left-1/4 p-2 bg-white rounded-xl shadow-lg animate-bounce duration-1000">
            <Globe size={20} className="text-[#00b37e]" />
          </div>
          <div className="absolute bottom-10 right-1/4 p-2 bg-black rounded-xl shadow-lg animate-bounce delay-300">
            <Star size={20} className="text-yellow-400" />
          </div>

          <div className="z-10 text-center">
            <span className="text-[12px] font-black uppercase tracking-[0.4em] text-slate-400">
              System Ready
            </span>
            <div className="h-1 w-16 bg-[#00b37e] mx-auto mt-2 rounded-full shadow-lg shadow-[#00b37e]/40"></div>
          </div>
        </div>

        {/* PARTE INFERIOR: FORMULÁRIO COM O SELECT DE NICHOS */}
        <div className="p-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            {/* NICHO (Alterado para SELECT) */}
            <FormGroup label="O que buscar?" icon={<Target size={14} />}>
              <select
                className="input-premium appearance-none cursor-pointer"
                value={config.niche}
                onChange={(e) =>
                  setConfig({ ...config, niche: e.target.value })
                }
              >
                {niches.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </FormGroup>

            {/* LOCALIZAÇÃO (Mantido input para você digitar a cidade) */}
            <FormGroup label="Localização" icon={<MapPin size={14} />}>
              <input
                type="text"
                placeholder="Ex: Sorocaba, SP"
                className="input-premium"
                value={config.location}
                onChange={(e) =>
                  setConfig({ ...config, location: e.target.value })
                }
              />
            </FormGroup>

            {/* LIMITE */}
            <FormGroup label="Meta de Leads" icon={<Hash size={14} />}>
              <input
                type="number"
                value={config.limit}
                className="input-premium"
                onChange={(e) =>
                  setConfig({ ...config, limit: e.target.value })
                }
              />
            </FormGroup>

            {/* REPUTAÇÃO MÍNIMA */}
            <FormGroup label="Avaliação Mínima" icon={<Star size={14} />}>
              <select
                className="input-premium appearance-none cursor-pointer"
                value={config.minRating}
                onChange={(e) =>
                  setConfig({ ...config, minRating: e.target.value })
                }
              >
                <option value="0">Qualquer nota</option>
                <option value="3.5">3.5+ Estrelas</option>
                <option value="4.0">4.0+ Estrelas</option>
                <option value="4.5">4.5+ Estrelas</option>
              </select>
            </FormGroup>
          </div>

          <button
            onClick={() => onStartSearch(config)}
            disabled={loading || !config.location}
            className="w-full bg-black text-white py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-4 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-black/20 disabled:opacity-50 group"
          >
            {loading ? (
              "Iniciando Extração..."
            ) : (
              <>
                Lançar Robô LeadHunt
                <Rocket
                  size={22}
                  className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"
                />
              </>
            )}
          </button>
        </div>
      </div>

      <p className="mt-8 text-slate-400 text-sm font-bold uppercase tracking-widest opacity-50">
        Alpha Version 1.0.3
      </p>
    </div>
  );
};

/* --- HELPER COMPONENTS --- */
function FormGroup({ label, icon, children }) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
        {icon} {label}
      </label>
      <div className="relative">
        {children}
        {/* Seta decorativa para os selects */}
        {children.type === "select" && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <svg
              width="10"
              height="6"
              viewBox="0 0 10 6"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 1L5 5L9 1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchSection;
