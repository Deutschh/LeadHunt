const { OpenAI } = require("openai");
const db = require("../database/db");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const generateLeadMessage = async (lead) => {
  try {
    const strategyRes = await db.query(
      "SELECT hook, call_to_action FROM niche_strategies WHERE niche_name = $1",
      [lead.lead_category],
    );

    const strategy = strategyRes.rows[0] || {
      hook: "melhorar a presença digital e atrair novos clientes",
      call_to_action: "Posso te mostrar isso de forma rápida?",
    };

    const angles = [
      "oportunidade_perdida",
      "desalinhamento",
      "curiosidade",
      "concorrencia",
    ];

    const selectedAngle = angles[Math.floor(Math.random() * angles.length)];

    const prompt = `
Você é um especialista em prospecção via WhatsApp que escreve como um humano real.

Seu único objetivo é fazer o lead responder.

LEAD:
Empresa: ${lead.name}
Cidade: ${lead.lead_city}
Nicho: ${lead.lead_category}
Avaliações no Google: ${lead.reviews_count}
Estratégia principal: ${strategy.hook}
CTA base: ${strategy.call_to_action}

ÂNGULO ESCOLHIDO:
${selectedAngle}

REGRAS ABSOLUTAS:
- Escreva em português do Brasil
- Mensagem curta
- Soar humano, direto e natural
- NÃO parecer vendedor
- NÃO parecer mensagem de IA
- NÃO usar saudação
- NÃO se apresentar
- NÃO usar assinatura
- NÃO usar "site", "serviço", "proposta" ou "solução"
- NÃO elogiar de forma genérica
- NÃO escrever texto genérico
- NÃO usar frases comuns demais
- A mensagem precisa parecer observação real
- Criar curiosidade, leve incômodo ou sensação de oportunidade perdida
- Use exatamente "---" entre a parte 1 e a parte 2
- A parte 2 deve terminar com UMA pergunta curta
- NÃO adicionar nada depois da pergunta
- NÃO usar emojis
- Máximo de 2 linhas por parte

ESTRUTURA:

Parte 1:
Uma observação específica, curta e forte sobre a empresa.
Essa observação deve gerar:
- curiosidade
ou
- leve desconforto
ou
- sensação de que algo está desalinhado

---
Parte 2:
Uma pergunta curta, provocativa e natural.
A pergunta deve ser simples e responder com vontade, não por educação.

INSTRUÇÕES POR ÂNGULO:

Se o ângulo for "oportunidade_perdida":
- mostre que a empresa pode estar deixando clientes escaparem

Se o ângulo for "desalinhamento":
- mostre contraste entre boa reputação e presença/percepção fraca

Se o ângulo for "curiosidade":
- faça uma observação inesperada que gere interesse

Se o ângulo for "concorrencia":
- insinue que outros podem estar aproveitando melhor a atenção do mercado

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

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error("❌ Erro na geração da IA:", error.message);

    return `Vi que a ${lead.name} já chama atenção no Google, mas talvez ainda esteja deixando passar parte dessa procura.
---
Isso já passou pela sua cabeça?`;
  }
};

module.exports = { generateLeadMessage };
