import React, { useState, useEffect } from "react";
import api from "../services/api";
import {
  ArrowLeft,
  Send,
  Star,
  ShieldCheck,
  MessageSquare,
  Briefcase,
  History,
  TrendingUp,
  DollarSign,
  Calendar,
  Trash2,
  Edit3,
  CheckCircle2,
  Clock,
  Award,
  X,
} from "lucide-react";

const LeadDetails = ({ leadId, onBack }) => {
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState([]);

  // Estados de Edição
  const [selectedServices, setSelectedServices] = useState([]);
  const [observation, setObservation] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [interestLevel, setInterestLevel] = useState(0);

  const [showClosingModal, setShowClosingModal] = useState(false);
  const [dealData, setDealData] = useState({
    services: {},
    totalValue: 0,
    closingDate: new Date().toISOString().split("T")[0],
  });

  const templates = {
    website:
      "Notei que sua empresa ainda não tem um site oficial. Isso faz com que você perca muitos clientes que buscam no Google.",
    automation:
      "Vi que vocês têm um fluxo alto. Já pensou em colocar um sistema de atendimento automático no WhatsApp?",
    ads: "Analisei sua região e seus concorrentes estão investindo em anúncios. Podemos te colocar no topo hoje.",
    social:
      "Seu Instagram tem potencial, mas percebi que as postagens estão pouco frequentes. Vamos profissionalizar?",
  };

  useEffect(() => {
    fetchData();
  }, [leadId]);

  // Sincroniza a mensagem quando os serviços ou observação mudam
  useEffect(() => {
    if (lead) setCustomMessage(generateBaseMessage());
  }, [selectedServices, observation, lead]);

  const fetchData = async () => {
    try {
      const [leadRes, activityRes] = await Promise.all([
        api.get(`/leads/${leadId}`),
        api.get(`/leads/${leadId}/activities`),
      ]);

      const data = leadRes.data;
      setLead(data);
      setObservation(data.market_observation || "");
      setInternalNotes(data.internal_notes || "");
      setInterestLevel(data.interest_level || 0);
      setActivities(activityRes.data);

      if (data.services_offered && data.services_offered.length > 0) {
        setSelectedServices(data.services_offered);
      } else if (data.has_website === false) {
        setSelectedServices(["website"]);
      }

      setLoading(false);
    } catch (err) {
      console.error("Erro ao carregar dados", err);
    }
  };

  // --- FUNÇÃO QUE ESTAVA FALTANDO (BUG FIX) ---
  const toggleService = (serviceId) => {
    setSelectedServices((prev) =>
      prev.includes(serviceId)
        ? prev.filter((s) => s !== serviceId)
        : [...prev, serviceId],
    );
  };

  const updateServiceDeal = (serviceId, field, value) => {
    setDealData((prev) => ({
      ...prev,
      services: {
        ...prev.services,
        [serviceId]: { ...prev.services[serviceId], [field]: value },
      },
    }));
  };

  const handleFinalizeDeal = async () => {
    const total = Object.values(dealData.services).reduce(
      (acc, curr) => acc + (parseFloat(curr.price) || 0),
      0,
    );

    await handleUpdate({
      status: "closed",
      interest_level: 4,
      deal_details: { ...dealData, totalValue: total },
    });

    setShowClosingModal(false);
  };

  const generateBaseMessage = () => {
    if (!lead) return "";
    let msg = `Olá, tudo bem? Sou o Guilherme, vi a *${lead.name}* aqui no Google...\n\n`;
    if (observation) msg += `*Análise:* ${observation}\n\n`;
    selectedServices.forEach((s) => {
      msg += `${templates[s]}\n\n`;
    });
    msg += "Podemos conversar sobre como implementar isso para você?";
    return msg;
  };

  const handleUpdate = async (payload) => {
    try {
      await api.patch(`/leads/${leadId}`, payload);
      fetchData(); // Recarrega para atualizar timeline
    } catch (err) {
      alert("Erro ao atualizar.");
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Tem certeza que deseja excluir este lead?")) {
      await api.patch(`/leads/${leadId}`, { is_archived: true });
      onBack();
    }
  };

  const handleEditName = async () => {
    const newName = prompt("Digite o novo nome da empresa:", lead.name);
    if (newName && newName !== lead.name) {
      handleUpdate({ name: newName });
    }
  };

  const handleSendWhatsApp = async () => {
    await handleUpdate({
      market_observation: observation,
      internal_notes: internalNotes,
      services_offered: selectedServices,
      update_contact: true,
      status: "contacted",
    });
    window.open(
      `https://wa.me/${lead.phone}?text=${encodeURIComponent(customMessage)}`,
      "_blank",
    );
  };

  if (loading)
    return (
      <div className="p-20 text-center font-black animate-pulse text-slate-400 uppercase tracking-widest">
        Iniciando Protocolo de Inteligência...
      </div>
    );

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-700 pb-20 relative">
      {/* 1. MODAL DE FECHAMENTO (Fica "por cima" de tudo) */}
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
              {selectedServices.map((s) => (
                <div
                  key={s}
                  className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">
                      {s === "website"
                        ? "🌐"
                        : s === "automation"
                          ? "🤖"
                          : s === "ads"
                            ? "📈"
                            : "📱"}
                    </span>
                    <h4 className="font-black text-sm uppercase tracking-widest text-slate-800">
                      {s}
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-1 block">
                        Valor (R$)
                      </label>
                      <input
                        type="number"
                        placeholder="0.00"
                        className="w-full p-4 bg-white rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-green-500 outline-none font-bold"
                        value={dealData.services[s]?.price || ""}
                        onChange={(e) =>
                          updateServiceDeal(s, "price", e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-1 block">
                        Data de Entrega
                      </label>
                      <input
                        type="date"
                        className="w-full p-4 bg-white rounded-2xl border-none shadow-sm focus:ring-2 focus:ring-green-500 outline-none font-bold text-sm"
                        value={dealData.services[s]?.deadline || ""}
                        onChange={(e) =>
                          updateServiceDeal(s, "deadline", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                  Total do Contrato
                </p>
                <p className="text-3xl font-black text-slate-900 tracking-tighter">
                  R${" "}
                  {Object.values(dealData.services)
                    .reduce(
                      (acc, curr) => acc + (parseFloat(curr.price) || 0),
                      0,
                    )
                    .toLocaleString("pt-BR")}
                </p>
              </div>
              <button
                onClick={handleFinalizeDeal}
                className="bg-[#00b37e] text-white px-10 py-5 rounded-[2rem] font-black text-sm shadow-xl shadow-[#00b37e]/20 hover:scale-105 active:scale-95 transition-all"
              >
                Confirmar Fechamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. BANNER DE SUCESSO (Aparece apenas se status for closed) */}
      {lead.status === "closed" && (
        <div className="mb-10 bg-green-500 text-white p-6 rounded-[2.5rem] flex items-center justify-between shadow-xl shadow-green-500/20 border border-green-400 animate-in slide-in-from-top duration-500">
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
              R$ {dealData.totalValue?.toLocaleString("pt-BR")}
            </p>
          </div>
        </div>
      )}

      {/* 3. HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-3 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all text-slate-400 hover:text-black"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-black tracking-tighter text-slate-900">
                {lead.name}
              </h1>
              <button
                onClick={handleEditName}
                className="text-slate-300 hover:text-blue-500 transition-colors p-1"
              >
                <Edit3 size={16} />
              </button>
            </div>
            <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">
              {lead.niche} • {lead.neighborhood}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDelete}
            className="p-3 text-red-400 hover:bg-red-50 rounded-2xl transition-all"
          >
            <Trash2 size={20} />
          </button>
          <div className="h-10 w-[1px] bg-slate-200 mx-2"></div>
          <div className="flex bg-slate-100 p-1 rounded-2xl">
            {["pending", "contacted", "closed"].map((st) => (
              <button
                key={st}
                onClick={() =>
                  st === "closed"
                    ? setShowClosingModal(true)
                    : handleUpdate({ status: st })
                }
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${lead.status === st ? "bg-white shadow-sm text-blue-600" : "text-slate-400"}`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* COLUNA ESQUERDA (Atividades e Notas) */}
        <div className="lg:col-span-8 space-y-8">
          {/* SEÇÃO DE CONTRATO FECHADO (Resumo do Deal) */}
          {lead.status === "closed" && lead.deal_details?.services && (
            <div className="bg-white p-8 rounded-[2.5rem] border-2 border-green-100 shadow-sm mb-8 animate-in zoom-in duration-500">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-green-600 flex items-center gap-2">
                  <Award size={18} /> Detalhes do Contrato Fechado
                </h3>
                <button
                  onClick={() => setShowClosingModal(true)}
                  className="text-[10px] font-black uppercase text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Edit3 size={12} /> Editar Valores/Prazos
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(lead.deal_details.services).map(
                  ([service, details]) => (
                    <div
                      key={service}
                      className="bg-green-50/50 p-4 rounded-2xl border border-green-100"
                    >
                      <p className="text-[10px] font-black text-green-700 uppercase mb-1">
                        {service}
                      </p>
                      <p className="text-lg font-black text-slate-900">
                        R$ {parseFloat(details.price).toLocaleString("pt-BR")}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-1 flex items-center gap-1">
                        <Calendar size={10} />{" "}
                        {details.deadline
                          ? new Date(details.deadline).toLocaleDateString(
                              "pt-BR",
                            )
                          : "Sem data"}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
          {/* TERMÔMETRO */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <TrendingUp size={16} className="text-orange-500" /> Temperatura
                do Lead
              </h3>
              <span
                className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${["bg-slate-100", "bg-blue-100 text-blue-600", "bg-yellow-100 text-yellow-600", "bg-orange-100 text-orange-600", "bg-green-100 text-green-600"][interestLevel]}`}
              >
                {
                  ["Frio", "Recusado", "Morno", "Quente", "Convertido"][
                    interestLevel
                  ]
                }
              </span>
            </div>
            <div className="flex gap-3">
              {[0, 1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  onClick={() => handleUpdate({ interest_level: num })}
                  className={`h-4 flex-1 rounded-full transition-all duration-500 ${interestLevel >= num ? ["bg-slate-200", "bg-blue-400", "bg-yellow-400", "bg-orange-500", "bg-green-500"][num] : "bg-slate-50"}`}
                />
              ))}
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
                placeholder="Link quebrado no Instagram, falta de site..."
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
                placeholder="Dono prefere falar à tarde..."
              />
            </div>
          </div>

          {/* TIMELINE */}
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

        {/* COLUNA DIREITA (Mensagem e Serviços) */}
        <div className="lg:col-span-4 space-y-6">
          {/* ROI / INVESTIMENTO */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2">
              <DollarSign size={16} className="text-green-500" /> CAC (Custo de
              Aquisição)
            </h3>
            <div className="flex items-center bg-slate-50 p-4 rounded-2xl">
              <span className="text-slate-400 font-black mr-2">R$</span>
              <input
                type="number"
                className="bg-transparent border-none outline-none font-bold text-slate-900 w-full"
                value={lead.acquisition_cost || ""}
                onChange={(e) =>
                  handleUpdate({ acquisition_cost: e.target.value })
                }
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "website", icon: "🌐", label: "Site" },
                { id: "automation", icon: "🤖", label: "Whats" },
                { id: "ads", icon: "📈", label: "Ads" },
                { id: "social", icon: "📱", label: "Social" },
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleService(s.id)}
                  className={`flex flex-col items-center p-4 rounded-2xl border-2 transition-all ${selectedServices.includes(s.id) ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-50 bg-slate-50 text-slate-300"}`}
                >
                  <span className="text-2xl mb-1">{s.icon}</span>
                  <span className="text-[9px] font-black uppercase tracking-tighter">
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-[10px] uppercase tracking-[0.3em] text-blue-400">
                Abordagem
              </h3>
              <button
                onClick={() => setCustomMessage(generateBaseMessage())}
                className="text-[9px] font-black uppercase text-slate-500 underline"
              >
                Resetar
              </button>
            </div>
            <textarea
              className="w-full bg-white/5 p-5 rounded-2xl border border-white/10 h-64 outline-none focus:border-blue-500 transition-all text-sm leading-relaxed italic opacity-90 resize-none scrollbar-hide"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
            />
            <button
              onClick={handleSendWhatsApp}
              className="w-full mt-6 bg-[#00b37e] hover:bg-[#00c98d] py-5 rounded-2xl font-black transition-all flex items-center justify-center gap-3 shadow-xl shadow-[#00b37e]/20"
            >
              <Send size={18} /> Disparar WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadDetails;
