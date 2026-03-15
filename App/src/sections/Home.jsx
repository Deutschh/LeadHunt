import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import api from "../services/api";
import {
  Terminal,
  Zap,
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
} from "lucide-react";

const Home = () => {
  const [logs, setLogs] = useState([]);
  const [leads, setLeads] = useState([]);
  const [notes, setNotes] = useState([]);

  // Estados para o Modal de Notas
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

  const terminalEndRef = useRef(null);
  const MONTHLY_GOAL = 10000;

  useEffect(() => {
    fetchDashboardData();
    fetchNotes();

    const socket = io("http://localhost:3001");
    socket.on("scraper-log", (newLog) => {
      setLogs((prev) => [...prev, newLog].slice(-50));
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // --- FUNÇÕES DE DADOS ---

  const fetchNotes = async () => {
    try {
      // Usamos o prefixo /api/leads definido no App.jsx + a rota do leads.js
      const { data } = await api.get("/leads/notes/active");
      setNotes(data);
    } catch (err) {
      console.error("Erro ao buscar notas", err);
    }
  };

  const handleCreateNote = async (e) => {
    e.preventDefault();
    try {
      await api.post("/leads/notes", newNote);
      setNewNote({ title: "", content: "", expires_at: "" });
      setShowNoteModal(false);
      fetchNotes();
    } catch (err) {
      alert("Erro ao salvar nota no banco.");
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
      const totalRevenue = closedLeads.reduce(
        (acc, lead) => acc + (parseFloat(lead.deal_details?.totalValue) || 0),
        0,
      );

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

  return (
    <div className="p-10 max-w-[1600px] mx-auto animate-in fade-in duration-700 pb-20 relative">
      {/* 1. MODAL DE ANOTAÇÕES (GLASSMORPISM) */}
      {showNoteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl p-10 border border-white/20 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-200">
                  <Plus size={20} />
                </div>
                <h2 className="text-xl font-black tracking-tight text-slate-900">
                  Nova Anotação
                </h2>
              </div>
              <button
                onClick={() => setShowNoteModal(false)}
                className="text-slate-400 hover:text-slate-900 transition-colors"
              >
                <X />
              </button>
            </div>

            <form onSubmit={handleCreateNote} className="space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 px-2 mb-2 block">
                  Assunto
                </label>
                <input
                  className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 transition-all border-none"
                  placeholder="Ex: Estratégia Zona Leste"
                  value={newNote.title}
                  onChange={(e) =>
                    setNewNote({ ...newNote, title: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 px-2 mb-2 block">
                  Mensagem
                </label>
                <textarea
                  className="w-full p-4 bg-slate-50 rounded-2xl outline-none min-h-[120px] resize-none text-slate-600 font-medium border-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Digite aqui sua ideia ou lembrete..."
                  value={newNote.content}
                  onChange={(e) =>
                    setNewNote({ ...newNote, content: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 px-2 mb-2 block">
                  Exibir até:
                </label>
                <input
                  type="date"
                  className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-slate-800 border-none"
                  value={newNote.expires_at}
                  onChange={(e) =>
                    setNewNote({ ...newNote, expires_at: e.target.value })
                  }
                />
              </div>
              <button
                type="submit"
                className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black shadow-xl shadow-slate-200 transition-all hover:scale-[1.02] active:scale-95"
              >
                Salvar no Banco de Dados
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. HEADER E META */}
      <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 mb-2">
            Dashboard Operacional
          </p>
          <h1 className="text-5xl font-black tracking-tighter text-slate-900">
            Visão Geral
          </h1>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          {/* BOTÃO DE NOTAS REFORMULADO */}
          <button
            onClick={() => setShowNoteModal(true)}
            className="p-5 bg-white rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md transition-all text-blue-600 active:scale-90 flex items-center justify-center group"
            title="Criar anotação"
          >
            <Plus
              size={24}
              className="group-hover:rotate-90 transition-transform duration-300"
            />
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

      {/* 3. GRID DE CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard
          icon={<DollarSign size={20} className="text-green-600" />}
          label="Faturamento Real"
          value={`R$ ${stats.totalRevenue.toLocaleString("pt-BR")}`}
          desc="Acumulado fechado"
          trend="+ R$ 0,00 lucro/CAC"
        />
        <StatCard
          icon={<Target size={20} className="text-blue-600" />}
          label="Conversão"
          value={`${stats.conversionRate}%`}
          desc="Leads para Contratos"
        />
        <StatCard
          icon={<MapPin size={20} className="text-orange-600" />}
          label="Foco Geográfico"
          value={stats.topNeighborhood}
          desc="Bairro com mais leads"
        />
        <StatCard
          icon={<TrendingUp size={20} className="text-indigo-600" />}
          label="Captados Hoje"
          value={stats.capturedToday}
          desc="Leads minerados"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 4. TERMINAL (RESTAURADO E TURBINADO) */}
        <div className="lg:col-span-8">
          <div className="bg-[#0B0F17] rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden flex flex-col h-[520px]">
            <div className="bg-[#161B26] px-6 py-4 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5 mr-4">
                  <div className="w-3 h-3 bg-[#FF5F56] rounded-full shadow-lg shadow-red-500/20"></div>
                  <div className="w-3 h-3 bg-[#FFBD2E] rounded-full shadow-lg shadow-yellow-500/20"></div>
                  <div className="w-3 h-3 bg-[#27C93F] rounded-full shadow-lg shadow-green-500/20"></div>
                </div>
                <div className="flex items-center gap-2 text-slate-500 font-mono text-[10px] font-bold uppercase tracking-widest">
                  <Terminal size={12} />
                  <span>Hunter_Shell_v3.0</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_#3b82f6]"></div>
                <span className="text-[9px] font-black text-blue-500 uppercase tracking-tighter">
                  Socket Online
                </span>
              </div>
            </div>

            <div className="flex-1 p-8 overflow-y-auto font-mono text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-white/10">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-700 opacity-50 space-y-4">
                  <Zap size={40} strokeWidth={1} className="animate-pulse" />
                  <p className="uppercase tracking-[0.3em]">
                    Aguardando conexão com o robô...
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log, i) => (
                    <div
                      key={i}
                      className={`flex gap-4 p-2 rounded transition-colors ${log.type === "success" ? "text-emerald-400 bg-emerald-500/5" : "text-slate-400"}`}
                    >
                      <span className="opacity-30">
                        [{new Date().toLocaleTimeString()}]
                      </span>
                      <span className="font-bold">{log.message}</span>
                    </div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 5. COLUNA DIREITA: NOTAS E TAREFAS */}
        <div className="lg:col-span-4 space-y-6">
          {/* CARD DE ANOTAÇÕES DINÂMICO */}
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 max-h-[480px] overflow-hidden flex flex-col">
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
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                  <p className="text-xs font-black text-slate-800 mb-1">
                    {note.title}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    {note.content}
                  </p>
                  {note.expires_at && (
                    <p className="mt-3 text-[9px] font-black text-blue-500/60 flex items-center gap-1 uppercase">
                      <CalendarIcon size={10} /> Até{" "}
                      {new Date(note.expires_at).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              ))}
              {notes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 opacity-30">
                  <Layout size={32} className="mb-2" />
                  <p className="text-[10px] uppercase tracking-widest font-black">
                    Nenhuma nota ativa
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* TAREFAS CRÍTICAS */}
          <div className="bg-slate-900 p-8 rounded-[3rem] shadow-xl relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 text-white opacity-5 group-hover:rotate-12 transition-transform duration-700">
              <Clock size={150} />
            </div>
            <div className="relative z-10">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-6">
                Tarefas Críticas
              </h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white">
                    <Clock size={18} />
                  </div>
                  <div>
                    <p className="text-white text-sm font-black">
                      {stats.pendingFollowups} Follow-ups
                    </p>
                    <p className="text-slate-400 text-[10px] font-bold">
                      Aguardando retorno via WhatsApp
                    </p>
                  </div>
                </div>
                <button className="w-full mt-4 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20">
                  Resolver Agora
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, desc, trend }) => (
  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
    <div className="relative z-10">
      <div className="p-3 bg-slate-50 w-fit rounded-2xl mb-6 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
        {label}
      </p>
      <p className="text-3xl font-black text-slate-900 tracking-tighter mb-2">
        {value}
      </p>
      <p className="text-[10px] font-bold text-slate-400 italic">{desc}</p>
      {trend && (
        <div className="mt-3 pt-3 border-t border-slate-50 flex items-center gap-1 text-green-600 font-black text-[9px] uppercase">
          <ArrowUpRight size={12} /> {trend}
        </div>
      )}
    </div>
  </div>
);

export default Home;
