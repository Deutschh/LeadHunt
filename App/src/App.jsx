import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Search, Send, RefreshCw, CheckCircle, Globe, 
  LayoutDashboard, Users, Zap, Settings, BarChart3, Plus, ExternalLink
} from 'lucide-react';

const API_URL = 'http://localhost:3001';

function App() {
  const [leads, setLeads] = useState([]);
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLeads = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/leads`);
      setLeads(data);
    } catch (error) {
      console.error("Erro ao carregar dados", error);
    }
  };

  const runScraper = async () => {
    if (!location) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/run-scraper`, { location });
    } catch (error) {
      console.error("Erro ao iniciar robô");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen bg-[#F0F2F5] text-slate-900 font-sans overflow-hidden">
      
      {/* SIDEBAR - LIQUID GLASS EFFECT */}
      <aside className="w-72 bg-white/40 backdrop-blur-2xl border-r border-white/40 flex flex-col p-8 h-full z-20">
        <div className="flex items-center gap-3 mb-14 px-2">
          <div className="w-9 h-9 bg-black text-white rounded-xl flex items-center justify-center font-black shadow-lg shadow-black/10">
            L
          </div>
          <span className="text-2xl font-black tracking-tighter italic text-black">LeadHunt</span>
        </div>

        <nav className="flex-1 space-y-3">
          <NavItem icon={<LayoutDashboard size={22}/>} label="Início" active />
          <NavItem icon={<Users size={22}/>} label="Meus Leads" />
          <NavItem icon={<Zap size={22}/>} label="Automação" />
          <NavItem icon={<BarChart3 size={22}/>} label="Análise" />
        </nav>

        <div className="pt-8 border-t border-black/5">
          <NavItem icon={<Settings size={22}/>} label="Configurações" />
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        
        {/* TOPBAR MINIMALISTA */}
        <header className="h-24 bg-white/60 backdrop-blur-md border-b border-white/40 px-10 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center bg-white/80 rounded-2xl px-5 py-3 w-[450px] shadow-sm border border-black/5 focus-within:ring-2 ring-black/5 transition-all">
            <Search size={18} className="text-slate-400" />
            <input 
              type="text" 
              placeholder="Digite a localização para minerar..." 
              className="bg-transparent border-none outline-none px-4 w-full text-sm font-medium"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-5">
            <button 
              onClick={runScraper}
              disabled={loading}
              className="bg-black text-white px-7 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-black/10"
            >
              <Plus size={18} /> {loading ? "Buscando..." : "Nova Busca"}
            </button>
          </div>
        </header>

        {/* ÁREA DE CONTEÚDO */}
        <div className="p-10 max-w-[1600px] mx-auto w-full">
          
          {/* STATS DE IMPACTO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <StatCard label="Leads Totais" value={leads.length} />
            <StatCard label="Sem Website" value={leads.filter(l => !l.has_website).length} isAlert />
            <StatCard label="Novos Hoje" value={leads.filter(l => l.status === 'pending').length} isSuccess />
          </div>

          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-black tracking-tight text-black">Leads Recentes</h2>
            <button onClick={fetchLeads} className="bg-white p-3 rounded-xl shadow-sm border border-black/5 hover:bg-slate-50 transition-colors">
              <RefreshCw size={20} className={`${loading ? "animate-spin" : ""} text-slate-600`} />
            </button>
          </div>

          {/* GRID DE LEADS */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

// --- COMPONENTES AUXILIARES ---

function NavItem({ icon, label, active = false }) {
  return (
    <div className={`flex items-center gap-4 px-5 py-4 rounded-2xl cursor-pointer transition-all duration-300 ${active ? 'bg-black text-white shadow-xl shadow-black/20' : 'text-slate-600 hover:text-black hover:bg-white/60'}`}>
      {icon}
      <span className="font-bold text-[15px]">{label}</span>
    </div>
  );
}

function StatCard({ label, value, isAlert = false, isSuccess = false }) {
  return (
    <div className="bg-white/80 backdrop-blur-sm p-8 rounded-[2.5rem] border border-white shadow-sm hover:shadow-md transition-shadow">
      <p className="text-slate-400 text-xs font-black uppercase tracking-[0.15em] mb-3">{label}</p>
      <p className={`text-5xl font-black tracking-tighter ${isAlert ? 'text-red-500' : isSuccess ? 'text-[#00b37e]' : 'text-black'}`}>
        {value}
      </p>
    </div>
  );
}

function LeadCard({ lead }) {
  // Limpeza de caracteres especiais do telefone
  const cleanPhone = lead.phone.replace(/\D/g, '');
  const displayPhone = lead.phone.replace(/\n/g, '').trim();
  
  return (
    <div className="bg-white border border-white p-8 rounded-[3rem] shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden">
      {/* Detalhe de fundo sutil */}
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-slate-50 rounded-full group-hover:scale-[3] transition-transform duration-700 opacity-50"></div>

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-8">
          <div className="w-14 h-14 bg-black text-white rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg shadow-black/10">
            {lead.name.charAt(0).toUpperCase()}
          </div>
          <div className="bg-red-50 text-red-500 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-100 flex items-center gap-1">
            <Globe size={12} /> No Website
          </div>
        </div>

        <h3 className="text-xl font-black mb-2 truncate text-black pr-4">{lead.name}</h3>
        <p className="text-slate-400 font-medium text-sm mb-8 flex items-center gap-2">
          {displayPhone}
        </p>

        <div className="flex gap-4">
          <button 
            onClick={() => window.open(`https://wa.me/${cleanPhone}?text=Olá!`, '_blank')}
            className="flex-[2] bg-[#00b37e] text-white py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#00b37e]/20"
          >
            <Send size={18} /> WhatsApp
          </button>
          <button className="flex-1 bg-slate-100 text-slate-400 py-4 rounded-2xl hover:bg-black hover:text-white transition-all flex items-center justify-center">
            <CheckCircle size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;