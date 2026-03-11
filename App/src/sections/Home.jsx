import React from "react";
import { RefreshCw, Globe, Send, CheckCircle } from "lucide-react";

const Home = ({ leads, loading, onRefresh, onUpdateStatus }) => {
  return (
    <div className="p-10 max-w-[1600px] mx-auto w-full animate-in fade-in duration-500">
      {/* SEÇÃO DE MÉTRICAS (STAT CARDS) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <StatCard label="Leads Totais" value={leads.length} />
        <StatCard
          label="Sem Website"
          value={leads.filter((l) => !l.has_website).length}
          isAlert
        />
        <StatCard
          label="Aguardando Contato"
          value={leads.filter((l) => l.status === "pending").length}
          isSuccess
        />
      </div>

      {/* CABEÇALHO DA LISTAGEM */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-black">
            Leads Recentes
          </h2>
          <p className="text-slate-400 font-medium">
            Gerencie as oportunidades mineradas pelo robô.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 hover:bg-slate-50 transition-all active:scale-95"
          title="Atualizar lista"
        >
          <RefreshCw
            size={20}
            className={`${loading ? "animate-spin" : ""} text-slate-600`}
          />
        </button>
      </div>

      {/* GRID DE LEADS */}
      {leads.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onUpdateStatus={onUpdateStatus}/>
          ))}
        </div>
      ) : (
        <div className="bg-white/50 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center">
          <p className="text-slate-400 font-bold">
            Nenhum lead encontrado ainda. Vá para "Busca Inteligente" para
            começar!
          </p>
        </div>
      )}
    </div>
  );
};

/* --- SUB-COMPONENTE: STAT CARD --- */
function StatCard({ label, value, isAlert = false, isSuccess = false }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm p-8 rounded-[2.5rem] border border-white shadow-sm hover:shadow-md transition-shadow">
      <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-3">
        {label}
      </p>
      <p
        className={`text-5xl font-black tracking-tighter ${isAlert ? "text-red-500" : isSuccess ? "text-[#00b37e]" : "text-black"}`}
      >
        {value}
      </p>
    </div>
  );
}

/* --- SUB-COMPONENTE: LEAD CARD --- */
function LeadCard({ lead, onUpdateStatus }) {
  const cleanPhone = lead.phone.replace(/\D/g, "");
  const displayPhone = lead.phone.replace(/\n/g, "").trim();

  // Verifica se o lead já foi contactado para mudar o estilo
  const isContacted = lead.status === "contacted";

  return (
    <div
      className={`bg-white border-none p-8 rounded-[3rem] shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden ${isContacted ? "opacity-75" : ""}`}
    >
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-slate-50 rounded-full group-hover:scale-[3] transition-transform duration-700 opacity-50"></div>

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-8">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg transition-transform group-hover:rotate-3 ${isContacted ? "bg-slate-200 text-slate-400" : "bg-black text-white"}`}
          >
            {lead.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col gap-2 items-end">
            <div className="bg-red-50 text-red-500 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-100 flex items-center gap-1">
              <Globe size={12} /> No Website
            </div>
            {isContacted && (
              <div className="bg-[#00b37e]/10 text-[#00b37e] px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider">
                Contactado
              </div>
            )}
          </div>
        </div>

        <h3
          className={`text-xl font-black mb-2 truncate pr-4 ${isContacted ? "text-slate-400 line-through" : "text-black"}`}
        >
          {lead.name}
        </h3>
        <p className="text-slate-400 font-medium text-sm mb-8">
          {displayPhone}
        </p>

        <div className="flex gap-4">
          <button
            onClick={() => {
              window.open(`https://wa.me/${cleanPhone}?text=Olá!`, "_blank");
              if (!isContacted) onUpdateStatus(lead.id, "contacted");
            }}
            className={`flex-[2] py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${isContacted ? "bg-slate-100 text-slate-400 shadow-none" : "bg-[#00b37e] text-white shadow-[#00b37e]/20 hover:brightness-110 active:scale-95"}`}
          >
            <Send size={18} /> {isContacted ? "Reenviar" : "WhatsApp"}
          </button>

          <button
            onClick={() =>
              onUpdateStatus(lead.id, isContacted ? "pending" : "contacted")
            }
            className={`flex-1 py-4 rounded-2xl transition-all flex items-center justify-center active:scale-95 ${isContacted ? "bg-black text-white shadow-lg" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
          >
            <CheckCircle size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Home;
