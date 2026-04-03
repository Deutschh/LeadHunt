const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const generateLeadMessage = async (lead) => {
  const prompt = `
    Você é o Guilherme, um consultor de Presença Digital focado em ajudar empresas locais a crescerem.
    Sua tarefa é criar uma mensagem de abordagem estratégica para o WhatsApp.

    DADOS TÉCNICOS DO LEAD (Use para contexto, não cite números frios):
    - Nome Original: ${lead.name}
    - Ramo/Nicho: ${lead.niche}
    - Avaliação: ${lead.rating} estrelas
    - Qtd. de Avaliações: ${lead.reviews_count}
    - Ponto Fraco Identificado: ${lead.market_observation || "Empresa com boa nota mas sem site oficial"}

    SUAS DIRETRIZES DE OURO:
    1. LIMPEZA DE NOME: Identifique o nome comercial/marca da empresa. Ignore descrições técnicas como "Higienização de estofados", "LTDA" ou "EIRELI". Use apenas o nome que um cliente usaria ao falar com eles.
    2. CONTEXTO DE AUTORIDADE: Note que eles têm ${lead.reviews_count} avaliações e nota ${lead.rating}. Use isso para elogiar a qualidade do serviço deles, mas aponte que é um pecado essa autoridade toda não estar em um site profissional.
    3. A PROPOSTA: Ofereça explicitamente a criação de um "esboço da página inicial" ou "demonstração de como seria a cara da empresa na internet" de forma gratuita.
    4. ESTRUTURA: Máximo 2 parágrafos curtos. Sem "Olá" ou saudações de tempo.
    5. TOM DE VOZ: Consultivo, amigável e focado em gerar curiosidade. Termine com uma pergunta de engajamento sobre o site ou automação.

    Exemplo de Saída Esperada:
    "Vi que a Magic Clean é muito bem avaliada aqui na região, com dezenas de clientes elogiando o serviço. Estava analisando o perfil de vocês e notei que ainda não possuem um site oficial para converter essa autoridade em vendas automáticas.

    Gostaria de ver um esboço de como ficaria a presença digital de vocês no Google? Posso montar uma demonstração da tela inicial sem compromisso."
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini", // Integração oficial planejada [cite: 35]
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8, // Um pouco mais de criatividade para variar os textos
  });

  return response.choices[0].message.content.trim();
};

module.exports = { generateLeadMessage };