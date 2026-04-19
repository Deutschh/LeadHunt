import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const Analysis = () => {
  const [data, setData] = useState(null);
  const [leads, setLeads] = useState([]);
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    try {
      setLoading(true);

      const [statsResponse, leadsResponse] = await Promise.all([
        axios.get(`${API_URL}/api/leads/stats/dashboard?period=${period}`),
        axios.get(`${API_URL}/api/leads`),
      ]);

      setData(statsResponse.data);
      setLeads(leadsResponse.data || []);
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
      setData(null);
      setLeads([]);
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

  const filteredLeadsByPeriod = useMemo(() => {
    const days = Number(period);
    const now = new Date();

    return leads.filter((lead) => {
      if (!lead.created_at) return false;
      const createdAt = new Date(lead.created_at);
      const diffDays = (now - createdAt) / (1000 * 60 * 60 * 24);
      return diffDays <= days;
    });
  }, [leads, period]);

  const followupMetrics = useMemo(() => {
    const leadsWithFollowup = filteredLeadsByPeriod.filter(
      (lead) => Number(lead.followup_count || 0) > 0,
    );

    const totalFollowupsSent = leadsWithFollowup.reduce(
      (acc, lead) => acc + Number(lead.followup_count || 0),
      0,
    );

    const scheduledFollowups = filteredLeadsByPeriod.filter(
      (lead) =>
        lead.status === "contacted" &&
        !lead.last_reply_at &&
        !!lead.next_followup_at &&
        !lead.is_archived,
    ).length;

    const recoveredByFollowup = filteredLeadsByPeriod.filter(
      (lead) =>
        Number(lead.followup_count || 0) > 0 &&
        (lead.status === "responded" ||
          lead.pipeline_stage === "responded" ||
          lead.pipeline_stage === "interested" ||
          lead.pipeline_stage === "preview_sent" ||
          lead.pipeline_stage === "negotiation" ||
          lead.pipeline_stage === "closed"),
    ).length;

    const leadsInFollowup = filteredLeadsByPeriod.filter(
      (lead) =>
        Number(lead.followup_count || 0) > 0 &&
        !lead.last_reply_at &&
        lead.status === "contacted" &&
        !lead.is_archived,
    ).length;

    const followupRate =
      core.sent > 0 ? (totalFollowupsSent / core.sent) * 100 : 0;

    const recoveryRate =
      leadsWithFollowup.length > 0
        ? (recoveredByFollowup / leadsWithFollowup.length) * 100
        : 0;

    return {
      totalFollowupsSent,
      scheduledFollowups,
      recoveredByFollowup,
      leadsInFollowup,
      followupRate,
      recoveryRate,
    };
  }, [filteredLeadsByPeriod, core.sent]);

  const chipMetrics = useMemo(() => {
    const chipMap = new Map();

    filteredLeadsByPeriod.forEach((lead) => {
      const chip = lead.assigned_number || "Sem chip";

      if (!chipMap.has(chip)) {
        chipMap.set(chip, {
          chip,
          leads: 0,
          sent: 0,
          replied: 0,
          engaged: 0,
          previews: 0,
          negotiation: 0,
          closed: 0,
          revenue: 0,
          followups: 0,
        });
      }

      const item = chipMap.get(chip);

      item.leads += 1;

      const stage = lead.pipeline_stage || "";
      const status = lead.status || "";

      if (
        [
          "contacted",
          "responded",
          "interested",
          "preview_sent",
          "negotiation",
          "closed",
        ].includes(stage) ||
        status === "contacted"
      ) {
        item.sent += 1;
      }

      if (
        [
          "responded",
          "interested",
          "preview_sent",
          "negotiation",
          "closed",
        ].includes(stage) ||
        status === "responded"
      ) {
        item.replied += 1;
      }

      if (
        ["interested", "preview_sent", "negotiation", "closed"].includes(stage)
      ) {
        item.engaged += 1;
      }

      if (
        lead.preview_sent ||
        ["preview_sent", "negotiation", "closed"].includes(stage)
      ) {
        item.previews += 1;
      }

      if (
        stage === "negotiation" ||
        status === "negotiation" ||
        status === "negociacao"
      ) {
        item.negotiation += 1;
      }

      if (stage === "closed" || status === "closed") {
        item.closed += 1;
      }

      item.revenue += Number(lead.sale_value || 0);
      item.followups += Number(lead.followup_count || 0);
    });

    return Array.from(chipMap.values())
      .map((item) => ({
        ...item,
        responseRate: item.sent > 0 ? (item.replied / item.sent) * 100 : 0,
        conversionRate: item.sent > 0 ? (item.closed / item.sent) * 100 : 0,
        avgTicket: item.closed > 0 ? item.revenue / item.closed : 0,
      }))
      .sort((a, b) => {
        if (b.closed !== a.closed) return b.closed - a.closed;
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        return b.responseRate - a.responseRate;
      });
  }, [filteredLeadsByPeriod]);

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
            Veja onde estão as respostas, negociações, follow-ups, chips e
            fechamentos.
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

      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
        <h3 className="font-bold mb-6 text-slate-800">
          Performance de Follow-up
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <MiniCard
            title="Follow-ups enviados"
            value={followupMetrics.totalFollowupsSent}
            desc="Total de tentativas automáticas"
          />
          <MiniCard
            title="Leads em follow-up"
            value={followupMetrics.leadsInFollowup}
            desc="Ainda sem resposta"
          />
          <MiniCard
            title="Follow-ups agendados"
            value={followupMetrics.scheduledFollowups}
            desc="Próximas ações do sistema"
          />
          <MiniCard
            title="Leads recuperados"
            value={followupMetrics.recoveredByFollowup}
            desc="Responderam após follow-up"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <RateCard
            title="Taxa de uso de Follow-up"
            value={`${followupMetrics.followupRate.toFixed(1)}%`}
            desc="Follow-ups enviados vs leads enviados"
          />
          <RateCard
            title="Taxa de Recuperação"
            value={`${followupMetrics.recoveryRate.toFixed(1)}%`}
            desc="Leads recuperados vs leads com follow-up"
          />
        </div>
      </div>

      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h3 className="font-bold text-slate-800">Performance por Chip</h3>
          <span className="text-xs font-bold text-slate-400">
            Baseado em assigned_number
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <MiniCard
            title="Chips ativos no período"
            value={chipMetrics.filter((c) => c.chip !== "Sem chip").length}
            desc="Números usados na operação"
          />
          <MiniCard
            title="Leads sem chip"
            value={chipMetrics.find((c) => c.chip === "Sem chip")?.leads || 0}
            desc="Ainda não atribuídos"
          />
          <MiniCard
            title="Melhor chip"
            value={chipMetrics[0]?.chip || "—"}
            desc="Ranking por fechamentos/receita"
          />
        </div>

        {chipMetrics.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="pb-4">Chip</th>
                  <th className="pb-4">Leads</th>
                  <th className="pb-4">Enviados</th>
                  <th className="pb-4">Respostas</th>
                  <th className="pb-4">Follow-ups</th>
                  <th className="pb-4">Fechados</th>
                  <th className="pb-4">Tx. Resposta</th>
                  <th className="pb-4">Tx. Conversão</th>
                  <th className="pb-4">Faturamento</th>
                  <th className="pb-4">Ticket Médio</th>
                </tr>
              </thead>
              <tbody>
                {chipMetrics.map((chip) => (
                  <tr
                    key={chip.chip}
                    className="border-b border-slate-50 last:border-b-0"
                  >
                    <td className="py-4 font-black text-slate-800 text-sm">
                      {chip.chip}
                    </td>
                    <td className="py-4 text-slate-600 font-semibold">
                      {chip.leads}
                    </td>
                    <td className="py-4 text-slate-600 font-semibold">
                      {chip.sent}
                    </td>
                    <td className="py-4 text-slate-600 font-semibold">
                      {chip.replied}
                    </td>
                    <td className="py-4 text-slate-600 font-semibold">
                      {chip.followups}
                    </td>
                    <td className="py-4 text-slate-600 font-semibold">
                      {chip.closed}
                    </td>
                    <td className="py-4">
                      <span className="inline-flex px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold">
                        {chip.responseRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4">
                      <span className="inline-flex px-3 py-1 rounded-full bg-green-50 text-green-600 text-xs font-bold">
                        {chip.conversionRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4 text-slate-800 font-bold">
                      {formatCurrency(chip.revenue)}
                    </td>
                    <td className="py-4 text-slate-600 font-semibold">
                      {formatCurrency(chip.avgTicket)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-slate-400 font-medium">
            Nenhum dado por chip disponível para este período.
          </div>
        )}
      </div>

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
    <p className="text-2xl font-black text-slate-900 my-2 break-words">
      {value}
    </p>
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
