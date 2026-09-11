const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createCommercialAiContextService,
} = require("../src/services/commercialAiContextService");
const {
  createCommercialProfileService,
} = require("../src/services/commercialProfileService");
const {
  createServiceCatalogService,
  ServiceNotFoundError,
} = require("../src/services/serviceCatalogService");
const {
  createNicheStrategyService,
} = require("../src/services/nicheStrategyService");
const { createAiService } = require("../src/services/aiService");

const WORKSPACE_A = "11";
const WORKSPACE_B = "12";

function profileRow({ senderName, businessName, description, salesContext }) {
  return {
    sender_name: senderName,
    business_name: businessName,
    business_description: description,
    sales_context: salesContext,
    presentation_preferences: {},
  };
}

function serviceRow({
  id,
  workspaceId,
  name,
  isActive = true,
  displayOrder = 0,
}) {
  return {
    id,
    workspace_id: workspaceId,
    service_key: `svc_fixture_${id}`,
    service_name: name,
    service_type: "universal",
    problem_category: `Problema ${workspaceId}`,
    description: `Descrição ${name}`,
    how_it_works: `Execução ${name}`,
    problems_solved: [`Dor ${workspaceId}`],
    target_niches: [workspaceId === WORKSPACE_A ? "Clínicas" : "Restaurantes"],
    is_active: isActive,
    display_order: displayOrder,
  };
}

function strategyRow({ id, workspaceId, nicheName, hook, callToAction }) {
  return {
    id,
    workspace_id: workspaceId,
    niche_name: nicheName,
    hook,
    call_to_action: callToAction,
  };
}

