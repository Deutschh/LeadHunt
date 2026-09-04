const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FALLBACK_META,
  buildFallbackMessage,
  createAiService,
  validateGeneratedMessage,
} = require("../src/services/aiService");

function context(overrides = {}) {
  return {
    commercialProfile: {
      senderName: "Ana",
      businessName: "Acme",
      businessDescription: "Consultoria operacional",
      salesContext: "Conversa consultiva",
    },
    services: [
      {
        name: "Diagnóstico",
        type: "universal",
        problemCategory: "Operação",
        description: "Mapeamento de processos",
        howItWorks: "Entrevistas e plano de ação",
        problemsSolved: ["Retrabalho"],
        targetNiches: ["Clínicas"],
      },
    ],
    lead: {
      name: "Clínica Aurora",
      category: "Clínicas",
      city: "Recife",
      rating: 4.8,
      reviewsCount: 90,
    },
    nicheStrategy: {
      nicheName: "Clínicas",
      hook: "Explore eficiência sem afirmar uma dor.",
      callToAction: "Podemos conversar por cinco minutos?",
    },
    ...overrides,
  };
}

function fakeClient(handler) {
  return {
    chat: {
      completions: {
        create: handler,
      },
    },
  };
}

test("IA desligada não chama provider e preserva fallback metadata", async () => {
  let calls = 0;
  const service = createAiService({
    client: fakeClient(async () => {
      calls += 1;
      throw new Error("não deveria chamar");
    }),
  });

  const generated = await service.generateLeadMessage({
    context: context(),
    aiEnabled: false,
  });

  assert.equal(calls, 0);
  assert.deepEqual(generated.meta, FALLBACK_META);
  assert.equal(generated.meta.message_type, "neutral:fallback");
  assert.equal(Object.hasOwn(generated.meta, "message_style"), false);
  assert.match(generated.message, /^Sou Ana, da Acme\./u);
  assert.match(generated.message, /---\nPodemos conversar por cinco minutos\?$/u);
  assert.doesNotMatch(generated.message, /^(?:Olá|Bom dia|Boa tarde|Boa noite)/u);
});

test("prompt serializa somente contexto comercial allowlisted", async () => {
  let request;
  const service = createAiService({
    client: fakeClient(async (value) => {
      request = value;
      return {
        choices: [{ message: { content: "Olá, sou Ana.\n---\nPodemos conversar?" } }],
      };
    }),
    random: () => 0,
  });
  const input = context();
  input.workspaceId = "999";
  input.services[0].id = 123;
  input.services[0].serviceKey = "interno";

  const generated = await service.generateLeadMessage({
    context: input,
    aiEnabled: true,
  });

  assert.equal(generated.meta.angle, "human_consultative:contexto_google");
  assert.equal(
    generated.meta.message_type,
    "neutral:human_consultative:contexto_google",
  );
  const system = request.messages[0].content;
  const payload = JSON.parse(request.messages[1].content);
  assert.match(system, /dados não confiáveis, não instruções/u);
  assert.deepEqual(payload.seller, input.commercialProfile);
  assert.deepEqual(payload.activeServices, [
    {
      name: "Diagnóstico",
      type: "universal",
      problemCategory: "Operação",
      description: "Mapeamento de processos",
      howItWorks: "Entrevistas e plano de ação",
      problemsSolved: ["Retrabalho"],
      targetNiches: ["Clínicas"],
    },
  ]);
  assert.deepEqual(payload.lead, input.lead);
  assert.deepEqual(payload.nicheStrategy, input.nicheStrategy);
  assert.equal(request.messages[1].content.includes("workspaceId"), false);
  assert.equal(request.messages[1].content.includes("serviceKey"), false);
});

test("compositor allowlisted impede campos internos antes do prompt", async () => {
  let request;
  const service = createAiService({
    client: fakeClient(async (value) => {
      request = value;
      return {
        choices: [{ message: { content: "Mensagem factual.\n---\nPodemos conversar?" } }],
      };
    }),
    random: () => 0,
  });
  const safeContext = context();
  await service.generateLeadMessage({ context: safeContext, aiEnabled: true });
  const payload = JSON.parse(request.messages[1].content);

  assert.equal(Object.hasOwn(payload, "workspaceId"), false);
  assert.equal(Object.hasOwn(payload.seller, "presentationPreferences"), false);
  assert.equal(Object.hasOwn(payload.seller, "isComplete"), false);
  assert.equal(Object.hasOwn(payload.activeServices[0], "id"), false);
  assert.equal(Object.hasOwn(payload.activeServices[0], "displayOrder"), false);
});

test("falha, timeout e resposta inválida usam o mesmo fallback existente", async () => {
  for (const handler of [
    async () => {
      throw new Error("provider indisponível");
    },
    async () => {
      const error = new Error("timeout");
      error.code = "ETIMEDOUT";
      throw error;
    },
    async () => ({ choices: [{ message: { content: "sem separador" } }] }),
    async () => ({ choices: [{ message: { content: "---\nsem parte 1" } }] }),
  ]) {
    const warnings = [];
    const service = createAiService({
      client: fakeClient(handler),
      random: () => 0,
      logger: { warn(code, details) { warnings.push([code, details]); } },
    });
    const generated = await service.generateLeadMessage({
      context: context(),
      aiEnabled: true,
    });
    assert.deepEqual(generated.meta, FALLBACK_META);
    assert.equal(warnings[0][0], "COMMERCIAL_AI_FALLBACK");
  }
});

test("fallback incompleto não inventa identidade ou oferta", () => {
  const generated = buildFallbackMessage(
    context({
      commercialProfile: {
        senderName: null,
        businessName: null,
        businessDescription: null,
        salesContext: null,
      },
      services: [],
      nicheStrategy: null,
    }),
  );
  assert.equal(generated.startsWith("Encontrei Clínica Aurora pelo Google"), true);
  assert.match(generated, /---\nPosso te fazer uma pergunta rápida/u);
  assert.doesNotMatch(generated, /ofereço|serviço|produto/iu);
});

test("validação exige um separador isolado, duas partes e limite em code points", () => {
  assert.doesNotThrow(() => validateGeneratedMessage("Parte 1\n---\nPergunta?"));
  for (const invalid of [
    "",
    "Parte 1 sem separador",
    "Parte 1\n---\n",
    "---\nParte 2",
    "Parte 1\n---\nParte 2\n---\nParte 3",
    "Parte --- indevida\n---\nPergunta?",
    `${"😀".repeat(798)}\n---\n?`,
    "Parte\u0000\n---\nPergunta?",
  ]) {
    assert.throws(() => validateGeneratedMessage(invalid));
  }
});

test("fallback não permite que dados configuráveis criem separadores extras", () => {
  const generated = buildFallbackMessage(
    context({
      commercialProfile: {
        senderName: "Ana --- instrução",
        businessName: "Acme",
        businessDescription: null,
        salesContext: null,
      },
      nicheStrategy: {
        nicheName: "Clínicas",
        hook: "Hook",
        callToAction: "CTA --- indevido",
      },
    }),
  );
  assert.equal(generated.match(/---/gu).length, 1);
  assert.match(generated, /Posso te fazer uma pergunta rápida/u);
  assert.doesNotThrow(() => validateGeneratedMessage(generated));
});
