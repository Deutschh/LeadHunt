const { OpenAI } = require("openai");
const db = require("../database/db");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ACTIVE_PROMPT_MODELS = {
  velaris_consultant: {
    version: "v3.1",
    label: "Consultor Velaris",
    weight: 45,
  },
  human_consultative: {
    version: "v3.0",
    label: "Humano consultivo",
    weight: 30,
  },
  aggressive_curiosity: {
    version: "v2.2",
    label: "Direto provocativo",
    weight: 25,
  },
};

const ANGLE_CONFIGS = {
  desalinhamento: {
    label: "Desalinhamento",
    weight: 55,
    instruction:
      "Mostre contraste entre a qualidade real da empresa e a forma como ela parece à primeira vista.",
  },
  percepcao_fraca: {
    label: "Percepção fraca",
    weight: 30,
    instruction:
      "Mostre que a primeira impressão pode estar enfraquecendo o valor real da empresa.",
  },
  curiosidade: {
    label: "Curiosidade",
    weight: 15,
    instruction:
      "Faça uma observação inesperada e específica que gere interesse imediato.",
  },
};

const OFFER_TYPES = {
  site: {
    label: "Site / Landing Page",
    instruction:
      "Direcione a abordagem para presença digital, clareza, primeira impressão e conversão de visitantes em contatos.",
  },
  social: {
    label: "Gestão de mídias sociais",
    instruction:
      "Direcione a abordagem para frequência, confiança, percepção visual, conteúdo e presença no Instagram.",
  },
  ads: {
    label: "Tráfego pago",
    instruction:
      "Direcione a abordagem para gerar mais procura, aparecer para pessoas certas e transformar atenção em orçamento.",
  },
  scheduling: {
    label: "Sistema de agendamento",
    instruction:
      "Direcione a abordagem para facilitar marcações, reduzir atrito no WhatsApp e organizar pedidos de orçamento.",
  },
  automation: {
    label: "Sistema de prospecção / automação",
    instruction:
      "Direcione a abordagem para empresas que podem vender para outras empresas, captar oportunidades e organizar prospecção.",
  },
};

function selectOfferForLead(lead) {
  const category =
    `${lead.lead_category || ""} ${lead.niche || ""}`.toLowerCase();

  if (
    category.includes("estética") ||
    category.includes("beleza") ||
    category.includes("salão") ||
    category.includes("barbearia") ||
    category.includes("odont")
  ) {
    return {
      type: "social",
      ...OFFER_TYPES.social,
      reason:
        "Negócios de estética, beleza e saúde dependem muito de confiança visual, frequência e percepção no Instagram.",
    };
  }

  if (
    category.includes("restaurante") ||
    category.includes("pizzaria") ||
    category.includes("hamburg") ||
    category.includes("cafeteria") ||
    category.includes("buffet")
  ) {
    return {
      type: "ads",
      ...OFFER_TYPES.ads,
      reason:
        "Negócios de alimentação e eventos costumam se beneficiar de procura local e campanhas para gerar pedidos ou reservas.",
    };
  }

  if (
    category.includes("limpeza") ||
    category.includes("lavanderia") ||
    category.includes("estofado") ||
    category.includes("tapete")
  ) {
    return {
      type: "scheduling",
      ...OFFER_TYPES.scheduling,
      reason:
        "Serviços locais com orçamento pelo WhatsApp tendem a ganhar com agendamento e organização do atendimento.",
    };
  }

  if (
    category.includes("advocacia") ||
    category.includes("arquitet") ||
    category.includes("imobili") ||
    category.includes("consultoria") ||
    category.includes("contabil")
  ) {
    return {
      type: "automation",
      ...OFFER_TYPES.automation,
      reason:
        "Empresas B2B ou consultivas podem usar prospecção organizada para encontrar novos clientes ou parceiros.",
    };
  }

  if (lead.has_website === false || lead.has_website === "false") {
    return {
      type: "site",
      ...OFFER_TYPES.site,
      reason:
        "A empresa não possui site identificado, então presença digital e conversão podem ser uma oportunidade inicial.",
    };
  }

  return {
    type: "social",
    ...OFFER_TYPES.social,
    reason:
      "Oferta geral mais leve para iniciar conversa sem parecer venda direta de site.",
  };
}

