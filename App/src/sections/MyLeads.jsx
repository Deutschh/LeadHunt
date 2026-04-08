import React, { useState } from "react";
import api from "../services/api";
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
  Plane,
  Flame,
  Handshake,
  Zap,
  ShieldCheck,
  AlertCircle,
  Ghost,
  Coffee,
  Sparkles, // Ícone da IA
} from "lucide-react";

const MyLeads = ({ leads, loading, onRefresh, onUpdateStatus, onOpenLead }) => {
  const [currentView, setCurrentView] = useState("pending");
  const [aiLoading, setAiLoading] = useState(false); // Estado para o carregamento da IA
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiConfig, setAiConfig] = useState({ limit: 10, minRating: 4.0 });

  // FUNÇÃO DA VARINHA MÁGICA (Geração em Massa)
  // Altere para receber o objeto de configuração (config)
  const handleMassAI = async (config) => {
    setAiLoading(true);
    try {
      // O 'api' já contém a URL base correta (localhost ou produção)
      const res = await api.post("/leads/generate-ai-mass", config);

      alert(res.data.message);
      onRefresh();
    } catch (err) {
      console.error("Erro na Varinha Mágica:", err);
      alert(
        "Erro ao gerar mensagens via IA. Verifique a conexão com o servidor.",
      );
    } finally {
      setAiLoading(false);
    }
  };

  // Função auxiliar para identificar se o lead deve estar no Limbo
  const checkIsLimbo = (l) => {
    if (!l.last_contact || l.interest_level > 0 || l.status !== "contacted")
      return false;
    const diasDesdeContato =
      (new Date() - new Date(l.last_contact)) / (1000 * 60 * 60 * 24);
    return diasDesdeContato > 4;
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
      (l) => l.status === "contacted" && !l.is_archived && !checkIsLimbo(l),
    ).length,
    limbo: leads.filter((l) => !l.is_archived && checkIsLimbo(l)).length,
    closed: leads.filter(
      (l) =>
        (l.status === "closed" || l.interest_level === 4) && !l.is_archived,
    ).length,
  };

  const filteredLeads = leads.filter((l) => {
    if (l.is_archived) return false;
    const isLimbo = checkIsLimbo(l);

    if (currentView === "pending")
      return l.status === "pending" && !l.is_verified;
    if (currentView === "verified")
      return l.status === "pending" && l.is_verified;
    if (currentView === "contacted")
      return l.status === "contacted" && !isLimbo;
    if (currentView === "limbo") return isLimbo;
    return false;
  });

  return (
    <div className="p-10 max-w-[1600px] mx-auto w-full animate-in fade-in duration-700">
      {/* SEÇÃO DE MÉTRICAS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
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
          label="Gestão"
          value={stats.contacted}
          icon={Flame}
          color="blue"
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

      {/* SWITCHER DE VISÃO */}
      <div className="flex bg-slate-200/50 p-1.5 rounded-[2rem] w-fit mb-10 border border-white/50 shadow-inner overflow-x-auto">
        <button
          onClick={() => setCurrentView("pending")}
          className={`px-8 py-3 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 whitespace-nowrap ${currentView === "pending" ? "bg-black text-white shadow-xl" : "text-slate-500 hover:text-black"}`}
        >
          <Users size={18} /> Prospecção
        </button>
        <button
          onClick={() => setCurrentView("verified")}
          className={`px-8 py-3 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 whitespace-nowrap ${currentView === "verified" ? "bg-[#ff8c00] text-white shadow-xl" : "text-slate-500 hover:text-black"}`}
        >
          <ShieldCheck size={18} /> Verificados
        </button>
        <button
          onClick={() => setCurrentView("contacted")}
          className={`px-8 py-3 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 whitespace-nowrap ${currentView === "contacted" ? "bg-black text-white shadow-xl" : "text-slate-500 hover:text-black"}`}
        >
          <Flame size={18} /> Funil Ativo
        </button>
        <button
          onClick={() => setCurrentView("limbo")}
          className={`px-8 py-3 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 whitespace-nowrap ${currentView === "limbo" ? "bg-slate-600 text-white shadow-xl" : "text-slate-500 hover:text-black"}`}
        >
          <Ghost size={18} /> Limbo
        </button>
      </div>

      {/* TÍTULOS DINÂMICOS */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-black">
            {currentView === "limbo"
              ? "Zona de Espera (Limbo)"
              : currentView === "contacted"
                ? "Pipeline de Vendas"
                : currentView === "pending"
                  ? "Novas Oportunidades"
                  : "Prontos para Disparo"}
          </h2>
          <p className="text-slate-400 font-medium">
            {currentView === "limbo"
              ? "Leads que não responderam nos últimos 4 dias. Tente reaquecer!"
              : "Acompanhe a temperatura das abordagens realizadas."}
          </p>
        </div>

        <div className="flex gap-3">
          {/* BOTÃO VARINHA MÁGICA (Exibido nas abas de prospecção/verificados) */}
          {(currentView === "verified" || currentView === "pending") && (
            <button
              onClick={() => setShowAiModal(true)}
              className="bg-blue-600 text-white px-6 py-4 rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg hover:bg-blue-700 transition-all"
            >
              <Sparkles size={18} /> VARINHA MÁGICA
            </button>
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

      {/* GRID DE LEADS */}
      {filteredLeads.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {filteredLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onUpdateStatus={onUpdateStatus}
              onOpenLead={onOpenLead}
              showInterestScale={
                currentView === "contacted" || currentView === "limbo"
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
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in duration-300">
            <h2 className="text-2xl font-black mb-2 flex items-center gap-2">
              <Sparkles className="text-blue-500" /> Configurar IA
            </h2>
            <p className="text-slate-400 text-sm font-medium mb-8">
              Escolha quantos leads a IA deve processar agora.
            </p>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">
                  Quantidade de Leads
                </label>
                <input
                  type="number"
                  className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  value={aiConfig.limit}
                  onChange={(e) =>
                    setAiConfig({ ...aiConfig, limit: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">
                  Avaliação Mínima (★)
                </label>
                <select
                  className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  value={aiConfig.minRating}
                  onChange={(e) =>
                    setAiConfig({ ...aiConfig, minRating: e.target.value })
                  }
                >
                  <option value="0">Qualquer nota</option>
                  <option value="3.5">Acima de 3.5</option>
                  <option value="4.0">Acima de 4.0 (Recomendado)</option>
                  <option value="4.5">Acima de 4.5 (Elite)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAiModal(false)}
                  className="flex-1 py-4 font-black text-slate-400"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    handleMassAI(aiConfig); // Passa a config para a função existente
                    setShowAiModal(false);
                  }}
                  className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-200"
                >
                  INICIAR GERAÇÃO
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* --- COMPONENTES AUXILIARES --- */

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
            <Icon size={18} className={c.text} />
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

function LeadCard({
  lead,
  onUpdateStatus,
  onOpenLead,
  showInterestScale,
  currentView,
}) {
  const cleanPhone = lead.phone?.replace(/\D/g, "");
  const displayPhone = lead.phone?.replace(/\n/g, "").trim();

  const thermalColors = [
    "bg-slate-200",
    "bg-blue-400",
    "bg-yellow-400",
    "bg-orange-500",
    "bg-red-500",
  ];
  const thermalLabels = ["Frio", "Recusado", "Morno", "Quente", "Convertido"];

  const renderStatusBadge = () => {
    if (lead.is_invalid_number) {
      return (
        <div className="bg-red-50 text-red-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-200 flex items-center gap-1 shadow-sm animate-pulse">
          <AlertCircle size={12} /> Número Inválido
        </div>
      );
    }

    // CORREÇÃO: Badge de sugestão da IA (Prioridade alta para revisão)
    // CORREÇÃO: O selo aparece se a IA gerou a mensagem, independente de estar verificado ou não
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
    // CORREÇÃO: Adicionado destaque visual (ring azul) se a IA estiver pronta
    <div
      className={`bg-white border-none p-8 rounded-[3rem] shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden ${lead.is_ai_ready && !lead.is_verified ? "ring-2 ring-blue-500/20 bg-blue-50/10" : ""}`}
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
          </div>
        </div>

        <button
          onClick={() => onOpenLead(lead.id)}
          className="absolute left-8 top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 text-white p-2 rounded-full shadow-lg"
        >
          <Target size={16} />
        </button>

        <h3
          className={`text-xl font-black mb-1 truncate pr-4 ${lead.is_invalid_number ? "text-slate-400 line-through" : "text-black"}`}
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

        {showInterestScale && (
          <div className="mb-8 p-4 bg-slate-50 rounded-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
              Interesse: {thermalLabels[lead.interest_level]}
            </p>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  onClick={() => onUpdateStatus(lead.id, lead.status, num)}
                  className={`h-3 flex-1 rounded-full transition-all ${lead.interest_level >= num ? thermalColors[num] : "bg-slate-200"}`}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={() => {
              const msg =
                currentView === "limbo"
                  ? "Olá! Gostaria de retomar nosso papo sobre o site da sua empresa?"
                  : "Olá!";
              window.open(
                `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`,
                "_blank",
              );
              if (lead.status === "pending")
                onUpdateStatus(lead.id, "contacted", 0);
            }}
            disabled={lead.is_invalid_number}
            className={`flex-[2] py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${currentView === "limbo" ? "bg-slate-800 text-white shadow-slate-800/20" : lead.is_invalid_number ? "bg-slate-100 text-slate-300 cursor-not-allowed shadow-none" : "bg-[#00b37e] text-white hover:brightness-110 shadow-[#00b37e]/20"}`}
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

          {currentView !== "contacted" && currentView !== "limbo" && (
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