function createCommercialFixture() {
  const profiles = new Map([
    [
      WORKSPACE_A,
      profileRow({
        senderName: "Ana",
        businessName: "Alpha SaaS",
        description: "Software para operações clínicas",
        salesContext: "Conversa consultiva sobre redução de faltas",
      }),
    ],
    [
      WORKSPACE_B,
      profileRow({
        senderName: "Bruno",
        businessName: "Beta Consultoria",
        description: "Consultoria financeira para empresas",
        salesContext: "Diagnóstico de margem e eficiência financeira",
      }),
    ],
  ]);
  const services = [
    serviceRow({
      id: 101,
      workspaceId: WORKSPACE_A,
      name: "Software de agenda",
    }),
    serviceRow({
      id: 102,
      workspaceId: WORKSPACE_A,
      name: "Oferta de mesmo nome",
      displayOrder: 1,
    }),
    serviceRow({
      id: 201,
      workspaceId: WORKSPACE_B,
      name: "Consultoria financeira",
    }),
    serviceRow({
      id: 202,
      workspaceId: WORKSPACE_B,
      name: "Oferta de mesmo nome",
      displayOrder: 1,
    }),
  ];
  const strategies = [
    strategyRow({
      id: 301,
      workspaceId: WORKSPACE_A,
      nicheName: "Clínicas",
      hook: "Reduzir faltas",
      callToAction: "Como vocês lidam com faltas hoje?",
    }),
    strategyRow({
      id: 302,
      workspaceId: WORKSPACE_A,
      nicheName: "clínicas",
      hook: "Variação minúscula",
      callToAction: "Podemos falar sobre a rotina?",
    }),
    strategyRow({
      id: 401,
      workspaceId: WORKSPACE_B,
      nicheName: "Clínicas",
      hook: "Melhorar margem",
      callToAction: "Como acompanham a margem atualmente?",
    }),
    strategyRow({
      id: 402,
      workspaceId: WORKSPACE_B,
      nicheName: "Restaurantes",
      hook: "Melhorar margem do restaurante",
      callToAction: "Faz sentido revisar os custos da operação?",
    }),
  ];
  const calls = {
    profileFind: [],
    profileUpdate: [],
    serviceList: [],
    serviceCreate: [],
    serviceUpdate: [],
    strategyResolve: [],
    strategyUpsert: [],
  };
  let nextServiceId = 500;
  let nextStrategyId = 600;

  const profileRepository = {
    async findByWorkspaceId(workspaceId) {
      calls.profileFind.push(workspaceId);
      return profiles.get(workspaceId) || null;
    },
    async updateByWorkspaceId(workspaceId, patch) {
      calls.profileUpdate.push({ workspaceId, patch });
      const current = profiles.get(workspaceId);
      if (!current) return null;
      const fields = {
        senderName: "sender_name",
        businessName: "business_name",
        businessDescription: "business_description",
        salesContext: "sales_context",
        presentationPreferences: "presentation_preferences",
      };
      for (const [field, column] of Object.entries(fields)) {
        if (Object.hasOwn(patch, field)) current[column] = patch[field];
      }
      return current;
    },
  };

  const serviceRepository = {
    async findAllByWorkspaceId(workspaceId, { active } = {}) {
      calls.serviceList.push({ workspaceId, active });
      return services
        .filter(
          (service) =>
            service.workspace_id === workspaceId &&
            (typeof active !== "boolean" || service.is_active === active),
        )
        .sort(
          (left, right) =>
            left.display_order - right.display_order || left.id - right.id,
        );
    },
    async createByWorkspaceId(workspaceId, serviceKey, data) {
      calls.serviceCreate.push({ workspaceId, serviceKey, data });
      const created = serviceRow({
        id: nextServiceId,
        workspaceId,
        name: data.name,
        isActive: data.isActive,
        displayOrder: data.displayOrder ?? services.length,
      });
      created.service_key = serviceKey;
      created.service_type = data.type;
      created.problem_category = data.problemCategory;
      created.description = data.description;
      created.how_it_works = data.howItWorks;
      created.problems_solved = data.problemsSolved;
      created.target_niches = data.targetNiches;
      nextServiceId += 1;
      services.push(created);
      return created;
    },
    async updateByIdAndWorkspaceId(serviceId, workspaceId, patch) {
      calls.serviceUpdate.push({ serviceId, workspaceId, patch });
      const service = services.find(
        (candidate) =>
          candidate.id === serviceId && candidate.workspace_id === workspaceId,
      );
      if (!service) return null;
      const fields = {
        name: "service_name",
        type: "service_type",
        problemCategory: "problem_category",
        description: "description",
        howItWorks: "how_it_works",
        problemsSolved: "problems_solved",
        targetNiches: "target_niches",
        isActive: "is_active",
        displayOrder: "display_order",
      };
      for (const [field, column] of Object.entries(fields)) {
        if (Object.hasOwn(patch, field)) service[column] = patch[field];
      }
      return service;
    },
  };

  const nicheRepository = {
    async findAllByWorkspaceId(workspaceId) {
      return strategies.filter(
        (strategy) => strategy.workspace_id === workspaceId,
      );
    },
    async upsertByWorkspaceId(workspaceId, data) {
      calls.strategyUpsert.push({ workspaceId, data });
      let strategy = strategies.find(
        (candidate) =>
          candidate.workspace_id === workspaceId &&
          candidate.niche_name === data.nicheName,
      );
      if (!strategy) {
        strategy = strategyRow({
          id: nextStrategyId,
          workspaceId,
          nicheName: data.nicheName,
          hook: data.hook,
          callToAction: data.callToAction,
        });
        nextStrategyId += 1;
        strategies.push(strategy);
      } else {
        strategy.hook = data.hook;
        strategy.call_to_action = data.callToAction;
      }
      return strategy;
    },
    async deleteByIdAndWorkspaceId(id, workspaceId) {
      const index = strategies.findIndex(
        (strategy) =>
          strategy.id === id && strategy.workspace_id === workspaceId,
      );
      if (index < 0) return null;
      const [deleted] = strategies.splice(index, 1);
      return { id: deleted.id };
    },
    async findByWorkspaceIdAndNicheName(workspaceId, nicheName) {
      calls.strategyResolve.push({ workspaceId, nicheName });
      return (
        strategies.find(
          (strategy) =>
            strategy.workspace_id === workspaceId &&
            strategy.niche_name === nicheName,
        ) || null
      );
    },
  };

  return {
    calls,
    profiles,
    services,
    strategies,
    commercialProfileService: createCommercialProfileService({
      repository: profileRepository,
    }),
    serviceCatalogService: createServiceCatalogService({
      repository: serviceRepository,
      keyFactory: () => `svc_fixture_${nextServiceId}`,
    }),
    nicheStrategyService: createNicheStrategyService({
      repository: nicheRepository,
    }),
  };
}

