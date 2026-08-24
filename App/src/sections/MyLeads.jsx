import React, { useState } from "react";
import useOperationalApi from "../hooks/useOperationalApi.js";
import {
  RefreshCw,
  Globe,
  Send,
  CheckCircle,
  Star,
  MapPin,
  Tag,
  Target,
  Users,
  Flame,
  Handshake,
  Zap,
  ShieldCheck,
  AlertCircle,
  Ghost,
  Coffee,
  Sparkles,
  BellRing,
  MessageCircle,
} from "lucide-react";

const MyLeads = ({ leads, loading, onRefresh, onUpdateStatus, onOpenLead }) => {
  const api = useOperationalApi();
  const [currentView, setCurrentView] = useState("pending");
  const [showAiModal, setShowAiModal] = useState(false);

  const [aiConfig, setAiConfig] = useState({
    limit: 10,
    minRating: 4.0,
    random: true,
    categories: [],
  });

  const [aiStep, setAiStep] = useState("idle");
  const [generatedCount, setGeneratedCount] = useState(0);
  const [generatedLeads, setGeneratedLeads] = useState([]);
  const [lastBatchId, setLastBatchId] = useState(null);

  const handleMassAI = async (config) => {
    setAiStep("processing");
    setGeneratedLeads([]);
    setLastBatchId(null);

    try {
      const payload = {
        ...config,
        limit: Number(config.limit || 10),
        minRating: Number(config.minRating || 0),
        random: Boolean(config.random),
        categories: Array.isArray(config.categories) ? config.categories : [],
      };
      
      const res = await api.post("/leads/generate-ai-mass", payload);

      setGeneratedCount(res.data.count || 0);
      setGeneratedLeads(res.data.generated_leads || []);
      setLastBatchId(res.data.batch_id || null);
      setAiStep("success");

      onRefresh();
    } catch (err) {
      console.error(err);
      setAiStep("error");
    }
  };

  const loadLastAiGeneration = async () => {
    setAiStep("processing");
    setShowAiModal(true);

    try {
      const res = await api.get("/leads/generate-ai-mass/last");

      setGeneratedCount(res.data.count || 0);
      setGeneratedLeads(res.data.leads || []);
      setLastBatchId(res.data.batch_id || null);
      setAiStep("success");
    } catch (err) {
      console.error(err);
      setAiStep("error");
    }
  };

  const availableCategories = [
    ...new Set(
      leads
        .filter((lead) => !lead.is_archived && lead.status === "pending")
        .map((lead) => lead.lead_category)
        .filter(Boolean),
    ),
  ].sort();

  const checkIsLimbo = (lead) => {
    const score = lead.lead_score ?? lead.interest_level ?? 0;

    if (!lead.last_contact || score > 0 || lead.status !== "contacted") {
      return false;
    }

    const diasDesdeContato =
      (new Date() - new Date(lead.last_contact)) / (1000 * 60 * 60 * 24);

    return diasDesdeContato > 4;
  };

  const isInProgressLead = (lead) => {
    const stage = lead.pipeline_stage || lead.status;

    return ["responded", "interested", "preview_sent", "negotiation"].includes(
      stage,
    );
  };

  const stats = {
    total: leads.filter((l) => !l.is_archived).length,

    pending: leads.filter(
      (l) => l.status === "pending" && !l.is_verified && !l.is_archived,
    ).length,

    verified: leads.filter(
      (l) => l.status === "pending" && l.is_verified && !l.is_archived,
    ).length,

    contacted: leads.filter(
      (l) =>
        l.status === "contacted" &&
        !l.last_reply_at &&
        !l.is_archived &&
        !checkIsLimbo(l),
    ).length,

    inProgress: leads.filter((l) => !l.is_archived && isInProgressLead(l))
      .length,

    limbo: leads.filter((l) => !l.is_archived && checkIsLimbo(l)).length,

    closed: leads.filter(
      (l) =>
        (l.status === "closed" || l.pipeline_stage === "closed") &&
        !l.is_archived,
    ).length,
  };

  const filteredLeads = leads.filter((lead) => {
    if (lead.is_archived) return false;

    const isLimbo = checkIsLimbo(lead);

    if (currentView === "pending") {
      return lead.status === "pending" && !lead.is_verified;
    }

    if (currentView === "verified") {
      return lead.status === "pending" && lead.is_verified;
    }

    if (currentView === "contacted") {
      return lead.status === "contacted" && !lead.last_reply_at && !isLimbo;
    }

    if (currentView === "in_progress") {
      return isInProgressLead(lead);
    }

    if (currentView === "limbo") {
      return isLimbo;
    }

    return false;
  });

  return (
    <div className="p-10 max-w-[1600px] mx-auto w-full animate-in fade-in duration-700">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-12">
        <StatCard
          label="Scanner Total"
          value={stats.total}
          icon={Target}
          color="slate"
        />
        <StatCard
          label="Prospecção"
          value={stats.pending}
          icon={Users}
          color="red"
          pulse={stats.pending > 0}
        />
        <StatCard
          label="Aguardando Robô"
          value={stats.verified}
          icon={Zap}
          color="orange"
        />
        <StatCard
          label="Funil Ativo"
          value={stats.contacted}
          icon={Flame}
          color="blue"
        />

        <StatCard
          label="Em andamento"
          value={stats.inProgress}
          icon={MessageCircle}
          color="orange"
        />
        <StatCard
          label="Limbo"
          value={stats.limbo}
          icon={Ghost}
          color="slate"
        />
        <StatCard
          label="Fechamentos"
          value={stats.closed}
          icon={Handshake}
          color="green"
        />
      </div>

      <div className="flex bg-slate-200/50 p-1.5 rounded-[2rem] w-fit mb-10 border border-white/50 shadow-inner overflow-x-auto">
        <TabButton
          active={currentView === "pending"}
          onClick={() => setCurrentView("pending")}
          icon={Users}
          label="Prospecção"
        />
        <TabButton
          active={currentView === "verified"}
          onClick={() => setCurrentView("verified")}
          icon={ShieldCheck}
          label="Verificados"
          orange
        />
        <TabButton
          active={currentView === "contacted"}
          onClick={() => setCurrentView("contacted")}
          icon={Flame}
          label="Funil Ativo"
        />
        <TabButton
          active={currentView === "in_progress"}
          onClick={() => setCurrentView("in_progress")}
          icon={MessageCircle}
          label="Em andamento"
          orange
        />
        <TabButton
          active={currentView === "limbo"}
          onClick={() => setCurrentView("limbo")}
          icon={Ghost}
          label="Limbo"
          slate
        />
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-black">
            {currentView === "limbo"
              ? "Zona de Espera (Limbo)"
              : currentView === "in_progress"
                ? "Leads em Andamento"
                : currentView === "contacted"
                  ? "Funil Ativo"
                  : currentView === "pending"
                    ? "Novas Oportunidades"
                    : "Prontos para Disparo"}
          </h2>

          <p className="text-slate-400 font-medium">
            {currentView === "limbo"
              ? "Leads que não responderam nos últimos 4 dias. Tente reaquecer!"
              : "Acompanhe a temperatura e a próxima ação recomendada para cada lead."}
          </p>
        </div>

        <div className="flex gap-3">
          {(currentView === "verified" || currentView === "pending") && (
            <>
              <button
                onClick={() => {
                  setGeneratedLeads([]);
                  setGeneratedCount(0);
                  setLastBatchId(null);
                  setAiStep("idle");
                  setShowAiModal(true);
                }}
                className="bg-blue-600 text-white px-6 py-4 rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg hover:bg-blue-700 transition-all"
              >
                <Sparkles size={18} /> VARINHA MÁGICA
              </button>

              <button
                onClick={loadLastAiGeneration}
                className="bg-white text-slate-700 px-6 py-4 rounded-2xl font-black text-sm flex items-center gap-2 shadow-sm border border-slate-200 hover:bg-slate-50 transition-all"
              >
                <BellRing size={18} /> ÚLTIMA GERAÇÃO
              </button>
            </>
          )}

          <button
            onClick={onRefresh}
            className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 hover:bg-slate-50 transition-all active:scale-95"
          >
            <RefreshCw
              size={20}
              className={`${loading ? "animate-spin" : ""} text-slate-600`}
            />
          </button>
        </div>
      </div>

      {filteredLeads.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {filteredLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onUpdateStatus={onUpdateStatus}
              onOpenLead={onOpenLead}
              showInterestScale={
                currentView === "contacted" ||
                currentView === "in_progress" ||
                currentView === "limbo"
              }
              currentView={currentView}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white/50 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center">
          <p className="text-slate-400 font-bold italic">
            Nenhum lead nesta etapa no momento.
          </p>
        </div>
      )}

      {showAiModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in duration-300 overflow-hidden relative">
            {aiStep === "idle" && (
              <>
                <h2 className="text-2xl font-black mb-2 flex items-center gap-2">
                  <Sparkles className="text-blue-500" /> Configurar IA
                </h2>

                <p className="text-slate-400 text-sm font-medium mb-8">
                  Escolha os critérios para a Varinha Mágica.
                </p>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">
                      Quantidade
                    </label>
                    <input
                      type="number"
                      className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold outline-none"
                      value={aiConfig.limit}
                      onChange={(e) =>
                        setAiConfig({ ...aiConfig, limit: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">
                      Avaliação Mínima
                    </label>
                    <select
                      className="w-full p-4 bg-slate-50 rounded-2xl border-none font-bold outline-none"
                      value={aiConfig.minRating}
                      onChange={(e) =>
                        setAiConfig({ ...aiConfig, minRating: e.target.value })
                      }
                    >
                      <option value="0">Qualquer nota</option>
                      <option value="4.0">Acima de 4.0</option>
                      <option value="4.5">Acima de 4.5</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">
                      Nichos para gerar
                    </label>

                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 max-h-[180px] overflow-y-auto space-y-3">
                      {availableCategories.length > 0 ? (
                        <>
                          <label className="flex items-center gap-3 cursor-pointer pb-3 border-b border-slate-200">
                            <input
                              type="checkbox"
                              checked={aiConfig.categories.length === 0}
                              onChange={() =>
                                setAiConfig({
                                  ...aiConfig,
                                  categories: [],
                                })
                              }
                              className="w-5 h-5 accent-blue-600"
                            />

                            <div>
                              <p className="text-sm font-black text-slate-800">
                                Todos os nichos
                              </p>
                              <p className="text-xs text-slate-400 font-medium">
                                Gera mensagens para qualquer nicho disponível.
                              </p>
                            </div>
                          </label>

                          {availableCategories.map((category) => {
                            const checked =
                              aiConfig.categories.includes(category);

                            return (
                              <label
                                key={category}
                                className="flex items-center gap-3 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const nextCategories = e.target.checked
                                      ? [...aiConfig.categories, category]
                                      : aiConfig.categories.filter(
                                          (c) => c !== category,
                                        );

                                    setAiConfig({
                                      ...aiConfig,
                                      categories: nextCategories,
                                    });
                                  }}
                                  className="w-5 h-5 accent-blue-600"
                                />

                                <span className="text-sm font-bold text-slate-700">
                                  {category}
                                </span>
                              </label>
                            );
                          })}
                        </>
                      ) : (
                        <p className="text-sm text-slate-400 font-medium">
                          Nenhum nicho pendente encontrado.
                        </p>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 font-medium mt-2 ml-2">
                      Se nenhum nicho estiver marcado, o sistema usa todos.
                    </p>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={aiConfig.random}
                        onChange={(e) =>
                          setAiConfig({
                            ...aiConfig,
                            random: e.target.checked,
                          })
                        }
                        className="w-5 h-5 accent-blue-600"
                      />

                      <div>
                        <p className="text-sm font-black text-slate-800">
                          Selecionar leads aleatórios
                        </p>
                        <p className="text-xs text-slate-400 font-medium">
                          Evita gerar mensagens sempre para o mesmo nicho ou
                          cidade.
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setShowAiModal(false)}
                      className="flex-1 py-4 font-black text-slate-400"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleMassAI(aiConfig)}
                      className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
                    >
                      INICIAR GERAÇÃO
                    </button>
                  </div>
                </div>
              </>
            )}

            {aiStep === "processing" && (
              <div className="py-12 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in">
                <div className="relative mb-6">
                  <div className="w-20 h-20 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                  <Sparkles
                    className="absolute inset-0 m-auto text-blue-500 animate-pulse"
                    size={32}
                  />
                </div>

                <h2 className="text-xl font-black text-slate-800 mb-2">
                  Canalizando Inteligência...
                </h2>

                <p className="text-slate-400 text-sm font-medium">
                  Criando abordagens personalizadas. Isso pode levar alguns
                  segundos.
                </p>
              </div>
            )}

            {aiStep === "success" && (
              <div className="py-6 flex flex-col items-center justify-center text-center animate-in cubic-bezier">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
                  <CheckCircle
                    size={40}
                    className="animate-in zoom-in duration-500"
                  />
                </div>

                <h2 className="text-xl font-black text-slate-800 mb-2">
                  Concluído com Sucesso!
                </h2>

                <p className="text-slate-400 text-sm font-medium mb-4">
                  Processamos {generatedCount} leads.
                </p>

                {lastBatchId && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-4">
                    Lote: {lastBatchId}
                  </p>
                )}

                {generatedLeads.length > 0 ? (
                  <div className="w-full max-h-[260px] overflow-y-auto bg-slate-50 rounded-3xl p-4 text-left space-y-3">
                    {generatedLeads.map((lead) => (
                      <div
                        key={lead.id}
                        className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-slate-800">
                              {lead.name}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                              {lead.lead_category || "Geral"} •{" "}
                              {lead.lead_city || "—"}
                            </p>
                          </div>

                          <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[9px] font-black uppercase whitespace-nowrap">
                            {lead.ai_prompt_label || "IA"}
                          </span>
                        </div>

                        {lead.custom_message && (
                          <p className="text-xs text-slate-500 mt-3 whitespace-pre-line line-clamp-4">
                            {lead.custom_message}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm font-medium">
                    Nenhum lead encontrado nesta geração.
                  </p>
                )}

                <div className="flex gap-3 w-full mt-6">
                  <button
                    onClick={() => {
                      setShowAiModal(false);
                      setAiStep("idle");
                      onRefresh();
                    }}
                    className="flex-1 bg-slate-900 text-white px-6 py-4 rounded-2xl font-black"
                  >
                    Fechar
                  </button>

                  <button
                    onClick={() => {
                      setAiStep("idle");
                      setGeneratedLeads([]);
                      setGeneratedCount(0);
                      setLastBatchId(null);
                    }}
                    className="flex-1 bg-blue-600 text-white px-6 py-4 rounded-2xl font-black"
                  >
                    Nova Geração
                  </button>
                </div>
              </div>
            )}

            {aiStep === "error" && (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6">
                  <AlertCircle size={40} />
                </div>

                <h2 className="text-xl font-black text-slate-800 mb-2">
                  Ops! Algo falhou.
                </h2>

                <p className="text-slate-400 text-sm font-medium mb-6">
                  Verifique seu saldo na OpenAI ou sua conexão.
                </p>

                <button
                  onClick={() => setAiStep("idle")}
                  className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black"
                >
                  Tentar Novamente
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function TabButton({ active, onClick, icon: Icon, label, orange, slate }) {
  const activeClass = orange
    ? "bg-[#ff8c00] text-white shadow-xl"
    : slate
      ? "bg-slate-600 text-white shadow-xl"
      : "bg-black text-white shadow-xl";

  return (
    <button
      onClick={onClick}
      className={`px-8 py-3 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 whitespace-nowrap ${
        active ? activeClass : "text-slate-500 hover:text-black"
      }`}
    >
      {React.createElement(Icon, { size: 18 })} {label}
    </button>
  );
}

function StatCard({ label, value, icon: Icon, color, pulse = false }) {
  const colors = {
    slate: {
      text: "text-slate-500",
      bg: "bg-slate-100",
      number: "text-slate-900",
      border: "border-slate-200",
    },
    red: {
      text: "text-red-500",
      bg: "bg-red-50",
      number: "text-red-600",
      border: "border-red-100",
    },
    blue: {
      text: "text-blue-500",
      bg: "bg-blue-50",
      number: "text-blue-600",
      border: "border-blue-100",
    },
    orange: {
      text: "text-orange-500",
      bg: "bg-orange-50",
      number: "text-orange-600",
      border: "border-orange-100",
    },
    green: {
      text: "text-[#00b37e]",
      bg: "bg-[#00b37e]/5",
      number: "text-[#00b37e]",
      border: "border-[#00b37e]/20",
    },
  };

  const c = colors[color] || colors.slate;

  return (
    <div
      className={`bg-white p-6 rounded-[2.5rem] border ${c.border} shadow-sm relative overflow-hidden group`}
    >
      <div
        className={`absolute -right-4 -bottom-4 w-16 h-16 ${c.bg} rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500`}
      ></div>

      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl ${c.bg} ${pulse ? "animate-pulse" : ""}`}
          >
            {React.createElement(Icon, { size: 18, className: c.text })}
          </div>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] leading-tight">
            {label}
          </p>
        </div>

        <p className={`text-4xl font-black tracking-tighter ${c.number}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function getTemperatureMeta(score = 0, band = "cold") {
  if (band === "converted") {
    return { label: "Convertido", color: "bg-green-500" };
  }
  if (band === "hot" || score >= 7) {
    return { label: "Quente", color: "bg-red-500" };
  }
  if (band === "warm" || score >= 3) {
    return { label: "Morno", color: "bg-orange-400" };
  }
  return { label: "Frio", color: "bg-slate-300" };
}

function getSuggestedAction(lead) {
  const score = lead.lead_score ?? lead.interest_level ?? 0;

  if (lead.status === "closed" || lead.pipeline_stage === "closed") {
    return {
      label: "Entregar / pós-venda",
      tone: "bg-green-50 text-green-700 border-green-200",
    };
  }

  if (lead.is_invalid_number) {
    return {
      label: "Número inválido",
      tone: "bg-red-50 text-red-700 border-red-200",
    };
  }

  if (lead.status === "pending" && !lead.is_verified) {
    return {
      label: "Revisar e aprovar",
      tone: "bg-slate-50 text-slate-700 border-slate-200",
    };
  }

  if (lead.status === "pending" && lead.is_verified && lead.is_ai_ready) {
    return {
      label: "Pronto para abordagem",
      tone: "bg-blue-50 text-blue-700 border-blue-200",
    };
  }

  if (
    lead.status === "contacted" &&
    !lead.last_reply_at &&
    !lead.preview_sent
  ) {
    if (
      lead.next_followup_at &&
      new Date(lead.next_followup_at) <= new Date()
    ) {
      return {
        label: "Follow-up pronto",
        tone: "bg-orange-50 text-orange-700 border-orange-200",
      };
    }

    return {
      label: "Aguardar follow-up",
      tone: "bg-blue-50 text-blue-700 border-blue-200",
    };
  }

  if (lead.status === "responded" && !lead.preview_sent) {
    return {
      label: "Enviar preview",
      tone: "bg-purple-50 text-purple-700 border-purple-200",
    };
  }

  if (lead.preview_sent && !lead.price_requested) {
    return {
      label: "Conduzir p/ orçamento",
      tone: "bg-indigo-50 text-indigo-700 border-indigo-200",
    };
  }

  if (lead.price_requested && lead.status !== "closed") {
    return {
      label: "Pronto para fechar",
      tone: "bg-green-50 text-green-700 border-green-200",
    };
  }

  if (score >= 7 && lead.status !== "closed") {
    return {
      label: "Prioridade máxima",
      tone: "bg-red-50 text-red-700 border-red-200",
    };
  }

  return {
    label: "Acompanhar evolução",
    tone: "bg-slate-50 text-slate-700 border-slate-200",
  };
}

function getFollowupMeta(lead) {
  const count = Number(lead.followup_count || 0);
  const total = 4;

  const labels = [
    "D+1 - Follow-up leve",
    "D+3 - Curiosidade",
    "D+5 - Oportunidade",
    "D+7 - Última tentativa",
  ];

  const nextLabel = labels[count] || "Sequência concluída";

  const nextDate = lead.next_followup_at
    ? new Date(lead.next_followup_at)
    : null;

  const isReady = nextDate && nextDate <= new Date();

  return {
    count,
    total,
    nextLabel,
    nextDate,
    isReady,
    finished: count >= total || !lead.next_followup_at,
  };
}

function LeadCard({
  lead,
  onUpdateStatus,
  onOpenLead,
  showInterestScale,
  currentView,
}) {
  const cleanPhone = lead.phone?.replace(/\D/g, "");
  const displayPhone = lead.phone?.replace(/\n/g, "").trim();

  const score = lead.lead_score ?? lead.interest_level ?? 0;
  const temp = getTemperatureMeta(score, lead.temperature_band);
  const action = getSuggestedAction(lead);
  const followupMeta = getFollowupMeta(lead);

  const renderStatusBadge = () => {
    if (lead.is_invalid_number) {
      return (
        <div className="bg-red-50 text-red-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-200 flex items-center gap-1 shadow-sm animate-pulse">
          <AlertCircle size={12} /> Número Inválido
        </div>
      );
    }

    if (lead.is_ai_ready && lead.status === "pending") {
      return (
        <div className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-200 flex items-center gap-1 shadow-sm animate-pulse">
          <Sparkles size={12} /> Sugestão de IA Pronta
        </div>
      );
    }

    if (currentView === "limbo") {
      return (
        <div className="bg-slate-100 text-slate-500 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200 flex items-center gap-1 shadow-sm">
          <Ghost size={12} /> Lead em Pausa
        </div>
      );
    }

    if (lead.status === "contacted" && lead.is_verified) {
      return (
        <div className="bg-blue-50 text-blue-500 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100 flex items-center gap-1 shadow-sm">
          <Zap size={12} fill="currentColor" /> Automação Concluída
        </div>
      );
    }

    if (lead.is_verified) {
      return (
        <div className="bg-orange-50 text-orange-500 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-orange-100 flex items-center gap-1 shadow-sm">
          <ShieldCheck size={12} /> Aprovado p/ Autom.
        </div>
      );
    }

    return (
      <div className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-100 flex items-center gap-1">
        <Globe size={12} /> {lead.has_website ? "Com Website" : "No Website"}
      </div>
    );
  };

  return (
    <div
      className={`bg-white border-none p-8 rounded-[3rem] shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden ${
        lead.is_ai_ready && !lead.is_verified
          ? "ring-2 ring-blue-500/20 bg-blue-50/10"
          : ""
      }`}
    >
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-slate-50 rounded-full group-hover:scale-[3] transition-transform duration-700 opacity-50"></div>

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-6">
          <div className="w-14 h-14 bg-black text-white rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg">
            {lead.name.charAt(0).toUpperCase()}
          </div>

          <div className="flex flex-col gap-2 items-end">
            <div className="flex items-center gap-1 bg-yellow-400/10 text-yellow-600 px-3 py-1 rounded-full text-[10px] font-black border border-yellow-100">
              <Star size={12} fill="currentColor" /> {lead.rating} (
              {lead.reviews_count})
            </div>

            {renderStatusBadge()}

            <div className="flex items-center gap-2 text-blue-500 text-[10px] font-black uppercase tracking-widest bg-blue-50 w-fit px-2 py-1 rounded-md">
              <Target size={12} /> {lead.lead_category || "Geral"}
            </div>
          </div>
        </div>

        <button
          onClick={() => onOpenLead(lead.id)}
          className="absolute left-8 top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 text-white p-2 rounded-full shadow-lg"
        >
          <Target size={16} />
        </button>

        <h3
          className={`text-xl font-black mb-1 truncate pr-4 ${
            lead.is_invalid_number
              ? "text-slate-400 line-through"
              : "text-black"
          }`}
        >
          {lead.name}
        </h3>

        <p
          className={`text-slate-500 font-bold text-sm mb-4 ${lead.is_invalid_number ? "text-red-400" : ""}`}
        >
          {displayPhone || "Telefone não disponível"}
        </p>

        <div className="space-y-1 mb-6">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
            <Tag size={12} /> {lead.niche}
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
            <MapPin size={12} /> {lead.neighborhood}
          </div>
        </div>

        <div className={`mb-5 rounded-2xl border px-4 py-3 ${action.tone}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 mb-1">
            Próxima ação
          </p>
          <p className="text-sm font-bold">{action.label}</p>
        </div>

        {lead.status === "contacted" && !lead.last_reply_at && (
          <div
            className={`mb-5 rounded-2xl border px-4 py-3 ${
              followupMeta.isReady
                ? "bg-orange-50 text-orange-700 border-orange-200"
                : followupMeta.finished
                  ? "bg-slate-50 text-slate-500 border-slate-200"
                  : "bg-blue-50 text-blue-700 border-blue-200"
            }`}
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">
                Follow-up automático
              </p>

              <span className="text-[10px] font-black uppercase">
                {Math.min(followupMeta.count, followupMeta.total)}/
                {followupMeta.total}
              </span>
            </div>

            <p className="text-sm font-black">
              {followupMeta.isReady
                ? "Pronto para enviar agora"
                : followupMeta.finished
                  ? "Sequência finalizada"
                  : followupMeta.nextLabel}
            </p>

            {followupMeta.nextDate && !followupMeta.finished && (
              <p className="text-xs font-bold opacity-70 mt-1">
                Próximo: {followupMeta.nextDate.toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        )}

        {showInterestScale && (
          <div className="mb-8 p-4 bg-slate-50 rounded-2xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                  Temperatura: {temp.label}
                </p>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${temp.color}`}></div>
                  <span className="text-sm font-bold text-slate-700">
                    Score: {score}
                  </span>
                </div>
              </div>

              {lead.followup_count > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-blue-50 text-blue-700 text-[11px] font-black uppercase tracking-widest border border-blue-100">
                  <BellRing size={12} />
                  {lead.followup_count} follow-up(s)
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={() => {
              const msg =
                currentView === "limbo"
                  ? "Olá! Gostaria de retomar nosso papo sobre a estrutura digital da sua empresa?"
                  : "Olá!";

              window.open(
                `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`,
                "_blank",
              );

              if (lead.status === "pending") {
                onUpdateStatus(lead.id, "contacted", 0);
              }
            }}
            disabled={lead.is_invalid_number}
            className={`flex-[2] py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
              currentView === "limbo"
                ? "bg-slate-800 text-white shadow-slate-800/20"
                : lead.is_invalid_number
                  ? "bg-slate-100 text-slate-300 cursor-not-allowed shadow-none"
                  : "bg-[#00b37e] text-white hover:brightness-110 shadow-[#00b37e]/20"
            }`}
          >
            {currentView === "limbo" ? (
              <Coffee size={18} />
            ) : (
              <Send size={18} />
            )}
            {currentView === "limbo"
              ? "Reaquecer"
              : lead.status === "contacted"
                ? "Reabrir Chat"
                : "WhatsApp"}
          </button>

          {currentView !== "contacted" &&
            currentView !== "in_progress" &&
            currentView !== "limbo" && (
              <button
                onClick={() => onUpdateStatus(lead.id, "contacted", 0)}
                className="flex-1 bg-slate-100 text-slate-400 py-4 rounded-2xl hover:bg-black hover:text-white transition-all flex items-center justify-center"
              >
                <CheckCircle size={22} />
              </button>
            )}
        </div>
      </div>
    </div>
  );
}

export default MyLeads;