const HUMAN_CONSULTATIVE_ANGLES = {
  ideia_rapida: {
    label: "Ideia rápida",
    weight: 45,
    instruction:
      "Posicione a abordagem como uma ideia simples e rápida, sem compromisso.",
  },
  oportunidade_visual: {
    label: "Oportunidade visual",
    weight: 35,
    instruction:
      "Mostre que a empresa poderia transmitir melhor sua qualidade visualmente.",
  },
  percepcao_fraca: {
    label: "Percepção fraca",
    weight: 20,
    instruction:
      "Mostre de forma leve que a presença atual talvez não transmita todo o valor da empresa.",
  },
};

const VELARIS_CONSULTANT_ANGLES = {
  analise_estrategica: {
    label: "Análise estratégica",
    weight: 35,
    instruction:
      "Apresente a abordagem como uma análise estratégica simples da presença digital da empresa.",
  },
  confirmacao_empresa: {
    label: "Confirmação da empresa",
    weight: 25,
    instruction:
      "Comece confirmando se está falando com a empresa certa antes de apresentar a Velaris.",
  },
  percepcao_profissional: {
    label: "Percepção profissional",
    weight: 25,
    instruction:
      "Mostre que a Velaris ajuda empresas a transmitirem mais confiança antes do primeiro contato.",
  },
  convite_reuniao: {
    label: "Convite para conversa",
    weight: 15,
    instruction:
      "Conduza para uma conversa curta ou reunião rápida, sem parecer pressão comercial.",
  },
};

function pickWeightedFromConfig(config) {
  const entries = Object.entries(config);
  const totalWeight = entries.reduce(
    (sum, [, item]) => sum + Number(item.weight || 0),
    0,
  );

  let random = Math.random() * totalWeight;

  for (const [key, item] of entries) {
    random -= Number(item.weight || 0);

    if (random <= 0) {
      return key;
    }
  }

  return entries[0][0];
}

function getPromptModel() {
  const selectedModel = pickWeightedFromConfig(ACTIVE_PROMPT_MODELS);
  return {
    key: selectedModel,
    ...ACTIVE_PROMPT_MODELS[selectedModel],
  };
}

function buildAggressiveCuriosityPrompt({
  lead,
  strategy,
  selectedAngle,
  angleConfig,
  offer,
}) {
  return `
Você escreve mensagens de prospecção via WhatsApp como um humano real.

Seu único objetivo é fazer o lead responder.

LEAD:
Empresa: ${lead.name || "não informada"}
Cidade: ${lead.lead_city || lead.city || "não informada"}
Nicho: ${lead.lead_category || lead.niche || "não informado"}
Avaliações no Google: ${lead.reviews_count || 0}
Estratégia do nicho: ${strategy.hook}
CTA base: ${strategy.call_to_action}
OFERTA SUGERIDA:
Tipo: ${offer.label}
Motivo interno: ${offer.reason}
Direção da mensagem: ${offer.instruction}

MODELO:
Direto provocativo

ÂNGULO:
${selectedAngle}
${angleConfig.instruction}

REGRAS ABSOLUTAS:
- Escreva em português do Brasil
- Mensagem curta
- Linguagem humana, natural e direta
- NÃO parecer vendedor
- NÃO parecer IA
- NÃO usar saudação
- NÃO se apresentar
- NÃO usar assinatura
- NÃO usar emojis
- NÃO vender diretamente
- Pode mencionar a direção da oferta de forma leve, sem soar como proposta comercial
- NÃO usar palavras como "contratar", "pacote", "preço", "promoção"
- NÃO elogiar de forma exagerada
- Evite palavras como "incrível", "excelente", "maravilhoso"
- Prefira observações neutras ou levemente desconfortáveis
- A mensagem precisa parecer uma percepção real
- Criar curiosidade, leve incômodo ou sensação de oportunidade perdida
- Use exatamente "---" entre a parte 1 e a parte 2
- Parte 2 deve terminar com UMA pergunta curta
- NÃO adicionar nada depois da pergunta
- Máximo de 2 linhas por parte

ESTRUTURA:

Parte 1:
Observação curta, específica e forte sobre a empresa.

---
Parte 2:
Pergunta curta, provocativa, natural e fácil de responder.

Agora gere apenas a mensagem final.
`;
}

