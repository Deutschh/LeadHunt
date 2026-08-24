import React, { useEffect, useMemo, useState } from "react";
import useOperationalApi from "../hooks/useOperationalApi.js";
import {
  Play,
  Pause,
  Clock,
  Settings,
  ListOrdered,
  Send,
  AlertCircle,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Activity,
  Cpu,
  RotateCcw,
  Power,
  PowerOff,
  MessageCircle,
  Repeat,
} from "lucide-react";

const Automation = () => {
  const api = useOperationalApi();
  const [settings, setSettings] = useState({
    is_active: false,
    min_interval_minutes: 10,
    max_interval_minutes: 20,
    daily_limit: 30,
    start_hour: "09:00",
    end_hour: "18:00",

    followup_enabled: true,
    followup_max_count: 2,

    followup_delay_hours_1: 24,
    followup_delay_hours_2: 72,

    followups_per_cycle: 2,
    followup_gap_seconds: 30,
  });

  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingNumbers, setSendingNumbers] = useState([]);
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    fetchData(true);
  }, []);

  const fetchData = async (showGlobalLoading = false) => {
    try {
      if (showGlobalLoading) setLoading(true);

      const [settingsRes, leadsRes, sendingNumbersRes] = await Promise.all([
        api.get("/leads/automation/settings"),
        api.get("/leads"),
        api.get("/leads/sending-numbers"),
      ]);

      setSettings(settingsRes.data);

      const verifiedQueue = leadsRes.data.filter(
        (l) => l.is_verified && l.status === "pending" && !l.is_archived,
      );
      setQueue(verifiedQueue);

      setSendingNumbers(sendingNumbersRes.data || []);
    } catch (err) {
      console.error("Erro ao carregar automação", err);
    } finally {
      if (showGlobalLoading) setLoading(false);
    }
  };

  const setChipLoading = (chipId, state) => {
    setActionLoading((prev) => ({ ...prev, [chipId]: state }));
  };

  const handleToggleAutomation = async () => {
    const newState = !settings.is_active;

    try {
      const { data } = await api.patch("/leads/automation/settings", {
        is_active: newState,
      });
      setSettings(data);
    } catch {
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

  const handlePauseChip = async (chipId) => {
    const minutes = window.prompt("Pausar chip por quantos minutos?", "30");
    if (minutes === null) return;

    const parsedMinutes = Number(minutes);

    if (Number.isNaN(parsedMinutes) || parsedMinutes <= 0) {
      alert("Digite uma quantidade de minutos válida.");
      return;
    }

    try {
      setChipLoading(chipId, true);
      await api.patch(`/leads/sending-numbers/${chipId}/pause`, {
        minutes: parsedMinutes,
        reason: "Pausa manual pelo painel",
      });
      await fetchData();
    } catch (err) {
      console.error(err);
      alert("Erro ao pausar chip.");
    } finally {
      setChipLoading(chipId, false);
    }
  };

  const handleResumeChip = async (chipId) => {
    try {
      setChipLoading(chipId, true);
      await api.patch(`/leads/sending-numbers/${chipId}/resume`);
      await fetchData();
    } catch (err) {
      console.error(err);
      alert("Erro ao reativar chip.");
    } finally {
      setChipLoading(chipId, false);
    }
  };

  const handleResetFailures = async (chipId) => {
    try {
      setChipLoading(chipId, true);
      await api.patch(`/leads/sending-numbers/${chipId}/reset-failures`);
      await fetchData();
    } catch (err) {
      console.error(err);
      alert("Erro ao resetar falhas.");
    } finally {
      setChipLoading(chipId, false);
    }
  };

  const handleToggleActiveChip = async (chip) => {
    try {
      setChipLoading(chip.id, true);
      await api.patch(`/leads/sending-numbers/${chip.id}/toggle-active`, {
        is_active: !chip.is_active,
      });
      await fetchData();
    } catch (err) {
      console.error(err);
      alert("Erro ao alterar estado do chip.");
    } finally {
      setChipLoading(chip.id, false);
    }
  };

  const handleUpdateDailyLimit = async (chip) => {
    const newLimit = window.prompt(
      `Novo limite diário para ${chip.label}:`,
      String(chip.daily_limit || 10),
    );

    if (newLimit === null) return;

    const parsedLimit = Number(newLimit);

    if (Number.isNaN(parsedLimit) || parsedLimit < 0) {
      alert("Digite um limite diário válido.");
      return;
    }

    try {
      setChipLoading(chip.id, true);
      await api.patch(`/leads/sending-numbers/${chip.id}/daily-limit`, {
        daily_limit: parsedLimit,
      });
      await fetchData();
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar limite diário.");
    } finally {
      setChipLoading(chip.id, false);
    }
  };

  const chipsSummary = useMemo(() => {
    const active = sendingNumbers.filter((n) => n.is_active).length;
    const healthy = sendingNumbers.filter(
      (n) => n.health_status === "healthy",
    ).length;
    const warning = sendingNumbers.filter(
      (n) => n.health_status === "warning",
    ).length;
    const paused = sendingNumbers.filter(
      (n) =>
        n.health_status === "paused" ||
        (n.paused_until && new Date(n.paused_until) > new Date()),
    ).length;

    const totalSentToday = sendingNumbers.reduce(
      (acc, item) => acc + Number(item.sent_today || 0),
      0,
    );

    return { active, healthy, warning, paused, totalSentToday };
  }, [sendingNumbers]);

  if (loading) {
    return (
      <div className="p-20 text-center font-black animate-pulse text-slate-400">
        Sincronizando Motores...
      </div>
    );
  }

  return (
    <div className="p-10 max-w-[1600px] mx-auto animate-in fade-in duration-700 pb-20">
      <header className="mb-12 flex justify-between items-end flex-wrap gap-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-yellow-500 mb-2">
            Módulo de Disparos
          </p>
          <h1 className="text-5xl font-black tracking-tighter text-slate-900">
            Automação
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => fetchData()}
            className="flex items-center gap-2 px-5 py-4 rounded-2xl font-black text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
          >
            <RefreshCw size={18} />
            Atualizar
          </button>

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
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
        <SummaryCard
          icon={Cpu}
          title="Chips ativos"
          value={chipsSummary.active}
          tone="slate"
        />
        <SummaryCard
          icon={ShieldCheck}
          title="Saudáveis"
          value={chipsSummary.healthy}
          tone="green"
        />
        <SummaryCard
          icon={AlertCircle}
          title="Warning"
          value={chipsSummary.warning}
          tone="orange"
        />
        <SummaryCard
          icon={Pause}
          title="Pausados"
          value={chipsSummary.paused}
          tone="red"
        />
        <SummaryCard
          icon={Send}
          title="Enviados hoje"
          value={chipsSummary.totalSentToday}
          tone="blue"
        />
      </div>

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

          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-8 gap-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <Repeat size={16} /> Follow-up Automático
              </h3>

              <button
                onClick={() =>
                  updateSetting("followup_enabled", !settings.followup_enabled)
                }
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                  settings.followup_enabled
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {settings.followup_enabled ? "Ligado" : "Desligado"}
              </button>
            </div>

            <div className="space-y-6">
              <ConfigInput
                label="Máximo de Follow-ups"
                value={settings.followup_max_count}
                onChange={(v) => updateSetting("followup_max_count", Number(v))}
              />

              <div className="grid grid-cols-2 gap-4">
                <ConfigInput
                  label="Delay 1º Follow-up (h)"
                  value={settings.followup_delay_hours_1}
                  onChange={(v) =>
                    updateSetting("followup_delay_hours_1", Number(v))
                  }
                />

                <ConfigInput
                  label="Delay 2º Follow-up (h)"
                  value={settings.followup_delay_hours_2}
                  onChange={(v) =>
                    updateSetting("followup_delay_hours_2", Number(v))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ConfigInput
                  label="Follow-ups por ciclo"
                  value={settings.followups_per_cycle}
                  onChange={(v) =>
                    updateSetting(
                      "followups_per_cycle",
                      Math.min(3, Math.max(0, Number(v))),
                    )
                  }
                />

                <ConfigInput
                  label="Intervalo entre Follow-ups (s)"
                  value={settings.followup_gap_seconds}
                  onChange={(v) =>
                    updateSetting(
                      "followup_gap_seconds",
                      Math.max(30, Number(v)),
                    )
                  }
                />
              </div>

              <div className="bg-slate-50 rounded-[2rem] p-5 border border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
                  Regra atual
                </p>

                <p className="text-sm font-bold text-slate-700 leading-relaxed">
                  {settings.followup_enabled
                    ? `
Enviar até ${settings.followup_max_count || 0}
follow-up(s).

Executar
${settings.followups_per_cycle || 0}
por ciclo.

Intervalo interno:
${settings.followup_gap_seconds || 30}s.

1° após
${settings.followup_delay_hours_1 || 0}h.

2° após
${settings.followup_delay_hours_2 || 0}h.
`
                    : "Follow-ups automáticos estão pausados. Leads não receberão novas tentativas."}
                </p>
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
          </div>
        </div>

        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <Activity size={16} /> Controle Operacional dos Chips
              </h3>
              <span className="text-[10px] font-black uppercase text-slate-400">
                {sendingNumbers.length} chip(s)
              </span>
            </div>

            <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
              {sendingNumbers.length === 0 ? (
                <div className="text-center py-10 text-slate-400 font-bold">
                  Nenhum chip cadastrado.
                </div>
              ) : (
                sendingNumbers.map((chip) => {
                  const paused =
                    chip.paused_until &&
                    new Date(chip.paused_until) > new Date();

                  const healthTone =
                    chip.health_status === "healthy"
                      ? "bg-green-100 text-green-700"
                      : chip.health_status === "warning"
                        ? "bg-orange-100 text-orange-700"
                        : chip.health_status === "paused" || paused
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-200 text-slate-700";

                  return (
                    <div
                      key={chip.id}
                      className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100"
                    >
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                          <p className="text-lg font-black text-slate-800">
                            {chip.label}
                          </p>
                          <p className="text-sm font-bold text-slate-400 mt-1">
                            {chip.phone_number}
                          </p>
                          <p className="text-xs font-bold text-slate-400 mt-2">
                            Perfil: {chip.whatsapp_profile_name || "—"} • Porta:{" "}
                            {chip.chrome_port || "—"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${healthTone}`}
                          >
                            {paused
                              ? "PAUSADO"
                              : chip.health_status || "unknown"}
                          </span>

                          <span
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                              chip.is_active
                                ? "bg-blue-100 text-blue-700"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {chip.is_active ? "ATIVO" : "INATIVO"}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-6">
                        <MiniInfo label="Status" value={chip.status || "—"} />
                        <MiniInfo
                          label="Uso hoje"
                          value={`${chip.sent_today} / ${chip.daily_limit}`}
                        />
                        <MiniInfo
                          label="Falhas"
                          value={chip.consecutive_failures || 0}
                        />
                        <MiniInfo
                          label="Pausado até"
                          value={
                            chip.paused_until
                              ? formatDateTime(chip.paused_until)
                              : "—"
                          }
                        />
                      </div>

                      <div className="mt-5">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                          <span>Uso diário</span>
                          <span>{chip.usage_percent}%</span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              chip.usage_percent >= 90
                                ? "bg-red-500"
                                : chip.usage_percent >= 70
                                  ? "bg-orange-500"
                                  : "bg-green-500"
                            }`}
                            style={{ width: `${chip.usage_percent}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-5 p-4 bg-white rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
                          Último erro
                        </p>
                        <p className="text-xs font-medium text-slate-600 break-words">
                          {chip.last_error || "Nenhum erro recente."}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3 mt-5">
                        <ActionButton
                          label="Pausar"
                          icon={Pause}
                          onClick={() => handlePauseChip(chip.id)}
                          disabled={!!actionLoading[chip.id]}
                          tone="red"
                        />

                        <ActionButton
                          label="Reativar"
                          icon={Play}
                          onClick={() => handleResumeChip(chip.id)}
                          disabled={!!actionLoading[chip.id]}
                          tone="green"
                        />

                        <ActionButton
                          label="Resetar falhas"
                          icon={RotateCcw}
                          onClick={() => handleResetFailures(chip.id)}
                          disabled={!!actionLoading[chip.id]}
                          tone="orange"
                        />

                        <ActionButton
                          label={chip.is_active ? "Desativar" : "Ativar"}
                          icon={chip.is_active ? PowerOff : Power}
                          onClick={() => handleToggleActiveChip(chip)}
                          disabled={!!actionLoading[chip.id]}
                          tone="slate"
                        />

                        <ActionButton
                          label="Limite diário"
                          icon={Clock}
                          onClick={() => handleUpdateDailyLimit(chip)}
                          disabled={!!actionLoading[chip.id]}
                          tone="blue"
                        />

                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <ListOrdered size={16} /> Próximos na Fila ({queue.length})
              </h3>
              <button
                onClick={() => fetchData()}
                className="text-[10px] font-black uppercase text-blue-600"
              >
                Atualizar
              </button>
            </div>

            <div className="max-h-[360px] overflow-y-auto pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {queue.map((lead, index) => (
                  <div
                    key={lead.id}
                    className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-between"
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

const SummaryCard = ({ icon: Icon, title, value, tone = "slate" }) => {
  const tones = {
    slate: "bg-white border-slate-100 text-slate-900",
    green: "bg-white border-green-100 text-green-700",
    orange: "bg-white border-orange-100 text-orange-700",
    red: "bg-white border-red-100 text-red-700",
    blue: "bg-white border-blue-100 text-blue-700",
  };

  return (
    <div className={`p-6 rounded-[2rem] border shadow-sm ${tones[tone]}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-xl bg-slate-50">
          {React.createElement(Icon, { size: 18 })}
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          {title}
        </p>
      </div>
      <p className="text-3xl font-black">{value}</p>
    </div>
  );
};

const MiniInfo = ({ label, value }) => (
  <div className="bg-white border border-slate-100 rounded-2xl p-4">
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
      {label}
    </p>
    <p className="text-sm font-bold text-slate-800 break-words">{value}</p>
  </div>
);

const ActionButton = ({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  tone = "slate",
}) => {
  const tones = {
    red: "bg-red-100 text-red-700 hover:bg-red-200",
    green: "bg-green-100 text-green-700 hover:bg-green-200",
    orange: "bg-orange-100 text-orange-700 hover:bg-orange-200",
    blue: "bg-blue-100 text-blue-700 hover:bg-blue-200",
    slate: "bg-slate-200 text-slate-700 hover:bg-slate-300",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-3 rounded-2xl text-xs font-black flex items-center gap-2 transition-all ${
        tones[tone]
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {React.createElement(Icon, { size: 14 })}
      {label}
    </button>
  );
};

function formatDateTime(value) {
  return new Date(value).toLocaleString("pt-BR");
}

export default Automation;
