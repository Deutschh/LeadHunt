import React, { useState, useEffect } from "react";
import axios from "axios";
import { ShieldCheck, Save, Code } from "lucide-react";

const Configs = () => {
  const [tags, setTags] = useState("h1.DUwDvf.lfPIob, h1.DUwDve, .lfPiob");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await axios.post("http://localhost:3001/settings/selectors", { tags });
      alert("🔥 Robô treinado! Novos seletores aplicados.");
    } catch (error) {
      alert("Erro ao salvar seletores.");
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
          <label className="text-xs font-black text-slate-500 uppercase tracking-tighter ml-1">
            Tags de Identificação (Separe por vírgula)
          </label>
          <textarea
            className="w-full h-32 p-4 bg-slate-50 border-none rounded-2xl font-mono text-sm focus:ring-2 focus:ring-orange-500 transition-all outline-none"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Ex: h1.DUwDvf.lfPIob, .lfPiob, h1"
          />

          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full bg-black text-white p-4 rounded-2xl font-black hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <Save size={20} />
            )}
            {loading ? "SALVANDO..." : "SALVAR NOVAS DIRETRIZES"}
          </button>
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-2xl flex gap-4 items-start border border-blue-100">
          <ShieldCheck className="text-blue-500 shrink-0" size={20} />
          <p className="text-blue-700 text-[11px] font-bold leading-relaxed">
            DICA: Se o robô parar de ler os nomes, inspecione o Google Maps,
            encontre a classe do título (H1) e adicione-a acima sem apagar as
            outras.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Configs;
