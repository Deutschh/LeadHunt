const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MESSAGE_MODEL = process.env.OPENAI_MESSAGE_MODEL || "gpt-4o-mini";

/**
 * Mantemos três estilos de abordagem para continuar comparando
 * taxas de resposta, mas todos agora são neutros em relação
 * ao serviço que será oferecido.
 */
const ACTIVE_PROMPT_MODELS = {
  velaris_consultant: {
    version: "v4.0",
    label: "Consultor Velaris · Neutro",
    weight: 50,
  },

  human_consultative: {
    version: "v4.0",
    label: "Humano consultivo · Neutro",
    weight: 35,
  },

  aggressive_curiosity: {
    version: "v3.0",
    label: "Direto neutro",
    weight: 15,
  },
};

/**
 * Os ângulos agora determinam apenas o modo de iniciar
 * a conversa, não o serviço que será oferecido.
 */
const NEUTRAL_ANGLES = {
  contexto_google: {
    label: "Contexto Google",
    weight: 35,
    instruction:
      "Use como contexto o fato de a empresa ter sido encontrada no Google durante uma pesquisa por negócios do segmento na região.",
  },

  reputacao_observavel: {
    label: "Reputação observável",
    weight: 20,
    instruction:
      "Quando houver avaliações disponíveis, mencione esse dado de maneira neutra e factual, sem elogio exagerado e sem concluir que existe algum problema.",
  },

  conversa_comercial: {
    label: "Conversa comercial",
    weight: 25,
    instruction:
      "Conduza para uma pergunta curta sobre como a empresa recebe, organiza ou conquista novos clientes, sem sugerir uma solução.",
  },

  permissao_rapida: {
    label: "Permissão rápida",
    weight: 20,
    instruction:
      "Faça uma abertura muito simples e peça permissão para fazer uma pergunta rápida sobre o negócio.",
  },
};

/**
 * Mantidos como aliases para não quebrar possíveis imports antigos.
 */
const ANGLE_CONFIGS = NEUTRAL_ANGLES;
const HUMAN_CONSULTATIVE_ANGLES = NEUTRAL_ANGLES;
const VELARIS_CONSULTANT_ANGLES = NEUTRAL_ANGLES;

