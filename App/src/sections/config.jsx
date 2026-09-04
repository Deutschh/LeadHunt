import React, { useEffect, useRef, useState } from "react";
import {
  Building2,
  Package,
  Save,
  Sparkles,
  Target,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider.jsx";
import useOperationalApi from "../hooks/useOperationalApi.js";
import CommercialProfileSection from "./commercial-settings/CommercialProfileSection.jsx";
import NicheStrategiesSection from "./commercial-settings/NicheStrategiesSection.jsx";
import ServiceCatalogSection from "./commercial-settings/ServiceCatalogSection.jsx";
import {
  canManageCommercialSettings,
  getNextSettingsTabIndex,
} from "./commercial-settings/commercialSettingsModel.js";
import useCommercialSettings from "./commercial-settings/useCommercialSettings.js";

const TABS = Object.freeze([
  { id: "identity", label: "Identidade comercial", icon: Building2 },
  { id: "services", label: "Produtos e serviços", icon: Package },
  { id: "strategies", label: "Estratégias de nicho", icon: Target },
]);

function SettingsTab({ tab, active, buttonRef, onSelect, onKeyDown }) {
  return (
    <button
      type="button"
      role="tab"
      id={`settings-tab-${tab.id}`}
      aria-controls={`settings-panel-${tab.id}`}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      ref={buttonRef}
      onClick={() => onSelect(tab.id)}
      onKeyDown={onKeyDown}
      className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[1.25rem] px-4 py-3 text-xs font-black transition sm:px-5 sm:text-sm ${
        active
          ? "bg-black text-white shadow-lg"
          : "text-slate-500 hover:bg-white hover:text-slate-900"
      }`}
    >
      {React.createElement(tab.icon, { size: 17 })}
      {tab.label}
    </button>
  );
}

const Configs = () => {
  const api = useOperationalApi();
  const { membership } = useAuth();
  const canManage = canManageCommercialSettings(membership);
  const commercialSettings = useCommercialSettings(api);
  const [activeTab, setActiveTab] = useState("identity");
  const tabRefs = useRef([]);

  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get("/leads/automation/settings");
        setIsAiEnabled(res.data.is_ai_enabled);
      } catch (err) {
        console.error("Erro ao carregar settings", err);
      }
    };
    void fetchSettings();
  }, [api]);

  const handleSaveGlobal = async () => {
    setLoading(true);
    try {
      await api.patch("/leads/automation/settings", {
        is_ai_enabled: isAiEnabled,
      });
      window.alert("🔥 Configurações globais atualizadas!");
    } catch {
      window.alert("Erro ao salvar configurações.");
    } finally {
      setLoading(false);
    }
  };

  const handleTabKeyDown = (event, currentIndex) => {
    const nextIndex = getNextSettingsTabIndex(
      currentIndex,
      event.key,
      TABS.length,
    );
    if (nextIndex === null) return;

    event.preventDefault();
    setActiveTab(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="mx-auto max-w-[900px] animate-in slide-in-from-bottom-4 px-4 pb-20 pt-6 duration-500 sm:px-6 sm:pt-8 lg:p-10 lg:pb-20">
      <h1 className="mb-2 text-3xl font-black tracking-tighter sm:text-4xl">
        Configurações
      </h1>
      <p className="mb-8 font-medium text-slate-400 sm:mb-10">
        Gerencie a identidade, as ofertas e as estratégias comerciais do seu
        workspace.
      </p>

      <div
        role="tablist"
        aria-label="Configurações comerciais"
        className="mb-6 flex w-full gap-1 overflow-x-auto rounded-[1.5rem] border border-white/50 bg-slate-200/60 p-1.5 shadow-inner"
      >
        {TABS.map((tab, index) => (
          <SettingsTab
            key={tab.id}
            tab={tab}
            active={activeTab === tab.id}
            buttonRef={(element) => {
              tabRefs.current[index] = element;
            }}
            onSelect={setActiveTab}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          />
        ))}
      </div>

      <div
        role="tabpanel"
        id="settings-panel-identity"
        aria-labelledby="settings-tab-identity"
        hidden={activeTab !== "identity"}
      >
        <CommercialProfileSection
          resource={commercialSettings.profile}
          canManage={canManage}
          saving={commercialSettings.profileSaving}
          onSave={commercialSettings.updateProfile}
          onRetry={commercialSettings.loadProfile}
        />
      </div>
      <div
        role="tabpanel"
        id="settings-panel-services"
        aria-labelledby="settings-tab-services"
        hidden={activeTab !== "services"}
      >
        <ServiceCatalogSection
          resource={commercialSettings.services}
          canManage={canManage}
          saving={commercialSettings.serviceSaving}
          onCreate={commercialSettings.createService}
          onUpdate={commercialSettings.updateService}
          onRetry={commercialSettings.loadServices}
        />
      </div>
      <div
        role="tabpanel"
        id="settings-panel-strategies"
        aria-labelledby="settings-tab-strategies"
        hidden={activeTab !== "strategies"}
      >
        <NicheStrategiesSection
          resource={commercialSettings.strategies}
          canManage={canManage}
          saving={commercialSettings.strategySaving}
          onUpsert={commercialSettings.upsertStrategy}
          onDelete={commercialSettings.removeStrategy}
          onRetry={commercialSettings.loadStrategies}
        />
      </div>

      <div className="mt-8 space-y-5">
        <div className="flex flex-col gap-5 rounded-[2.5rem] border border-blue-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-50 p-3 text-blue-500">
              <Sparkles size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">
                Cérebro Artificial
              </h2>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Ativar geração de mensagens em massa
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isAiEnabled}
            aria-label="Ativar geração de mensagens em massa"
            onClick={() => setIsAiEnabled(!isAiEnabled)}
            className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors duration-300 ${
              isAiEnabled ? "bg-blue-500" : "bg-slate-200"
            }`}
          >
            <div
              className={`h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
                isAiEnabled ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSaveGlobal}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black p-5 font-black text-white shadow-xl shadow-black/10 transition-all hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white" />
          ) : (
            <Save size={20} />
          )}
          {loading ? "SALVANDO..." : "SALVAR CONFIGURAÇÕES"}
        </button>
      </div>
    </div>
  );
};

export default Configs;
