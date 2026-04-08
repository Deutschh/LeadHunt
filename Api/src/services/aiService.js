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
      Você é o Guilherme, consultor de marketing especializado em ${lead.lead_category}.
      Aborde a empresa ${lead.name} localizada em ${lead.lead_city}.
      
      ESTRATÉGIA DO NICHO: ${strategy.hook}.
      
      DADOS DO LEAD:
      - Nome da empresa: ${lead.name}
      - Avaliações no Google: ${lead.reviews_count}
      
      REGRAS:
      - Seja direto e profissional.
      - Elogie a autoridade deles por terem ${lead.reviews_count} avaliações no Google.
      - Mencione que em ${lead.lead_city} a concorrência está crescendo e um site é vital.
      - Finalize com esta pergunta exata: ${strategy.call_to_action}
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
