import React, { useEffect, useState } from "react";
import {
  Target,
  MapPin,
  Hash,
  Star,
  Rocket,
  Globe,
} from "lucide-react";
import useOperationalApi from "../hooks/useOperationalApi.js";

const SearchSection = ({ onStartSearch, loading }) => {
  const api = useOperationalApi();
  const [niches, setNiches] = useState([]);

  const [config, setConfig] = useState({
    niche: "",
    location: "",
    limit: 10,
    minRating: 4.0,
    minReviews: 0,
    websiteFilter: "any",
  });

  useEffect(() => {
    const fetchNiches = async () => {
      try {
        const res = await api.get("/leads/niches");

        setNiches(res.data);

        if (res.data.length > 0) {
          setConfig((prev) => ({
            ...prev,
            niche: res.data[0].niche_name,
          }));
        }
      } catch (err) {
        console.error("Erro ao carregar nichos no buscador:", err);
      }
    };

    fetchNiches();
  }, []);

  const handleStart = () => {
    const normalizedConfig = {
      ...config,
      limit: Math.max(1, Number(config.limit) || 10),
      minRating: Math.max(0, Number(config.minRating) || 0),
      minReviews: Math.max(0, Number(config.minReviews) || 0),
    };

    onStartSearch(normalizedConfig);
  };

  return (
    <div className="p-10 flex flex-col items-center justify-center min-h-full w-full animate-in zoom-in-95 duration-500">
      {/* HEADER */}
      <div className="text-center mb-10">
        <h2 className="text-5xl font-black tracking-tighter text-black mb-3 italic">
          Busca Inteligente
        </h2>

        <p className="text-slate-500 font-medium max-w-md mx-auto">
          Escolha uma estratégia do seu laboratório e defina os critérios da
          busca.
        </p>
      </div>

      {/* CONTAINER PRINCIPAL */}
      <div className="bg-white/90 backdrop-blur-2xl border border-white w-full max-w-3xl rounded-[4rem] shadow-2xl overflow-hidden">
        {/* PARTE SUPERIOR */}
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

          <div className="absolute w-40 h-40 border border-black/70 rounded-full animate-ping opacity-20" />

          <div className="z-10 text-center">
            <span className="text-[12px] font-black uppercase tracking-[0.4em] text-slate-400">
              System Ready
            </span>

            <div className="h-1 w-16 bg-[#00b37e] mx-auto mt-2 rounded-full shadow-lg" />
          </div>
        </div>

        {/* FORMULÁRIO */}
        <div className="p-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            {/* NICHO */}
            <FormGroup label="O que buscar?" icon={<Target size={14} />}>
              <select
                className="input-premium appearance-none cursor-pointer"
                value={config.niche}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    niche: e.target.value,
                  }))
                }
              >
                {niches.length > 0 ? (
                  niches.map((niche) => (
                    <option key={niche.id} value={niche.niche_name}>
                      {niche.niche_name}
                    </option>
                  ))
                ) : (
                  <option value="">Nenhum nicho cadastrado</option>
                )}
              </select>

              <SelectArrow />
            </FormGroup>

            {/* LOCALIZAÇÃO */}
            <FormGroup label="Localização" icon={<MapPin size={14} />}>
              <input
                type="text"
                placeholder="Ex: Sorocaba, SP"
                className="input-premium"
                value={config.location}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    location: e.target.value,
                  }))
                }
              />
            </FormGroup>

            {/* META */}
            <FormGroup label="Meta de Leads" icon={<Hash size={14} />}>
              <input
                type="number"
                min="1"
                max="250"
                className="input-premium"
                value={config.limit}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    limit: e.target.value,
                  }))
                }
              />
            </FormGroup>

            {/* NOTA */}
            <FormGroup label="Avaliação mínima" icon={<Star size={14} />}>
              <select
                className="input-premium appearance-none cursor-pointer"
                value={config.minRating}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    minRating: e.target.value,
                  }))
                }
              >
                <option value="0">Qualquer nota</option>
                <option value="3.5">3.5+ estrelas</option>
                <option value="4">4.0+ estrelas</option>
                <option value="4.5">4.5+ estrelas</option>
              </select>

              <SelectArrow />
            </FormGroup>

            {/* AVALIAÇÕES */}
            <FormGroup
              label="Quantidade mínima de avaliações"
              icon={<Hash size={14} />}
            >
              <input
                type="number"
                min="0"
                placeholder="Ex: 20"
                className="input-premium"
                value={config.minReviews}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    minReviews: e.target.value,
                  }))
                }
              />
            </FormGroup>

            {/* SITE */}
            <FormGroup label="Presença de site" icon={<Globe size={14} />}>
              <select
                className="input-premium appearance-none cursor-pointer"
                value={config.websiteFilter}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    websiteFilter: e.target.value,
                  }))
                }
              >
                <option value="any">Qualquer empresa</option>
                <option value="with">Somente empresas com site</option>
                <option value="without">Somente empresas sem site</option>
              </select>

              <SelectArrow />
            </FormGroup>
          </div>

          <button
            type="button"
            onClick={handleStart}
            disabled={
              loading ||
              niches.length === 0 ||
              !config.niche ||
              !config.location.trim()
            }
            className="w-full bg-black text-white py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-4 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-black/20 disabled:opacity-50 disabled:hover:scale-100 group"
          >
            {loading ? (
              "Iniciando extração..."
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
        Alpha Version 1.0.5
      </p>
    </div>
  );
};

function FormGroup({ label, icon, children }) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
        {icon}
        {label}
      </label>

      <div className="relative">{children}</div>
    </div>
  );
}

function SelectArrow() {
  return (
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
  );
}

export default SearchSection;
