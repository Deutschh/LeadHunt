import React, { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import axios from "axios";
import Sidebar from "./components/Sidebar";
import MyLeads from "./sections/MyLeads";
import SearchSection from "./sections/Search";
import Configs from "./sections/config";
import LeadDetails from "./sections/LeadDetails";
import Home from "./sections/Home";
import Automation from "./sections/Automation";
import Analysis from "./sections/Analisy";
import Laboratory from "./sections/Laboratory";
import PublicBriefing from "./sections/PublicBriefing";

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
      console.error("Erro ao buscar leads:", error);
    }
  };

  const handleStartSearch = async (config) => {
    setLoading(true);
    try {
      await axios.post(`${API_URL}/run-scraper`, config);
      setActiveTab("home");
    } catch (error) {
      console.error("Erro ao iniciar busca:", error);
      alert("Erro ao iniciar a busca.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id, newStatus, _newInterestLevel = 0) => {
    try {
      const response = await axios.patch(`${API_URL}/api/leads/${id}`, {
        status: newStatus,
      });

      const updatedLead = response?.data?.lead;

      if (updatedLead) {
        setLeads((prevLeads) =>
          prevLeads.map((lead) => (lead.id === id ? updatedLead : lead)),
        );
      } else {
        await fetchLeads();
      }

      console.log(`✅ Lead ${id} atualizado para status "${newStatus}"`);
    } catch (error) {
      console.error("❌ Erro ao atualizar o lead:", error);
      alert(
        "Erro ao salvar a atualização. Verifique a conexão com o servidor.",
      );
    }
  };

  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Routes>
      <Route path="/briefing/:leadId" element={<PublicBriefing />} />

      <Route
        path="*"
        element={
          <div className="flex h-screen bg-[#F0F2F5] text-slate-900 overflow-hidden font-sans">
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

            <main className="flex-1 overflow-y-auto">
              {activeTab === "home" && <Home />}

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
                <SearchSection
                  onStartSearch={handleStartSearch}
                  loading={loading}
                />
              )}

              {activeTab === "lead-details" && (
                <LeadDetails
                  leadId={selectedLeadId}
                  onBack={() => setActiveTab("leads")}
                />
              )}

              {activeTab === "automation" && <Automation />}
              {activeTab === "analysis" && <Analysis />}
              {activeTab === "settings" && <Configs />}
              {activeTab === "laboratory" && <Laboratory />}
            </main>
          </div>
        }
      />
    </Routes>
  );
}

export default App;
