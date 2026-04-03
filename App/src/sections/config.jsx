import React, { useState, useEffect } from "react";
import axios from "axios";
import { ShieldCheck, Save, Code, Sparkles } from "lucide-react"; // Adicionado Sparkles

const Configs = () => {
  const [tags, setTags] = useState("h1.DUwDvf.lfPIob, h1.DUwDve, .lfPiob");
  const [isAiEnabled, setIsAiEnabled] = useState(false); // NOVO ESTADO
  const [loading, setLoading] = useState(false);

  // Busca as configurações atuais ao abrir
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await axios.get(
          "http://localhost:3001/api/leads/automation/settings",
        );
        setIsAiEnabled(res.data.is_ai_enabled);
      } catch (err) {
        console.error("Erro ao carregar settings");
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      // Salva os seletores (seu endpoint antigo)
      await axios.post("http://localhost:3001/settings/selectors", { tags });

      // Salva o Master Switch da IA (nosso novo endpoint)
      await axios.patch("http://localhost:3001/api/leads/automation/settings", {
        is_ai_enabled: isAiEnabled,
      });

      alert("🔥 Configurações atualizadas com sucesso!");
    } catch (error) {
      alert("Erro ao salvar configurações.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-10 max-w-[800px] animate-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-4xl font-black tracking-tighter mb-2">
        Configurações
      </h1>
      <p className="text-slate-400 mb-10 font-medium">
        Gerencie a inteligência do LeadHunt.
      </p>

      <div className="space-y-6">
        {/* SEÇÃO IA (NOVA) */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-blue-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 rounded-2xl text-blue-500">
                <Sparkles size={24} />
              </div>
              <div>
                <h2 className="font-black text-lg text-slate-800">
                  Cérebro Artificial
                </h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                  Geração de mensagens personalizadas
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <button
              onClick={() => setIsAiEnabled(!isAiEnabled)}
              className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 ${isAiEnabled ? "bg-blue-500" : "bg-slate-200"}`}
            >
              <div
                className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform duration-300 ${isAiEnabled ? "translate-x-6" : "translate-x-0"}`}
              />
            </button>
          </div>
        </div>

        {/* SEÇÃO SELETORES (SUA EXISTENTE) */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-orange-50 rounded-2xl text-orange-500">
              <Code size={24} />
            </div>
            <div>
              <h2 className="font-black text-lg text-slate-800">
                Treinamento de Campo
              </h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                Ajuste de Seletores Google Maps
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <textarea
              className="w-full h-32 p-4 bg-slate-50 border-none rounded-2xl font-mono text-sm focus:ring-2 focus:ring-orange-500 outline-none"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />

            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center justify-center gap-2 w-full bg-black text-white p-4 rounded-2xl font-black hover:bg-slate-800 transition-all disabled:opacity-50"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <Save size={20} />
              )}
              {loading ? "SALVANDO..." : "SALVAR NOVAS DIRETRIZES"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Configs;
