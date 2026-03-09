import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from './components/Sidebar';
import Home from './sections/Home';
import SearchSection from './sections/Search';

const API_URL = 'http://localhost:3001';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLeads = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/leads`);
      setLeads(data);
    } catch (error) { console.error(error); }
  };

  const handleStartSearch = async (config) => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/run-scraper`, config);
      setActiveTab('home'); // Volta para o início para ver os leads entrando
    } catch (error) { alert("Erro ao iniciar."); }
    setLoading(false);
  };

  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen bg-[#F0F2F5] text-slate-900 overflow-hidden font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'home' && (
          <Home leads={leads} loading={loading} onRefresh={fetchLeads} />
        )}
        {activeTab === 'search' && (
          <SearchSection onStartSearch={handleStartSearch} loading={loading} />
        )}
        {/* Outras abas podem ser adicionadas aqui */}
      </main>
    </div>
  );
}

export default App;