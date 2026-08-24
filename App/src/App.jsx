import React, { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import AuthRoutes from "./auth/AuthRoutes.jsx";
import Sidebar from "./components/Sidebar";
import MyLeads from "./sections/MyLeads";
import Configs from "./sections/config";
import LeadDetails from "./sections/LeadDetails";
import Home from "./sections/Home";
import Automation from "./sections/Automation";
import Analysis from "./sections/Analisy";
import PublicBriefing from "./sections/PublicBriefing";
import useOperationalApi from "./hooks/useOperationalApi.js";

function LegacyAppShell() {
  const api = useOperationalApi();
  const [activeTab, setActiveTab] = useState("home");
  const [leads, setLeads] = useState([]);
  const loading = false;
  const [selectedLeadId, setSelectedLeadId] = useState(null);

  const handleOpenLead = (id) => {
    setSelectedLeadId(id);
    setActiveTab("lead-details");
  };

  const fetchLeads = async () => {
    try {
      const { data } = await api.get("/leads");
      setLeads(data);
    } catch (error) {
      console.error("Erro ao buscar leads:", error);
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const response = await api.patch(`/leads/${id}`, {
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
    const initialFetch = window.setTimeout(fetchLeads, 0);
    const interval = setInterval(fetchLeads, 15000);
    return () => {
      window.clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, []);

  return (
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

        {activeTab === "lead-details" && (
          <LeadDetails
            leadId={selectedLeadId}
            onBack={() => setActiveTab("leads")}
          />
        )}

        {activeTab === "automation" && <Automation />}
        {activeTab === "analysis" && <Analysis />}
        {activeTab === "settings" && <Configs />}
      </main>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/briefing/:publicToken" element={<PublicBriefing />} />
      <Route
        path="*"
        element={
          <AuthProvider>
            <AuthRoutes operationalElement={<LegacyAppShell />} />
          </AuthProvider>
        }
      />
    </Routes>
  );
}

export default App;
