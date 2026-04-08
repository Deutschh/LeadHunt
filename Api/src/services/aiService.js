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
      Aborde a empresa ${lead.name} em ${lead.lead_city}.
      
      ESTRATÉGIA: ${strategy.hook}.

      REGRAS CRÍTICAS:
      1. PROIBIDO saudações (Olá, Bom dia, etc).
      2. PROIBIDO assinar (Atenciosamente, Guilherme, Consultor, etc).
      3. Use o separador "---" exatamente entre a análise e a pergunta final.
      4. NÃO invente textos fora das duas partes abaixo.

      ESTRUTURA DA RESPOSTA:
      Parte 1: Elogio sobre as ${lead.reviews_count} avaliações e análise curta sobre a necessidade de um site em ${lead.lead_city}.
      ---
      Parte 2: Pergunta direta baseada no gancho: ${strategy.call_to_action} e finalize apenas com "Aguardo sua resposta!".
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
