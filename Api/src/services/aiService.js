const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const nicheStrategies = {
  "Limpeza de Estofados": {
    hook: "mostrar o antes e depois detalhado e destacar os benefícios para a saúde (ácaros e alergias)",
    callToAction:
      "Gostaria de ver como uma galeria de resultados no seu site poderia aumentar sua conversão?",
  },
  "Oficina Mecânica": {
    hook: "transmitir confiança profissional e facilitar o agendamento de orçamentos online",
    callToAction:
      "Já pensou em ter uma página de agendamento que economiza o tempo da sua recepção?",
  },
  "Estética Automotiva": {
    hook: "destacar o visual premium dos serviços (vitrificação/polimento) e criar um portfólio de luxo",
    callToAction:
      "Posso te mostrar como um site bem estruturado pode atrair donos de carros de luxo?",
  },
  "Clínica de Estética": {
    hook: "reforçar a autoridade da profissional e organizar os diversos procedimentos em um cardápio digital",
    callToAction:
      "Vamos transformar suas avaliações do Google em um mural de depoimentos no seu próprio site?",
  },
};

const generateLeadMessage = async (lead) => {
  const strategy = nicheStrategies[lead.lead_category] || {
    hook: "melhorar a presença digital",
    callToAction: "Podemos conversar sobre um site?",
  };

  const prompt = `
  Você é o Guilherme, consultor de marketing.
  Aborde a empresa ${lead.name} do nicho ${lead.lead_category} em ${lead.lead_city}.
  
  CONTEXTO ESTRATÉGICO:
  Sua missão para este nicho é: ${strategy.hook}.
  
  DADOS DO LEAD:
  - Nome: ${lead.name}
  - Avaliações: ${lead.reviews_count} (use para elogiar a autoridade deles em ${lead.lead_city})
  
  REGRAS:
  - Seja direto. Limpe o nome da empresa.
  - Mencione que o trabalho deles de ${lead.lead_category} merece um site à altura.
  - Finalize com: ${strategy.callToAction}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini", // Integração oficial planejada [cite: 35]
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8, // Um pouco mais de criatividade para variar os textos
  });

  return response.choices[0].message.content.trim();
};

module.exports = { generateLeadMessage };
