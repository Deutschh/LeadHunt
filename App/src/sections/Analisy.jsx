import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const Analysis = () => {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_URL}/api/leads/stats/dashboard?period=${period}`,
      );
      setData(response.data);
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [period]);

  const core = useMemo(() => {
    if (!data?.core) {
      return {
        total_leads: 0,
        sent: 0,
        replied: 0,
        engaged: 0,
        previews: 0,
        negotiation: 0,
        closed: 0,
        total_revenue: 0,
        response_rate: 0,
        interest_rate: 0,
        conversion_rate: 0,
      };
    }

    return {
      total_leads: Number(data.core.total_leads || 0),
      sent: Number(data.core.sent || 0),
      replied: Number(data.core.replied || 0),
      engaged: Number(data.core.engaged || 0),
      previews: Number(data.core.previews || 0),
      negotiation: Number(data.core.negotiation || 0),
      closed: Number(data.core.closed || 0),
      total_revenue: Number(data.core.total_revenue || 0),
      response_rate: Number(data.core.response_rate || 0),
      interest_rate: Number(data.core.interest_rate || 0),
      conversion_rate: Number(data.core.conversion_rate || 0),
    };
  }, [data]);

  const safeTotalForFunnel = Math.max(core.total_leads, 1);
  const avgRevenuePerClosed =
    core.closed > 0 ? core.total_revenue / core.closed : 0;
  const revenuePerLead =
    core.total_leads > 0 ? core.total_revenue / core.total_leads : 0;

  if (loading) {
    return (
      <div className="p-10 text-center text-slate-500 font-bold">
        Sincronizando dados estratégicos...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-10 text-center">
        <p className="text-slate-500 font-bold mb-4">
          Não foi possível carregar os dados da análise.
        </p>
        <button
          onClick={loadStats}
          className="bg-black text-white px-6 py-3 rounded-2xl font-bold"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[#F8FAFC] min-h-screen space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">
            Inteligência de Mercado
          </h1>
          <p className="text-slate-400 text-sm font-medium mt-1">
            Veja onde estão as respostas, negociações e fechamentos.
          </p>
        </div>

        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200">
          {["1", "7", "30"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-6 py-2 rounded-xl font-bold text-xs transition-all ${
                period === p ? "bg-black text-white" : "text-slate-400"
              }`}
            >
              {p === "1" ? "Hoje" : `${p} Dias`}
            </button>
          ))}
        </div>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <MetricCard
          title="Leads no período"
          value={core.total_leads}
          desc="Base analisada"
        />
        <MetricCard
          title="Fechamentos"
          value={core.closed}
          desc="Negócios concluídos"
        />
        <MetricCard
          title="Faturamento"
          value={formatCurrency(core.total_revenue)}
          desc="Receita total"
        />
        <MetricCard
          title="Ticket médio"
          value={formatCurrency(avgRevenuePerClosed)}
          desc="Receita por fechamento"
        />
      </div>

      {/* Taxas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <RateCard
          title="Taxa de Resposta"
          value={`${core.response_rate.toFixed(1)}%`}
          desc="Enviados vs Respostas"
        />
        <RateCard
          title="Taxa de Interesse"
          value={`${core.interest_rate.toFixed(1)}%`}
          desc="Respostas vs Engajados"
        />
        <RateCard
          title="Conversão Final"
          value={`${core.conversion_rate.toFixed(1)}%`}
          desc="Enviados vs Fechados"
        />
      </div>

      {/* Funil */}
      <div className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-10 flex-wrap gap-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">
            Saúde do Funil
          </h3>
          <span className="text-xs font-bold text-slate-400">
            Receita por lead: {formatCurrency(revenuePerLead)}
          </span>
        </div>

        <div className="space-y-4 max-w-3xl mx-auto">
          <FunnelRow
            label="1. Enviados"
            value={core.sent}
            color="bg-slate-200"
            total={safeTotalForFunnel}
          />
          <FunnelRow
            label="2. Respostas"
            value={core.replied}
            color="bg-blue-200"
            total={safeTotalForFunnel}
          />
          <FunnelRow
            label="3. Engajados"
            value={core.engaged}
            color="bg-blue-400"
            total={safeTotalForFunnel}
          />
          <FunnelRow
            label="4. Previews"
            value={core.previews}
            color="bg-orange-400"
            total={safeTotalForFunnel}
          />
          <FunnelRow
            label="5. Negociação"
            value={core.negotiation}
            color="bg-orange-600"
            total={safeTotalForFunnel}
          />
          <FunnelRow
            label="6. Fechados"
            value={core.closed}
            color="bg-green-500"
            total={safeTotalForFunnel}
          />
        </div>
      </div>

      {/* Resumo operacional */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MiniCard
          title="Mensagens enviadas"
          value={core.sent}
          desc="Leads abordados no período"
        />
        <MiniCard
          title="Previews enviados"
          value={core.previews}
          desc="Momento mais importante da oferta"
        />
        <MiniCard
          title="Em negociação"
          value={core.negotiation}
          desc="Leads mais próximos do fechamento"
        />
      </div>

      {/* Nichos */}
      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
        <h3 className="font-bold mb-6 text-slate-800">Desempenho por Nicho</h3>

        {data.niches?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="pb-4">Nicho</th>
                  <th className="pb-4">Leads</th>
                  <th className="pb-4">Respostas</th>
                  <th className="pb-4">Vendas</th>
                  <th className="pb-4">Taxa de Resposta</th>
                  <th className="pb-4">Taxa de Fechamento</th>
                </tr>
              </thead>
              <tbody>
                {data.niches.map((n) => {
                  const leads = Number(n.leads || 0);
                  const respostas = Number(n.respostas || 0);
                  const vendas = Number(n.vendas || 0);
                  const taxaFechamento =
                    leads > 0
                      ? ((vendas / leads) * 100).toFixed(1) + "%"
                      : "0%";

                  return (
                    <tr
                      key={n.nicho || "Sem nicho"}
                      className="border-b border-slate-50 last:border-b-0"
                    >
                      <td className="py-4 font-black text-slate-800 text-sm uppercase">
                        {n.nicho || "Sem nicho"}
                      </td>
                      <td className="py-4 text-slate-600 font-semibold">
                        {leads}
                      </td>
                      <td className="py-4 text-slate-600 font-semibold">
                        {respostas}
                      </td>
                      <td className="py-4 text-slate-600 font-semibold">
                        {vendas}
                      </td>
                      <td className="py-4">
                        <span className="inline-flex px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold">
                          {n.taxa_res}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className="inline-flex px-3 py-1 rounded-full bg-green-50 text-green-600 text-xs font-bold">
                          {taxaFechamento}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-slate-400 font-medium">
            Nenhum dado por nicho disponível para este período.
          </div>
        )}
      </div>
    </div>
  );
};

const MetricCard = ({ title, value, desc }) => (
  <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
      {title}
    </p>
    <p className="text-3xl font-black text-slate-900 my-2 break-words">
      {value}
    </p>
    <p className="text-xs text-slate-400 font-medium">{desc}</p>
  </div>
);

const RateCard = ({ title, value, desc }) => (
  <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
      {title}
    </p>
    <p className="text-4xl font-black text-slate-900 my-2">{value}</p>
    <p className="text-xs text-slate-400 font-medium">{desc}</p>
  </div>
);

const MiniCard = ({ title, value, desc }) => (
  <div className="bg-white p-6 rounded-[30px] border border-slate-100 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
      {title}
    </p>
    <p className="text-2xl font-black text-slate-900 my-2">{value}</p>
    <p className="text-xs text-slate-400 font-medium">{desc}</p>
  </div>
);

const FunnelRow = ({ label, value, color, total }) => {
  const width = Math.max(0, Math.min(100, (value / total) * 100));

  return (
    <div className="relative group">
      <div className="flex justify-between text-[10px] font-black uppercase mb-1 px-2">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-900">{value}</span>
      </div>
      <div className="w-full bg-slate-50 rounded-full h-4 overflow-hidden border border-slate-100">
        <div
          className={`${color} h-full rounded-full transition-all duration-1000`}
          style={{ width: `${width}%` }}
        ></div>
      </div>
    </div>
  );
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default Analysis;
