import React, { useState, useEffect } from "react";
import axios from "axios";
import Sidebar from "./components/Sidebar";
import MyLeads from "./sections/MyLeads";
import SearchSection from "./sections/Search";
import Configs from "./sections/config";
import LeadDetails from "./sections/LeadDetails";
import Home from "./sections/Home";
import Automation from "./sections/Automation";

// Agora ele tenta pegar a URL da Vercel primeiro. Se não achar, usa o localhost.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedLeadId, setSelectedLeadId] = useState(null);

  const handleOpenLead = (id) => {
    setSelectedLeadId(id);
    setActiveTab("lead-details");
  };

  const fetchLeads = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/leads`);
      setLeads(data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleStartSearch = async (config) => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/run-scraper`, config);
      setActiveTab("home"); // Volta para o início para ver os leads entrando
    } catch (error) {
      alert("Erro ao iniciar.");
    }
    setLoading(false);
  };

  // Função para sincronizar o progresso do lead com o Neon DB
  const handleUpdateStatus = async (id, newStatus, newInterestLevel = 0) => {
    try {
      // 1. Fazemos o PATCH na API enviando o status e o nível de interesse
      const response = await axios.patch(`${API_URL}/api/leads/${id}`, {
        status: newStatus,
        interest_level: newInterestLevel,
      });

      if (response.status === 200) {
        // 2. Atualizamos o estado local para a UI refletir a mudança na hora
        setLeads((prevLeads) =>
          prevLeads.map((lead) =>
            lead.id === id
              ? { ...lead, status: newStatus, interest_level: newInterestLevel }
              : lead,
          ),
        );

        console.log(
          `✅ Lead ${id} atualizado: Status ${newStatus}, Nível ${newInterestLevel}`,
        );
      }
    } catch (error) {
      console.error("❌ Erro ao atualizar o progresso do lead:", error);
      alert("Erro ao salvar o progresso. Verifique a conexão com o servidor.");
    }
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
        {activeTab === "home" && (
          <Home />
        )}
        {activeTab === "leads" && (
          <MyLeads
            leads={leads}
            loading={loading}
            onRefresh={fetchLeads}
            onUpdateStatus={handleUpdateStatus}
            onOpenLead={handleOpenLead}
          />
        )}
        {activeTab === "search" && (
          <SearchSection onStartSearch={handleStartSearch} loading={loading} />
        )}
        {/* DETALHES DO LEAD (MINI-CRM) */}
        {activeTab === "lead-details" && (
          <LeadDetails
            leadId={selectedLeadId}
            onBack={() => setActiveTab("leads")}
          />
        )}
        {activeTab === "automation" && <Automation />}
        {activeTab === "settings" && <Configs />}
      </main>
    </div>
  );
}

export default App;