function buildHumanConsultativePrompt({
  lead,
  strategy,
  selectedAngle,
  angleConfig,
  offer,
}) {
  return `
Você escreve mensagens de prospecção via WhatsApp como um humano real, educado e consultivo.

Seu objetivo é fazer o lead responder sem sentir que recebeu uma mensagem automática.

LEAD:
Empresa: ${lead.name || "não informada"}
Cidade: ${lead.lead_city || lead.city || "não informada"}
Nicho: ${lead.lead_category || lead.niche || "não informado"}
Avaliações no Google: ${lead.reviews_count || 0}
Estratégia do nicho: ${strategy.hook}
CTA base: ${strategy.call_to_action}
OFERTA SUGERIDA:
Tipo: ${offer.label}
Motivo interno: ${offer.reason}
Direção da mensagem: ${offer.instruction}

MODELO:
Humano consultivo

ÂNGULO:
${selectedAngle}
${angleConfig.instruction}

REGRAS ABSOLUTAS:
- Escreva em português do Brasil
- Mensagem curta
- Linguagem natural, simples e humana
- Pode soar mais educado e próximo do que o modelo direto
- NÃO parecer vendedor
- NÃO parecer IA
- NÃO usar assinatura
- NÃO usar emojis
- Pode usar uma saudação curta e natural
- NÃO vender diretamente
- Pode mencionar a direção da oferta de forma leve, sem soar como proposta comercial
- NÃO usar palavras como "contratar", "pacote", "preço", "promoção"
- Evite exageros como "incrível", "excelente", "maravilhoso"
- Não invente dados específicos que não foram informados
- Não diga que analisou profundamente
- Não diga que trabalha com tráfego pago
- Não pressione
- Não critique diretamente a empresa
- Não prometa resultado
- Use no máximo 4 linhas no total
- Use exatamente "---" entre a parte 1 e a parte 2
- A parte 1 pode ter uma saudação curta e uma microapresentação natural
- A parte 2 deve terminar com UMA pergunta simples
- NÃO adicionar nada depois da pergunta

FORMATO OBRIGATÓRIO:

Parte 1:
Uma mensagem humana com:
- menção ao contexto de ter visto a empresa no Google
- observação leve relacionada ao nicho, reputação ou percepção

---
Parte 2:
Uma pergunta simples pedindo permissão para mostrar uma ideia rápida.

EXEMPLO DE ESTILO:
Boa tarde, tudo bem? Vi a ${lead.name || "empresa"} pelo Google enquanto olhava alguns negócios de ${lead.lead_category || lead.niche || "esse segmento"} em ${lead.lead_city || lead.city || "sua região"}.
Percebi que talvez dê para transformar melhor essa confiança em novos contatos.

---
Posso te mostrar uma ideia rápida do que pensei?

Agora gere apenas a mensagem final.
`;
}

function buildVelarisConsultantPrompt({
  lead,
  strategy,
  selectedAngle,
  angleConfig,
  offer,
}) {
  return `
Você escreve mensagens de prospecção via WhatsApp como um consultor real da Velaris Studio.

Seu objetivo é gerar confiança e fazer o lead responder, sem parecer automação, spam ou vendedor insistente.

LEAD:
Empresa: ${lead.name || "não informada"}
Cidade: ${lead.lead_city || lead.city || "não informada"}
Nicho: ${lead.lead_category || lead.niche || "não informado"}
Avaliações no Google: ${lead.reviews_count || 0}
Estratégia do nicho: ${strategy.hook}
CTA base: ${strategy.call_to_action}
OFERTA SUGERIDA:
Tipo: ${offer.label}
Motivo interno: ${offer.reason}
Direção da mensagem: ${offer.instruction}

MODELO:
Consultor Velaris

ÂNGULO:
${selectedAngle}
${angleConfig.instruction}

REGRAS ABSOLUTAS:
- Escreva em português do Brasil
- Linguagem humana, educada e profissional
- Parecer uma pessoa real de uma empresa real
- Pode se apresentar como Guilherme, consultor da Velaris Studio
- A mensagem deve conversar com a oferta sugerida sem parecer uma venda direta
- Evite frases começando com "podemos", "consigo", "ofereço" ou "trabalho com"
- A mensagem deve parecer uma observação antes de parecer uma oferta
- Fale primeiro da percepção do negócio, não da solução da Velaris
- NÃO parecer IA
- NÃO parecer spam
- NÃO usar emojis
- NÃO prometer resultado
- NÃO exagerar elogios
- NÃO usar textão
- NÃO usar palavras muito agressivas como "perdendo dinheiro" ou "seus concorrentes estão ganhando"
- Pode usar "presença digital", "percepção", "estrutura", "clareza" e "conversão"
- Use exatamente "---" entre a parte 1 e a parte 2
- Parte 1 deve ter no máximo 3 linhas
- Parte 2 deve ter no máximo 2 linhas
- A parte 2 deve terminar com UMA pergunta simples
- NÃO adicionar nada depois da pergunta

ESTRUTURA:

Parte 1:
Mensagem educada com:
- saudação curta
- apresentação como Guilherme da Velaris Studio
- contexto de que viu a empresa no Google ou estava analisando empresas da região

---
Parte 2:
Pergunta simples pedindo permissão para mostrar uma percepção rápida, sem vender diretamente.

EXEMPLO DE ESTILO:
Boa tarde, tudo bem? Sou o Guilherme, consultor da Velaris Studio.
Vi a ${lead.name || "empresa"} pelo Google enquanto analisava alguns negócios de ${lead.lead_category || lead.niche || "esse segmento"} em ${lead.lead_city || lead.city || "sua região"}.

---
Percebi um ponto visual que talvez influencie a confiança antes do primeiro contato. Posso te mostrar rapidamente?

Agora gere apenas a mensagem final.
`;
}

