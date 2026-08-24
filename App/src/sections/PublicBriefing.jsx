import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Instagram,
  MessageCircle,
  Sparkles,
  Diamond,
  Target,
  TrendingUp,
  ShieldCheck,
  Loader2,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import {
  getPublicBriefing,
  submitPublicBriefing,
} from "../services/publicBriefingApi.js";

const initialForm = {
  business_name: "",
  instagram: "",
  whatsapp: "",
  city: "",
  weekly_clients: "",
  main_services: "",
  most_profitable_service: "",
  differential: "",
  target_audience: "",
  biggest_problem: "",
  investment_range: "",
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
  const { publicToken } = useParams();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [linkState, setLinkState] = useState("loading");

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    setLinkState("loading");
    setForm(initialForm);
    setSent(false);
    setLoading(false);

    const validateLink = async () => {
      try {
        const response = await getPublicBriefing(publicToken, {
          signal: controller.signal,
        });

        if (!isCurrent || controller.signal.aborted) return;

        setLinkState(response.status === 204 ? "valid" : "error");
      } catch (error) {
        if (
          !isCurrent ||
          controller.signal.aborted ||
          error?.code === "ERR_CANCELED"
        ) {
          return;
        }

        setLinkState(
          error.response?.status === 404 ? "unavailable" : "error",
        );
      }
    };

    validateLink();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [publicToken]);

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

    if (linkState !== "valid" || loading || sent) return;

    if (!form.business_name.trim()) {
      alert("Informe o nome da empresa.");
      return;
    }

    try {
      setLoading(true);

      const response = await submitPublicBriefing(publicToken, form);

      if (response.status !== 201 || response.data?.success !== true) {
        throw new Error("Resposta inesperada ao enviar briefing.");
      }

      setSent(true);
    } catch (error) {
      if (error.response?.status === 404) {
        setLinkState("unavailable");
        return;
      }

      if (error.response?.status === 400) {
        alert("Revise os dados do briefing e tente novamente.");
        return;
      }

      alert("Não foi possível enviar o briefing. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-[#080B0D] text-[#F2F2F4] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute w-[420px] h-[420px] bg-white/10 blur-[140px] rounded-full -top-32 right-10" />
        <div className="absolute w-[320px] h-[320px] bg-white/5 blur-[120px] rounded-full bottom-0 left-0" />

        <div className="relative bg-[#111315]/90 rounded-[3rem] p-10 max-w-xl w-full text-center border border-white/10 shadow-2xl">
          <div className="w-20 h-20 rounded-[2rem] bg-white text-black flex items-center justify-center mx-auto mb-6 shadow-[0_0_45px_rgba(255,255,255,0.18)]">
            <CheckCircle2 size={38} />
          </div>

          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/45 mb-3">
            Briefing enviado
          </p>

          <h1 className="font-serif text-4xl tracking-tight text-white mb-4">
            Recebemos suas informações.
          </h1>

          <p className="text-white/55 font-medium leading-relaxed">
            Agora vamos analisar tudo com cuidado para preparar uma proposta
            mais alinhada com a percepção, posicionamento e realidade da sua
            empresa.
          </p>
        </div>
      </div>
    );
  }

  if (linkState === "loading") {
    return (
      <BriefingStatusScreen
        icon={<Loader2 size={38} className="animate-spin" />}
        eyebrow="Validando link"
        title="Preparando seu briefing."
        description="Aguarde enquanto verificamos se este link ainda está disponível."
      />
    );
  }

  if (linkState === "unavailable") {
    return (
      <BriefingStatusScreen
        icon={<AlertCircle size={38} />}
        eyebrow="Link indisponível"
        title="Este briefing não está mais disponível."
        description="Solicite um novo link à pessoa que o enviou."
      />
    );
  }

  if (linkState === "error") {
    return (
      <BriefingStatusScreen
        icon={<AlertTriangle size={38} />}
        eyebrow="Não foi possível carregar"
        title="Tivemos um problema de conexão."
        description="Verifique sua conexão e recarregue a página para tentar novamente."
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#080B0D] text-[#F2F2F4] relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.08),transparent_32%),radial-gradient(circle_at_10%_70%,rgba(255,255,255,0.045),transparent_30%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[length:100%_120px] opacity-20" />

      <header className="relative max-w-6xl mx-auto px-6 py-10 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-5">
          <div className="w-12 h-12 rounded-full border border-white/15 flex items-center justify-center text-white font-serif text-xl">
            L
          </div>

          <div>
            <div className="font-serif text-3xl tracking-[0.55em] uppercase">
              LeadHunt
            </div>
            <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/35 mt-1">
              Presença digital premium
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
          <Sparkles size={14} />
          Briefing inteligente
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-6 py-14">
        <section className="grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-10 items-start">
          <aside className="lg:sticky lg:top-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.03] text-white/55 text-[10px] font-black uppercase tracking-[0.25em] mb-8">
              <Sparkles size={14} />
              Antes do projeto
            </div>

            <h1 className="font-serif text-5xl md:text-6xl tracking-tight leading-[0.95] mb-7 text-white">
              Vamos entender a essência da sua empresa.
            </h1>

            <p className="text-white/52 font-medium leading-relaxed mb-10 max-w-xl">
              Esse briefing é rápido e ajuda a LeadHunt a criar uma análise,
              preview ou proposta com mais clareza, sofisticação e direção
              estratégica.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-8">
              <EssenceCard icon={<Target size={18} />} title="Clareza" />
              <EssenceCard icon={<TrendingUp size={18} />} title="Conversão" />
              <EssenceCard icon={<ShieldCheck size={18} />} title="Confiança" />
              <EssenceCard icon={<Diamond size={18} />} title="Premium" />
            </div>

            <div className="bg-[#111315]/80 backdrop-blur-xl text-white rounded-[2.5rem] p-8 border border-white/10 shadow-2xl relative overflow-hidden">
              <div className="absolute w-40 h-40 rounded-full bg-white/10 blur-[80px] -right-10 -bottom-10" />

              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35 mb-5">
                Por que responder?
              </p>

              <div className="space-y-4 text-sm text-white/60 font-medium leading-relaxed">
                <p>• Evita ideias genéricas.</p>
                <p>• Ajuda a destacar os serviços certos.</p>
                <p>• Deixa a proposta mais precisa.</p>
                <p>• Facilita a criação de um preview mais profissional.</p>
              </div>
            </div>
          </aside>

          <form
            onSubmit={handleSubmit}
            className="bg-[#111315]/90 backdrop-blur-xl rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="p-10 border-b border-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/35 mb-3">
                Diagnóstico inicial
              </p>

              <h2 className="font-serif text-4xl tracking-tight text-white">
                Informações principais
              </h2>

              <p className="text-white/42 text-sm font-medium mt-3">
                Responda de forma simples. O importante é entendermos o que faz
                sua empresa ser única.
              </p>
            </div>

            <div className="p-10 space-y-8">
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField label="Quantos clientes você atende por semana?">
                  <input
                    value={form.weekly_clients}
                    onChange={(e) =>
                      updateField("weekly_clients", e.target.value)
                    }
                    placeholder="Ex: 10, 25, 50..."
                    className="input-briefing"
                  />
                </FormField>

                <FormField label="Faixa de investimento confortável (opcional)">
                  <select
                    value={form.investment_range}
                    onChange={(e) =>
                      updateField("investment_range", e.target.value)
                    }
                    className="input-briefing"
                  >
                    <option value="">Selecionar</option>
                    <option>Até R$300/mês</option>
                    <option>R$300 a R$600/mês</option>
                    <option>R$600 a R$1.000/mês</option>
                    <option>Acima de R$1.000/mês</option>
                    <option>Prefiro conversar sobre isso</option>
                  </select>
                </FormField>
              </div>

              <FormField label="Quais são os principais serviços da empresa?">
                <textarea
                  value={form.main_services}
                  onChange={(e) => updateField("main_services", e.target.value)}
                  placeholder="Ex: limpeza de estofados, higienização de colchões, impermeabilização..."
                  className="input-briefing min-h-[120px] resize-none"
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
                  className="input-briefing min-h-[110px] resize-none"
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

              <FormField label="Qual é a maior dificuldade hoje para conseguir mais clientes?">
                <textarea
                  value={form.biggest_problem}
                  onChange={(e) =>
                    updateField("biggest_problem", e.target.value)
                  }
                  placeholder="Ex: pouca visibilidade, Instagram parado, clientes pedem preço e somem..."
                  className="input-briefing min-h-[110px] resize-none"
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
                            ? "bg-white text-black border-white shadow-[0_0_30px_rgba(255,255,255,0.08)]"
                            : "bg-white/[0.03] border-white/10 text-white/55 hover:bg-white/[0.06] hover:text-white"
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
                  className="input-briefing min-h-[110px] resize-none"
                />
              </FormField>

              <FormField label="Observações finais">
                <textarea
                  value={form.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder="Algo importante que você queira que a gente saiba?"
                  className="input-briefing min-h-[120px] resize-none"
                />
              </FormField>
            </div>

            <div className="p-10 bg-white/[0.025] border-t border-white/10 flex flex-col md:flex-row gap-5 md:items-center md:justify-between">
              <p className="text-xs text-white/38 font-bold max-w-md leading-relaxed">
                Ao enviar, suas respostas serão usadas apenas para preparar uma
                análise mais alinhada ao seu negócio.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="bg-[#F2F2F4] text-black px-8 py-5 rounded-full font-black text-sm flex items-center justify-center gap-3 hover:bg-white hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60 shadow-[0_0_35px_rgba(255,255,255,0.12)]"
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
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.08);
          outline: none;
          font-weight: 700;
          color: #F2F2F4;
          transition: all .2s ease;
        }

        .input-briefing::placeholder {
          color: rgba(255,255,255,0.24);
        }

        .input-briefing:focus {
          border-color: rgba(255,255,255,0.22);
          background: rgba(255,255,255,0.055);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.04);
        }

        .label-briefing {
          display: block;
          margin-left: 0.5rem;
          margin-bottom: 0.65rem;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.24em;
          color: rgba(255,255,255,0.42);
        }
      `}</style>
    </div>
  );
}

function BriefingStatusScreen({ icon, eyebrow, title, description }) {
  return (
    <div className="min-h-screen bg-[#080B0D] text-[#F2F2F4] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute w-[420px] h-[420px] bg-white/10 blur-[140px] rounded-full -top-32 right-10" />
      <div className="absolute w-[320px] h-[320px] bg-white/5 blur-[120px] rounded-full bottom-0 left-0" />

      <div className="relative bg-[#111315]/90 rounded-[3rem] p-10 max-w-xl w-full text-center border border-white/10 shadow-2xl">
        <div className="w-20 h-20 rounded-[2rem] bg-white text-black flex items-center justify-center mx-auto mb-6 shadow-[0_0_45px_rgba(255,255,255,0.18)]">
          {icon}
        </div>

        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/45 mb-3">
          {eyebrow}
        </p>

        <h1 className="font-serif text-4xl tracking-tight text-white mb-4">
          {title}
        </h1>

        <p className="text-white/55 font-medium leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function EssenceCard({ icon, title }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-5 flex items-center gap-3">
      <div className="w-10 h-10 rounded-2xl border border-white/10 flex items-center justify-center text-white/55">
        {icon}
      </div>
      <p className="font-serif text-lg text-white/85">{title}</p>
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
