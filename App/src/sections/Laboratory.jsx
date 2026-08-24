import React, { useEffect, useState } from "react";
import { Sparkles, Plus } from "lucide-react";
import { renderPreviewTemplate } from "../templates/core/renderPreviewTemplate";
import PreviewCard from "../components/Laboratory/PreviewCard";
import CreatePreviewModal from "../components/Laboratory/CreatePreviewModal";
import { getPreviews, createPreview } from "../services/previewService";
import useOperationalApi from "../hooks/useOperationalApi.js";

const initialForm = {
  project_name: "",
  niche: "Clínica de Estética",
  city: "",
  template_key: "esthetic-premium",
  whatsapp: "",
  instagram: "",
  primary_color: "#ffffff",
  headline: "",
  subheadline: "",
};

export default function Laboratory() {
  const api = useOperationalApi();
  const [previews, setPreviews] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [selectedPreview, setSelectedPreview] = useState(null);

  useEffect(() => {
    let current = true;

    const loadPreviews = async () => {
      try {
        const data = await getPreviews(api);
        if (!current) return;

        if (Array.isArray(data)) {
          setPreviews(data);
        } else if (Array.isArray(data.previews)) {
          setPreviews(data.previews);
        } else if (Array.isArray(data.data)) {
          setPreviews(data.data);
        } else {
          setPreviews([]);
        }
      } catch {
        if (current) setPreviews([]);
      }
    };

    void loadPreviews();
    return () => {
      current = false;
    };
  }, [api]);

  const handleCreatePreview = async () => {
    if (!form.project_name.trim()) {
      alert("Informe o nome da empresa.");
      return;
    }

    try {
      const createdPreview = await createPreview(api, form);

      setPreviews((prev) => [
        Array.isArray(createdPreview) ? createdPreview[0] : createdPreview,
        ...prev,
      ]);

      setForm(initialForm);
      setShowModal(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao criar preview.");
    }
  };

  if (selectedPreview) {
    return renderPreviewTemplate(selectedPreview, () =>
      setSelectedPreview(null),
    );
  }

  return (
    <div className="p-10 max-w-[1600px] mx-auto w-full animate-in fade-in duration-700">
      <div className="flex items-center justify-between mb-10">
        <div>
          <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-600 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-4">
            <Sparkles size={14} />
            Laboratório Velaris
          </div>

          <h1 className="text-4xl font-black tracking-tight text-slate-950">
            Gerador de Previews
          </h1>

          <p className="text-slate-400 font-medium mt-2 max-w-xl">
            Crie, organize e reutilize previews comerciais para enviar aos leads
            com mais velocidade.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bg-black text-white px-6 py-4 rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl hover:scale-105 active:scale-95 transition-all"
        >
          <Plus size={18} />
          Novo Preview
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        <LabStat label="Previews criados" value={previews.length} />
        <LabStat label="Templates ativos" value="3" />
        <LabStat label="Nicho principal" value="Estética" />
      </div>

      {previews.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {previews.map((preview) => (
            <PreviewCard
              key={preview.id}
              preview={preview}
              onOpen={() => setSelectedPreview(preview)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white/60 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center">
          <p className="text-slate-400 font-bold">
            Nenhum preview criado ainda.
          </p>
        </div>
      )}

      {showModal && (
        <CreatePreviewModal
          form={form}
          setForm={setForm}
          onClose={() => setShowModal(false)}
          onCreate={handleCreatePreview}
        />
      )}
    </div>
  );
}

function LabStat({ label, value }) {
  return (
    <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
        {label}
      </p>
      <p className="text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}
