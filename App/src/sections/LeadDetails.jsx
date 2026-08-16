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
  FileText,
  BookOpen,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

const ANALYSIS_PAIN_POINTS = [
  "Organização",
  "Credibilidade",
  "Aquisição de clientes",
  "Atendimento",
  "Processos internos",
  "Visibilidade local",
  "Conversão",
  "Agilidade",
  "Prospecção",
  "Outro",
];

const INITIAL_GUIDE_SECTIONS = {
  objective: true,
  scenario_reading: true,
  main_opportunity: true,
  pains_to_explore: false,
  recommended_questions: true,
  value_arguments: true,
  likely_objections: false,
  objection_responses: false,
  ideal_demo_moment: false,
  next_step: true,
  cautions: false,
};

const LeadDetails = ({ leadId, onBack }) => {
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [briefing, setBriefing] = useState(null);
  const [showBriefingLinkModal, setShowBriefingLinkModal] = useState(false);
  const [briefingLink, setBriefingLink] = useState("");
  const [copiedBriefingLink, setCopiedBriefingLink] = useState(false);
  const [generatingBriefingLink, setGeneratingBriefingLink] = useState(false);

  const [observation, setObservation] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState("");

  const [recommendations, setRecommendations] = useState(null);
  const [currentOpportunity, setCurrentOpportunity] = useState(null);

  const [loadingRecommendations, setLoadingRecommendations] = useState(true);
  const [recommendationError, setRecommendationError] = useState("");
  const [serviceFeedback, setServiceFeedback] = useState("");

  const [progressEvent, setProgressEvent] = useState("");
  const [progressFeedback, setProgressFeedback] = useState("");
  const [progressWarning, setProgressWarning] = useState("");
  const [progressError, setProgressError] = useState("");

  const [showAllServices, setShowAllServices] = useState(false);
  const [selectingServiceId, setSelectingServiceId] = useState(null);

  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  const [analysisForm, setAnalysisForm] = useState({
    analysis_notes: "",
    pain_points: [],
    perceived_goal: "",
  });

  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisFeedback, setAnalysisFeedback] = useState("");

  const [showNegotiationGuide, setShowNegotiationGuide] = useState(false);
  const [generatingGuide, setGeneratingGuide] = useState(false);
  const [guideError, setGuideError] = useState("");
  const [copiedGuideItem, setCopiedGuideItem] = useState("");

  const [expandedGuideSections, setExpandedGuideSections] = useState(
    INITIAL_GUIDE_SECTIONS,
  );

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
    setProgressEvent("");
    setProgressFeedback("");
    setProgressWarning("");
    setProgressError("");
    setRecommendationError("");
    setShowNegotiationGuide(false);
    setGuideError("");
    setCopiedGuideItem("");
    setExpandedGuideSections(INITIAL_GUIDE_SECTIONS);

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

    const hasCommercialAnalysis = Boolean(
      currentOpportunity?.analysis_notes?.trim() ||
      currentOpportunity?.perceived_goal?.trim() ||
      (Array.isArray(currentOpportunity?.pain_points) &&
        currentOpportunity.pain_points.length > 0),
    );

    if (currentOpportunity && !hasCommercialAnalysis) {
      return {
        title: "Preencha a análise comercial",
        description: `Registre o que percebeu sobre a oportunidade de ${currentOpportunity.service_name}.`,
        classes: "bg-indigo-50 text-indigo-700 border-indigo-200",
      };
    }

    if (
      currentOpportunity &&
      hasCommercialAnalysis &&
      !currentOpportunity.negotiation_guide
    ) {
      return {
        title: "Gere o guia da negociação",
        description:
          "A análise está salva. Agora a IA pode estruturar sua estratégia comercial.",
        classes: "bg-purple-50 text-purple-700 border-purple-200",
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

    const interestRegistered =
      Number(currentOpportunity?.interest_score || 0) > 0;

    const previewRegistered =
      Number(currentOpportunity?.preview_score || 0) > 0;

    const priceRegistered = Number(currentOpportunity?.price_score || 0) > 0;

    const closedRegistered = Number(currentOpportunity?.closed_score || 0) > 0;

    if (interestRegistered && !previewRegistered) {
      return {
        title: "Apresente uma demonstração ou exemplo",
        description:
          "O interesse foi confirmado. Mostre algo concreto para aumentar a percepção de valor.",
        classes: "bg-blue-50 text-blue-700 border-blue-200",
      };
    }

    if (previewRegistered && !priceRegistered) {
      return {
        title: "Valide interesse e conduza para investimento",
        description:
          "O lead já viu uma demonstração. Confirme a aderência e avance para preço e escopo.",
        classes: "bg-indigo-50 text-indigo-700 border-indigo-200",
      };
    }

    if (priceRegistered && !closedRegistered) {
      return {
        title: "Negocie condições e próximo passo",
        description:
          "O lead avançou para preço. Alinhe escopo, prazo, pagamento e fechamento.",
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

  const openAnalysisModal = (opportunity = currentOpportunity) => {
    if (!opportunity) {
      setRecommendationError(
        "Selecione um serviço antes de preencher a análise.",
      );
      return;
    }

    setAnalysisForm({
      analysis_notes: opportunity.analysis_notes || "",

      pain_points: Array.isArray(opportunity.pain_points)
        ? opportunity.pain_points
        : [],

      perceived_goal: opportunity.perceived_goal || "",
    });

    setAnalysisError("");
    setAnalysisFeedback("");
    setShowAnalysisModal(true);
  };

  const toggleAnalysisPainPoint = (painPoint) => {
    setAnalysisForm((current) => {
      const alreadySelected = current.pain_points.includes(painPoint);

      return {
        ...current,

        pain_points: alreadySelected
          ? current.pain_points.filter((item) => item !== painPoint)
          : [...current.pain_points, painPoint],
      };
    });
  };

  const handleSaveAnalysis = async ({ closeAfterSave = true } = {}) => {
    if (!currentOpportunity) {
      setAnalysisError("Nenhum serviço ativo foi encontrado.");
      return false;
    }

    const normalizedForm = {
      analysis_notes: analysisForm.analysis_notes.trim(),

      pain_points: analysisForm.pain_points,

      perceived_goal: analysisForm.perceived_goal.trim(),
    };

    const hasContent = Boolean(
      normalizedForm.analysis_notes ||
      normalizedForm.perceived_goal ||
      normalizedForm.pain_points.length > 0,
    );

    if (!hasContent) {
      setAnalysisError(
        "Preencha pelo menos uma observação, uma dor ou um objetivo percebido.",
      );
      return false;
    }

    const currentPainPoints = Array.isArray(currentOpportunity.pain_points)
      ? [...currentOpportunity.pain_points].sort()
      : [];

    const nextPainPoints = [...normalizedForm.pain_points].sort();

    const hasChanges =
      String(currentOpportunity.analysis_notes || "").trim() !==
        normalizedForm.analysis_notes ||
      String(currentOpportunity.perceived_goal || "").trim() !==
        normalizedForm.perceived_goal ||
      JSON.stringify(currentPainPoints) !== JSON.stringify(nextPainPoints);

    if (!hasChanges) {
      setAnalysisError("");
      setAnalysisFeedback("A análise já está atualizada.");

      if (closeAfterSave) {
        setShowAnalysisModal(false);
      }

      return true;
    }

    setSavingAnalysis(true);
    setAnalysisError("");
    setAnalysisFeedback("");

    try {
      const response = await api.patch(
        `/service-opportunities/leads/${leadId}/analysis`,
        normalizedForm,
      );

      const opportunity = response.data?.opportunity || {};

      const service = response.data?.service || {};

      const updatedOpportunity = {
        ...currentOpportunity,
        ...opportunity,

        service_name: service.service_name || currentOpportunity.service_name,

        service_key: service.service_key || currentOpportunity.service_key,

        problem_category:
          service.problem_category || currentOpportunity.problem_category,
      };

      setCurrentOpportunity(updatedOpportunity);

      setAnalysisForm({
        analysis_notes: updatedOpportunity.analysis_notes || "",

        pain_points: Array.isArray(updatedOpportunity.pain_points)
          ? updatedOpportunity.pain_points
          : [],

        perceived_goal: updatedOpportunity.perceived_goal || "",
      });

      const successMessage =
        response.data?.message || "Análise comercial salva com sucesso.";

      setGuideError("");

      setAnalysisFeedback(successMessage);
      setServiceFeedback(successMessage);

      if (closeAfterSave) {
        setShowAnalysisModal(false);
      }

      return true;
    } catch (error) {
      console.error("Erro ao salvar análise:", error);

      setAnalysisError(
        error.response?.data?.error ||
          "Não foi possível salvar a análise comercial.",
      );

      return false;
    } finally {
      setSavingAnalysis(false);
    }
  };

  const toggleGuideSection = (sectionId) => {
    setExpandedGuideSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  };

  const handleCopyGuideText = async (text, copyId) => {
    const normalizedText = String(text || "").trim();

    if (!normalizedText) return;

    try {
      await navigator.clipboard.writeText(normalizedText);

      setCopiedGuideItem(copyId);

      setTimeout(() => {
        setCopiedGuideItem((current) => (current === copyId ? "" : current));
      }, 1800);
    } catch (error) {
      console.error("Erro ao copiar conteúdo:", error);

      prompt("Copie o conteúdo:", normalizedText);
    }
  };

  const handleGenerateGuide = async ({
    saveAnalysisFirst = false,
    confirmRegeneration = false,
  } = {}) => {
    if (!currentOpportunity) {
      setGuideError("Nenhum serviço ativo foi encontrado.");
      return false;
    }

    if (confirmRegeneration && currentOpportunity.negotiation_guide) {
      const confirmed = window.confirm(
        "Deseja regenerar o guia usando a análise comercial atual?\n\nO guia anterior será substituído.",
      );

      if (!confirmed) {
        return false;
      }
    }

    if (saveAnalysisFirst) {
      const analysisSaved = await handleSaveAnalysis({
        closeAfterSave: false,
      });

      if (!analysisSaved) {
        return false;
      }
    }

    setGeneratingGuide(true);
    setGuideError("");
    setAnalysisError("");
    setAnalysisFeedback("");

    try {
      const response = await api.post(
        `/service-opportunities/leads/${leadId}/guide`,
        {},
      );

      const opportunity = response.data?.opportunity || {};

      const service = response.data?.service || {};

      setCurrentOpportunity((current) => ({
        ...current,
        ...opportunity,

        service_name: service.service_name || current?.service_name,

        service_key: service.service_key || current?.service_key,

        problem_category: service.problem_category || current?.problem_category,
      }));

      setServiceFeedback(
        response.data?.message || "Guia de negociação gerado com sucesso.",
      );

      setShowAnalysisModal(false);
      setShowNegotiationGuide(true);

      setExpandedGuideSections(INITIAL_GUIDE_SECTIONS);

      return true;
    } catch (error) {
      console.error("Erro ao gerar guia:", error);

      setGuideError(
        error.response?.data?.error ||
          error.response?.data?.details ||
          "Não foi possível gerar o guia de negociação.",
      );

      return false;
    } finally {
      setGeneratingGuide(false);
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

      const returnedOpportunity = response.data?.opportunity || null;

      const returnedService = response.data?.service || null;

      const enrichedOpportunity = returnedOpportunity
        ? {
            ...returnedOpportunity,

            service_name:
              returnedService?.service_name || returnedOpportunity.service_name,

            service_key:
              returnedService?.service_key || returnedOpportunity.service_key,

            problem_category:
              returnedService?.problem_category ||
              returnedOpportunity.problem_category,
          }
        : null;

      if (enrichedOpportunity) {
        setCurrentOpportunity(enrichedOpportunity);
      }

      setServiceFeedback(
        response.data?.message || "Serviço selecionado com sucesso.",
      );

      setShowNegotiationGuide(false);
      setGuideError("");

      await fetchServiceOpportunityData();

      if (
        enrichedOpportunity &&
        ["created", "changed"].includes(response.data?.action)
      ) {
        openAnalysisModal(enrichedOpportunity);
      }
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

  const handleProgressEvent = async (event, extraPayload = {}) => {
    if (progressEvent) {
      return null;
    }

    setProgressEvent(event);
    setProgressFeedback("");
    setProgressWarning("");
    setProgressError("");

    try {
      const response = await api.patch(
        `/service-opportunities/leads/${leadId}/progress`,
        {
          event,
          ...extraPayload,
        },
      );

      const responseData = response.data;

      if (responseData?.lead) {
        setLead(responseData.lead);
      }

      if (responseData?.opportunity) {
        setCurrentOpportunity((current) => ({
          ...current,
          ...responseData.opportunity,
        }));
      }

      setProgressFeedback(
        responseData?.message || "Avanço comercial registrado com sucesso.",
      );

      setProgressWarning(responseData?.warning || "");

      /*
       * Atualiza:
       * - lead;
       * - histórico;
       * - oportunidade;
       * - ranking do nicho.
       */
      await Promise.all([fetchData(), fetchServiceOpportunityData()]);

      return responseData;
    } catch (error) {
      console.error("Erro ao registrar progresso:", error);

      setProgressError(
        error.response?.data?.error ||
          "Não foi possível registrar o avanço comercial.",
      );

      return null;
    } finally {
      setProgressEvent("");
    }
  };

  const handlePipelineStatusClick = async (status) => {
    if (status === "closed") {
      setProgressError("");
      setShowClosingModal(true);
      return;
    }

    if (status === "qualified") {
      await handleProgressEvent("interest");
      return;
    }

    if (status === "preview_sent") {
      await handleProgressEvent("preview");
      return;
    }

    if (status === "negotiation") {
      await handleProgressEvent("price");
      return;
    }

    await handleUpdate({
      status,
      pipeline_stage: status,
      lost_reason: status === "lost" ? "manual" : undefined,
    });
  };

  const isPipelineStatusActive = (status) => {
    if (status === "qualified") {
      return ["qualified", "interested"].includes(lead.pipeline_stage);
    }

    if (status === "preview_sent") {
      return lead.pipeline_stage === "preview_sent";
    }

    if (status === "negotiation") {
      return (
        lead.status === "negotiation" || lead.pipeline_stage === "negotiation"
      );
    }

    if (status === "closed") {
      return lead.status === "closed" || lead.pipeline_stage === "closed";
    }

    return lead.status === status || lead.pipeline_stage === status;
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
    if (!dealData.items?.length) {
      setProgressError(
        "Adicione pelo menos um serviço antes de confirmar o fechamento.",
      );
      return;
    }

    const hasInvalidItem = dealData.items.some(
      (item) => parseMoney(item.amount) <= 0,
    );

    if (hasInvalidItem) {
      setProgressError(
        "Todos os serviços do contrato precisam possuir um valor maior que zero.",
      );
      return;
    }

    const totals = calculateDealTotals();

    const finalDealDetails = {
      ...dealData,
      totalInitialValue: totals.initialTotal,
      oneTimeValue: totals.oneTimeTotal,
      monthlyRecurringValue: totals.monthlyTotal,
      closedAt: new Date().toISOString(),
    };

    const result = await handleProgressEvent("closed", {
      sale_value: totals.initialTotal,
      deal_details: finalDealDetails,
    });

    if (result?.success) {
      setShowClosingModal(false);
    }
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

  const handleCopyBriefingLink = async () => {
    setGeneratingBriefingLink(true);

    try {
      const response = await api.post(
        `/briefings/lead/${leadId}/public-link`,
      );
      const publicToken = response.data?.public_token;

      if (
        typeof publicToken !== "string" ||
        publicToken.trim().length === 0
      ) {
        throw new Error("Resposta inesperada ao gerar link de briefing.");
      }

      const link = `${window.location.origin}/briefing/${encodeURIComponent(publicToken.trim())}`;
      setBriefingLink(link);
      setCopiedBriefingLink(false);
      setShowBriefingLinkModal(true);
    } catch {
      alert("Não foi possível gerar o link do briefing. Tente novamente.");
    } finally {
      setGeneratingBriefingLink(false);
    }
  };

  const copyBriefingLinkToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(briefingLink);
      setCopiedBriefingLink(true);
    } catch {
      prompt("Copie o link do briefing:", briefingLink);
    }
  };

  const closeBriefingLinkModal = () => {
    setShowBriefingLinkModal(false);
    setBriefingLink("");
    setCopiedBriefingLink(false);
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

  const hasLeadResponded = Boolean(
    lead.responded_at ||
    lead.last_reply_at ||
    ["responded", "qualified", "negotiation", "closed"].includes(lead.status) ||
    [
      "responded",
      "interested",
      "preview_sent",
      "negotiation",
      "closed",
    ].includes(lead.pipeline_stage),
  );

  const interestProgressRegistered =
    Number(currentOpportunity?.interest_score || 0) > 0;

  const previewProgressRegistered =
    Number(currentOpportunity?.preview_score || 0) > 0;

  const priceProgressRegistered =
    Number(currentOpportunity?.price_score || 0) > 0;

  const closedProgressRegistered =
    Number(currentOpportunity?.closed_score || 0) > 0 ||
    lead.status === "closed" ||
    lead.pipeline_stage === "closed";

  const opportunityScore = Number(currentOpportunity?.total_score || 0);

  const visibleRecommendedServices = showAllServices
    ? recommendations?.all_services || []
    : recommendations?.top_recommendations || [];

  const selectedServiceRanking =
    recommendations?.all_services?.find(
      (service) =>
        Number(service.service_id) === Number(currentOpportunity?.service_id),
    ) || null;

  const hasCommercialAnalysis = Boolean(
    currentOpportunity?.analysis_notes?.trim() ||
    currentOpportunity?.perceived_goal?.trim() ||
    (Array.isArray(currentOpportunity?.pain_points) &&
      currentOpportunity.pain_points.length > 0),
  );

  const negotiationGuide =
    currentOpportunity?.negotiation_guide &&
    typeof currentOpportunity.negotiation_guide === "object"
      ? currentOpportunity.negotiation_guide
      : null;

  const hasNegotiationGuide = Boolean(negotiationGuide);

  const guideGeneratedAt = currentOpportunity?.guide_generated_at || null;

  const guideIsOutdated = Boolean(
    hasNegotiationGuide &&
    currentOpportunity?.analysis_updated_at &&
    guideGeneratedAt &&
    new Date(currentOpportunity.analysis_updated_at).getTime() >
      new Date(guideGeneratedAt).getTime(),
  );

  const guideSections = [
    {
      id: "objective",
      title: "1. Objetivo da conversa",
      type: "text",
      value: negotiationGuide?.objective,
    },
    {
      id: "scenario_reading",
      title: "2. Leitura do cenário",
      type: "text",
      value: negotiationGuide?.scenario_reading,
    },
    {
      id: "main_opportunity",
      title: "3. Oportunidade principal",
      type: "text",
      value: negotiationGuide?.main_opportunity,
    },
    {
      id: "pains_to_explore",
      title: "4. Dores para explorar",
      type: "list",
      value: negotiationGuide?.pains_to_explore,
    },
    {
      id: "recommended_questions",
      title: "5. Perguntas recomendadas",
      type: "list",
      value: negotiationGuide?.recommended_questions,
    },
    {
      id: "value_arguments",
      title: "6. Argumentos de valor",
      type: "list",
      value: negotiationGuide?.value_arguments,
    },
    {
      id: "likely_objections",
      title: "7. Objeções prováveis",
      type: "list",
      value: negotiationGuide?.likely_objections,
    },
    {
      id: "objection_responses",
      title: "8. Respostas às objeções",
      type: "objections",
      value: negotiationGuide?.objection_responses,
    },
    {
      id: "ideal_demo_moment",
      title: "9. Momento ideal para mostrar exemplo",
      type: "text",
      value: negotiationGuide?.ideal_demo_moment,
    },
    {
      id: "next_step",
      title: "10. Próximo passo sugerido",
      type: "text",
      value: negotiationGuide?.next_step,
    },
    {
      id: "cautions",
      title: "11. Cuidados",
      type: "list",
      value: negotiationGuide?.cautions,
    },
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-700 pb-20 relative">
      {showAnalysisModal && currentOpportunity && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-[3rem] shadow-2xl border border-white/20 animate-in zoom-in duration-200">
            <div className="bg-slate-900 text-white p-8 flex items-start justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-2xl bg-purple-500 text-white shadow-lg shadow-purple-500/20">
                  <BrainCircuit size={23} />
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-purple-300 mb-2">
                    Análise comercial
                  </p>

                  <h2 className="text-2xl font-black tracking-tight">
                    {currentOpportunity.service_name}
                  </h2>

                  <p className="text-sm font-bold text-slate-400 mt-1">
                    {currentOpportunity.problem_category}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowAnalysisModal(false)}
                disabled={savingAnalysis || generatingGuide}
                className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-8 space-y-7 max-h-[65vh] overflow-y-auto scrollbar-hide">
              <div className="p-5 rounded-[2rem] bg-purple-50 border border-purple-100">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-500 mb-2">
                  Serviço escolhido
                </p>

                <p className="text-lg font-black text-slate-900">
                  {currentOpportunity.service_name}
                </p>

                <p className="text-sm font-medium text-slate-500 mt-1">
                  A seleção do serviço não altera a mensagem inicial enviada ao
                  lead.
                </p>
              </div>

              <div>
                <div className="flex items-end justify-between gap-3 mb-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    O que você percebeu?
                  </label>

                  <span className="text-[10px] font-bold text-slate-300">
                    {analysisForm.analysis_notes.length}/5000
                  </span>
                </div>

                <textarea
                  value={analysisForm.analysis_notes}
                  maxLength={5000}
                  onChange={(event) =>
                    setAnalysisForm((current) => ({
                      ...current,
                      analysis_notes: event.target.value,
                    }))
                  }
                  placeholder="Ex: A empresa possui boa reputação, mas aparenta depender bastante do WhatsApp para organizar horários e contatos..."
                  className="w-full min-h-[150px] resize-none rounded-[2rem] bg-slate-50 border border-slate-100 p-5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 block mb-4">
                  Principais dores
                </label>

                <div className="flex flex-wrap gap-3">
                  {ANALYSIS_PAIN_POINTS.map((painPoint) => {
                    const selected =
                      analysisForm.pain_points.includes(painPoint);

                    return (
                      <button
                        key={painPoint}
                        type="button"
                        onClick={() => toggleAnalysisPainPoint(painPoint)}
                        className={`px-4 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                          selected
                            ? "bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-600/20"
                            : "bg-white text-slate-500 border-slate-200 hover:border-purple-300 hover:text-purple-600"
                        }`}
                      >
                        {selected && (
                          <CheckCircle2 size={13} className="inline mr-2" />
                        )}

                        {painPoint}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-slate-400 font-medium mt-3">
                  Você pode selecionar mais de uma dor.
                </p>
              </div>

              <div>
                <div className="flex items-end justify-between gap-3 mb-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Objetivo percebido
                  </label>

                  <span className="text-[10px] font-bold text-slate-300">
                    {analysisForm.perceived_goal.length}/2000
                  </span>
                </div>

                <textarea
                  value={analysisForm.perceived_goal}
                  maxLength={2000}
                  onChange={(event) =>
                    setAnalysisForm((current) => ({
                      ...current,
                      perceived_goal: event.target.value,
                    }))
                  }
                  placeholder="Ex: Facilitar as marcações, diminuir o trabalho manual e oferecer uma experiência mais organizada aos clientes."
                  className="w-full min-h-[110px] resize-none rounded-[2rem] bg-slate-50 border border-slate-100 p-5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>

              {analysisError && (
                <div className="p-4 rounded-2xl bg-red-50 text-red-600 border border-red-100 flex items-start gap-3">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />

                  <p className="text-sm font-bold">{analysisError}</p>
                </div>
              )}

              {guideError && (
                <div className="p-4 rounded-2xl bg-red-50 text-red-600 border border-red-100 flex items-start gap-3">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />

                  <div>
                    <p className="text-sm font-black">
                      Não foi possível gerar o guia
                    </p>

                    <p className="text-xs font-medium mt-1">{guideError}</p>
                  </div>
                </div>
              )}

              {analysisFeedback && (
                <div className="p-4 rounded-2xl bg-green-50 text-green-700 border border-green-100 flex items-start gap-3">
                  <CheckCircle2 size={18} className="shrink-0 mt-0.5" />

                  <p className="text-sm font-bold">{analysisFeedback}</p>
                </div>
              )}
            </div>

            <div className="p-7 bg-slate-50 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setShowAnalysisModal(false)}
                disabled={savingAnalysis || generatingGuide}
                className="py-4 rounded-2xl text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSaveAnalysis({
                    closeAfterSave: true,
                  })
                }
                disabled={savingAnalysis || generatingGuide}
                className="py-4 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {savingAnalysis ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Salvando
                  </>
                ) : (
                  <>
                    <Save size={15} />
                    Salvar análise
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  handleGenerateGuide({
                    saveAnalysisFirst: true,
                  })
                }
                disabled={savingAnalysis || generatingGuide}
                className="py-4 rounded-2xl bg-purple-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-purple-700 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-purple-600/20"
              >
                {generatingGuide ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Gerando guia
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    Gerar guia
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
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
                onClick={closeBriefingLinkModal}
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
              {progressError && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-start gap-3">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />

                  <p className="text-sm font-bold">{progressError}</p>
                </div>
              )}
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
                disabled={progressEvent === "closed"}
                className="bg-[#00b37e] text-white px-10 py-5 rounded-[2rem] font-black text-sm shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {progressEvent === "closed" ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    Finalizando
                  </>
                ) : (
                  <>
                    <DollarSign size={17} />
                    Confirmar Fechamento
                  </>
                )}
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

        <div className="flex items-center gap-3 flex-wrap justify-end">
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
                onClick={() => handlePipelineStatusClick(st)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  isPipelineStatusActive(st)
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
                  disabled={generatingBriefingLink}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-black active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {generatingBriefingLink ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Gerando link...
                    </>
                  ) : (
                    <>
                      <Link size={13} />
                      Solicitar Briefing
                    </>
                  )}
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
                    onClick={() => handleProgressEvent("interest")}
                    disabled={
                      Boolean(progressEvent) ||
                      Number(currentOpportunity?.interest_score || 0) > 0
                    }
                    className="px-4 py-2 rounded-xl bg-purple-50 text-purple-600 text-[10px] font-black uppercase tracking-widest border border-purple-100 hover:bg-purple-100 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {progressEvent === "interest"
                      ? "Salvando..."
                      : "Marcar qualificado"}
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

                      <div className="mt-5">
                        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-green-400 transition-all duration-500"
                            style={{
                              width: `${Math.min(
                                100,
                                (Number(currentOpportunity.total_score || 0) /
                                  8) *
                                  100,
                              )}%`,
                            }}
                          />
                        </div>

                        <div className="flex justify-between mt-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                          <span>Selecionado</span>
                          <span>Fechado</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 mt-6">
                        <button
                          onClick={() => openAnalysisModal(currentOpportunity)}
                          className="px-4 py-3 rounded-xl bg-white/10 text-white hover:bg-white/20 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                          <FileText size={14} />

                          {hasCommercialAnalysis
                            ? "Editar análise"
                            : "Preencher análise"}
                        </button>

                        <button
                          onClick={() => {
                            setGuideError("");

                            if (hasNegotiationGuide) {
                              setShowNegotiationGuide((current) => !current);
                              return;
                            }

                            if (hasCommercialAnalysis) {
                              handleGenerateGuide();
                              return;
                            }

                            openAnalysisModal(currentOpportunity);
                          }}
                          disabled={generatingGuide}
                          className="px-4 py-3 rounded-xl bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-60"
                        >
                          {generatingGuide ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Gerando
                            </>
                          ) : hasNegotiationGuide ? (
                            <>
                              <BookOpen size={14} />
                              {showNegotiationGuide
                                ? "Ocultar guia"
                                : "Ver guia"}
                            </>
                          ) : hasCommercialAnalysis ? (
                            <>
                              <Sparkles size={14} />
                              Gerar guia
                            </>
                          ) : (
                            <>
                              <FileText size={14} />
                              Preencher análise
                            </>
                          )}
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

                {showNegotiationGuide && hasNegotiationGuide && (
                  <div className="rounded-[2.5rem] border border-purple-100 bg-gradient-to-b from-purple-50/70 to-white overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-3 duration-300">
                    <div className="p-7 border-b border-purple-100 bg-white/70">
                      <div className="flex items-start justify-between gap-5 flex-wrap">
                        <div className="flex items-start gap-4">
                          <div className="p-3 rounded-2xl bg-purple-600 text-white shadow-lg shadow-purple-600/20">
                            <BookOpen size={22} />
                          </div>

                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-500 mb-2">
                              Assistente comercial
                            </p>

                            <h4 className="text-xl font-black text-slate-900 tracking-tight">
                              Guia da negociação
                            </h4>

                            <p className="text-sm font-medium text-slate-400 mt-1">
                              Estratégia interna para{" "}
                              <span className="font-black text-slate-700">
                                {currentOpportunity.service_name}
                              </span>
                            </p>

                            <div className="flex flex-wrap gap-2 mt-3">
                              <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest">
                                Gerado em {formatDateTime(guideGeneratedAt)}
                              </span>

                              {negotiationGuide?.metadata?.version && (
                                <span className="px-3 py-1.5 rounded-full bg-purple-100 text-purple-600 text-[9px] font-black uppercase tracking-widest">
                                  Versão {negotiationGuide.metadata.version}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              openAnalysisModal(currentOpportunity)
                            }
                            className="px-4 py-3 rounded-xl bg-white text-slate-600 border border-slate-200 hover:border-purple-300 hover:text-purple-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                          >
                            <FileText size={14} />
                            Editar análise
                          </button>

                          <button
                            onClick={() =>
                              handleGenerateGuide({
                                confirmRegeneration: true,
                              })
                            }
                            disabled={generatingGuide}
                            className="px-4 py-3 rounded-xl bg-purple-600 text-white hover:bg-purple-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-60"
                          >
                            {generatingGuide ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                            Regenerar
                          </button>

                          <button
                            onClick={() => setShowNegotiationGuide(false)}
                            className="px-4 py-3 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 text-[10px] font-black uppercase tracking-widest transition-all"
                          >
                            Ocultar
                          </button>
                        </div>
                      </div>
                    </div>

                    {guideIsOutdated && (
                      <div className="mx-7 mt-6 p-5 rounded-[2rem] bg-orange-50 border border-orange-200 text-orange-700">
                        <div className="flex items-start gap-3">
                          <AlertTriangle
                            size={20}
                            className="shrink-0 mt-0.5"
                          />

                          <div className="flex-1">
                            <p className="text-sm font-black">
                              Este guia está desatualizado
                            </p>

                            <p className="text-xs font-medium mt-1">
                              A análise comercial foi modificada depois da
                              última geração.
                            </p>

                            <button
                              onClick={() =>
                                handleGenerateGuide({
                                  confirmRegeneration: true,
                                })
                              }
                              disabled={generatingGuide}
                              className="mt-4 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-60"
                            >
                              <RefreshCw
                                size={13}
                                className={
                                  generatingGuide ? "animate-spin" : ""
                                }
                              />
                              Regenerar com análise atual
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="p-7 space-y-3">
                      {guideSections.map((section) => {
                        const expanded = expandedGuideSections[section.id];

                        const itemCount = Array.isArray(section.value)
                          ? section.value.length
                          : null;

                        return (
                          <div
                            key={section.id}
                            className="rounded-[1.75rem] bg-white border border-slate-100 overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => toggleGuideSection(section.id)}
                              className="w-full p-5 flex items-center justify-between gap-4 text-left hover:bg-slate-50 transition-all"
                            >
                              <div>
                                <p className="text-sm font-black text-slate-800">
                                  {section.title}
                                </p>

                                {itemCount !== null && (
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 mt-1">
                                    {itemCount}{" "}
                                    {itemCount === 1 ? "item" : "itens"}
                                  </p>
                                )}
                              </div>

                              {expanded ? (
                                <ChevronUp
                                  size={18}
                                  className="text-purple-500"
                                />
                              ) : (
                                <ChevronDown
                                  size={18}
                                  className="text-slate-300"
                                />
                              )}
                            </button>

                            {expanded && (
                              <div className="px-5 pb-5 border-t border-slate-50">
                                {section.type === "text" && (
                                  <div className="pt-5">
                                    <p className="text-sm font-medium leading-relaxed text-slate-600 whitespace-pre-line">
                                      {section.value ||
                                        "Nenhuma informação disponível."}
                                    </p>

                                    {section.value && (
                                      <div className="flex justify-end mt-4">
                                        <GuideCopyButton
                                          copied={
                                            copiedGuideItem === section.id
                                          }
                                          onClick={() =>
                                            handleCopyGuideText(
                                              section.value,
                                              section.id,
                                            )
                                          }
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {section.type === "list" && (
                                  <div className="pt-5 space-y-3">
                                    {Array.isArray(section.value) &&
                                    section.value.length > 0 ? (
                                      section.value.map((item, index) => {
                                        const copyId = `${section.id}-${index}`;

                                        return (
                                          <div
                                            key={copyId}
                                            className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3"
                                          >
                                            <div className="w-7 h-7 shrink-0 rounded-xl bg-white text-purple-600 flex items-center justify-center text-[10px] font-black border border-slate-100">
                                              {index + 1}
                                            </div>

                                            <p className="flex-1 text-sm font-medium leading-relaxed text-slate-600">
                                              {item}
                                            </p>

                                            <GuideCopyButton
                                              compact
                                              copied={
                                                copiedGuideItem === copyId
                                              }
                                              onClick={() =>
                                                handleCopyGuideText(
                                                  item,
                                                  copyId,
                                                )
                                              }
                                            />
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <p className="text-sm text-slate-400 font-medium">
                                        Nenhum item disponível.
                                      </p>
                                    )}
                                  </div>
                                )}

                                {section.type === "objections" && (
                                  <div className="pt-5 space-y-4">
                                    {Array.isArray(section.value) &&
                                    section.value.length > 0 ? (
                                      section.value.map((item, index) => {
                                        const copyId = `objection-response-${index}`;

                                        return (
                                          <div
                                            key={copyId}
                                            className="p-5 rounded-[1.5rem] bg-slate-50 border border-slate-100"
                                          >
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400 mb-2">
                                              Objeção
                                            </p>

                                            <p className="text-sm font-black text-slate-800">
                                              {item.objection ||
                                                "Objeção não informada"}
                                            </p>

                                            <div className="my-4 h-px bg-slate-200" />

                                            <div className="flex items-start gap-3">
                                              <div className="flex-1">
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-green-500 mb-2">
                                                  Resposta sugerida
                                                </p>

                                                <p className="text-sm font-medium leading-relaxed text-slate-600">
                                                  {item.response ||
                                                    "Resposta não informada"}
                                                </p>
                                              </div>

                                              {item.response && (
                                                <GuideCopyButton
                                                  compact
                                                  copied={
                                                    copiedGuideItem === copyId
                                                  }
                                                  onClick={() =>
                                                    handleCopyGuideText(
                                                      item.response,
                                                      copyId,
                                                    )
                                                  }
                                                />
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <p className="text-sm text-slate-400 font-medium">
                                        Nenhuma resposta disponível.
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
            <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
              <div>
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                  <TrendingUp size={16} className="text-orange-500" />
                  Progresso Comercial
                </h3>

                <p className="text-xs font-medium text-slate-400 mt-2">
                  Cada avanço pontua uma única vez no serviço em negociação.
                </p>
              </div>

              <div className="px-4 py-3 rounded-2xl bg-slate-900 text-white">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Score da oportunidade
                </p>

                <p className="text-2xl font-black mt-1">
                  {currentOpportunity ? `${opportunityScore}/8` : "Sem serviço"}
                </p>
              </div>
            </div>

            {progressFeedback && (
              <div className="mb-4 p-4 rounded-2xl bg-green-50 border border-green-100 text-green-700 flex items-start gap-3">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />

                <p className="text-sm font-bold">{progressFeedback}</p>
              </div>
            )}

            {progressWarning && (
              <div className="mb-4 p-4 rounded-2xl bg-orange-50 border border-orange-200 text-orange-700 flex items-start gap-3">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />

                <div>
                  <p className="text-sm font-black">Avanço sem atribuição</p>

                  <p className="text-xs font-medium mt-1">{progressWarning}</p>
                </div>
              </div>
            )}

            {progressError && (
              <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 flex items-start gap-3">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />

                <p className="text-sm font-bold">{progressError}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() =>
                  handleUpdate({
                    status: "responded",
                    pipeline_stage: "responded",
                  })
                }
                disabled={
                  hasLeadResponded || isSaving || Boolean(progressEvent)
                }
                className={`p-5 rounded-3xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
                  hasLeadResponded
                    ? "bg-green-50 text-green-500 border border-green-100"
                    : "bg-slate-900 text-white hover:bg-black shadow-lg shadow-black/10"
                } disabled:cursor-not-allowed`}
              >
                {hasLeadResponded ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <MessageSquare size={16} />
                )}

                {hasLeadResponded ? "Lead respondeu" : "Marcar resposta"}
              </button>

              <button
                onClick={() => handleProgressEvent("interest")}
                disabled={interestProgressRegistered || Boolean(progressEvent)}
                className={`p-5 rounded-3xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
                  interestProgressRegistered
                    ? "bg-purple-50 text-purple-500 border border-purple-100"
                    : "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-600/20"
                } disabled:cursor-not-allowed`}
              >
                {progressEvent === "interest" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : interestProgressRegistered ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <Target size={16} />
                )}

                {interestProgressRegistered
                  ? "Interesse confirmado"
                  : "Confirmar interesse (+1)"}
              </button>

              <button
                onClick={() => handleProgressEvent("preview")}
                disabled={previewProgressRegistered || Boolean(progressEvent)}
                className={`p-5 rounded-3xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
                  previewProgressRegistered
                    ? "bg-blue-50 text-blue-500 border border-blue-100"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20"
                } disabled:cursor-not-allowed`}
              >
                {progressEvent === "preview" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : previewProgressRegistered ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <Sparkles size={16} />
                )}

                {previewProgressRegistered
                  ? "Preview enviado"
                  : "Marcar preview (+1)"}
              </button>

              <button
                onClick={() => handleProgressEvent("price")}
                disabled={priceProgressRegistered || Boolean(progressEvent)}
                className={`p-5 rounded-3xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
                  priceProgressRegistered
                    ? "bg-indigo-50 text-indigo-500 border border-indigo-100"
                    : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20"
                } disabled:cursor-not-allowed`}
              >
                {progressEvent === "price" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : priceProgressRegistered ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <Receipt size={16} />
                )}

                {priceProgressRegistered
                  ? "Preço solicitado"
                  : "Marcar pedido de preço (+1)"}
              </button>

              <button
                onClick={() => {
                  setProgressError("");
                  setShowClosingModal(true);
                }}
                disabled={closedProgressRegistered || Boolean(progressEvent)}
                className={`md:col-span-2 p-5 rounded-3xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
                  closedProgressRegistered
                    ? "bg-green-50 text-green-600 border border-green-100"
                    : "bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-500/20"
                } disabled:cursor-not-allowed`}
              >
                {progressEvent === "closed" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : closedProgressRegistered ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <DollarSign size={16} />
                )}

                {closedProgressRegistered
                  ? "Negócio fechado (+4)"
                  : "Fechar negócio (+4)"}
              </button>
            </div>

            {!currentOpportunity && (
              <p className="mt-5 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-100 rounded-2xl p-4">
                Nenhum serviço está selecionado. O avanço continuará sendo salvo
                no lead, mas não pontuará o ranking de serviços.
              </p>
            )}
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

const GuideCopyButton = ({ copied, onClick, compact = false }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-xl border font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
      compact ? "w-9 h-9 shrink-0" : "px-3 py-2 text-[9px]"
    } ${
      copied
        ? "bg-green-50 text-green-600 border-green-100"
        : "bg-white text-slate-400 border-slate-200 hover:text-purple-600 hover:border-purple-200"
    }`}
    title={copied ? "Copiado" : "Copiar conteúdo"}
  >
    {copied ? <Check size={13} /> : <Copy size={13} />}

    {!compact && (copied ? "Copiado" : "Copiar")}
  </button>
);

const InfoMiniCard = ({ label, value }) => (
  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
      {label}
    </p>
    <p className="text-sm font-bold text-slate-800 break-words">{value}</p>
  </div>
);

export default LeadDetails;
