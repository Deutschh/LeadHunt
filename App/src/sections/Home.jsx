import React, { useState, useEffect } from "react";
import api from "../services/api";
import {
  Target,
  TrendingUp,
  Clock,
  DollarSign,
  MapPin,
  ArrowUpRight,
  Trophy,
  Plus,
  StickyNote,
  X,
  Calendar as CalendarIcon,
  Trash2,
  Layout,
  ChevronRight,
} from "lucide-react";

const Home = () => {
  const [leads, setLeads] = useState([]);
  const [notes, setNotes] = useState([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [newNote, setNewNote] = useState({
    title: "",
    content: "",
    expires_at: "",
  });

  const [stats, setStats] = useState({
    capturedToday: 0,
    totalRevenue: 0,
    pendingFollowups: 0,
    conversionRate: 0,
    topNeighborhood: "Analisando...",
  });

  const MONTHLY_GOAL = 10000;

  const fetchNotes = async () => {
    try {
      const { data } = await api.get("/leads/notes/active");
      setNotes(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateNote = async (e) => {
    e.preventDefault();
    try {
      await api.post("/leads/notes", newNote);
      setNewNote({ title: "", content: "", expires_at: "" });
      setShowNoteModal(false);
      fetchNotes();
    } catch {
      alert("Erro ao salvar nota.");
    }
  };

  const deleteNote = async (id) => {
    try {
      await api.delete(`/leads/notes/${id}`);
      fetchNotes();
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const { data } = await api.get("/leads");
      setLeads(data);
      const today = new Date().toISOString().split("T")[0];
      const capturedToday = data.filter((l) =>
        l.created_at.startsWith(today),
      ).length;
      const closedLeads = data.filter((l) => l.status === "closed");
      const totalRevenue = closedLeads.reduce((acc, lead) => {
        return acc + (parseFloat(lead.sale_value) || 0);
      }, 0);
      const neighborhoods = data.map((l) => l.neighborhood).filter(Boolean);
      const topNb = neighborhoods
        .sort(
          (a, b) =>
            neighborhoods.filter((v) => v === a).length -
            neighborhoods.filter((v) => v === b).length,
        )
        .pop();

      setStats({
        capturedToday,
        totalRevenue,
        pendingFollowups: data.filter((l) => l.status === "contacted").length,
        conversionRate:
          data.length > 0
            ? ((closedLeads.length / data.length) * 100).toFixed(1)
            : 0,
        topNeighborhood: topNb || "Geral",
      });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      fetchDashboardData();
      fetchNotes();
    }, 0);

    return () => window.clearTimeout(initialFetch);
  }, []);

  return (
    <div className="p-10 max-w-[1600px] mx-auto animate-in fade-in duration-700 pb-20 relative text-slate-900">
      {/* 1. MODAL DE NOTAS */}
      {showNoteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl p-10 border border-white/20 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-black tracking-tight">
                Nova Anotação
              </h2>
              <button
                onClick={() => setShowNoteModal(false)}
                className="text-slate-400 hover:text-slate-900 transition-colors"
              >
                <X />
              </button>
            </div>
            <form onSubmit={handleCreateNote} className="space-y-6">
              <input
                className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold"
                placeholder="Assunto"
                value={newNote.title}
                onChange={(e) =>
                  setNewNote({ ...newNote, title: e.target.value })
                }
                required
              />
              <textarea
                className="w-full p-4 bg-slate-50 rounded-2xl outline-none min-h-[120px] resize-none"
                placeholder="Mensagem..."
                value={newNote.content}
                onChange={(e) =>
                  setNewNote({ ...newNote, content: e.target.value })
                }
              />
              <input
                type="date"
                className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold"
                value={newNote.expires_at}
                onChange={(e) =>
                  setNewNote({ ...newNote, expires_at: e.target.value })
                }
              />
              <button
                type="submit"
                className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black shadow-xl"
              >
                Salvar Nota
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. HEADER E BARRA DE META */}
      <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 mb-2">
            Dashboard Operacional
          </p>
          <h1 className="text-5xl font-black tracking-tighter">Visão Geral</h1>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button
            onClick={() => setShowNoteModal(true)}
            className="p-5 bg-white rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md transition-all text-blue-600 active:scale-90"
          >
            <Plus size={24} />
          </button>
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex-1 md:w-80">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-black uppercase text-slate-400">
                Meta Mensal
              </span>
              <span className="text-[10px] font-black text-blue-600">
                {((stats.totalRevenue / MONTHLY_GOAL) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-1000 shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                style={{
                  width: `${Math.min((stats.totalRevenue / MONTHLY_GOAL) * 100, 100)}%`,
                }}
              ></div>
            </div>
          </div>
        </div>
      </header>

      {/* 3. CONTAINERS SUPERIORES REFORMULADOS (GRID 2 COLUNAS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        {/* CARD FINANCEIRO (FATURAMENTO) */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex items-center justify-between relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-700 text-green-600">
            <DollarSign size={200} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-green-50 rounded-2xl text-green-600">
                <DollarSign size={24} />
              </div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                Faturamento Real
              </p>
            </div>
            <h2 className="text-5xl font-black tracking-tighter mb-2">
              R$ {stats.totalRevenue.toLocaleString("pt-BR")}
            </h2>
            <p className="text-xs font-bold text-slate-400 italic">
              Total acumulado em contratos fechados
            </p>
          </div>
          <div className="text-right relative z-10">
            <div className="flex items-center gap-1 text-green-600 font-black text-xs uppercase mb-1">
              <TrendingUp size={16} /> ROI Estável
            </div>
            <p className="text-[10px] font-bold text-slate-300 uppercase">
              Custo CAC: R$ 0,00
            </p>
          </div>
        </div>

        {/* POWER CARD: PERFORMANCE DO FUNIL (DADOS JUNTO COM CONVERSÃO) */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm grid grid-cols-2 gap-8 relative overflow-hidden group">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                <Target size={24} />
              </div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                Funil & Conversão
              </p>
            </div>
            <h2 className="text-5xl font-black tracking-tighter text-blue-600">
              {stats.conversionRate}%
            </h2>
            <p className="text-[10px] font-black text-slate-300 uppercase mt-2">
              Taxa de Eficiência
            </p>
          </div>

          <div className="flex flex-col justify-center space-y-6 border-l border-slate-100 pl-8">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-orange-50 rounded-xl text-orange-600">
                <MapPin size={18} />
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase">
                  Top Bairro
                </p>
                <p className="text-sm font-black text-slate-800">
                  {stats.topNeighborhood}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                <TrendingUp size={18} />
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase">
                  Hoje
                </p>
                <p className="text-sm font-black text-slate-800">
                  +{stats.capturedToday} Leads
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-12 space-y-6">
          {/* LISTA DE WINS (TROFÉU) - REESTABELECIDA */}
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
              <Trophy size={16} className="text-yellow-500" /> Últimos
              Fechamentos
            </h3>
            <div className="space-y-4">
              {leads
                .filter((l) => l.status === "closed")
                .slice(0, 3)
                .map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl group hover:bg-green-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-xs font-black shadow-sm group-hover:text-green-600">
                        {l.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800">
                          {l.name}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">
                          {l.niche}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-green-600">
                        R$ {Number(l.sale_value || 0).toLocaleString("pt-BR")}
                      </p>
                      <p className="text-[8px] font-black text-slate-300 uppercase">
                        MRR: R${" "}
                        {Number(
                          l.deal_details?.monthlyRecurringValue || 0,
                        ).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                ))}
              {leads.filter((l) => l.status === "closed").length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-4">
                  Buscando o primeiro troféu...
                </p>
              )}
            </div>
          </div>

          {/* CARD DE ANOTAÇÕES */}
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 max-h-[350px] overflow-hidden flex flex-col">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
              <StickyNote size={16} className="text-blue-500" /> Notas do QG
            </h3>
            <div className="space-y-4 overflow-y-auto scrollbar-hide flex-1">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 group relative transition-all hover:bg-slate-100"
                >
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-red-400 transition-all p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                  <p className="text-xs font-black text-slate-800 mb-1">
                    {note.title}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    {note.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
