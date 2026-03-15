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
} from "lucide-react";

const Home = ({ leads, loading, onRefresh, onUpdateStatus, onOpenLead }) => {
  const [currentView, setCurrentView] = useState("pending");

  // Contagem inteligente para o Pipeline
  const stats = {
    total: leads.length,
    pending: leads.filter((l) => l.status === "pending").length,
    contacted: leads.filter(
      (l) => l.status === "contacted" && l.interest_level <= 1,
    ).length,
    negotiating: leads.filter(
      (l) => l.interest_level >= 2 && l.interest_level <= 3,
    ).length,
    closed: leads.filter((l) => l.interest_level === 4).length,
  };

  const filteredLeads = leads.filter((l) => l.status === currentView);

  return (
    <div className="p-10 max-w-[1600px] mx-auto w-full animate-in fade-in duration-500">
      {/* SEÇÃO DE MÉTRICAS (STAT CARDS) PREMIUM */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12">
        <StatCard
          label="Scanner Total"
          value={stats.total}
          icon={Target}
          color="slate"
        />
        <StatCard
          label="Novos Leads"
          value={stats.pending}
          icon={Users}
          color="red"
          pulse={stats.pending > 0}
        />
        <StatCard
          label="Abordados"
          value={stats.contacted}
          icon={Plane}
          color="blue"
        />
        <StatCard
          label="Em Negociação"
          value={stats.negotiating}
          icon={Flame}
          color="orange"
        />
        <StatCard
          label="Fechamentos"
          value={stats.closed}
          icon={Handshake}
          color="green"
        />
      </div>

      {/* ... Restante do código (Switcher e Grid) permanece igual ... */}

      {/* SWITCHER DE VISÃO (CRM TABS) */}
      <div className="flex bg-slate-200/50 p-1.5 rounded-[2rem] w-fit mb-10 border border-white/50">
        <button
          onClick={() => setCurrentView("pending")}
          className={`px-8 py-3 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 ${currentView === "pending" ? "bg-black text-white shadow-xl" : "text-slate-500 hover:text-black"}`}
        >
          <Users size={18} /> Prospecção
        </button>
        <button
          onClick={() => setCurrentView("contacted")}
          className={`px-8 py-3 rounded-[1.5rem] font-black text-sm transition-all flex items-center gap-2 ${currentView === "contacted" ? "bg-black text-white shadow-xl" : "text-slate-500 hover:text-black"}`}
        >
          <Flame size={18} /> Gestão de Funil
        </button>
      </div>

      {/* LISTAGEM */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-black">
            {currentView === "pending"
              ? "Novas Oportunidades"
              : "Pipeline de Vendas"}
          </h2>
          <p className="text-slate-400 font-medium">
            {currentView === "pending"
              ? "Leads prontos para o primeiro contato."
              : "Acompanhe a temperatura das suas negociações."}
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

      {filteredLeads.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {filteredLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onUpdateStatus={onUpdateStatus}
              onOpenLead={onOpenLead}
              showInterestScale={currentView === "contacted"}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white/50 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center">
          <p className="text-slate-400 font-bold italic">
            {currentView === "pending"
              ? "Tudo limpo! Nenhuma pendência por aqui."
              : "Nenhum contato em negociação no momento."}
          </p>
        </div>
      )}
    </div>
  );
};

/* --- COMPONENTES AUXILIARES --- */

function StatCard({ label, value, icon: Icon, color, pulse = false }) {
  // Mapeamento de Cores Premium (Tailwind)
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

  const c = colors[color] || colors.slate; // Fallback para slate

  return (
    <div
      className={`bg-white p-6 rounded-[2.5rem] border ${c.border} shadow-sm relative overflow-hidden group`}
    >
      {/* Detalhe de fundo decorativo e sutil */}
      <div
        className={`absolute -right-4 -bottom-4 w-16 h-16 ${c.bg} rounded-full opacity-50 group-hover:scale-150 transition-transform duration-500`}
      ></div>

      <div className="relative z-10 flex flex-col gap-4">
        {/* Topo com Ícone e Label */}
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

        {/* Número Grande */}
        <p className={`text-4xl font-black tracking-tighter ${c.number}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function LeadCard({ lead, onUpdateStatus, onOpenLead, showInterestScale }) {
  const rawPhone = lead.phone || "";
  const cleanPhone = lead.phone?.replace(/\D/g, "");
  const displayPhone = lead.phone?.replace(/\n/g, "").trim();

  // Mapeamento de cores da Escala Térmica
  const thermalColors = [
    "bg-slate-200",
    "bg-blue-400",
    "bg-yellow-400",
    "bg-orange-500",
    "bg-red-500",
  ];
  const thermalLabels = ["Frio", "Recusado", "Morno", "Quente", "Convertido"];

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
            <div className="bg-red-50 text-red-500 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-100 flex items-center gap-1">
              <Globe size={12} /> No Website
            </div>
          </div>
        </div>

                <button 
         onClick={() => onOpenLead(lead.id)}
         className="absolute left-8 top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 text-white p-2 rounded-full shadow-lg"
       >
         <Target size={16} />
       </button>

        <h3 className="text-xl font-black mb-1 truncate pr-4 text-black">
          {lead.name}
        </h3>

        {/* EXIBIÇÃO DO TELEFONE NO CARD */}
        <p className="text-slate-500 font-bold text-sm mb-4">
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

        {/* ESCALA TÉRMICA (Apenas na aba Gestão) */}
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
            className="flex-[2] bg-[#00b37e] text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-[#00b37e]/20"
          >
            <Send size={18} />{" "}
            {lead.status === "contacted" ? "Reenviar" : "WhatsApp"}
          </button>

          {!showInterestScale && (
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

export default Home;
