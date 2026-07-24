import React from "react";
import {
  AlertCircle,
  BarChart3,
  Loader2,
  RefreshCw,
  Trophy,
} from "lucide-react";

const ServiceOpportunityMetrics = ({
  data,
  loading,
  error,
  nicheFilter,
  serviceFilter,
  onNicheChange,
  onServiceChange,
  onRefresh,
}) => {
  const summary = data?.summary || {
    opportunities: 0,
    interests: 0,
    previews: 0,
    price_requests: 0,
    closings: 0,
    total_points: 0,
    average_score: 0,
    rates: {
      interest_rate: 0,
      preview_rate: 0,
      price_rate: 0,
      closing_rate: 0,
      overall_closing_rate: 0,
    },
  };

  const serviceRows = Array.isArray(data?.by_service)
    ? data.by_service
    : [];

  const nicheRows = Array.isArray(data?.by_niche)
    ? data.by_niche
    : [];

  const serviceOptions =
    data?.filters?.options?.services || [];

  const nicheOptions =
    data?.filters?.options?.niches || [];

  const serviceLeaders =
    data?.leaders?.services || {};

  const nicheLeaders =
    data?.leaders?.niches || {};

  const hasFilters =
    nicheFilter !== "all" ||
    serviceFilter !== "all";

  const resetFilters = () => {
    onNicheChange("all");
    onServiceChange("all");
  };

  if (loading && !data) {
    return (
      <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm">
        <div className="flex flex-col items-center justify-center py-14">
          <Loader2
            size={34}
            className="animate-spin text-purple-600 mb-4"
          />

          <p className="font-black text-slate-800">
            Calculando desempenho comercial
          </p>

          <p className="text-sm text-slate-400 mt-1">
            Analisando serviços, nichos e etapas do funil.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-xl overflow-hidden relative">
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-purple-500/10" />

        <div className="relative z-10 flex items-start justify-between gap-5 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-purple-600 shadow-lg shadow-purple-600/20">
              <BarChart3 size={22} />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-purple-300 mb-2">
                Inteligência de serviços
              </p>

              <h2 className="text-2xl font-black tracking-tight">
                Performance comercial por serviço e nicho
              </h2>

              <p className="text-sm font-medium text-slate-400 mt-2 max-w-2xl">
                Entenda quais serviços avançam mais, quais nichos apresentam
                maior potencial e onde a negociação perde força.
              </p>

              {data?.period?.label && (
                <span className="inline-flex mt-4 px-3 py-2 rounded-full bg-white/10 text-[10px] font-black uppercase tracking-widest text-slate-300">
                  Período: {data.period.label}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-5 py-3 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin" : ""}
            />
            Atualizar
          </button>
        </div>
      </div>

      <div className="bg-white p-7 rounded-[32px] border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between gap-5 flex-wrap">
          <div>
            <h3 className="font-black text-slate-800">
              Filtros das oportunidades
            </h3>

            <p className="text-xs text-slate-400 font-medium mt-1">
              O período acompanha o filtro principal localizado no topo da
              página.
            </p>
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 text-[10px] font-black uppercase tracking-widest"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-2 mb-2 block">
              Nicho
            </label>

            <select
              value={nicheFilter}
              onChange={(event) =>
                onNicheChange(event.target.value)
              }
              className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:ring-2 focus:ring-purple-500 font-bold text-slate-700"
            >
              <option value="all">
                Todos os nichos
              </option>

              {nicheOptions.map((niche) => (
                <option
                  key={niche.niche_key}
                  value={niche.niche_key}
                >
                  {niche.niche_label} ({niche.opportunities})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-2 mb-2 block">
              Serviço
            </label>

            <select
              value={serviceFilter}
              onChange={(event) =>
                onServiceChange(event.target.value)
              }
              className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:ring-2 focus:ring-purple-500 font-bold text-slate-700"
            >
              <option value="all">
                Todos os serviços
              </option>

              {serviceOptions.map((service) => (
                <option
                  key={service.service_id}
                  value={service.service_key}
                >
                  {service.service_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-5 rounded-[28px] bg-red-50 border border-red-100 text-red-600 flex items-start gap-3">
          <AlertCircle
            size={20}
            className="shrink-0 mt-0.5"
          />

          <div className="flex-1">
            <p className="font-black">
              Não foi possível carregar as métricas
            </p>

            <p className="text-sm font-medium mt-1">
              {error}
            </p>

            <button
              type="button"
              onClick={onRefresh}
              className="mt-4 px-4 py-2 rounded-xl bg-white border border-red-100 text-[10px] font-black uppercase tracking-widest"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {loading && data && (
        <div className="px-5 py-3 rounded-2xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center gap-3">
          <Loader2
            size={16}
            className="animate-spin"
          />

          <p className="text-xs font-black uppercase tracking-widest">
            Atualizando métricas
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <OpportunityMetricCard
          title="Oportunidades"
          value={summary.opportunities}
          desc="Serviços selecionados"
        />

        <OpportunityMetricCard
          title="Interesses"
          value={summary.interests}
          desc="Interesse confirmado"
        />

        <OpportunityMetricCard
          title="Previews"
          value={summary.previews}
          desc="Demonstrações apresentadas"
        />

        <OpportunityMetricCard
          title="Pedidos de preço"
          value={summary.price_requests}
          desc="Avanços para investimento"
        />

        <OpportunityMetricCard
          title="Fechamentos"
          value={summary.closings}
          desc="Negócios concluídos"
          tone="green"
        />

        <OpportunityMetricCard
          title="Pontos totais"
          value={summary.total_points}
          desc="Pontuação acumulada"
        />

        <OpportunityMetricCard
          title="Score médio"
          value={`${Number(summary.average_score || 0).toFixed(2)}/8`}
          desc={summary.sample_status || "Sem histórico"}
          tone="purple"
        />

        <OpportunityMetricCard
          title="Conversão geral"
          value={`${Number(
            summary.rates?.overall_closing_rate || 0,
          ).toFixed(1)}%`}
          desc="Selecionados que fecharam"
          tone="green"
        />
      </div>

      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
        <div className="mb-7">
          <h3 className="font-black text-slate-800">
            Taxas entre as etapas
          </h3>

          <p className="text-xs text-slate-400 font-medium mt-1">
            Cada taxa considera a etapa imediatamente anterior.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <RateBox
            label="Seleção → Interesse"
            value={summary.rates?.interest_rate}
          />

          <RateBox
            label="Interesse → Preview"
            value={summary.rates?.preview_rate}
          />

          <RateBox
            label="Preview → Preço"
            value={summary.rates?.price_rate}
          />

          <RateBox
            label="Preço → Fechamento"
            value={summary.rates?.closing_rate}
          />

          <RateBox
            label="Seleção → Fechamento"
            value={summary.rates?.overall_closing_rate}
            highlight
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <LeaderPanel
          title="Destaques por serviço"
          items={[
            {
              label: "Mais escolhido",
              leader: serviceLeaders.most_selected,
              value: (leader) =>
                `${leader.opportunities} oportunidades`,
            },
            {
              label: "Maior score médio",
              leader: serviceLeaders.highest_average_score,
              value: (leader) =>
                `${Number(leader.average_score || 0).toFixed(2)}/8`,
            },
            {
              label: "Mais fechamentos",
              leader: serviceLeaders.most_closings,
              value: (leader) =>
                `${leader.closings} fechamentos`,
            },
            {
              label: "Maior conversão",
              leader: serviceLeaders.highest_closing_rate,
              value: (leader) =>
                `${Number(
                  leader.rates?.overall_closing_rate || 0,
                ).toFixed(1)}%`,
            },
          ]}
          nameField="service_name"
        />

        <LeaderPanel
          title="Destaques por nicho"
          items={[
            {
              label: "Mais oportunidades",
              leader: nicheLeaders.most_opportunities,
              value: (leader) =>
                `${leader.opportunities} oportunidades`,
            },
            {
              label: "Maior score médio",
              leader: nicheLeaders.highest_average_score,
              value: (leader) =>
                `${Number(leader.average_score || 0).toFixed(2)}/8`,
            },
            {
              label: "Mais fechamentos",
              leader: nicheLeaders.most_closings,
              value: (leader) =>
                `${leader.closings} fechamentos`,
            },
            {
              label: "Maior conversão",
              leader: nicheLeaders.highest_closing_rate,
              value: (leader) =>
                `${Number(
                  leader.rates?.overall_closing_rate || 0,
                ).toFixed(1)}%`,
            },
          ]}
          nameField="niche_label"
        />
      </div>

      <StatsTable
        title="Ranking por serviço"
        description="Desempenho de cada solução ao longo do funil comercial."
        rows={serviceRows}
        type="service"
      />

      <StatsTable
        title="Ranking por nicho"
        description="Resultados agrupados pela categoria comercial do lead."
        rows={nicheRows}
        type="niche"
      />
    </section>
  );
};

const OpportunityMetricCard = ({
  title,
  value,
  desc,
  tone = "slate",
}) => {
  const valueClass =
    tone === "green"
      ? "text-emerald-500"
      : tone === "purple"
        ? "text-purple-600"
        : "text-slate-900";

  return (
    <div className="bg-white rounded-[30px] border border-slate-100 p-6 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
        {title}
      </p>

      <p className={`text-3xl font-black my-2 ${valueClass}`}>
        {value}
      </p>

      <p className="text-xs text-slate-400 font-medium">
        {desc}
      </p>
    </div>
  );
};

const RateBox = ({
  label,
  value,
  highlight = false,
}) => (
  <div
    className={`p-5 rounded-[26px] border ${
      highlight
        ? "bg-green-50 border-green-100"
        : "bg-slate-50 border-slate-100"
    }`}
  >
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
      {label}
    </p>

    <p
      className={`text-2xl font-black mt-2 ${
        highlight
          ? "text-green-600"
          : "text-slate-900"
      }`}
    >
      {Number(value || 0).toFixed(1)}%
    </p>
  </div>
);

const LeaderPanel = ({
  title,
  items,
  nameField,
}) => (
  <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
    <div className="flex items-center gap-3 mb-6">
      <div className="p-3 rounded-2xl bg-amber-50 text-amber-500">
        <Trophy size={19} />
      </div>

      <h3 className="font-black text-slate-800">
        {title}
      </h3>
    </div>

    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4"
        >
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              {item.label}
            </p>

            <p className="text-sm font-black text-slate-800 mt-1">
              {item.leader?.[nameField] || "Sem dados"}
            </p>
          </div>

          <span className="text-xs font-black text-purple-600 text-right">
            {item.leader
              ? item.value(item.leader)
              : "—"}
          </span>
        </div>
      ))}
    </div>
  </div>
);

const StatsTable = ({
  title,
  description,
  rows,
  type,
}) => (
  <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
    <div className="mb-6">
      <h3 className="font-black text-slate-800">
        {title}
      </h3>

      <p className="text-xs text-slate-400 font-medium mt-1">
        {description}
      </p>
    </div>

    {rows.length === 0 ? (
      <div className="p-8 rounded-[28px] bg-slate-50 border border-dashed border-slate-200 text-center">
        <p className="font-bold text-slate-400">
          Nenhuma oportunidade encontrada com os filtros selecionados.
        </p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1250px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
              <th className="pb-4">Posição</th>
              <th className="pb-4">
                {type === "service" ? "Serviço" : "Nicho"}
              </th>
              <th className="pb-4">Selecionados</th>
              <th className="pb-4">Interesses</th>
              <th className="pb-4">Previews</th>
              <th className="pb-4">Preços</th>
              <th className="pb-4">Fechados</th>
              <th className="pb-4">Pontos</th>
              <th className="pb-4">Score médio</th>
              <th className="pb-4">Conversão</th>
              <th className="pb-4">Amostra</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={
                  type === "service"
                    ? row.service_id
                    : row.niche_key
                }
                className="border-b border-slate-50 last:border-b-0"
              >
                <td className="py-4">
                  <span className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs">
                    {row.rank}
                  </span>
                </td>

                <td className="py-4">
                  <p className="font-black text-slate-800 text-sm">
                    {type === "service"
                      ? row.service_name
                      : row.niche_label}
                  </p>

                  <p className="text-[10px] font-bold uppercase tracking-widest text-purple-500 mt-1">
                    {type === "service"
                      ? row.problem_category
                      : `${row.services_count} serviços`}
                  </p>
                </td>

                <NumberCell value={row.opportunities} />
                <NumberCell value={row.interests} />
                <NumberCell value={row.previews} />
                <NumberCell value={row.price_requests} />
                <NumberCell value={row.closings} />
                <NumberCell value={row.total_points} />

                <td className="py-4 font-black text-slate-800">
                  {Number(row.average_score || 0).toFixed(2)}/8
                </td>

                <td className="py-4">
                  <span className="inline-flex px-3 py-1.5 rounded-full bg-green-50 text-green-600 text-xs font-black">
                    {Number(
                      row.rates?.overall_closing_rate || 0,
                    ).toFixed(1)}
                    %
                  </span>
                </td>

                <td className="py-4">
                  <SampleBadge
                    status={row.sample_status}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

const NumberCell = ({ value }) => (
  <td className="py-4 text-slate-600 font-semibold">
    {Number(value || 0)}
  </td>
);

const SampleBadge = ({ status }) => {
  const classes =
    status === "Histórico relevante"
      ? "bg-green-50 text-green-600 border-green-100"
      : status === "Histórico inicial"
        ? "bg-blue-50 text-blue-600 border-blue-100"
        : status === "Amostra pequena"
          ? "bg-orange-50 text-orange-600 border-orange-100"
          : "bg-slate-50 text-slate-400 border-slate-100";

  return (
    <span
      className={`inline-flex px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${classes}`}
    >
      {status}
    </span>
  );
};

export default ServiceOpportunityMetrics;