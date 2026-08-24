import MiniCard from "./MiniCard";

export default function PromptPerformanceTable({
  promptMetrics = [],
  showAllPrompts = false,
  onToggleShowAll,
}) {
  const getStatusClass = (status) => {
    if (status === "active") return "bg-green-50 text-green-600";
    if (status === "testing") return "bg-yellow-50 text-yellow-700";
    if (status === "archived") return "bg-slate-100 text-slate-500";
    return "bg-slate-100 text-slate-500";
  };

  return (
    <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-slate-800">Performance de Copy / IA</h3>
          <span className="text-xs font-bold text-slate-400">
            Baseado em ai_prompt_angle / ai_prompt_label
          </span>
        </div>

        <button
          onClick={onToggleShowAll}
          className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-black uppercase hover:bg-slate-200 transition-all"
        >
          {showAllPrompts ? "Ver somente ativas" : "Ver todas"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <MiniCard
          title="Abordagens rastreadas"
          value={promptMetrics.length}
          desc="Ângulos de copy identificados"
        />
        <MiniCard
          title="Melhor abordagem"
          value={promptMetrics[0]?.prompt_label || "—"}
          desc="Ranking por resposta/conversão"
        />
        <MiniCard
          title="Versão principal"
          value={promptMetrics[0]?.prompt_version || "—"}
          desc="Prompt version mais forte"
        />
      </div>

      {promptMetrics.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <th className="pb-4">Abordagem</th>
                <th className="pb-4">Status</th>
                <th className="pb-4">Versão</th>
                <th className="pb-4">Leads</th>
                <th className="pb-4">Enviados</th>
                <th className="pb-4">Respostas</th>
                <th className="pb-4">Previews</th>
                <th className="pb-4">Fechados</th>
                <th className="pb-4">Tx. Resposta</th>
                <th className="pb-4">Tx. Preview</th>
              </tr>
            </thead>

            <tbody>
              {promptMetrics.map((item, index) => {
                const lowSample = Number(item.enviados || 0) < 10;
                const rankingBadge =
                  index === 0
                    ? "🥇"
                    : index === 1
                      ? "🥈"
                      : index === 2
                        ? "🥉"
                        : null;

                return (
                  <tr
                    key={`${item.ai_prompt_angle}-${item.prompt_version}`}
                    className={`border-b border-slate-50 last:border-b-0 ${
                      item.status === "archived"
                        ? "opacity-45 bg-slate-50/60"
                        : ""
                    }`}
                  >
                    <td className="py-4 font-black text-slate-800 text-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        {rankingBadge && (
                          <span className="text-lg">{rankingBadge}</span>
                        )}
                        <span>{item.prompt_label}</span>

                        {lowSample && (
                          <span className="inline-flex px-2 py-1 rounded-full bg-yellow-50 text-yellow-700 text-[10px] font-black uppercase">
                            baixa amostragem
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-4">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-xs font-bold uppercase ${getStatusClass(
                          item.status,
                        )}`}
                      >
                        {item.status}
                      </span>
                    </td>

                    <td className="py-4 text-slate-600 font-semibold">
                      {item.prompt_version}
                    </td>

                    <td className="py-4 text-slate-600 font-semibold">
                      {item.total}
                    </td>

                    <td className="py-4 text-slate-600 font-semibold">
                      {item.enviados}
                    </td>

                    <td className="py-4 text-slate-600 font-semibold">
                      {item.respostas}
                    </td>

                    <td className="py-4 text-slate-600 font-semibold">
                      {item.previews}
                    </td>

                    <td className="py-4 text-slate-600 font-semibold">
                      {item.fechamentos}
                    </td>

                    <td className="py-4">
                      <span className="inline-flex px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold">
                        {item.response_rate}
                      </span>
                    </td>

                    <td className="py-4">
                      <span className="inline-flex px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-xs font-bold">
                        {item.preview_rate}
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
          Ainda não há dados suficientes de copy/IA para este período.
        </div>
      )}
    </div>
  );
}
