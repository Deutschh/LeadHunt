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

Seu único objetivo é gerar curiosidade suficiente para o lead responder.

Lead:
Empresa: ${lead.name}
Cidade: ${lead.lead_city}
Nicho: ${lead.lead_category}
Avaliações: ${lead.reviews_count}

REGRAS:
- Mensagem curta (máx 3 linhas por bloco)
- Linguagem natural (parecer humano, não robô)
- NÃO parecer venda
- NÃO usar palavras como "site", "serviço", "proposta"
- NÃO ser genérico
- Criar leve dúvida ou percepção de oportunidade perdida

ESTRUTURA:

Parte 1:
Observação específica + leve provocação sobre oportunidade não aproveitada

---

Parte 2:
Pergunta curiosa, simples e fácil de responder (sim/não ou curiosidade)

Finalize com: "Fiquei curioso pra te mostrar isso."
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
