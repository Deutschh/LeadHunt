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
Você é um especialista em prospecção via WhatsApp focado em gerar respostas, não em vender.

OBJETIVO:
Fazer o lead responder com curiosidade.

DADOS DO LEAD:
Empresa: ${lead.name}
Cidade: ${lead.lead_city}
Nicho: ${lead.lead_category}
Avaliações: ${lead.reviews_count}

CONTEXTO:
Use o gancho estratégico: ${strategy.hook}

REGRAS CRÍTICAS:
- NÃO usar saudações (Oi, Olá, Bom dia, etc)
- NÃO parecer vendedor
- NÃO usar palavras como "site", "serviço", "proposta"
- NÃO elogiar de forma genérica
- NÃO ser formal
- NÃO explicar demais
- Linguagem simples, direta e humana
- Criar leve dúvida ou sensação de oportunidade perdida
- Máximo 2 linhas por mensagem
- Gerar EXATAMENTE 2 mensagens separadas por "--"

ESTRUTURA:

Mensagem 1:
- Observação específica (baseada nas avaliações ou presença digital)
- + leve quebra de expectativa OU provocação
- Deve parecer algo que uma pessoa real falaria olhando o negócio

--

Mensagem 2:
- Pergunta simples, natural e fácil de responder
- Pode ser sim/não ou escolha (ex: indicação vs Google)
- Finalizar com: "Fiquei curioso pra te mostrar isso."

IMPORTANTE:
- Não repetir palavras
- Não usar linguagem genérica tipo "aumentar clientes"
- Não inventar dados
- Soar como alguém que realmente analisou o negócio rapidamente
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
