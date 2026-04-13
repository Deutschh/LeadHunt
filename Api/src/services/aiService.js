const { OpenAI } = require("openai");
const db = require("../database/db"); // ADICIONE ESTA LINHA AQUI!
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const generateLeadMessage = async (lead) => {
  try {
    // Busca a estratégia no banco de dados
    const strategyRes = await db.query(
      "SELECT hook, call_to_action FROM niche_strategies WHERE niche_name = $1",
      [lead.lead_category],
    );

    const strategy = strategyRes.rows[0] || {
      hook: "melhorar a presença digital e atrair novos clientes",
      call_to_action:
        "Podemos conversar sobre como um site profissional ajudaria seu negócio?",
    };

const prompt = `
Você é um especialista em prospecção via WhatsApp.

Seu objetivo é fazer o lead responder por curiosidade ou leve desconforto.

Lead:
Empresa: ${lead.name}
Cidade: ${lead.lead_city}
Nicho: ${lead.lead_category}
Avaliações: ${lead.reviews_count}

REGRAS:
- Mensagem curta
- Linguagem natural (parecer humano)
- NÃO parecer venda
- NÃO usar palavras como "site", "serviço", "proposta"
- NÃO ser genérico
- NÃO fazer perguntas óbvias ou comuns
- Sempre trazer uma observação que pareça real e específica
- Criar leve desconforto ou sensação de oportunidade perdida
- Use o separador "---" exatamente entre a parte 1 e a parte 2.

ESTRUTURA:

Parte 1:
Observação específica + insight que gere dúvida ou leve preocupação
(evite frases genéricas como "presença digital baixa")
---
Parte 2:
Pergunta simples, mas provocativa
(deve fazer o lead parar e pensar, não responder automático)

Finalize com:
"Fiquei curioso pra te mostrar isso."
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    // LOGUE APENAS A MENSAGEM, NÃO O OBJETO TODO
    console.error("❌ Erro na geração da IA:", error.message);

    return "Olá! Notei que sua empresa tem ótimas avaliações no Google. Já pensou em ter um site profissional para converter esses acessos em clientes?";
  }
};

module.exports = { generateLeadMessage };
