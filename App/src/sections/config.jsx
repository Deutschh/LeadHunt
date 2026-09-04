import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Save,
  Sparkles,
  Target,
  Plus,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
import useOperationalApi from "../hooks/useOperationalApi.js";

const Configs = () => {
  const api = useOperationalApi();
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [niches, setNiches] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [newNiche, setNewNiche] = useState({
    nicheName: "",
    hook: "",
    callToAction: "",
  });

  // 1. Carregar configurações ao abrir
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get("/leads/automation/settings");
        setIsAiEnabled(res.data.is_ai_enabled);
      } catch (err) {
        console.error("Erro ao carregar settings", err);
      }
    };
    fetchSettings();
    loadNiches();
  }, []);

  // 2. CORREÇÃO DAS ROTAS (Adicionado /leads/ antes de /niches)
  const loadNiches = async () => {
    try {
      const res = await api.get("/leads/niches");
      setNiches(res.data);
    } catch (error) {
      console.error("Erro ao carregar nichos", error);
    }
  };

  const startEdit = (niche) => {
    setEditingId(niche.id);
    setNewNiche({
      nicheName: niche.nicheName,
      hook: niche.hook,
      callToAction: niche.callToAction,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewNiche({ nicheName: "", hook: "", callToAction: "" });
  };

  const handleSaveNiche = async () => {
    const nichePayload = {
      nicheName: newNiche.nicheName.trim(),
      hook: newNiche.hook.trim(),
      callToAction: newNiche.callToAction.trim(),
    };

    if (
      !nichePayload.nicheName ||
      !nichePayload.hook ||
      !nichePayload.callToAction
    ) {
      return alert("Preencha o nome, o hook e o CTA!");
    }

    try {
      // CORREÇÃO: Rota correta /leads/niches
      await api.post("/leads/niches", nichePayload);
      setNewNiche({ nicheName: "", hook: "", callToAction: "" });
      setEditingId(null);
      alert(
        editingId ? "✅ Estratégia atualizada!" : "🎯 Novo nicho cadastrado!",
      );
      loadNiches();
    } catch {
      alert("Erro ao salvar nicho.");
    }
  };

  const handleDeleteNiche = async (id) => {
    if (window.confirm("Deseja realmente remover esta estratégia?")) {
      try {
        // CORREÇÃO: Rota correta /leads/niches
        await api.delete(`/leads/niches/${id}`);
        if (editingId === id) cancelEdit();
        loadNiches();
      } catch {
        alert("Erro ao deletar nicho.");
      }
    }
  };

  const handleSaveGlobal = async () => {
    setLoading(true);
    try {
      await api.patch("/leads/automation/settings", {
        is_ai_enabled: isAiEnabled,
      });
      alert("🔥 Configurações globais atualizadas!");
    } catch {
      alert("Erro ao salvar configurações.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-10 max-w-[900px] mx-auto animate-in slide-in-from-bottom-4 duration-500 pb-20">
      <h1 className="text-4xl font-black tracking-tighter mb-2">
        Configurações
      </h1>
      <p className="text-slate-400 mb-10 font-medium">
        Gerencie a inteligência e as estratégias do LeadHunt.
      </p>

      <div className="space-y-8">
        {/* LABORATÓRIO DE NICHOS */}
        <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-200">
                <Target size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800">
                  {editingId ? "Editando Estratégia" : "Laboratório de Nichos"}
                </h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                  Ganchos de venda personalizados para a IA
                </p>
              </div>
            </div>
            {editingId && (
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1 text-[10px] font-black uppercase text-red-500 bg-red-50 px-3 py-1 rounded-full"
              >
                <X size={12} /> Cancelar Edição
              </button>
            )}
          </div>

          {/* Form */}
          <div
            className={`grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 p-6 rounded-[2.5rem] border transition-all duration-500 ${editingId ? "bg-blue-50/50 border-blue-200 shadow-inner" : "bg-slate-50 border-slate-100"}`}
          >
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2">
                Nicho
              </label>
              <input
                className="w-full p-4 rounded-xl border-none outline-none font-bold text-sm shadow-sm"
                value={newNiche.nicheName}
                onChange={(e) =>
                  setNewNiche({ ...newNiche, nicheName: e.target.value })
                }
                placeholder="Ex: Dentistas"
                disabled={!!editingId}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2">
                Hook
              </label>
              <textarea
                className="w-full p-4 rounded-xl border-none outline-none font-bold text-sm h-14 shadow-sm resize-none"
                value={newNiche.hook}
                onChange={(e) =>
                  setNewNiche({ ...newNiche, hook: e.target.value })
                }
                placeholder="O que focar..."
              />
            </div>
            <div className="flex items-end gap-2 my-auto">
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">
                  CTA
                </label>
                <input
                  className="w-full p-4 rounded-xl border-none outline-none font-bold text-sm shadow-sm"
                  value={newNiche.callToAction}
                  onChange={(e) =>
                    setNewNiche({ ...newNiche, callToAction: e.target.value })
                  }
                  placeholder="Pergunta final..."
                />
              </div>
              <button
                onClick={handleSaveNiche}
                className={`${editingId ? "bg-green-500 hover:bg-green-600" : "bg-blue-600 hover:bg-blue-700"} text-white p-4 rounded-xl transition-all shadow-md active:scale-95`}
              >
                {editingId ? <Save size={20} /> : <Plus size={20} />}
              </button>
            </div>
          </div>

          {/* Listagem */}
          <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
            {niches.length > 0 ? (
              niches.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-center justify-between p-5 border rounded-[1.5rem] transition-all group shadow-sm ${editingId === n.id ? "bg-blue-50 border-blue-300" : "bg-white border-slate-100"}`}
                >
                  <div className="flex-1">
                    <h4 className="font-black text-slate-800 flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${editingId === n.id ? "bg-green-500 animate-pulse" : "bg-blue-500"}`}
                      ></span>
                      {n.nicheName}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed italic line-clamp-1">
                      "{n.hook}"
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(n)}
                      className="p-2 text-slate-300 hover:text-blue-500 transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteNiche(n.id)}
                      className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-slate-400 py-10 font-bold italic">
                Nenhum nicho cadastrado ainda.
              </p>
            )}
          </div>
        </div>

        {/* MASTER SWITCH IA */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-blue-100 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-2xl text-blue-500">
              <Sparkles size={24} />
            </div>
            <div>
              <h2 className="font-black text-lg text-slate-800">
                Cérebro Artificial
              </h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                Ativar geração de mensagens em massa
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsAiEnabled(!isAiEnabled)}
            className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 ${isAiEnabled ? "bg-blue-500" : "bg-slate-200"}`}
          >
            <div
              className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 ${isAiEnabled ? "translate-x-6" : "translate-x-0"}`}
            />
          </button>
        </div>

        <button
          onClick={handleSaveGlobal}
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full bg-black text-white p-5 rounded-2xl font-black hover:bg-slate-800 transition-all shadow-xl shadow-black/10 disabled:opacity-50"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
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