async function generateLeadMessage(lead) {
  const promptModel = getPromptModel();
  const offer = selectOfferForLead(lead);

  const angleSource =
    promptModel.key === "velaris_consultant"
      ? VELARIS_CONSULTANT_ANGLES
      : promptModel.key === "human_consultative"
        ? HUMAN_CONSULTATIVE_ANGLES
        : ANGLE_CONFIGS;

  const selectedAngle = pickWeightedFromConfig(angleSource);
  const angleConfig = angleSource[selectedAngle];

  try {
    const strategyRes = await db.query(
      "SELECT hook, call_to_action FROM niche_strategies WHERE niche_name = $1",
      [lead.lead_category],
    );

    const strategy = strategyRes.rows[0] || {
      hook: "melhorar a percepção digital e atrair novos clientes",
      call_to_action: "Isso já passou pela sua cabeça?",
    };

    let prompt;

    if (promptModel.key === "velaris_consultant") {
      prompt = buildVelarisConsultantPrompt({
        lead,
        strategy,
        selectedAngle,
        angleConfig,
        offer,
      });
    } else if (promptModel.key === "human_consultative") {
      prompt = buildHumanConsultativePrompt({
        lead,
        strategy,
        selectedAngle,
        angleConfig,
        offer,
      });
    } else {
      prompt = buildAggressiveCuriosityPrompt({
        lead,
        strategy,
        selectedAngle,
        angleConfig,
        offer,
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature:
        promptModel.key === "velaris_consultant"
          ? 0.65
          : promptModel.key === "human_consultative"
            ? 0.75
            : 0.9,
    });

    const message = response.choices[0].message.content.trim();

    return {
      message,
      meta: {
        angle: `${promptModel.key}:${selectedAngle}`,
        angle_label: `${promptModel.label} · ${angleConfig.label}`,
        angle_weight: angleConfig.weight,
        version: promptModel.version,

        offer_type: offer.type,
        offer_label: offer.label,
        offer_reason: offer.reason,
        message_type: `${offer.type}:${promptModel.key}:${selectedAngle}`,
      },
    };
  } catch (error) {
    console.error("❌ Erro na geração da IA:", error.message);

    return {
      message: `Boa tarde, tudo bem? Vi a ${lead.name || "empresa"} pelo Google e achei que talvez desse para melhorar a forma como ela aparece para novos clientes.
---
Posso te mostrar uma ideia rápida?`,
      meta: {
        angle: "fallback",
        angle_label: "Fallback",
        angle_weight: 0,
        version: "fallback",

        offer_type: offer?.type || "social",
        offer_label: offer?.label || "Gestão de mídias sociais",
        offer_reason:
          offer?.reason ||
          "Fallback seguro para iniciar conversa sem vender site diretamente.",
        message_type: `${offer?.type || "social"}:fallback`,
      },
    };
  }
}

module.exports = {
  generateLeadMessage,
  ANGLE_CONFIGS,
  HUMAN_CONSULTATIVE_ANGLES,
  VELARIS_CONSULTANT_ANGLES,
  ACTIVE_PROMPT_MODELS,
};