function validServicePayload(name) {
  return {
    name,
    type: "universal",
    problemCategory: "Eficiência operacional",
    description: `Descrição de ${name}`,
    howItWorks: `Execução de ${name}`,
    problemsSolved: ["Processo manual"],
    targetNiches: ["Clínicas"],
    isActive: true,
  };
}

test("Etapa 4 mantém identidade, catálogo e estratégia independentes em A/B", async () => {
  const fixture = createCommercialFixture();
  const {
    commercialProfileService,
    serviceCatalogService,
    nicheStrategyService,
  } = fixture;

  await commercialProfileService.updateByWorkspaceId(WORKSPACE_A, {
    senderName: "Ana atualizada",
  });
  assert.equal(
    (await commercialProfileService.getByWorkspaceId(WORKSPACE_A)).senderName,
    "Ana atualizada",
  );
  assert.equal(
    (await commercialProfileService.getByWorkspaceId(WORKSPACE_B)).senderName,
    "Bruno",
  );

  const sameNameA = await serviceCatalogService.createByWorkspaceId(
    WORKSPACE_A,
    validServicePayload("Oferta comum"),
  );
  const sameNameB = await serviceCatalogService.createByWorkspaceId(
    WORKSPACE_B,
    validServicePayload("Oferta comum"),
  );
  assert.notEqual(sameNameA.id, sameNameB.id);
  await serviceCatalogService.updateByIdAndWorkspaceId(
    sameNameA.id,
    WORKSPACE_A,
    { isActive: false },
  );
  assert.equal(
    (await serviceCatalogService.listByWorkspaceId(WORKSPACE_A, { active: true }))
      .some((service) => service.id === sameNameA.id),
    false,
  );
  assert.equal(
    (await serviceCatalogService.listByWorkspaceId(WORKSPACE_B, { active: true }))
      .some((service) => service.id === sameNameB.id),
    true,
  );
  await assert.rejects(
    serviceCatalogService.updateByIdAndWorkspaceId(
      sameNameB.id,
      WORKSPACE_A,
      { isActive: false },
    ),
    ServiceNotFoundError,
  );

  await nicheStrategyService.upsertByWorkspaceId(WORKSPACE_A, {
    nicheName: "Clínicas",
    hook: "Novo hook exclusivo A",
    callToAction: "CTA exclusivo A?",
  });
  assert.equal(
    (await nicheStrategyService.resolveWorkspaceNicheStrategy(
      WORKSPACE_A,
      "Clínicas",
    )).hook,
    "Novo hook exclusivo A",
  );
  assert.equal(
    (await nicheStrategyService.resolveWorkspaceNicheStrategy(
      WORKSPACE_B,
      "Clínicas",
    )).hook,
    "Melhorar margem",
  );
  assert.equal(
    (await nicheStrategyService.resolveWorkspaceNicheStrategy(
      WORKSPACE_A,
      "clínicas",
    )).hook,
    "Variação minúscula",
  );
  assert.equal(
    await nicheStrategyService.resolveWorkspaceNicheStrategy(
      WORKSPACE_A,
      "Restaurantes",
    ),
    null,
  );
});

