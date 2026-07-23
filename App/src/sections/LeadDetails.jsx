import React, { useState, useEffect } from "react";
import api from "../services/api";
import {
  ArrowLeft,
  Send,
  ShieldCheck,
  MessageSquare,
  History,
  TrendingUp,
  DollarSign,
  Trash2,
  Edit3,
  CheckCircle2,
  Clock,
  Award,
  X,
  Save,
  Sparkles,
  RotateCcw,
  Flame,
  Receipt,
  BellRing,
  Target,
  ClipboardList,
  Link,
  BrainCircuit,
  BarChart3,
  Layers3,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
} from "lucide-react";

const LeadDetails = ({ leadId, onBack }) => {
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [briefing, setBriefing] = useState(null);
  const [showBriefingLinkModal, setShowBriefingLinkModal] = useState(false);
  const [briefingLink, setBriefingLink] = useState("");
  const [copiedBriefingLink, setCopiedBriefingLink] = useState(false);
  const [loadingBriefing, setLoadingBriefing] = useState(false);

  const [observation, setObservation] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState("");

  const [recommendations, setRecommendations] = useState(null);
  const [currentOpportunity, setCurrentOpportunity] = useState(null);

  const [loadingRecommendations, setLoadingRecommendations] = useState(true);
  const [recommendationError, setRecommendationError] = useState("");
  const [serviceFeedback, setServiceFeedback] = useState("");

  const [showAllServices, setShowAllServices] = useState(false);
  const [selectingServiceId, setSelectingServiceId] = useState(null);

  const [showClosingModal, setShowClosingModal] = useState(false);
  const [dealData, setDealData] = useState({
    items: [],
    totalInitialValue: 0,
    monthlyRecurringValue: 0,
    closingDate: new Date().toISOString().split("T")[0],
  });

  const AVAILABLE_DEAL_SERVICES = [
    { id: "social", label: "Gestão Social", icon: "📱" },
    { id: "site", label: "Site Institucional", icon: "🌐" },
    { id: "landing_page", label: "Landing Page", icon: "🧲" },
    { id: "ads", label: "Tráfego Pago", icon: "📈" },
    { id: "automation", label: "Automação WhatsApp", icon: "🤖" },
    { id: "branding", label: "Identidade Visual", icon: "🎨" },
    { id: "google_business", label: "Google Meu Negócio", icon: "📍" },
    { id: "hosting", label: "Hospedagem / Manutenção", icon: "🛠️" },
  ];

  useEffect(() => {
    if (!leadId) return;

    setShowAllServices(false);
    setServiceFeedback("");
    setRecommendationError("");

    fetchData();
    fetchServiceOpportunityData();
  }, [leadId]);

  const getTemperatureMeta = (score = 0, band = "cold") => {
    if (band === "converted") {
      return {
        label: "Convertido",
        classes: "bg-green-500 text-white border-green-600",
      };
    }
    if (band === "hot" || score >= 7) {
      return {
        label: "Quente",
        classes: "bg-red-500 text-white border-red-600 animate-pulse",
      };
    }
    if (band === "warm" || score >= 3) {
      return {
        label: "Morno",
        classes: "bg-orange-100 text-orange-700 border-orange-200",
      };
    }
    return {
      label: "Frio",
      classes: "bg-blue-50 text-blue-600 border-blue-100",
    };
  };

  const formatDateTime = (value) => {
    if (!value) return "—";
    return new Date(value).toLocaleString("pt-BR");
  };

  const getFollowupStatus = () => {
    if (!lead) return { label: "Sem dados", color: "text-slate-400" };

    if (lead.last_reply_at) {
      return {
        label: "Lead respondeu — follow-up pausado",
        color: "text-green-600",
      };
    }

    if (lead.status !== "contacted") {
      return {
        label: "Follow-up não aplicável no momento",
        color: "text-slate-400",
      };
    }

    if (lead.next_followup_at) {
      const now = new Date();
      const next = new Date(lead.next_followup_at);

      if (next <= now) {
        return { label: "Pronto para follow-up", color: "text-orange-600" };
      }

      return { label: "Aguardando próximo follow-up", color: "text-blue-600" };
    }

    return { label: "Sem follow-up agendado", color: "text-slate-400" };
  };

  const getSuggestedAction = () => {
    if (!lead) {
      return {
        title: "Sem dados",
        description: "Carregando informações do lead.",
        classes: "bg-slate-50 text-slate-500 border-slate-200",
      };
    }

    const score = lead.lead_score ?? lead.interest_level ?? 0;

    if (lead.status === "closed" || lead.pipeline_stage === "closed") {
      return {
        title: "Negócio fechado",
        description: "Agora foque na entrega e no pós-venda.",
        classes: "bg-green-50 text-green-700 border-green-200",
      };
    }

    if (lead.is_invalid_number) {
      return {
        title: "Número inválido",
        description: "Retire esse lead do fluxo ou tente outro contato.",
        classes: "bg-red-50 text-red-700 border-red-200",
      };
    }

    if (lead.status === "pending" && !lead.is_verified) {
      return {
        title: "Revisar e aprovar para automação",
        description: "Esse lead ainda não foi validado para entrar no fluxo.",
        classes: "bg-slate-50 text-slate-700 border-slate-200",
      };
    }

    if (lead.status === "pending" && lead.is_verified && lead.is_ai_ready) {
      return {
        title: "Pronto para primeira abordagem",
        description: "O lead já está validado e com mensagem pronta.",
        classes: "bg-blue-50 text-blue-700 border-blue-200",
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
          title: "Follow-up atrasado / pronto para envio",
          description: "O lead não respondeu e já pode receber novo toque.",
          classes: "bg-orange-50 text-orange-700 border-orange-200",
        };
      }

      return {
        title: "Aguardar follow-up automático",
        description: "O lead já foi abordado e o sistema fará o próximo toque.",
        classes: "bg-blue-50 text-blue-700 border-blue-200",
      };
    }

    const hasResponded = Boolean(
      lead.responded_at ||
      lead.last_reply_at ||
      ["responded", "qualified", "negotiation", "closed"].includes(
        lead.status,
      ) ||
      [
        "responded",
        "qualified",
        "interested",
        "preview_sent",
        "negotiation",
        "closed",
      ].includes(lead.pipeline_stage),
    );

    if (hasResponded && loadingRecommendations) {
      return {
        title: "Analisando oportunidades",
        description:
          "O sistema está carregando as recomendações para este nicho.",
        classes: "bg-blue-50 text-blue-700 border-blue-200",
      };
    }

    if (hasResponded && !currentOpportunity) {
      return {
        title: "Analise e selecione um serviço",
        description:
          "Compare as recomendações do nicho com sua análise comercial.",
        classes: "bg-purple-50 text-purple-700 border-purple-200",
      };
    }

    if (currentOpportunity && !currentOpportunity.negotiation_guide) {
      return {
        title: "Preencha a análise e gere o guia",
        description: `O serviço em negociação é ${currentOpportunity.service_name}.`,
        classes: "bg-indigo-50 text-indigo-700 border-indigo-200",
      };
    }

    if (
      currentOpportunity?.negotiation_guide &&
      Number(currentOpportunity.interest_score || 0) === 0
    ) {
      return {
        title: "Conduza a descoberta usando o guia",
        description: "Explore as dores e confirme se existe interesse real.",
        classes: "bg-purple-50 text-purple-700 border-purple-200",
      };
    }

    if (lead.status === "responded" && !lead.preview_sent) {
      return {
        title: "Enviar preview",
        description:
          "Esse é o melhor próximo passo para aumentar percepção de valor.",
        classes: "bg-purple-50 text-purple-700 border-purple-200",
      };
    }

    if (lead.preview_sent && !lead.price_requested) {
      return {
        title: "Conduzir para orçamento",
        description:
          "O lead já viu valor. Tente levar a conversa para preço/escopo.",
        classes: "bg-indigo-50 text-indigo-700 border-indigo-200",
      };
    }

    if (lead.price_requested && lead.status !== "closed") {
      return {
        title: "Pronto para fechamento",
        description: "Lead pediu preço. Momento de negociar e fechar.",
        classes: "bg-green-50 text-green-700 border-green-200",
      };
    }

    if (score >= 7 && lead.status !== "closed") {
      return {
        title: "Lead muito quente",
        description: "Priorize esse lead. Ele está próximo de conversão.",
        classes: "bg-red-50 text-red-700 border-red-200",
      };
    }

    return {
      title: "Acompanhar evolução",
      description:
        "Mantenha o lead em observação e avance conforme a resposta.",
      classes: "bg-slate-50 text-slate-700 border-slate-200",
    };
  };

  const fetchData = async () => {
    try {
      const [leadRes, activityRes, briefingRes] = await Promise.all([
        api.get(`/leads/${leadId}`),
        api.get(`/leads/${leadId}/activities`),
        api.get(`/briefings/lead/${leadId}`),
      ]);

      const data = leadRes.data;

      setLead(data);
      setObservation(data.market_observation || "");
      setInternalNotes(data.internal_notes || "");
      setActivities(activityRes.data);
      setBriefing(briefingRes.data);
      setAiSuggestion(data.ai_message_suggestion || "");

      setCustomMessage(data.custom_message || data.ai_message_suggestion || "");

      if (data.deal_details?.items) {
        setDealData(data.deal_details);
      }

      setLoading(false);
    } catch (err) {
      console.error("Erro ao carregar dados", err);
    }
  };

  const fetchServiceOpportunityData = async () => {
    if (!leadId) return;

    setLoadingRecommendations(true);
    setRecommendationError("");

    try {
      const [recommendationsRes, currentRes] = await Promise.all([
        api.get(`/service-opportunities/leads/${leadId}/recommendations`),

        api.get(`/service-opportunities/leads/${leadId}/current`),
      ]);

      setRecommendations(recommendationsRes.data);

      setCurrentOpportunity(currentRes.data?.opportunity || null);
    } catch (error) {
      console.error("Erro ao carregar recomendações:", error);

      setRecommendationError(
        error.response?.data?.error ||
          "Não foi possível carregar as recomendações.",
      );
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const handleSelectRecommendedService = async (
    service,
    confirmReset = false,
  ) => {
    const serviceId = Number(service.service_id || service.id);

    if (!serviceId) {
      setRecommendationError("Não foi possível identificar o serviço.");
      return;
    }

    setSelectingServiceId(serviceId);
    setRecommendationError("");
    setServiceFeedback("");

    try {
      const response = await api.post(
        `/service-opportunities/leads/${leadId}/select`,
        {
          service_id: serviceId,
          confirm_reset: confirmReset,
        },
      );

      setServiceFeedback(
        response.data?.message || "Serviço selecionado com sucesso.",
      );

      await fetchServiceOpportunityData();
    } catch (error) {
      const responseData = error.response?.data;

      if (
        error.response?.status === 409 &&
        responseData?.requires_confirmation &&
        confirmReset === false
      ) {
        const currentName =
          responseData.current_service?.service_name || "serviço atual";

        const requestedName =
          responseData.requested_service?.service_name || service.service_name;

        const confirmed = window.confirm(
          `O lead já possui progresso registrado em "${currentName}".\n\n` +
            `Ao trocar para "${requestedName}", a análise, o guia e a pontuação atual serão reiniciados.\n\n` +
            "Deseja continuar?",
        );

        if (confirmed) {
          await handleSelectRecommendedService(service, true);
        }

        return;
      }

      console.error("Erro ao selecionar serviço:", error);

      setRecommendationError(
        responseData?.error || "Não foi possível selecionar o serviço.",
      );
    } finally {
      setSelectingServiceId(null);
    }
  };

  const handleApplyAI = () => {
    if (aiSuggestion) {
      setCustomMessage(aiSuggestion);
    }
  };

  const addDealItem = () => {
    const defaultService = AVAILABLE_DEAL_SERVICES[0];

    setDealData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: `item_${Date.now()}`,
          service_id: defaultService.id,
          service_label: defaultService.label,
          icon: defaultService.icon,
          billing_type: "recurring",
          amount: "",
          frequency: "monthly",
          due_day: "",
          deadline: "",
          notes: "",
        },
      ],
    }));
  };

  const updateDealItem = (itemId, field, value) => {
    setDealData((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== itemId) return item;

        if (field === "service_id") {
          const service = AVAILABLE_DEAL_SERVICES.find((s) => s.id === value);

          return {
            ...item,
            service_id: service.id,
            service_label: service.label,
            icon: service.icon,
          };
        }

        return {
          ...item,
          [field]: value,
        };
      }),
    }));
  };

  const removeDealItem = (itemId) => {
    setDealData((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== itemId),
    }));
  };

  const parseMoney = (value) => {
    const normalized = String(value || "0")
      .replace(/\./g, "")
      .replace(",", ".");

    return Number(normalized) || 0;
  };
  const calculateDealTotals = () => {
    const items = dealData.items || [];

    const oneTimeTotal = items
      .filter((item) => item.billing_type === "one_time")
      .reduce((acc, item) => acc + parseMoney(item.amount), 0);

    const monthlyTotal = items
      .filter((item) => item.billing_type === "recurring")
      .reduce((acc, item) => acc + parseMoney(item.amount), 0);

    return {
      oneTimeTotal,
      monthlyTotal,
      initialTotal: oneTimeTotal + monthlyTotal,
    };
  };

  const handleFinalizeDeal = async () => {
    const totals = calculateDealTotals();

    const finalDealDetails = {
      ...dealData,
      totalInitialValue: totals.initialTotal,
      oneTimeValue: totals.oneTimeTotal,
      monthlyRecurringValue: totals.monthlyTotal,
      closedAt: new Date().toISOString(),
    };

    console.log("FECHAMENTO DEBUG:", {
      dealData,
      totals,
      sale_value: totals.initialTotal,
    });

    await handleUpdate({
      status: "closed",
      pipeline_stage: "closed",
      sale_value: totals.initialTotal,
      deal_details: finalDealDetails,
    });

    setShowClosingModal(false);
  };

  const handleUpdate = async (payload) => {
    setIsSaving(true);

    try {
      await api.patch(`/leads/${leadId}`, payload);

      await Promise.all([fetchData(), fetchServiceOpportunityData()]);

      setTimeout(() => setIsSaving(false), 1500);
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar.");
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Deseja realmente remover o lead "${lead.name}"?`)) {
      try {
        await api.patch(`/leads/${leadId}`, { is_archived: true });
        onBack();
      } catch (err) {
        console.error(err);
        alert("Ocorreu um erro ao tentar excluir o lead.");
      }
    }
  };

  const handleEditName = async () => {
    const newName = prompt("Digite o novo nome da empresa:", lead.name);
    if (newName && newName !== lead.name) {
      handleUpdate({ name: newName });
    }
  };

  const handleCopyBriefingLink = () => {
    const link = `${window.location.origin}/briefing/${leadId}`;

    setBriefingLink(link);
    setCopiedBriefingLink(false);
    setShowBriefingLinkModal(true);
  };

  const copyBriefingLinkToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(briefingLink);
      setCopiedBriefingLink(true);
    } catch (err) {
      console.error(err);
      prompt("Copie o link do briefing:", briefingLink);
    }
  };

  const handleSendWhatsApp = async () => {
    await handleUpdate({
      market_observation: observation,
      internal_notes: internalNotes,
      update_contact: true,
      status: "contacted",
      custom_message: customMessage,
    });

    window.open(
      `https://wa.me/${lead.phone}?text=${encodeURIComponent(customMessage)}`,
      "_blank",
    );
  };

  const handleResetMessage = () => {
    setCustomMessage(aiSuggestion || lead?.custom_message || "");
  };

  if (loading) {
    return (
      <div className="p-20 text-center font-black animate-pulse text-slate-400 uppercase tracking-widest">
        Iniciando Protocolo de Inteligência...
      </div>
    );
  }

  const score = lead?.lead_score ?? lead?.interest_level ?? 0;
  const temp = getTemperatureMeta(score, lead?.temperature_band || "cold");
  const followupStatus = getFollowupStatus();
  const suggestedAction = getSuggestedAction();

  const visibleRecommendedServices = showAllServices
    ? recommendations?.all_services || []
    : recommendations?.top_recommendations || [];

  const selectedServiceRanking =
    recommendations?.all_services?.find(
      (service) =>
        Number(service.service_id) === Number(currentOpportunity?.service_id),
    ) || null;

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-700 pb-20 relative">
      {showBriefingLinkModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden border border-white/20 animate-in zoom-in duration-200">
            <div className="p-8 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-2">
                  Link público
                </p>
                <h2 className="text-2xl font-black tracking-tight">
                  Solicitar briefing
                </h2>
              </div>

              <button
                onClick={() => setShowBriefingLinkModal(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-all"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-8 space-y-5">
              <p className="text-sm font-medium text-slate-500 leading-relaxed">
                Envie este link para o lead preencher o briefing. Assim você
                recebe as informações direto no LeadHunt.
              </p>

              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
                  Link do briefing
                </p>
                <p className="text-sm font-bold text-slate-800 break-all">
                  {briefingLink}
                </p>
              </div>

              <button
                onClick={copyBriefingLinkToClipboard}
                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
                  copiedBriefingLink
                    ? "bg-green-500 text-white"
                    : "bg-slate-900 text-white hover:bg-black"
                }`}
              >
                {copiedBriefingLink ? "Link copiado!" : "Copiar link"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showClosingModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden border border-white/20">
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-500 rounded-2xl shadow-lg shadow-green-500/30">
                  <Award size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight">
                    Finalizar Negócio
                  </h2>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
                    Defina valores e prazos
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowClosingModal(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto scrollbar-hide">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-widest">
                    Serviços do contrato
                  </h3>
                  <p className="text-xs text-slate-400 font-bold mt-1">
                    Adicione serviços únicos, recorrentes ou combinados.
                  </p>
                </div>

                <button
                  onClick={addDealItem}
                  className="bg-slate-900 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                >
                  + Serviço
                </button>
              </div>

              {dealData.items.length === 0 ? (
                <div className="p-10 rounded-[2rem] bg-slate-50 border border-dashed border-slate-200 text-center">
                  <p className="text-slate-400 font-bold text-sm">
                    Nenhum serviço adicionado ainda.
                  </p>
                  <button
                    onClick={addDealItem}
                    className="mt-4 bg-green-500 text-white px-6 py-3 rounded-2xl font-black text-xs"
                  >
                    Adicionar primeiro serviço
                  </button>
                </div>
              ) : (
                dealData.items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100"
                  >
                    <div className="flex items-center justify-between gap-4 mb-5">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{item.icon}</span>
                        <div>
                          <h4 className="font-black text-sm uppercase tracking-widest text-slate-800">
                            {item.service_label}
                          </h4>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {item.billing_type === "recurring"
                              ? "Cobrança recorrente"
                              : "Pagamento único"}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => removeDealItem(item.id)}
                        className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-1 block">
                          Serviço
                        </label>
                        <select
                          className="w-full p-4 bg-white rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-green-500 outline-none font-bold"
                          value={item.service_id}
                          onChange={(e) =>
                            updateDealItem(
                              item.id,
                              "service_id",
                              e.target.value,
                            )
                          }
                        >
                          {AVAILABLE_DEAL_SERVICES.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-1 block">
                          Tipo de cobrança
                        </label>
                        <select
                          className="w-full p-4 bg-white rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-green-500 outline-none font-bold"
                          value={item.billing_type}
                          onChange={(e) =>
                            updateDealItem(
                              item.id,
                              "billing_type",
                              e.target.value,
                            )
                          }
                        >
                          <option value="one_time">Pagamento único</option>
                          <option value="recurring">Mensalidade</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-1 block">
                          Valor (R$)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          className="w-full p-4 bg-white rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-green-500 outline-none font-bold"
                          value={item.amount}
                          onChange={(e) =>
                            updateDealItem(item.id, "amount", e.target.value)
                          }
                        />
                      </div>

                      {item.billing_type === "recurring" ? (
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-1 block">
                            Vencimento mensal
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            min="1"
                            max="31"
                            placeholder="Ex: 5"
                            className="w-full p-4 bg-white rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-green-500 outline-none font-bold"
                            value={item.due_day}
                            onChange={(e) =>
                              updateDealItem(item.id, "due_day", e.target.value)
                            }
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-1 block">
                            Data de entrega
                          </label>
                          <input
                            type="date"
                            className="w-full p-4 bg-white rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-green-500 outline-none font-bold text-sm"
                            value={item.deadline}
                            onChange={(e) =>
                              updateDealItem(
                                item.id,
                                "deadline",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                      )}

                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-1 block">
                          Observações
                        </label>
                        <input
                          placeholder="Ex: 2 posts e 5 stories por semana"
                          className="w-full p-4 bg-white rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-green-500 outline-none font-bold"
                          value={item.notes}
                          onChange={(e) =>
                            updateDealItem(item.id, "notes", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                    Inicial
                  </p>
                  <p className="text-2xl font-black text-slate-900 tracking-tighter">
                    {formatCurrency(calculateDealTotals().oneTimeTotal)}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                    Mensal
                  </p>
                  <p className="text-2xl font-black text-green-600 tracking-tighter">
                    {formatCurrency(calculateDealTotals().monthlyTotal)}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                    Total inicial
                  </p>
                  <p className="text-2xl font-black text-slate-900 tracking-tighter">
                    {formatCurrency(calculateDealTotals().initialTotal)}
                  </p>
                </div>
              </div>

              <button
                onClick={handleFinalizeDeal}
                className="bg-[#00b37e] text-white px-10 py-5 rounded-[2rem] font-black text-sm shadow-xl hover:scale-105 active:scale-95 transition-all"
              >
                Confirmar Fechamento
              </button>
            </div>
          </div>
        </div>
      )}

      {lead.status === "closed" && (
        <div className="mb-10 bg-green-500 text-white p-6 rounded-[2.5rem] flex items-center justify-between shadow-xl border border-green-400 animate-in slide-in-from-top duration-500">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl">
              <Award size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight">
                Negócio Fechado! 🎉
              </h2>
              <p className="opacity-80 text-sm font-bold">
                Parabéns pelo fechamento com a {lead.name}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70">
              Valor Total
            </p>
            <p className="text-3xl font-black tracking-tighter">
              {formatCurrency(
                lead.sale_value || dealData.totalInitialValue || 0,
              )}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-3 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all text-slate-400 hover:text-black"
          >
            <ArrowLeft size={20} />
          </button>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-black tracking-tighter text-slate-900">
                {lead.name}
              </h1>

              <button
                onClick={handleEditName}
                className="text-slate-300 hover:text-blue-500 transition-colors p-1"
              >
                <Edit3 size={16} />
              </button>

              <span className="bg-slate-100 text-rose-500 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest border border-rose-100">
                {lead.lead_category} • {lead.lead_city}
              </span>

              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest border ${temp.classes}`}
                >
                  <Flame size={12} />
                  {temp.label}
                </div>

                <div className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest border bg-slate-50 text-slate-700 border-slate-200">
                  {score} pontos
                </div>
              </div>
            </div>

            <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">
              {lead.niche} • {lead.neighborhood}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap bg-amaber-600 justify-end">
          <div className="w-full justify-end flex">
            <button
              onClick={() =>
                handleUpdate({
                  is_verified: !lead.is_verified,
                  custom_message: customMessage,
                  is_ai_ready: true,
                })
              }
              className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                lead.is_verified
                  ? "bg-green-100 text-green-600 border-2 border-green-200"
                  : "bg-white text-slate-400 border-2 border-slate-100"
              }`}
            >
              {lead.is_verified
                ? "✓ Verificado para Automação"
                : "Aprovar Automação"}
            </button>

            <button
              onClick={handleDelete}
              className="p-3 text-red-400 hover:bg-red-50 rounded-2xl transition-all"
            >
              <Trash2 size={22} />
            </button>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-2xl">
            {[
              "pending",
              "contacted",
              "responded",
              "qualified",
              "preview_sent",
              "negotiation",
              "closed",
              "lost",
            ].map((st) => (
              <button
                key={st}
                onClick={() =>
                  st === "closed"
                    ? setShowClosingModal(true)
                    : handleUpdate({
                        status: st,
                        pipeline_stage:
                          st === "preview_sent"
                            ? "preview_sent"
                            : st === "qualified"
                              ? "qualified"
                              : st === "negotiation"
                                ? "negotiation"
                                : st === "lost"
                                  ? "lost"
                                  : st,
                        preview_sent: st === "preview_sent" ? true : undefined,
                        lost_reason: st === "lost" ? "manual" : undefined,
                      })
                }
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  lead.status === st
                    ? "bg-white shadow-sm text-blue-600"
                    : "text-slate-400"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <ClipboardList size={16} className="text-purple-500" />
                Briefing do Cliente
              </h3>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyBriefingLink}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-black active:scale-95 transition-all"
                >
                  <Link size={13} />
                  Solicitar Briefing
                </button>

                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    briefing
                      ? "bg-green-50 text-green-600 border border-green-100"
                      : "bg-slate-50 text-slate-400 border border-slate-100"
                  }`}
                >
                  {briefing ? "Recebido" : "Aguardando"}
                </span>
                {briefing && lead.pipeline_stage !== "qualified" && (
                  <button
                    onClick={() =>
                      handleUpdate({
                        status: "responded",
                        pipeline_stage: "qualified",
                      })
                    }
                    className="px-4 py-2 rounded-xl bg-purple-50 text-purple-600 text-[10px] font-black uppercase tracking-widest border border-purple-100 hover:bg-purple-100 active:scale-95 transition-all"
                  >
                    Marcar qualificado
                  </button>
                )}
              </div>
            </div>

            {briefing ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InfoMiniCard
                    label="Empresa"
                    value={briefing.business_name || "—"}
                  />
                  <InfoMiniCard
                    label="Clientes/semana"
                    value={briefing.weekly_clients || "—"}
                  />
                  <InfoMiniCard
                    label="Investimento"
                    value={briefing.investment_range || "—"}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoMiniCard
                    label="Serviços principais"
                    value={briefing.main_services || "—"}
                  />
                  <InfoMiniCard
                    label="Serviço foco"
                    value={briefing.most_profitable_service || "—"}
                  />
                  <InfoMiniCard
                    label="Diferencial"
                    value={briefing.differential || "—"}
                  />
                  <InfoMiniCard
                    label="Público-alvo"
                    value={briefing.target_audience || "—"}
                  />
                </div>

                <InfoMiniCard
                  label="Maior dificuldade"
                  value={briefing.biggest_problem || "—"}
                />

                {Array.isArray(briefing.goals) && briefing.goals.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
                      Objetivos
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {briefing.goals.map((goal) => (
                        <span
                          key={goal}
                          className="px-3 py-2 rounded-full bg-purple-50 text-purple-600 text-[10px] font-black uppercase tracking-widest"
                        >
                          {goal}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoMiniCard
                    label="Cores da marca"
                    value={briefing.brand_colors || "—"}
                  />
                  <InfoMiniCard
                    label="Referências"
                    value={briefing.references_text || "—"}
                  />
                </div>

                <InfoMiniCard
                  label="Observações finais"
                  value={briefing.notes || "—"}
                />
              </div>
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-[2rem] p-8 text-center">
                <p className="text-sm font-bold text-slate-400">
                  Nenhum briefing recebido ainda para este lead.
                </p>

                <p className="text-xs text-slate-400 mt-2">
                  Envie o link de briefing para coletar informações estratégicas
                  antes do preview ou proposta.
                </p>
              </div>
            )}
          </div>

          <div
            className={`p-6 rounded-[2.5rem] border shadow-sm ${suggestedAction.classes}`}
          >
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-2xl bg-white/60 border border-white/50">
                <Target size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 mb-2">
                  Próxima ação sugerida
                </p>
                <h3 className="text-lg font-black tracking-tight mb-1">
                  {suggestedAction.title}
                </h3>
                <p className="text-sm font-medium opacity-90">
                  {suggestedAction.description}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-2xl bg-purple-50 text-purple-600">
                  <BrainCircuit size={21} />
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-500 mb-2">
                    Inteligência comercial
                  </p>

                  <h3 className="text-xl font-black tracking-tight text-slate-900">
                    Serviços recomendados
                  </h3>

                  <p className="text-sm font-medium text-slate-400 mt-1">
                    Ranking baseado nos resultados registrados para{" "}
                    <span className="text-slate-700 font-black">
                      {recommendations?.lead?.lead_category ||
                        lead.lead_category ||
                        "este nicho"}
                    </span>
                    .
                  </p>
                </div>
              </div>

              {recommendations?.available &&
                recommendations?.all_services?.length > 3 && (
                  <button
                    onClick={() => setShowAllServices((current) => !current)}
                    className="px-4 py-3 rounded-2xl bg-slate-50 text-slate-600 hover:bg-slate-100 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                  >
                    {showAllServices ? (
                      <>
                        <ChevronUp size={15} />
                        Mostrar top 3
                      </>
                    ) : (
                      <>
                        <ChevronDown size={15} />
                        Ver todos ({recommendations.all_services.length})
                      </>
                    )}
                  </button>
                )}
            </div>

            {loadingRecommendations ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <Loader2
                  size={30}
                  className="animate-spin text-purple-500 mb-4"
                />

                <p className="text-sm font-black text-slate-700">
                  Calculando recomendações
                </p>

                <p className="text-xs font-medium text-slate-400 mt-1">
                  Consultando o histórico comercial do nicho.
                </p>
              </div>
            ) : recommendationError ? (
              <div className="p-6 rounded-[2rem] bg-red-50 border border-red-100">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-red-500 shrink-0" />

                  <div className="flex-1">
                    <p className="font-black text-red-700 text-sm">
                      Não foi possível carregar
                    </p>

                    <p className="text-xs text-red-500 font-medium mt-1">
                      {recommendationError}
                    </p>

                    <button
                      onClick={fetchServiceOpportunityData}
                      className="mt-4 px-4 py-2 rounded-xl bg-white text-red-600 text-[10px] font-black uppercase tracking-widest border border-red-100"
                    >
                      Tentar novamente
                    </button>
                  </div>
                </div>
              </div>
            ) : recommendations?.available === false ? (
              <div className="p-8 rounded-[2rem] bg-slate-50 border border-dashed border-slate-200 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 mb-4">
                  <Layers3 size={21} />
                </div>

                <p className="text-sm font-black text-slate-700">
                  Recomendação disponível após o lead responder
                </p>

                <p className="text-xs font-medium text-slate-400 mt-2 max-w-md mx-auto">
                  Depois da resposta, o sistema mostrará os serviços com melhor
                  histórico para este nicho.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {currentOpportunity && (
                  <div className="bg-slate-900 text-white p-6 rounded-[2rem] relative overflow-hidden">
                    <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-purple-500/10" />

                    <div className="relative z-10">
                      <div className="flex items-start justify-between gap-5 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2
                              size={15}
                              className="text-green-400"
                            />

                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-green-400">
                              Serviço em negociação
                            </p>
                          </div>

                          <h4 className="text-2xl font-black tracking-tight">
                            {currentOpportunity.service_name}
                          </h4>

                          <p className="text-sm font-bold text-slate-400 mt-1">
                            {currentOpportunity.problem_category}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="px-3 py-2 rounded-full bg-white/10 text-[10px] font-black uppercase tracking-widest">
                            Oportunidade: {currentOpportunity.total_score}/8
                          </span>

                          {selectedServiceRanking?.has_history && (
                            <span className="px-3 py-2 rounded-full bg-purple-500/20 text-purple-200 text-[10px] font-black uppercase tracking-widest">
                              Média no nicho:{" "}
                              {Number(
                                selectedServiceRanking.average_score || 0,
                              ).toFixed(1)}
                              /8
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 mt-6">
                        <button
                          disabled
                          title="Será ativado na etapa de análise comercial"
                          className="px-4 py-3 rounded-xl bg-white/5 text-slate-500 text-[10px] font-black uppercase tracking-widest cursor-not-allowed"
                        >
                          Editar análise
                        </button>

                        <button
                          disabled
                          title="Será ativado quando o guia for implementado"
                          className="px-4 py-3 rounded-xl bg-white/5 text-slate-500 text-[10px] font-black uppercase tracking-widest cursor-not-allowed"
                        >
                          Ver guia
                        </button>

                        <button
                          onClick={() => setShowAllServices(true)}
                          className="px-4 py-3 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          Trocar serviço
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {serviceFeedback && (
                  <div className="px-5 py-4 rounded-2xl bg-green-50 text-green-700 border border-green-100 text-sm font-bold flex items-center gap-2">
                    <CheckCircle2 size={17} />
                    {serviceFeedback}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        {showAllServices
                          ? "Todos os serviços"
                          : "Top 3 do nicho"}
                      </p>

                      <p className="text-xs font-medium text-slate-400 mt-1">
                        A decisão final continua sendo sua.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <BarChart3 size={14} />
                      {
                        recommendations?.ranking_summary?.services_with_history
                      }{" "}
                      com histórico
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    {visibleRecommendedServices.map((service) => {
                      const isSelected = service.is_selected === true;

                      const isSelecting =
                        selectingServiceId === Number(service.service_id);

                      const sampleClasses =
                        service.sample_status === "Histórico relevante"
                          ? "bg-green-50 text-green-600 border-green-100"
                          : service.sample_status === "Histórico inicial"
                            ? "bg-blue-50 text-blue-600 border-blue-100"
                            : service.sample_status === "Amostra pequena"
                              ? "bg-orange-50 text-orange-600 border-orange-100"
                              : "bg-slate-50 text-slate-400 border-slate-100";

                      return (
                        <div
                          key={service.service_id}
                          className={`p-5 rounded-[2rem] border transition-all ${
                            isSelected
                              ? "border-purple-300 bg-purple-50/60 ring-2 ring-purple-100"
                              : "border-slate-100 bg-white hover:border-purple-200 hover:shadow-lg"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-5">
                            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black">
                              {service.rank}
                            </div>

                            <span
                              className={`px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${sampleClasses}`}
                            >
                              {service.sample_status}
                            </span>
                          </div>

                          <h4 className="text-base font-black text-slate-900 tracking-tight">
                            {service.service_name}
                          </h4>

                          <p className="text-[10px] font-black uppercase tracking-widest text-purple-500 mt-2">
                            {service.problem_category}
                          </p>

                          <p className="text-xs font-medium text-slate-400 leading-relaxed mt-4 line-clamp-3">
                            {service.description}
                          </p>

                          <div className="grid grid-cols-2 gap-3 mt-5">
                            <div className="bg-slate-50 rounded-2xl p-3">
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                Score médio
                              </p>

                              <p className="text-lg font-black text-slate-900 mt-1">
                                {service.has_history
                                  ? `${Number(
                                      service.average_score || 0,
                                    ).toFixed(1)}/8`
                                  : "—"}
                              </p>
                            </div>

                            <div className="bg-slate-50 rounded-2xl p-3">
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                Utilizações
                              </p>

                              <p className="text-lg font-black text-slate-900 mt-1">
                                {service.times_selected}
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() =>
                              handleSelectRecommendedService(service)
                            }
                            disabled={isSelected || isSelecting}
                            className={`w-full mt-5 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${
                              isSelected
                                ? "bg-purple-100 text-purple-600 cursor-default"
                                : "bg-slate-900 text-white hover:bg-black active:scale-95"
                            }`}
                          >
                            {isSelecting ? (
                              <>
                                <Loader2 size={15} className="animate-spin" />
                                Salvando
                              </>
                            ) : isSelected ? (
                              <>
                                <CheckCircle2 size={15} />
                                Selecionado
                              </>
                            ) : currentOpportunity ? (
                              "Trocar para este"
                            ) : (
                              "Selecionar"
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <TrendingUp size={16} className="text-orange-500" /> Ações de
                Conversão (Scoring)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() =>
                  handleUpdate({
                    status: "responded",
                    pipeline_stage: "responded",
                  })
                }
                disabled={lead.status === "responded"}
                className={`p-5 rounded-3xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
                  lead.status === "responded"
                    ? "bg-green-50 text-green-500 border border-green-100"
                    : "bg-slate-900 text-white hover:bg-black shadow-lg shadow-black/10"
                }`}
              >
                {lead.status === "responded" ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <MessageSquare size={16} />
                )}
                {lead.status === "responded"
                  ? "Lead Respondeu"
                  : "Marcar Resposta (+2)"}
              </button>

              <button
                onClick={() =>
                  handleUpdate({
                    preview_sent: true,
                    pipeline_stage: "preview_sent",
                  })
                }
                disabled={lead.preview_sent}
                className={`p-5 rounded-3xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
                  lead.preview_sent
                    ? "bg-blue-50 text-blue-500 border border-blue-100"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20"
                }`}
              >
                {lead.preview_sent ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                {lead.preview_sent ? "Preview Enviado" : "Enviar Preview (+2)"}
              </button>

              <button
                onClick={() =>
                  handleUpdate({
                    price_requested: true,
                    pipeline_stage: "negotiation",
                    status: "negotiation",
                  })
                }
                disabled={lead.price_requested}
                className={`p-5 rounded-3xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
                  lead.price_requested
                    ? "bg-purple-50 text-purple-500 border border-purple-100"
                    : "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-600/20"
                }`}
              >
                {lead.price_requested ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <Receipt size={16} />
                )}
                {lead.price_requested ? "Pediu Orçamento" : "Pediu Preço (+3)"}
              </button>

              <button
                onClick={() => setShowClosingModal(true)}
                className="p-5 rounded-3xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/20"
              >
                <DollarSign size={16} />
                Fechar Negócio
              </button>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <BellRing size={16} className="text-blue-500" /> Follow-up
                Automático
              </h3>
              <span className={`text-sm font-bold ${followupStatus.color}`}>
                {followupStatus.label}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InfoMiniCard
                label="Follow-ups enviados"
                value={lead.followup_count ?? 0}
              />
              <InfoMiniCard
                label="Último follow-up"
                value={formatDateTime(lead.last_followup_at)}
              />
              <InfoMiniCard
                label="Próximo agendado"
                value={formatDateTime(lead.next_followup_at)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2">
                <ShieldCheck size={16} className="text-blue-500" /> Análise de
                Mercado
              </h3>
              <textarea
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium min-h-[120px] resize-none transition-all"
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
              />
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2">
                <MessageSquare size={16} /> Notas Estratégicas
              </h3>
              <textarea
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-slate-300 outline-none text-sm font-medium min-h-[120px] resize-none italic"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-2">
              <History size={16} /> Histórico de Atividades
            </h3>

            <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
              {activities.map((act) => (
                <div key={act.id} className="flex gap-4 relative">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                      {act.type === "contact" ? (
                        <Send size={12} />
                      ) : act.type === "followup" ? (
                        <BellRing size={12} />
                      ) : (
                        <Clock size={12} />
                      )}
                    </div>
                    <div className="w-[2px] h-full bg-slate-50 mt-2"></div>
                  </div>

                  <div className="pb-6">
                    <p className="text-sm font-bold text-slate-800">
                      {act.description}
                    </p>
                    <p className="text-[10px] text-slate-400 font-black uppercase mt-1">
                      {new Date(act.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2">
              <DollarSign size={16} className="text-green-500" /> CAC
            </h3>

            <div className="flex items-center bg-slate-50 p-4 rounded-2xl">
              <span className="text-slate-400 font-black mr-2">R$</span>
              <input
                type="number"
                className="bg-transparent border-none outline-none font-bold text-slate-900 w-full"
                value={lead?.acquisition_cost || ""}
                onChange={(e) =>
                  handleUpdate({ acquisition_cost: e.target.value })
                }
              />
            </div>
          </div>

          <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
            {aiSuggestion && (
              <div className="mb-6 p-4 bg-blue-600/20 border border-blue-500/30 rounded-2xl animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-blue-400">
                    <Sparkles size={14} className="animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                      Sugestão da IA
                    </span>
                  </div>

                  <button
                    onClick={handleApplyAI}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-black py-1 px-3 rounded-full transition-all active:scale-95"
                  >
                    APLICAR TEXTO
                  </button>
                </div>

                <p className="text-[11px] text-blue-100/70 italic line-clamp-3 leading-relaxed">
                  "{aiSuggestion}"
                </p>
              </div>
            )}

            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-[10px] uppercase tracking-[0.3em] text-blue-400">
                Mensagem Final
              </h3>

              <button
                onClick={handleResetMessage}
                className="text-[9px] font-black uppercase text-slate-500 flex items-center gap-1 hover:text-white transition-colors"
              >
                <RotateCcw size={10} /> Resetar Padrão
              </button>
            </div>

            <textarea
              className="w-full bg-white/5 p-5 rounded-2xl border border-white/10 h-64 outline-none focus:border-blue-500 transition-all text-sm leading-relaxed italic opacity-90 resize-none scrollbar-hide"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSendWhatsApp}
                className="flex-[4] bg-[#00b37e] hover:bg-[#00c98d] py-5 rounded-2xl font-black transition-all flex items-center justify-center gap-3 shadow-xl shadow-[#00b37e]/20"
              >
                <Send size={18} /> Disparar WhatsApp
              </button>

              <button
                onClick={() =>
                  handleUpdate({
                    custom_message: customMessage,
                    is_ai_ready: true,
                  })
                }
                disabled={isSaving}
                className={`flex-1 rounded-2xl transition-all border border-white/10 flex items-center justify-center group ${
                  isSaving
                    ? "bg-blue-600 text-white"
                    : "bg-white/10 hover:bg-white/20 text-white"
                }`}
              >
                {isSaving ? (
                  <CheckCircle2 size={20} className="animate-in zoom-in" />
                ) : (
                  <Save
                    size={20}
                    className="group-hover:scale-110 transition-transform text-blue-400"
                  />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const formatCurrency = (value) => {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const InfoMiniCard = ({ label, value }) => (
  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
      {label}
    </p>
    <p className="text-sm font-bold text-slate-800 break-words">{value}</p>
  </div>
);

export default LeadDetails;
