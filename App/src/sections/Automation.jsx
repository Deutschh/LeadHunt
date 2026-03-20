import React, { useState, useEffect } from "react";
import api from "../services/api";
import {
  Zap,
  Play,
  Pause,
  Clock,
  Settings,
  ListOrdered,
  Send,
  AlertCircle,
  CheckCircle2,
  Monitor,
} from "lucide-react";
import { io } from "socket.io-client";

const Automation = () => {
  const [settings, setSettings] = useState({
    is_active: false,
    min_interval_minutes: 10,
    max_interval_minutes: 20,
    daily_limit: 30,
    start_hour: "09:00",
    end_hour: "18:00",
  });

  const [queue, setQueue] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isWorkerOnline, setIsWorkerOnline] = useState(false);

  useEffect(() => {
    // 1. CARREGAR LOGS SALVOS (Persistência)
    const savedLogs = localStorage.getItem("leadhunt_logs");
    if (savedLogs) {
      setLogs(JSON.parse(savedLogs));
    }

    fetchData();

    const socket = io("https://leadhunt-api.onrender.com");

    socket.on("worker-status-update", (status) => {
      setIsWorkerOnline(status);
    });

    // 2. OUVIR E SALVAR LOGS NO LOCALSTORAGE
    socket.on("automation-log", (newLog) => {
      setLogs((prev) => {
        const updatedLogs = [newLog, ...prev].slice(0, 30);
        localStorage.setItem("leadhunt_logs", JSON.stringify(updatedLogs));
        return updatedLogs;
      });
    });

    return () => socket.disconnect();
  }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, leadsRes] = await Promise.all([
        api.get("/leads/automation/settings"),
        api.get("/leads"),
      ]);

      setSettings(settingsRes.data);
      const verifiedQueue = leadsRes.data.filter(
        (l) => l.is_verified && l.status === "pending",
      );
      setQueue(verifiedQueue);
      setLoading(false);
    } catch (err) {
      console.error("Erro ao carregar automação", err);
    }
  };

  const handleToggleAutomation = async () => {
    const newState = !settings.is_active;
    try {
      const { data } = await api.patch("/leads/automation/settings", {
        is_active: newState,
      });
      setSettings(data);
    } catch (err) {
      alert("Erro ao mudar estado da automação");
    }
  };

  const updateSetting = async (field, value) => {
    try {
      const { data } = await api.patch("/leads/automation/settings", {
        [field]: value,
      });
      setSettings(data);
    } catch (err) {
      console.error(err);
    }
  };

  // Função para limpar os logs manualmente se você quiser
  const clearLogs = () => {
    setLogs([]);
    localStorage.removeItem("leadhunt_logs");
  };

  if (loading)
    return (
      <div className="p-20 text-center font-black animate-pulse text-slate-400">
        Sincronizando Motores...
      </div>
    );

  return (
    <div className="p-10 max-w-[1600px] mx-auto animate-in fade-in duration-700 pb-20">
      <header className="mb-12 flex justify-between items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-yellow-500 mb-2">
            Módulo de Disparos
          </p>
          <h1 className="text-5xl font-black tracking-tighter text-slate-900">
            Automação
          </h1>
        </div>

        <div
          className={`flex items-center gap-4 px-6 py-3 rounded-2xl border transition-all ${isWorkerOnline ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}
        >
          <div className="relative flex h-3 w-3">
            {isWorkerOnline && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            )}
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${isWorkerOnline ? "bg-green-500" : "bg-red-500"}`}
            ></span>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">
              Conexão com PC Local
            </p>
            <p
              className={`text-xs font-bold ${isWorkerOnline ? "text-green-700" : "text-red-700"}`}
            >
              {isWorkerOnline ? "MOTOR ONLINE" : "MOTOR OFFLINE"}
            </p>
          </div>
        </div>

        <button
          onClick={handleToggleAutomation}
          className={`flex items-center gap-3 px-10 py-5 rounded-[2rem] font-black text-sm transition-all shadow-xl ${
            settings.is_active
              ? "bg-red-500 text-white shadow-red-200 hover:bg-red-600"
              : "bg-[#00b37e] text-white shadow-green-200 hover:bg-[#00c98d]"
          }`}
        >
          {settings.is_active ? (
            <>
              <Pause size={20} /> Pausar Motor
            </>
          ) : (
            <>
              <Play size={20} /> Iniciar Motor
            </>
          )}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-2">
              <Settings size={16} /> Parâmetros de Disparo
            </h3>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <ConfigInput
                  label="Min Intervalo"
                  value={settings.min_interval_minutes}
                  onChange={(v) => updateSetting("min_interval_minutes", v)}
                />
                <ConfigInput
                  label="Max Intervalo"
                  value={settings.max_interval_minutes}
                  onChange={(v) => updateSetting("max_interval_minutes", v)}
                />
              </div>
              <ConfigInput
                label="Limite Diário"
                value={settings.daily_limit}
                onChange={(v) => updateSetting("daily_limit", v)}
              />
              <div className="grid grid-cols-2 gap-4">
                <ConfigInput
                  type="time"
                  label="Início"
                  value={settings.start_hour}
                  onChange={(v) => updateSetting("start_hour", v)}
                />
                <ConfigInput
                  type="time"
                  label="Término"
                  value={settings.end_hour}
                  onChange={(v) => updateSetting("end_hour", v)}
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Monitor size={80} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">
              Painel de Controle
            </p>
            <p className="text-2xl font-black mb-4">
              {settings.is_active ? "Automação Ativa" : "Motor em Repouso"}
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-bold bg-white/5 p-4 rounded-2xl">
              <AlertCircle size={14} />
              {isWorkerOnline
                ? "Comunicação com o PC estabelecida."
                : "Ligue o Worker no seu computador."}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <ListOrdered size={16} /> Próximos na Fila ({queue.length})
              </h3>
              <button
                onClick={fetchData}
                className="text-[10px] font-black uppercase text-blue-600"
              >
                Atualizar
              </button>
            </div>

            {/* CONTAINER ROLÁVEL DA FILA */}
            <div className="max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {queue.map((lead, index) => (
                  <div
                    key={lead.id}
                    className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-between animate-in slide-in-from-bottom-2"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-slate-400 shadow-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800">
                          {lead.name}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          {lead.neighborhood}
                        </p>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-[9px] font-black uppercase">
                      Pronto
                    </div>
                  </div>
                ))}
                {queue.length === 0 && (
                  <div className="col-span-2 py-6 text-center text-slate-300 uppercase text-[10px] font-black">
                    Fila vazia.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <Send size={16} /> Log em Tempo Real (Worker Remote)
              </h3>
              {logs.length > 0 && (
                <button
                  onClick={clearLogs}
                  className="text-[9px] font-black uppercase text-red-400 hover:text-red-600 transition-colors"
                >
                  Limpar Terminal
                </button>
              )}
            </div>
            <div className="space-y-2 font-mono text-[11px] max-h-[300px] overflow-y-auto pr-4 scrollbar-hide">
              {logs.length === 0 ? (
                <p className="text-slate-300 italic">
                  Aguardando atividade do motor...
                </p>
              ) : (
                logs.map((log, i) => (
                  <div
                    key={i}
                    className={`flex gap-4 p-3 rounded-xl items-center ${log.type === "error" ? "bg-red-50" : "bg-slate-50"}`}
                  >
                    <span className="text-slate-300">[{log.time}]</span>
                    <span
                      className={
                        log.type === "success"
                          ? "text-green-600 font-bold"
                          : log.type === "error"
                            ? "text-red-600"
                            : "text-slate-600"
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ConfigInput = ({ label, value, onChange, type = "number" }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black text-slate-400 uppercase px-2">
      {label}
    </label>
    <input
      type={type}
      className="w-full p-4 bg-slate-50 rounded-2xl border-none outline-none font-bold text-slate-800 focus:ring-2 focus:ring-yellow-400 transition-all"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

export default Automation;
