const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createLeadMessageRepository,
} = require("../src/repositories/leadMessageRepository");
const {
  createCommercialAiContextService,
} = require("../src/services/commercialAiContextService");
const {
  CommercialProfileStateError,
} = require("../src/services/commercialProfileService");

function profile() {
  return {
    senderName: "Ana",
    businessName: "Acme",
    businessDescription: "Descrição",
    salesContext: "Contexto",
    presentationPreferences: { internal: true },
    isComplete: true,
  };
}

function serviceRow(overrides = {}) {
  return {
    id: 5,
    name: "Diagnóstico",
    type: "universal",
    problemCategory: "Operação",
    description: "Descrição",
    howItWorks: "Execução",
    problemsSolved: ["Retrabalho"],
    targetNiches: ["Clínicas"],
    isActive: true,
    displayOrder: 3,
    ...overrides,
  };
}

test("contexto carrega perfil/catálogo uma vez e deduplica nichos exatos", async () => {
  const calls = [];
  const contextService = createCommercialAiContextService({
    commercialProfileService: {
      async getByWorkspaceId(workspaceId) {
        calls.push(["profile", workspaceId]);
        return profile();
      },
    },
    serviceCatalogService: {
      async listByWorkspaceId(workspaceId, options) {
        calls.push(["services", workspaceId, options]);
        return [serviceRow()];
      },
    },
    nicheStrategyService: {
      async resolveWorkspaceNicheStrategy(workspaceId, nicheName) {
        calls.push(["strategy", workspaceId, nicheName]);
        return nicheName === "Clínicas"
          ? {
              id: 8,
              nicheName,
              hook: "Hook",
              callToAction: "CTA?",
            }
          : null;
      },
    },
  });
  const leads = [
    {
      id: 1,
      name: "A",
      lead_category: " Clínicas ",
      niche: "Categoria Google diferente",
      lead_city: "Recife",
      rating: "4.5",
      reviews_count: 10,
    },
    { id: 2, name: "B", lead_category: "Clínicas", niche: "Outra" },
    { id: 3, name: "C", lead_category: "clínicas", niche: "Clínicas" },
    { id: 4, name: "D", lead_category: null, niche: "Clínicas" },
  ];

  const batch = await contextService.prepareBatchContext("11", leads);
  const first = batch.forLead(leads[0]);
  const secondCase = batch.forLead(leads[2]);
  const withoutCategory = batch.forLead(leads[3]);

  assert.deepEqual(calls, [
    ["profile", "11"],
    ["services", "11", { active: true }],
    ["strategy", "11", "Clínicas"],
    ["strategy", "11", "clínicas"],
  ]);
  assert.deepEqual(first.commercialProfile, {
    senderName: "Ana",
    businessName: "Acme",
    businessDescription: "Descrição",
    salesContext: "Contexto",
  });
  assert.deepEqual(first.services, [
    {
      name: "Diagnóstico",
      type: "universal",
      problemCategory: "Operação",
      description: "Descrição",
      howItWorks: "Execução",
      problemsSolved: ["Retrabalho"],
      targetNiches: ["Clínicas"],
    },
  ]);
  assert.equal(first.nicheStrategy.nicheName, "Clínicas");
  assert.equal(secondCase.nicheStrategy, null);
  assert.equal(withoutCategory.nicheStrategy, null);
  assert.equal(first.lead.category, "Clínicas");
  assert.equal(Object.hasOwn(first.lead, "niche"), false);
  assert.equal(Object.hasOwn(first.commercialProfile, "isComplete"), false);
  assert.equal(Object.hasOwn(first.services[0], "id"), false);
});

test("contexto mantém workspaces independentes e propaga perfil estrutural ausente", async () => {
  const profileService = {
    async getByWorkspaceId(workspaceId) {
      if (workspaceId === "12") throw new CommercialProfileStateError();
      return { ...profile(), businessName: `Empresa ${workspaceId}` };
    },
  };
  const contextService = createCommercialAiContextService({
    commercialProfileService: profileService,
    serviceCatalogService: {
      async listByWorkspaceId(workspaceId) {
        return [serviceRow({ name: `Oferta ${workspaceId}` })];
      },
    },
    nicheStrategyService: {
      async resolveWorkspaceNicheStrategy(workspaceId, nicheName) {
        return {
          id: 1,
          nicheName,
          hook: `Hook ${workspaceId}`,
          callToAction: `CTA ${workspaceId}?`,
        };
      },
    },
  });
  const leads = [{ name: "Lead", lead_category: "Mesmo nicho" }];
  const workspace11 = await contextService.prepareBatchContext("11", leads);
  assert.equal(
    workspace11.forLead(leads[0]).commercialProfile.businessName,
    "Empresa 11",
  );
  assert.equal(workspace11.forLead(leads[0]).services[0].name, "Oferta 11");
  assert.equal(workspace11.forLead(leads[0]).nicheStrategy.hook, "Hook 11");
  await assert.rejects(
    contextService.prepareBatchContext("12", leads),
    CommercialProfileStateError,
  );
});

test("repository mantém todas as queries limitadas ao workspace", async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      const statement = String(sql);
      calls.push({ sql: statement, params });
      if (/SELECT is_ai_enabled/u.test(statement)) return { rows: [] };
      if (/SELECT ai_generation_batch_id/u.test(statement)) {
        return { rows: [{ ai_generation_batch_id: "batch-1" }] };
      }
      if (/UPDATE public\.leads/u.test(statement)) {
        return { rows: [{ id: 7, custom_message: params[0] }] };
      }
      return { rows: [] };
    },
  };
  const repository = createLeadMessageRepository({ db });

  await repository.findEligibleByWorkspaceId("11", {
    limit: 10,
    minRating: 4,
    status: "pending",
    category: undefined,
    categories: ["Clínicas"],
    random: false,
  });
  assert.match(calls[0].sql, /FROM public\.leads/u);
  assert.match(calls[0].sql, /WHERE workspace_id = \$1/u);
  assert.match(calls[0].sql, /lead_category = ANY\(\$4\)/u);
  assert.match(calls[0].sql, /LIMIT \$5/u);
  assert.doesNotMatch(calls[0].sql, /SELECT \*/u);
  assert.deepEqual(calls[0].params, ["11", "pending", 4, ["Clínicas"], 10]);

  assert.equal(await repository.isAiEnabledByWorkspaceId("11"), false);
  assert.deepEqual(calls[1].params, ["11"]);

  const generated = {
    message: "Parte 1\n---\nPergunta?",
    meta: {
      angle: "neutral:fallback",
      version: "neutral-fallback-v1",
      angle_label: "Mensagem neutra · Fallback",
      message_type: "neutral:fallback",
    },
  };
  await repository.updateGeneratedMessageByIdAndWorkspaceId(
    7,
    "11",
    "batch-1",
    generated,
  );
  assert.match(calls[2].sql, /WHERE id = \$7\s+AND workspace_id = \$8/u);
  assert.deepEqual(calls[2].params.slice(-2), [7, "11"]);
  assert.match(calls[2].sql, /offer_type = NULL/u);

  assert.equal(await repository.findLatestBatchIdByWorkspaceId("11"), "batch-1");
  assert.match(calls[3].sql, /WHERE workspace_id = \$1/u);
  assert.deepEqual(calls[3].params, ["11"]);

  await repository.findByBatchIdAndWorkspaceId("batch-1", "11");
  assert.match(
    calls[4].sql,
    /WHERE ai_generation_batch_id = \$1\s+AND workspace_id = \$2/u,
  );
  assert.deepEqual(calls[4].params, ["batch-1", "11"]);
});
