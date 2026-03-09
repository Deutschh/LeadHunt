import React from 'react';
import { LayoutDashboard, Users, Search, Zap, BarChart3, Settings } from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'home', label: 'Início', icon: <LayoutDashboard size={22}/> },
    { id: 'leads', label: 'Meus Leads', icon: <Users size={22}/> },
    { id: 'search', label: 'Busca Inteligente', icon: <Search size={22}/> },
    { id: 'automation', label: 'Automação', icon: <Zap size={22}/> },
    { id: 'analysis', label: 'Análise', icon: <BarChart3 size={22}/> },
  ];

  return (
    <aside className="w-72 bg-white/40 backdrop-blur-2xl border-r border-white/40 flex flex-col p-8 h-full z-20">
      <div className="flex items-center gap-3 mb-14 px-2">
        <div className="w-9 h-9 bg-black text-white rounded-xl flex items-center justify-center font-black shadow-lg shadow-black/10">L</div>
        <span className="text-2xl font-black tracking-tighter italic text-black">LeadHunt</span>
      </div>

      <nav className="flex-1 space-y-3">
        {menuItems.map((item) => (
          <div
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex items-center gap-4 px-5 py-4 rounded-2xl cursor-pointer transition-all duration-300 ${
              activeTab === item.id 
              ? 'bg-black text-white shadow-xl shadow-black/20' 
              : 'text-slate-600 hover:text-black hover:bg-white/60'
            }`}
          >
            {item.icon}
            <span className="font-bold text-[15px]">{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="pt-8 border-t border-black/5">
        <div className="flex items-center gap-4 px-5 py-4 rounded-2xl cursor-pointer text-slate-600 hover:text-black hover:bg-white/60 transition-all">
          <Settings size={22}/>
          <span className="font-bold text-[15px]">Configurações</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;