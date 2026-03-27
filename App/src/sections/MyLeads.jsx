import React, { useState } from "react";
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
  AlertCircle, // Adicionado para o selo de erro
} from "lucide-react";

const MyLeads = ({ leads, loading, onRefresh, onUpdateStatus, onOpenLead }) => {
  // Estados de visualização: pending (novos), verified (aprovados), contacted (em conversa)
  const [currentView, setCurrentView] = useState("pending");

  // Contagem inteligente para o Pipeline (Filtrando arquivados)
  const stats = {
    total: leads.filter((l) => !l.is_archived).length,
    pending: leads.filter(
      (l) => l.status === "pending" && !l.is_verified && !l.is_archived,
    ).length,
    verified: leads.filter(
      (l) => l.status === "pending" && l.is_verified && !l.is_archived,
    ).length,
    contacted: leads.filter((l) => l.status === "contacted" && !l.is_archived)
      .length,
    closed: leads.filter(
      (l) =>
        (l.status === "closed" || l.interest_level === 4) && !l.is_archived,
    ).length,
  };

  // Lógica de filtragem das listas
  const filteredLeads = leads.filter((l) => {
    if (l.is_archived) return false;

    if (currentView === "pending")
      return l.status === "pending" && !l.is_verified;
    if (currentView === "verified")
      return l.status === "pending" && l.is_verified;
    if (currentView === "contacted") return l.status === "contacted";
    return false;
  });

  return (
    <div className="p-10 max-w-[1600px] mx-auto w-full animate-in fade-in duration-700">
      {/* SEÇÃO DE MÉTRICAS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12">
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
          label="Abordados"
          value={stats.contacted}
          icon={Plane}
          color="blue"
        />
        <StatCard
          label="Fechamentos"
          value={stats.closed}
          icon={Handshake}
          color="green"
        />
      </div>

      {/* SWITCHER DE VISÃO (AS 3 ABAS) */}
      <div className="flex bg-slate-200/50 p-1.5 rounded-[2rem] w-fit mb-10 border border-white/50 shadow-inner">
        <button
          onClick={() => setCurrentView("pending")}
          className={`px-8 py-3 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 ${currentView === "pending" ? "bg-black text-white shadow-xl" : "text-slate-500 hover:text-black"}`}
        >
          <Users size={18} /> Prospecção
        </button>
        <button
          onClick={() => setCurrentView("verified")}
          className={`px-8 py-3 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 ${currentView === "verified" ? "bg-[#ff8c00] text-white shadow-xl" : "text-slate-500 hover:text-black"}`}
        >
          <ShieldCheck size={18} /> Leads Verificados
        </button>
        <button
          onClick={() => setCurrentView("contacted")}
          className={`px-8 py-3 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 ${currentView === "contacted" ? "bg-black text-white shadow-xl" : "text-slate-500 hover:text-black"}`}
        >
          <Flame size={18} /> Gestão de Funil
        </button>
      </div>

      {/* TÍTULOS DINÂMICOS */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-black">
            {currentView === "pending"
              ? "Novas Oportunidades"
              : currentView === "verified"
                ? "Prontos para Disparo"
                : "Pipeline de Vendas"}
          </h2>
          <p className="text-slate-400 font-medium">
            {currentView === "pending"
              ? "Analise e aprove esses leads para o robô entrar em ação."
              : currentView === "verified"
                ? "Estes leads estão na fila do Motor Hunter para hoje."
                : "Acompanhe a temperatura das abordagens realizadas."}
          </p>
        </div>
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

      {/* GRID DE LEADS */}
      {filteredLeads.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {filteredLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onUpdateStatus={onUpdateStatus}
              onOpenLead={onOpenLead}
              showInterestScale={currentView === "contacted"}
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

  // LÓGICA DO SELO DE STATUS NO CARD (Atualizada com Número Inválido)
  const renderStatusBadge = () => {
    // Prioridade 1: Erro de Número (Selo Vermelho Pulsante)
    if (lead.is_invalid_number) {
      return (
        <div className="bg-red-50 text-red-600 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-200 flex items-center gap-1 shadow-sm animate-pulse">
          <AlertCircle size={12} /> Número Inválido
        </div>
      );
    }
    // Prioridade 2: Automação Feita
    if (lead.status === "contacted" && lead.is_verified) {
      return (
        <div className="bg-blue-50 text-blue-500 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100 flex items-center gap-1 shadow-sm">
          <Zap size={12} fill="currentColor" /> Automação Concluída
        </div>
      );
    }
    // Prioridade 3: Aprovado para disparo
    if (lead.is_verified) {
      return (
        <div className="bg-orange-50 text-orange-500 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-orange-100 flex items-center gap-1 shadow-sm">
          <ShieldCheck size={12} /> Aprovado p/ Autom.
        </div>
      );
    }
    // Padrão: Status do Website
    return (
      <div className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-100 flex items-center gap-1">
        <Globe size={12} /> {lead.has_website ? "Com Website" : "No Website"}
      </div>
    );
  };

  return (
    <div className="bg-white border-none p-8 rounded-[3rem] shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden">
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
              window.open(`https://wa.me/${cleanPhone}?text=Olá!`, "_blank");
              if (lead.status === "pending")
                onUpdateStatus(lead.id, "contacted", 0);
            }}
            disabled={lead.is_invalid_number}
            className={`flex-[2] py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${lead.is_invalid_number ? "bg-slate-100 text-slate-300 cursor-not-allowed shadow-none" : "bg-[#00b37e] text-white hover:brightness-110 shadow-[#00b37e]/20"}`}
          >
            <Send size={18} />{" "}
            {lead.status === "contacted" ? "Reabrir Chat" : "WhatsApp"}
          </button>

          {currentView !== "contacted" && (
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
