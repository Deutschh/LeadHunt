import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import MetricCard from "../components/Analisy/MetricCard";
import RateCard from "../components/Analisy/RateCard";
import MiniCard from "../components/Analisy/MiniCard";
import FunnelRow from "../components/Analisy/FunnelRow";
import InfoRow from "../components/Analisy/InfoRow";
import useAnalysisMetrics from "../hooks/useAnalysisMetrics";
import PromptPerformanceTable from "../components/Analisy/PromptPerformanceTable";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const Analysis = () => {
  const [data, setData] = useState(null);
  const [leads, setLeads] = useState([]);
  const [sendingNumbers, setSendingNumbers] = useState([]);
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);
  const [showAllPrompts, setShowAllPrompts] = useState(false);

  const loadStats = async () => {
    try {
      setLoading(true);

      const [statsResponse, leadsResponse, numbersResponse] = await Promise.all(
        [
          axios.get(
            `${API_URL}/api/leads/stats/dashboard?period=${period}&includeArchived=${showAllPrompts}`,
          ),
          axios.get(`${API_URL}/api/leads`),
          axios.get(`${API_URL}/api/leads/sending-numbers`),
        ],
      );

      setData(statsResponse.data);
      setLeads(leadsResponse.data || []);
      setSendingNumbers(numbersResponse.data || []);
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
      setData(null);
      setLeads([]);
      setSendingNumbers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [period, showAllPrompts]);

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

  const { followupMetrics, chipMetrics, sendingSummary } = useAnalysisMetrics({
    filteredLeadsByPeriod,
    sendingNumbers,
    core,
  });

  const promptMetrics = data?.prompts || [];

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
            Centro de comando da operação, chips, follow-up e performance de
            copy.
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
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h3 className="font-bold text-slate-800">
            Saúde Operacional dos Chips
          </h3>
          <button
            onClick={loadStats}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest"
          >
            Atualizar
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          <MiniCard
            title="Ativos"
            value={sendingSummary.active}
            desc="Chips habilitados"
          />
          <MiniCard
            title="Saudáveis"
            value={sendingSummary.healthy}
            desc="Operando normalmente"
          />
          <MiniCard
            title="Warning"
            value={sendingSummary.warning}
            desc="Com falhas recentes"
          />
          <MiniCard
            title="Pausados"
            value={sendingSummary.paused}
            desc="Bloqueados temporariamente"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {sendingNumbers.map((chip) => {
            const paused =
              chip.paused_until && new Date(chip.paused_until) > new Date();

            const healthTone =
              chip.health_status === "healthy"
                ? "bg-green-100 text-green-700"
                : chip.health_status === "warning"
                  ? "bg-orange-100 text-orange-700"
                  : chip.health_status === "paused" || paused
                    ? "bg-red-100 text-red-700"
                    : "bg-slate-200 text-slate-700";

            return (
              <div
                key={chip.id}
                className="p-6 rounded-[28px] border border-slate-100 bg-slate-50 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      {chip.label}
                    </p>
                    <p className="text-xs text-slate-400 font-bold mt-1">
                      {chip.phone_number}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${healthTone}`}
                  >
                    {paused ? "PAUSADO" : chip.health_status || "unknown"}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <InfoRow
                    label="Perfil"
                    value={chip.whatsapp_profile_name || "—"}
                  />
                  <InfoRow label="Porta" value={chip.chrome_port || "—"} />
                  <InfoRow label="Status" value={chip.status || "—"} />
                  <InfoRow
                    label="Aquecimento"
                    value={chip.warmup_stage || "—"}
                  />
                  <InfoRow
                    label="Uso hoje"
                    value={`${chip.sent_today} / ${chip.daily_limit}`}
                  />
                  <InfoRow label="Restante" value={chip.available_slots} />
                  <InfoRow
                    label="Falhas seguidas"
                    value={chip.consecutive_failures || 0}
                  />
                  <InfoRow
                    label="Último health check"
                    value={
                      chip.last_health_check_at
                        ? formatDateTime(chip.last_health_check_at)
                        : "—"
                    }
                  />
                  <InfoRow
                    label="Pausado até"
                    value={
                      chip.paused_until
                        ? formatDateTime(chip.paused_until)
                        : "—"
                    }
                  />
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    <span>Uso diário</span>
                    <span>{chip.usage_percent}%</span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        chip.usage_percent >= 90
                          ? "bg-red-500"
                          : chip.usage_percent >= 70
                            ? "bg-orange-500"
                            : "bg-green-500"
                      }`}
                      style={{ width: `${chip.usage_percent}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-2xl bg-white border border-slate-100 min-h-[92px]">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
                    Último erro
                  </p>
                  <p className="text-xs text-slate-600 font-medium break-words">
                    {chip.last_error || "Nenhum erro recente."}
                  </p>
                </div>

                <div className="mt-4">
                  <span
                    className={`inline-flex px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      chip.can_send
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {chip.can_send
                      ? "Pronto para envio"
                      : "Indisponível para envio"}
                  </span>
                </div>
              </div>
            );
          })}
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
            value={sendingNumbers.filter((c) => c.is_active).length}
            desc="Números ativos na operação"
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

      <PromptPerformanceTable
        promptMetrics={promptMetrics}
        onStatusUpdated={loadStats}
        showAllPrompts={showAllPrompts}
        onToggleShowAll={() => setShowAllPrompts((prev) => !prev)}
      />
    </div>
  );
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("pt-BR");
}

export default Analysis;
