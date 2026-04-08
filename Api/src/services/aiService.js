const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const generateLeadMessage = async (lead) => {
  // BUSCA A ESTRATÉGIA NO BANCO
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
    
    REGRAS:
    - Seja direto e profissional.
    - Elogie a autoridade deles (possuem ${lead.reviews_count} avaliações).
    - Mencione que em ${lead.lead_city} a concorrência está crescendo e um site é vital.
    - Finalize com: ${strategy.call_to_action}
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
  });

  return response.choices[0].message.content.trim();
};

module.exports = { generateLeadMessage };
