import React, { useState, useEffect } from "react";
import api from "../services/api";
import {
  ArrowLeft,
  Send,
  Star,
  ShieldCheck,
  MessageSquare,
  Briefcase,
} from "lucide-react";

const LeadDetails = ({ leadId, onBack }) => {
  const id = leadId;
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedServices, setSelectedServices] = useState([]);
  const [observation, setObservation] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const templates = {
    website:
      "Notei que sua empresa ainda não tem um site oficial. Isso faz com que você perca muitos clientes que buscam pelo seu serviço no Google.",
    automation:
      "Vi que vocês têm um fluxo alto de clientes. Já pensou em colocar um sistema de atendimento automático no WhatsApp para não deixar ninguém esperando?",
    ads: "Analisei sua região e vi que seus concorrentes estão investindo em anúncios. Podemos colocar sua empresa no topo das buscas hoje mesmo.",
    social:
      "Seu Instagram tem um potencial enorme, mas percebi que as postagens estão pouco frequentes. Podemos profissionalizar sua vitrine digital.",
  };

  useEffect(() => {
    const fetchLead = async () => {
      if (!id) return;
      try {
        const response = await api.get(`/leads/${id}`);
        setLead(response.data);
        setObservation(response.data.market_observation || "");
        setInternalNotes(response.data.internal_notes || "");
        setSelectedServices(response.data.services_offered || []);
        setLoading(false);
      } catch (err) {
        console.error("Erro ao carregar lead", err);
      }
    };
    fetchLead();
  }, [id]);

  const toggleService = (service) => {
    setSelectedServices((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service],
    );
  };

  const generateMessage = () => {
    if (!lead) return "";
    let msg = `Olá, tudo bem? Sou o Guilherme, vi a *${lead.name}* aqui no Google...\n\n`;
    if (observation) msg += `*Análise:* ${observation}\n\n`;
    selectedServices.forEach((s) => {
      msg += `${templates[s]}\n\n`;
    });
    msg += "Podemos conversar sobre como implementar isso para você?";
    return msg;
  };

  const handleSaveAndSend = async () => {
    try {
      await api.patch(`/leads/${id}`, {
        market_observation: observation,
        internal_notes: internalNotes,
        services_offered: selectedServices,
        update_contact: true,
        status: "contacted",
      });
      const finalMsg = encodeURIComponent(generateMessage());
      window.open(`https://wa.me/${lead.phone}?text=${finalMsg}`, "_blank");
    } catch (err) {
      alert("Erro ao salvar dados do lead.");
    }
  };

  if (loading)
    return (
      <div className="h-full flex items-center justify-center text-slate-400 font-bold animate-pulse">
        Buscando inteligência do lead...
      </div>
    );

  return (
    <div className="p-8 max-w-[1400px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* HEADER / NAVIGATION */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onBack}
          className="group flex items-center gap-2 text-slate-500 hover:text-black transition-all font-bold text-sm"
        >
          <div className="p-2 bg-white rounded-xl shadow-sm group-hover:shadow-md transition-all">
            <ArrowLeft size={18} />
          </div>
          Voltar para a lista
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">
            Status do Lead:
          </span>
          <div className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-xs font-black shadow-lg shadow-blue-200 uppercase tracking-widest">
            {lead.status}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: DATA & NOTES (8 Cols) */}
        <div className="lg:col-span-8 space-y-8">
          {/* Business identity Card */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Briefcase size={120} />
            </div>
            <div className="relative z-10">
              <h1 className="text-4xl font-black text-black tracking-tighter mb-2">
                {lead.name}
              </h1>
              <div className="flex flex-wrap gap-4 items-center text-slate-400 font-bold text-sm">
                <span className="flex items-center gap-1.5">
                  <Star size={16} className="text-yellow-400 fill-yellow-400" />{" "}
                  {lead.rating} de avaliação
                </span>
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <span>{lead.niche}</span>
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <span>{lead.neighborhood}</span>
              </div>
            </div>
          </div>

          {/* Text Areas Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <h3 className="flex items-center gap-2 font-black text-xs uppercase tracking-[0.2em] text-slate-400 mb-4">
                <ShieldCheck size={16} className="text-blue-500" /> Quebra-Gelo
                (Público)
              </h3>
              <textarea
                className="w-full p-4 border-none bg-slate-50 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium min-h-[150px] resize-none"
                placeholder="Notei que o link do seu Instagram está quebrado..."
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
              />
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
              <h3 className="flex items-center gap-2 font-black text-xs uppercase tracking-[0.2em] text-slate-400 mb-4">
                <MessageSquare size={16} className="text-slate-400" /> Notas
                Internas (Privado)
              </h3>
              <textarea
                className="w-full p-4 border-none bg-slate-50 rounded-2xl focus:ring-2 focus:ring-slate-300 outline-none text-sm font-medium min-h-[150px] resize-none italic"
                placeholder="O dono é gente boa, mas só decide com o sócio..."
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIONS (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Service Selector */}
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 mb-6 text-center">
              Serviços Sugeridos
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { id: "website", icon: "🌐", label: "Site" },
                { id: "automation", icon: "🤖", label: "Whats" },
                { id: "ads", icon: "📈", label: "Ads" },
                { id: "social", icon: "📱", label: "Social" },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleService(s.id)}
                  className={`flex flex-col items-center justify-center p-5 rounded-3xl border-2 transition-all duration-300 ${
                    selectedServices.includes(s.id)
                      ? "border-blue-600 bg-blue-50 text-blue-600 scale-95 shadow-inner"
                      : "border-slate-50 bg-slate-50 text-slate-300 hover:border-slate-200"
                  }`}
                >
                  <span className="text-3xl mb-2">{s.icon}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Message Preview & Action */}
          <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500 rounded-full opacity-10 group-hover:scale-150 transition-transform duration-700"></div>

            <h3 className="font-black text-[10px] uppercase tracking-[0.3em] text-blue-400 mb-6 relative z-10">
              Preview da Abordagem
            </h3>

            <div className="bg-white/5 p-5 rounded-2xl border border-white/10 h-64 overflow-y-auto mb-8 relative z-10 scrollbar-hide font-medium text-sm leading-relaxed italic opacity-80">
              {generateMessage()}
            </div>

            <button
              onClick={handleSaveAndSend}
              className="w-full bg-[#00b37e] hover:bg-[#00c98d] text-white font-black py-5 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-[#00b37e]/20 active:scale-95 relative z-10"
            >
              <Send size={20} />
              <span>Disparar WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadDetails;
