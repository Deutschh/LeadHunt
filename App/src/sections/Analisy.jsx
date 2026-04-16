import React, { useEffect, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const Analysis = () => {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState("30");

  const loadStats = async () => {
    const { data } = await axios.get(
      `${API_URL}/api/leads/stats/dashboard?period=${period}`,
    );
    setData(data);
  };

  useEffect(() => {
    loadStats();
  }, [period]);

  if (!data)
    return (
      <div className="p-10 text-center">
        Sincronizando dados estratégicos...
      </div>
    );

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen space-y-8">
      {/* SELETOR DE PERÍODO  */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-black italic uppercase tracking-tighter">
          Inteligência de Mercado
        </h1>
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200">
          {["1", "7", "30"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-6 py-2 rounded-xl font-bold text-xs transition-all ${period === p ? "bg-black text-white" : "text-slate-400"}`}
            >
              {p === "1" ? "Hoje" : `${p} Dias`}
            </button>
          ))}
        </div>
      </div>

      {/* CARDS DE TAXAS (%) [cite: 202, 203] */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <RateCard
          title="Taxa de Resposta"
          value={`${data.core.response_rate.toFixed(1)}%`}
          desc="Enviados vs Respostas"
        />
        <RateCard
          title="Taxa de Interesse"
          value={`${data.core.interest_rate.toFixed(1)}%`}
          desc="Respostas vs Engajados"
        />
        <RateCard
          title="Conversão Final"
          value={`${data.core.conversion_rate.toFixed(1)}%`}
          desc="Enviados vs Fechados"
        />
      </div>

      {/* FUNIL DE 6 ETAPAS [cite: 72-79, 175-181] */}
      <div className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-100">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-10 text-center">
          Saúde do Funil (6 Etapas)
        </h3>
        <div className="space-y-4 max-w-2xl mx-auto">
          <FunnelRow
            label="1. Enviados"
            value={data.core.sent}
            color="bg-slate-200"
            total={data.core.total_leads}
          />
          <FunnelRow
            label="2. Respostas"
            value={data.core.replied}
            color="bg-blue-200"
            total={data.core.total_leads}
          />
          <FunnelRow
            label="3. Engajados"
            value={data.core.engaged}
            color="bg-blue-400"
            total={data.core.total_leads}
          />
          <FunnelRow
            label="4. Previews"
            value={data.core.previews}
            color="bg-orange-400"
            total={data.core.total_leads}
          />
          <FunnelRow
            label="5. Negociação"
            value={data.core.negotiation}
            color="bg-orange-600"
            total={data.core.total_leads}
          />
          <FunnelRow
            label="6. Fechados"
            value={data.core.closed}
            color="bg-green-500"
            total={data.core.total_leads}
          />
        </div>
      </div>

      {/* PERFORMANCE POR NICHO [cite: 28, 100] */}
      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
        <h3 className="font-bold mb-6">Desempenho por Nicho</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.niches.map((n) => (
            <div
              key={n.nicho}
              className="p-4 bg-slate-50 rounded-2xl border border-slate-100"
            >
              <p className="font-black text-slate-800 uppercase text-xs">
                {n.nicho}
              </p>
              <div className="flex justify-between mt-2">
                <span className="text-xs text-slate-500">
                  Taxa de Resposta:
                </span>
                <span className="text-xs font-bold text-blue-600">
                  {n.taxa_res}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Componentes Estilizados
const RateCard = ({ title, value, desc }) => (
  <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
      {title}
    </p>
    <p className="text-4xl font-black text-slate-900 my-2">{value}</p>
    <p className="text-xs text-slate-400 font-medium">{desc}</p>
  </div>
);

const FunnelRow = ({ label, value, color, total }) => (
  <div className="relative group">
    <div className="flex justify-between text-[10px] font-black uppercase mb-1 px-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900">{value}</span>
    </div>
    <div className="w-full bg-slate-50 rounded-full h-4 overflow-hidden border border-slate-100">
      <div
        className={`${color} h-full rounded-full transition-all duration-1000`}
        style={{ width: `${(value / total) * 100}%` }}
      ></div>
    </div>
  </div>
);

export default Analysis;
