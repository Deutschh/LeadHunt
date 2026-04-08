import React, { useState, useEffect } from "react";
import { Target, MapPin, Hash, Star, Rocket, Globe } from "lucide-react";
import api from "../services/api"; // Certifique-se de que o caminho está correto

const SearchSection = ({ onStartSearch, loading }) => {
  // 1. Estados para os nichos dinâmicos
  const [niches, setNiches] = useState([]);
  const [config, setConfig] = useState({
    niche: "",
    location: "",
    limit: 10,
    minRating: 4.0,
  });

  // 2. Carrega a lista de nichos do banco de dados
  useEffect(() => {
    const fetchNiches = async () => {
      try {
        const res = await api.get("/leads/niches");
        setNiches(res.data);

        // Define o primeiro nicho da lista como padrão, se existir
        if (res.data.length > 0) {
          setConfig((prev) => ({ ...prev, niche: res.data[0].niche_name }));
        }
      } catch (err) {
        console.error("Erro ao carregar nichos no buscador:", err);
      }
    };
    fetchNiches();
  }, []);

  return (
    <div className="p-10 flex flex-col items-center justify-center min-h-full w-full animate-in zoom-in-95 duration-500">
      {/* HEADER */}
      <div className="text-center mb-10">
        <h2 className="text-5xl font-black tracking-tighter text-black mb-3 italic">
          Busca Inteligente
        </h2>
        <p className="text-slate-500 font-medium max-w-md mx-auto">
          Escolha uma estratégia do seu laboratório e defina a região de
          atuação.
        </p>
      </div>

      {/* CONTAINER PRINCIPAL */}
      <div className="bg-white/90 backdrop-blur-2xl border border-white w-full max-w-2xl rounded-[4rem] shadow-2xl overflow-hidden">
        {/* PARTE SUPERIOR: DESIGN (Mantido igual) */}
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
          <div className="z-10 text-center">
            <span className="text-[12px] font-black uppercase tracking-[0.4em] text-slate-400">
              System Ready
            </span>
            <div className="h-1 w-16 bg-[#00b37e] mx-auto mt-2 rounded-full shadow-lg"></div>
          </div>
        </div>

        {/* PARTE INFERIOR: FORMULÁRIO DINÂMICO */}
        <div className="p-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            {/* SELECT DE NICHOS (Agora vindo do Banco) */}
            <FormGroup label="O que buscar?" icon={<Target size={14} />}>
              <select
                className="input-premium appearance-none cursor-pointer"
                value={config.niche}
                onChange={(e) =>
                  setConfig({ ...config, niche: e.target.value })
                }
              >
                {niches.length > 0 ? (
                  niches.map((n) => (
                    <option key={n.id} value={n.niche_name}>
                      {n.niche_name}
                    </option>
                  ))
                ) : (
                  <option value="">Nenhum nicho cadastrado</option>
                )}
              </select>
              {/* Seta decorativa para o select */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                  <path
                    d="M1 1L5 5L9 1"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </FormGroup>

            {/* LOCALIZAÇÃO */}
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

            {/* META DE LEADS */}
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

            {/* AVALIAÇÃO MÍNIMA */}
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
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                  <path
                    d="M1 1L5 5L9 1"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </FormGroup>
          </div>

          <button
            onClick={() => onStartSearch(config)}
            disabled={loading || niches.length === 0 || !config.location}
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
        Alpha Version 1.0.4
      </p>
    </div>
  );
};

// HELPER COMPONENT (Adicionado a lógica da seta decorativa)
function FormGroup({ label, icon, children }) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
        {icon} {label}
      </label>
      <div className="relative">{children}</div>
    </div>
  );
}

export default SearchSection;
