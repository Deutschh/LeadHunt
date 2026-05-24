import React, { useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Instagram,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import api from "../services/api";

const initialForm = {
  business_name: "",
  instagram: "",
  whatsapp: "",
  city: "",
  main_services: "",
  most_profitable_service: "",
  differential: "",
  target_audience: "",
  goals: [],
  brand_colors: "",
  references_text: "",
  notes: "",
};

const GOALS = [
  "Atrair mais clientes",
  "Melhorar presença digital",
  "Organizar o Instagram",
  "Criar ou melhorar site",
  "Aumentar agendamentos",
  "Transmitir mais confiança",
  "Começar tráfego pago",
  "Melhorar atendimento no WhatsApp",
];

export default function PublicBriefing() {
  const { leadId } = useParams();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleGoal = (goal) => {
    setForm((prev) => ({
      ...prev,
      goals: prev.goals.includes(goal)
        ? prev.goals.filter((item) => item !== goal)
        : [...prev.goals, goal],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.business_name.trim()) {
      alert("Informe o nome da empresa.");
      return;
    }

    try {
      setLoading(true);

      await api.post("/briefings", {
        lead_id: leadId || null,
        ...form,
      });

      setSent(true);
    } catch (err) {
      console.error(err);
      alert("Não foi possível enviar o briefing. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white rounded-[3rem] p-10 max-w-xl w-full text-center border border-slate-100 shadow-xl">
          <div className="w-20 h-20 rounded-[2rem] bg-green-50 text-green-600 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={38} />
          </div>

          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-green-600 mb-3">
            Briefing enviado
          </p>

          <h1 className="text-3xl font-black tracking-tight text-slate-950 mb-4">
            Recebemos suas informações.
          </h1>

          <p className="text-slate-500 font-medium leading-relaxed">
            Agora vamos analisar tudo com cuidado para preparar algo mais
            alinhado com a realidade da sua empresa.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-950">
      <header className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between">
        <div className="font-black tracking-[0.3em] uppercase text-sm">
          Velaris
        </div>

        <div className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          <Sparkles size={14} />
          Briefing inteligente
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-16">
        <section className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-8 items-start">
          <div className="lg:sticky lg:top-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-[0.2em] mb-6">
              <Sparkles size={14} />
              Antes do projeto
            </div>

            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[0.95] mb-6">
              Vamos entender melhor a sua empresa.
            </h1>

            <p className="text-slate-500 font-medium leading-relaxed mb-8">
              Esse briefing é rápido e ajuda a Velaris a criar uma análise,
              preview ou proposta mais alinhada com o seu negócio, seu público e
              seus objetivos.
            </p>

            <div className="bg-slate-950 text-white rounded-[2.5rem] p-7 shadow-2xl">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300 mb-4">
                Por que responder?
              </p>

              <div className="space-y-4 text-sm text-white/70 font-medium">
                <p>• Evita ideias genéricas.</p>
                <p>• Ajuda a destacar seus serviços certos.</p>
                <p>• Deixa a proposta mais precisa.</p>
                <p>• Facilita a criação de um preview mais profissional.</p>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden"
          >
            <div className="p-8 border-b border-slate-100">
              <h2 className="text-2xl font-black tracking-tight">
                Informações principais
              </h2>
              <p className="text-slate-400 text-sm font-medium mt-1">
                Responda de forma simples. Não precisa escrever textos grandes.
              </p>
            </div>

            <div className="p-8 space-y-6">
              <FormField label="Nome da empresa">
                <input
                  value={form.business_name}
                  onChange={(e) => updateField("business_name", e.target.value)}
                  placeholder="Ex: Clínica Essence"
                  className="input-briefing"
                />
              </FormField>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField label="Instagram">
                  <div className="relative">
                    <Instagram
                      size={17}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
                    />
                    <input
                      value={form.instagram}
                      onChange={(e) => updateField("instagram", e.target.value)}
                      placeholder="@empresa"
                      className="input-briefing pl-11"
                    />
                  </div>
                </FormField>

                <FormField label="WhatsApp">
                  <div className="relative">
                    <MessageCircle
                      size={17}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
                    />
                    <input
                      value={form.whatsapp}
                      onChange={(e) => updateField("whatsapp", e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="input-briefing pl-11"
                    />
                  </div>
                </FormField>
              </div>

              <FormField label="Cidade / Região">
                <input
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                  placeholder="Ex: Jundiaí - SP"
                  className="input-briefing"
                />
              </FormField>

              <FormField label="Quais são os principais serviços da empresa?">
                <textarea
                  value={form.main_services}
                  onChange={(e) => updateField("main_services", e.target.value)}
                  placeholder="Ex: limpeza de estofados, higienização de colchões, impermeabilização..."
                  className="input-briefing min-h-[110px] resize-none"
                />
              </FormField>

              <FormField label="Qual serviço você mais gostaria de vender?">
                <input
                  value={form.most_profitable_service}
                  onChange={(e) =>
                    updateField("most_profitable_service", e.target.value)
                  }
                  placeholder="Ex: limpeza de sofá, pacote mensal, avaliação estética..."
                  className="input-briefing"
                />
              </FormField>

              <FormField label="Qual é o principal diferencial da empresa?">
                <textarea
                  value={form.differential}
                  onChange={(e) => updateField("differential", e.target.value)}
                  placeholder="Ex: atendimento rápido, experiência, produtos premium, atendimento humanizado..."
                  className="input-briefing min-h-[100px] resize-none"
                />
              </FormField>

              <FormField label="Qual público você quer atrair?">
                <input
                  value={form.target_audience}
                  onChange={(e) =>
                    updateField("target_audience", e.target.value)
                  }
                  placeholder="Ex: clientes de alto padrão, famílias, empresas, mulheres de 25 a 45 anos..."
                  className="input-briefing"
                />
              </FormField>

              <div>
                <label className="label-briefing">Objetivos principais</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {GOALS.map((goal) => {
                    const active = form.goals.includes(goal);

                    return (
                      <button
                        key={goal}
                        type="button"
                        onClick={() => toggleGoal(goal)}
                        className={`text-left p-4 rounded-2xl border text-sm font-bold transition-all ${
                          active
                            ? "bg-blue-50 border-blue-200 text-blue-700"
                            : "bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        {goal}
                      </button>
                    );
                  })}
                </div>
              </div>

              <FormField label="Cores da marca">
                <input
                  value={form.brand_colors}
                  onChange={(e) => updateField("brand_colors", e.target.value)}
                  placeholder="Ex: preto e dourado, azul e branco..."
                  className="input-briefing"
                />
              </FormField>

              <FormField label="Referências ou links importantes">
                <textarea
                  value={form.references_text}
                  onChange={(e) =>
                    updateField("references_text", e.target.value)
                  }
                  placeholder="Pode colocar links de Instagram, sites, concorrentes ou referências visuais."
                  className="input-briefing min-h-[100px] resize-none"
                />
              </FormField>

              <FormField label="Observações finais">
                <textarea
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder="Algo importante que você queira que a gente saiba?"
                  className="input-briefing min-h-[110px] resize-none"
                />
              </FormField>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
              <p className="text-xs text-slate-400 font-bold max-w-md">
                Ao enviar, suas respostas serão usadas apenas para preparar uma
                análise mais alinhada ao seu negócio.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="bg-slate-950 text-white px-8 py-5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60"
              >
                {loading ? "Enviando..." : "Enviar briefing"}
                <ArrowRight size={18} />
              </button>
            </div>
          </form>
        </section>
      </main>

      <style>{`
        .input-briefing {
          width: 100%;
          padding: 1rem;
          border-radius: 1rem;
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          outline: none;
          font-weight: 700;
          color: #0f172a;
        }

        .input-briefing:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
        }

        .label-briefing {
          display: block;
          margin-left: 0.5rem;
          margin-bottom: 0.5rem;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #94a3b8;
        }
      `}</style>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div>
      <label className="label-briefing">{label}</label>
      {children}
    </div>
  );
}