test("pipeline comercial da IA usa somente contexto do workspace do lead", async () => {
  const fixture = createCommercialFixture();
  const contextService = createCommercialAiContextService({
    commercialProfileService: fixture.commercialProfileService,
    serviceCatalogService: fixture.serviceCatalogService,
    nicheStrategyService: fixture.nicheStrategyService,
  });
  const leadsA = [
    {
      name: "Lead A1",
      lead_category: "Clínicas",
      niche: "Restaurantes",
      lead_city: "Recife",
    },
    {
      name: "Lead A2",
      lead_category: "Clínicas",
      niche: "Restaurantes",
      lead_city: "Recife",
    },
    {
      name: "Lead A3",
      lead_category: "clínicas",
      niche: "Restaurantes",
      lead_city: "Recife",
    },
  ];
  const leadsB = [{
    name: "Lead B",
    lead_category: "Restaurantes",
    niche: "Clínicas",
    lead_city: "Salvador",
  }];
  const batchA = await contextService.prepareBatchContext(WORKSPACE_A, leadsA);
  const batchB = await contextService.prepareBatchContext(WORKSPACE_B, leadsB);
  const contextA = batchA.forLead(leadsA[0]);
  const contextB = batchB.forLead(leadsB[0]);

  assert.equal(contextA.commercialProfile.businessName, "Alpha SaaS");
  assert.equal(contextB.commercialProfile.businessName, "Beta Consultoria");
  assert.deepEqual(contextA.services.map(({ name }) => name), [
    "Software de agenda",
    "Oferta de mesmo nome",
  ]);
  assert.deepEqual(contextB.services.map(({ name }) => name), [
    "Consultoria financeira",
    "Oferta de mesmo nome",
  ]);
  assert.equal(contextA.nicheStrategy.hook, "Reduzir faltas");
  assert.equal(contextB.nicheStrategy.hook, "Melhorar margem do restaurante");
  assert.equal(
    fixture.calls.profileFind.filter((workspaceId) => workspaceId === WORKSPACE_A)
      .length,
    1,
  );
  assert.equal(
    fixture.calls.serviceList.filter(
      ({ workspaceId, active }) =>
        workspaceId === WORKSPACE_A && active === true,
    ).length,
    1,
  );
  assert.deepEqual(
    fixture.calls.strategyResolve.filter(
      ({ workspaceId }) => workspaceId === WORKSPACE_A,
    ),
    [
      { workspaceId: WORKSPACE_A, nicheName: "Clínicas" },
      { workspaceId: WORKSPACE_A, nicheName: "clínicas" },
    ],
  );

  const providerPayloads = [];
  const aiService = createAiService({
    client: {
      chat: {
        completions: {
          async create({ messages }) {
            providerPayloads.push(JSON.parse(messages[1].content));
            return {
              choices: [{
                message: {
                  content: "Encontrei sua empresa no Google.\n\n---\nPodemos conversar?",
                },
              }],
            };
          },
        },
      },
    },
    random: () => 0,
  });
  await aiService.generateLeadMessage({ context: contextA, aiEnabled: true });
  await aiService.generateLeadMessage({ context: contextB, aiEnabled: true });
  assert.equal(providerPayloads[0].seller.businessName, "Alpha SaaS");
  assert.equal(providerPayloads[1].seller.businessName, "Beta Consultoria");
  assert.equal(JSON.stringify(providerPayloads[0]).includes("Beta Consultoria"), false);
  assert.equal(JSON.stringify(providerPayloads[1]).includes("Alpha SaaS"), false);

  let disabledProviderCalls = 0;
  const disabledAiService = createAiService({
    client: {
      chat: {
        completions: {
          async create() {
            disabledProviderCalls += 1;
            throw new Error("provider não deve ser chamado");
          },
        },
      },
    },
  });
  const fallback = await disabledAiService.generateLeadMessage({
    context: contextA,
    aiEnabled: false,
  });
  assert.equal(disabledProviderCalls, 0);
  assert.match(fallback.message, /Ana|Alpha SaaS/u);
  assert.doesNotMatch(fallback.message, /Bruno|Beta Consultoria/u);
});
