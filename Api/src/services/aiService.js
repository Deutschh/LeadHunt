const { OpenAI } = require("openai");
const db = require("../database/db");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPT_VERSION = "v2.1";

const ANGLE_CONFIGS = {
  oportunidade_perdida: {
    label: "Oportunidade perdida",
    instruction:
      "Mostre que a empresa pode estar deixando clientes escaparem sem perceber.",
  },
  desalinhamento: {
    label: "Desalinhamento",
    instruction:
      "Mostre contraste entre a qualidade real da empresa e a forma como ela parece à primeira vista.",
  },
  curiosidade: {
    label: "Curiosidade",
    instruction:
      "Faça uma observação inesperada e específica que gere interesse imediato.",
  },
  concorrencia: {
    label: "Concorrência",
    instruction:
      "Insinue que empresas piores podem estar parecendo mais fortes e captando mais atenção.",
  },
  percepcao_fraca: {
    label: "Percepção fraca",
    instruction:
      "Mostre que a primeira impressão pode estar enfraquecendo o valor real da empresa.",
  },
};

function pickRandomAngle() {
  const keys = Object.keys(ANGLE_CONFIGS);
  return keys[Math.floor(Math.random() * keys.length)];
}

async function generateLeadMessage(lead) {
  try {
    const strategyRes = await db.query(
      "SELECT hook, call_to_action FROM niche_strategies WHERE niche_name = $1",
      [lead.lead_category],
    );

    const strategy = strategyRes.rows[0] || {
      hook: "melhorar a presença digital e atrair novos clientes",
      call_to_action: "Isso já passou pela sua cabeça?",
    };

    const selectedAngle = pickRandomAngle();
    const angleConfig = ANGLE_CONFIGS[selectedAngle];

    const prompt = `
Você escreve mensagens de prospecção via WhatsApp como um humano real.

Seu único objetivo é fazer o lead responder.

LEAD:
Empresa: ${lead.name}
Cidade: ${lead.lead_city || "não informada"}
Nicho: ${lead.lead_category || "não informado"}
Avaliações no Google: ${lead.reviews_count || 0}
Estratégia do nicho: ${strategy.hook}
CTA base: ${strategy.call_to_action}

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
- NÃO usar palavras como "site", "serviço", "proposta", "solução"
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
Essa observação deve gerar:
- curiosidade
ou
- leve desconforto
ou
- sensação de desalinhamento
ou
- sensação de oportunidade perdida

---
Parte 2:
Pergunta curta, provocativa, natural e fácil de responder.

EXEMPLO DE FORMATO:
Texto da parte 1
---
Texto da parte 2?

Agora gere apenas a mensagem final.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9,
    });

    const message = response.choices[0].message.content.trim();

    return {
      message,
      meta: {
        angle: selectedAngle,
        angle_label: angleConfig.label,
        version: PROMPT_VERSION,
      },
    };
  } catch (error) {
    console.error("❌ Erro na geração da IA:", error.message);

    return {
      message: `Vi que a ${lead.name} já chama atenção no Google, mas talvez isso não esteja ficando tão claro pra quem encontra vocês.
---
Você já percebeu isso?`,
      meta: {
        angle: "fallback",
        angle_label: "Fallback",
        version: PROMPT_VERSION,
      },
    };
  }
}

module.exports = { generateLeadMessage };