const MODEL_STYLE_INSTRUCTIONS = {
  velaris_consultant: `
- Faça uma saudação curta.
- Apresente-se como Guilherme, da Velaris Studio.
- Mantenha um tom profissional, próximo e seguro.
- Não pareça formal demais.
`,

  human_consultative: `
- Pode usar uma saudação curta e natural.
- A apresentação pode ser mais leve.
- A mensagem deve parecer escrita manualmente para aquela empresa.
- Use linguagem simples e próxima.
`,

  aggressive_curiosity: `
- Seja direto e curto.
- A saudação é opcional.
- Não seja provocativo nem agressivo.
- Gere curiosidade apenas por meio de uma pergunta simples.
`,
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

function buildLeadFacts(lead) {
  const companyName = lead.name?.trim() || "Empresa não informada";

  const city =
    lead.lead_city?.trim() || lead.city?.trim() || "Região não informada";

  const category =
    lead.lead_category?.trim() ||
    lead.niche?.trim() ||
    "Segmento não informado";

  const rating = Number(lead.rating || 0);
  const reviewsCount = Number(lead.reviews_count || 0);

  const facts = [
    `Empresa: ${companyName}`,
    `Cidade ou região: ${city}`,
    `Segmento: ${category}`,
  ];

  if (rating > 0) {
    facts.push(`Nota no Google: ${rating}`);
  }

  if (reviewsCount > 0) {
    facts.push(`Quantidade de avaliações no Google: ${reviewsCount}`);
  }

  return facts.join("\n");
}

function buildNeutralPrompt({ lead, promptModel, selectedAngle, angleConfig }) {
  const leadFacts = buildLeadFacts(lead);

  const styleInstruction =
    MODEL_STYLE_INSTRUCTIONS[promptModel.key] ||
    MODEL_STYLE_INSTRUCTIONS.human_consultative;

  return `
Você escreve a primeira mensagem de uma prospecção consultiva pelo WhatsApp.

Esta é apenas a abertura da conversa.

O serviço que será oferecido ainda NÃO foi escolhido.

A mensagem deve ser neutra, humana e adequada para qualquer uma das soluções da Velaris.

DADOS CONFIÁVEIS DO LEAD:
${leadFacts}

MODELO DE TOM:
${promptModel.label}

INSTRUÇÕES DE TOM:
${styleInstruction}

ÂNGULO DA ABORDAGEM:
${selectedAngle}
${angleConfig.instruction}

OBJETIVO:
Fazer o responsável responder e permitir o início de uma conversa comercial consultiva.

REGRAS ABSOLUTAS:
- Escreva em português do Brasil.
- Use somente informações presentes nos dados confiáveis.
- Não invente informações sobre a empresa.
- Não diga que analisou profundamente o negócio.
- Não diga que analisou Instagram, site ou WhatsApp.
- Não afirme que a empresa possui algum problema.
- Não afirme que o atendimento é lento ou desorganizado.
- Não afirme que a presença digital está ruim.
- Não diga que a empresa está perdendo clientes.
- Não mencione concorrentes.
- Não escolha ou recomende qualquer serviço.
- Não mencione site institucional.
- Não mencione landing page.
- Não mencione gestão de redes sociais.
- Não mencione tráfego pago ou anúncios.
- Não mencione automação de WhatsApp.
- Não mencione sistema de agendamento.
- Não mencione sistema de orçamentos.
- Não mencione sistema personalizado.
- Não mencione LeadHunt.
- Não mencione Google Meu Negócio.
- Não use palavras como pacote, preço, promoção ou contratação.
- Não prometa resultados.
- Não use elogios exagerados.
- Não use emojis.
- Não pareça uma automação.
- Não pareça uma mensagem copiada.
- A pergunta final deve ser fácil de responder.
- Use exatamente "---" para separar as duas partes.
- Não adicione nenhum texto depois da pergunta final.
- A mensagem inteira deve ter no máximo 5 linhas visuais.

ESTRUTURA OBRIGATÓRIA:

Parte 1:
- saudação opcional;
- apresentação de acordo com o modelo escolhido;
- contexto verdadeiro de que encontrou a empresa no Google;
- referência ao segmento e/ou região.

---
Parte 2:
- uma única pergunta curta;
- pedir permissão para fazer uma pergunta ou conversar rapidamente;
- não antecipar o serviço.

EXEMPLO DE DIREÇÃO, SEM COPIAR LITERALMENTE:

Boa tarde, tudo bem? Sou o Guilherme, da Velaris Studio.
Encontrei a empresa pelo Google enquanto pesquisava negócios desse segmento na região.

---
Posso te fazer uma pergunta rápida sobre como vocês recebem novos clientes?

Agora gere somente a mensagem final.
`;
}

function normalizeGeneratedMessage(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .trim();
}

function validateGeneratedMessage(message) {
  if (!message) {
    throw new Error("A IA retornou uma mensagem vazia.");
  }

  if (!message.includes("---")) {
    throw new Error('A mensagem não contém o separador obrigatório "---".');
  }

  if (message.length > 800) {
    throw new Error("A mensagem gerada ultrapassou o tamanho permitido.");
  }
}

function getTemperature(promptModelKey) {
  if (promptModelKey === "velaris_consultant") {
    return 0.6;
  }

  if (promptModelKey === "human_consultative") {
    return 0.7;
  }

  return 0.75;
}

function buildFallbackMessage(lead) {
  const name = lead.name || "empresa";

  const category = lead.lead_category || lead.niche || "seu segmento";

  const city = lead.lead_city || lead.city || "sua região";

  return `Boa tarde, tudo bem? Sou o Guilherme, da Velaris Studio.
Encontrei a ${name} pelo Google enquanto pesquisava empresas de ${category} em ${city}.

---
Posso te fazer uma pergunta rápida sobre o negócio?`;
}

async function generateLeadMessage(lead) {
  const promptModel = getPromptModel();

  const selectedAngle = pickWeightedFromConfig(NEUTRAL_ANGLES);

  const angleConfig = NEUTRAL_ANGLES[selectedAngle];

  try {
    const prompt = buildNeutralPrompt({
      lead,
      promptModel,
      selectedAngle,
      angleConfig,
    });

    const response = await openai.chat.completions.create({
      model: MESSAGE_MODEL,

      messages: [
        {
          role: "system",
          content:
            "Você cria primeiras abordagens neutras e humanas para prospecção consultiva via WhatsApp.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature: getTemperature(promptModel.key),
      max_tokens: 220,
    });

    const message = normalizeGeneratedMessage(
      response.choices?.[0]?.message?.content,
    );

    validateGeneratedMessage(message);

    return {
      message,

      meta: {
        angle: `${promptModel.key}:${selectedAngle}`,

        angle_label: `${promptModel.label} · ${angleConfig.label}`,

        angle_weight: angleConfig.weight,
        version: promptModel.version,

        /**
         * Mantidos temporariamente para compatibilidade com
         * chamadas antigas, mas novas mensagens não possuem oferta.
         */
        offer_type: null,
        offer_label: null,
        offer_reason: null,

        message_type: `neutral:${promptModel.key}:${selectedAngle}`,
      },
    };
  } catch (error) {
    console.error("❌ Erro na geração da mensagem neutra:", error.message);

    return {
      message: buildFallbackMessage(lead),

      meta: {
        angle: "neutral:fallback",
        angle_label: "Mensagem neutra · Fallback",
        angle_weight: 0,
        version: "neutral-fallback-v1",

        offer_type: null,
        offer_label: null,
        offer_reason: null,

        message_type: "neutral:fallback",
      },
    };
  }
}

module.exports = {
  generateLeadMessage,

  ACTIVE_PROMPT_MODELS,

  NEUTRAL_ANGLES,

  /**
   * Exports antigos preservados para compatibilidade.
   */
  ANGLE_CONFIGS,
  HUMAN_CONSULTATIVE_ANGLES,
  VELARIS_CONSULTANT_ANGLES,
};
