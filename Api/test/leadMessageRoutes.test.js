const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const {
  createAccessTokenService,
} = require("../src/services/accessTokenService");
const {
  createRequireAuthenticatedContext,
} = require("../src/middleware/requireAuthenticatedContext");
const {
  createRequireOperationalAccess,
} = require("../src/middleware/requireOperationalAccess");
const {
  createCommercialProfileRepository,
} = require("../src/repositories/commercialProfileRepository");
const {
  createCommercialProfileService,
} = require("../src/services/commercialProfileService");
const {
  createServiceCatalogRepository,
} = require("../src/repositories/serviceCatalogRepository");
const {
  createServiceCatalogService,
} = require("../src/services/serviceCatalogService");
const {
  createNicheStrategyRepository,
} = require("../src/repositories/nicheStrategyRepository");
const {
  createNicheStrategyService,
} = require("../src/services/nicheStrategyService");
const {
  createLeadMessageRepository,
} = require("../src/repositories/leadMessageRepository");
const {
  createCommercialAiContextService,
} = require("../src/services/commercialAiContextService");
const { createAiService } = require("../src/services/aiService");
const {
  createLeadMessageRouter,
} = require("../src/routes/leadMessageRoutes");
const {
  createOperationalWebRouter,
} = require("../src/routes/operationalWebRoutes");

const JWT_CONFIG = Object.freeze({
  jwtSecret: "j".repeat(32),
  jwtKeyId: "lead-message-test",
  jwtIssuer: "leadhunt-api-test",
  jwtAudience: "leadhunt-web-test",
  accessTokenTtlSeconds: 600,
});

function authenticatedContext({
  userId,
  workspaceId,
  role = "owner",
  accountStatus = "active",
  isActive = true,
}) {
  return {
    user: { id: userId, name: `User ${userId}`, email: `u${userId}@test.local` },
    membership: { userId, workspaceId, role },
    workspace: {
      id: workspaceId,
      name: `Workspace ${workspaceId}`,
      accountStatus,
      isActive,
      timezone: "America/Sao_Paulo",
      releaseChannel: "stable",
      minProfiles: 1,
      maxProfiles: 2,
    },
  };
}

function profileRow(workspaceId) {
  return {
    sender_name: `Pessoa ${workspaceId}`,
    business_name: `Empresa ${workspaceId}`,
    business_description: `Descrição ${workspaceId}`,
    sales_context: `Contexto ${workspaceId}`,
    presentation_preferences: {},
  };
}

function serviceRow(workspaceId) {
  return {
    id: Number(workspaceId),
    service_name: `Oferta ${workspaceId}`,
    service_type: "universal",
    problem_category: "Operação",
    description: `Descrição da oferta ${workspaceId}`,
    how_it_works: "Execução",
    problems_solved: [],
    target_niches: ["Clínicas"],
    is_active: true,
    display_order: 0,
  };
}

function strategyRow(workspaceId, nicheName) {
  return {
    id: Number(workspaceId),
    niche_name: nicheName,
    hook: `Hook ${workspaceId}`,
    call_to_action: `CTA ${workspaceId}?`,
  };
}

function leadRow(id, workspaceId) {
  return {
    id,
    workspace_id: workspaceId,
    name: `Lead ${workspaceId}`,
    phone: `550000${workspaceId}`,
    lead_category: "Clínicas",
    lead_city: "Recife",
    rating: "4.8",
    reviews_count: 30,
    is_ai_ready: false,
    status: "pending",
  };
}

function createFakeDb() {
  const calls = [];
  const leads = [leadRow(11, "11"), leadRow(12, "12")];
  const aiEnabled = new Map([
    ["11", true],
    ["12", false],
  ]);

  return {
    calls,
    leads,
    async query(sql, params) {
      const statement = String(sql);
      calls.push({ sql: statement, params });

      if (/FROM public\.workspace_commercial_profiles/u.test(statement)) {
        return { rows: params[0] === "13" ? [] : [profileRow(params[0])] };
      }
      if (/FROM public\.velaris_services/u.test(statement)) {
        return { rows: [serviceRow(params[0])] };
      }
      if (/FROM public\.niche_strategies/u.test(statement)) {
        return { rows: [strategyRow(params[0], params[1])] };
      }
      if (/SELECT is_ai_enabled/u.test(statement)) {
        return aiEnabled.has(params[0])
          ? { rows: [{ is_ai_enabled: aiEnabled.get(params[0]) }] }
          : { rows: [] };
      }
      if (/is_ai_ready = false/u.test(statement)) {
        return {
          rows: leads.filter(
            (lead) =>
              lead.workspace_id === params[0] && lead.is_ai_ready === false,
          ),
        };
      }
      if (/UPDATE public\.leads/u.test(statement)) {
        const lead = leads.find(
          (item) => item.id === params[6] && item.workspace_id === params[7],
        );
        if (!lead) return { rows: [] };
        Object.assign(lead, {
          is_ai_ready: true,
          custom_message: params[0],
          ai_prompt_angle: params[1],
          ai_prompt_version: params[2],
          ai_prompt_label: params[3],
          ai_generation_batch_id: params[4],
          message_type: params[5],
          offer_type: null,
          offer_label: null,
          offer_reason: null,
        });
        const { workspace_id: _workspaceId, is_ai_ready: _isAiReady, status: _status, ...publicLead } = lead;
        return { rows: [publicLead] };
      }
      if (/SELECT ai_generation_batch_id/u.test(statement)) {
        const lead = leads.find(
          (item) =>
            item.workspace_id === params[0] && item.ai_generation_batch_id,
        );
        return {
          rows: lead
            ? [{ ai_generation_batch_id: lead.ai_generation_batch_id }]
            : [],
        };
      }
      if (/WHERE ai_generation_batch_id = \$1/u.test(statement)) {
        return {
          rows: leads.filter(
            (lead) =>
              lead.ai_generation_batch_id === params[0] &&
              lead.workspace_id === params[1],
          ).map(({ workspace_id: _workspaceId, is_ai_ready: _isAiReady, status: _status, ...lead }) => lead),
        };
      }
      throw new Error(`SQL inesperado: ${statement}`);
    },
  };
}

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function request(origin, path, { method = "GET", token, body, headers } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function createFixture(contexts) {
  const db = createFakeDb();
  const accessTokenService = createAccessTokenService(JWT_CONFIG);
  const identityService = {
    async resolve({ userId }) {
      return contexts[userId];
    },
  };
  const logger = { error() {}, warn() {} };
  const commercialProfileService = createCommercialProfileService({
    repository: createCommercialProfileRepository({ db }),
  });
  const serviceCatalogService = createServiceCatalogService({
    repository: createServiceCatalogRepository({ db }),
  });
  const nicheStrategyService = createNicheStrategyService({
    repository: createNicheStrategyRepository({ db }),
  });
  const contextService = createCommercialAiContextService({
    commercialProfileService,
    serviceCatalogService,
    nicheStrategyService,
  });
  const providerCalls = [];
  const aiService = createAiService({
    client: {
      chat: {
        completions: {
          async create(input) {
            providerCalls.push(input);
            const payload = JSON.parse(input.messages[1].content);
            return {
              choices: [
                {
                  message: {
                    content: `${payload.seller.businessName}.\n---\n${payload.nicheStrategy.callToAction}`,
                  },
                },
              ],
            };
          },
        },
      },
    },
    random: () => 0,
    logger,
  });
  const leadMessageRouter = createLeadMessageRouter({
    repository: createLeadMessageRepository({ db }),
    commercialAiContextService: contextService,
    aiService,
    batchIdFactory: () => "batch-test",
    logger,
  });
  const unusedRouter = express.Router();
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createOperationalWebRouter({
      requireAuthenticatedContext: createRequireAuthenticatedContext({
        accessTokenService,
        identityService,
        logger,
      }),
      requireOperationalAccess: createRequireOperationalAccess({ logger }),
      leadsRouter: unusedRouter,
      briefingRouter: unusedRouter,
      serviceOpportunitiesRouter: unusedRouter,
      commercialProfileRouter: unusedRouter,
      serviceCatalogRouter: unusedRouter,
      nicheStrategyRouter: unusedRouter,
      leadMessageRouter,
    }),
  );

  return {
    app,
    db,
    providerCalls,
    token(userId) {
      return accessTokenService.issue({ userId, authVersion: 1 });
    },
  };
}

test("rota exige contexto operacional real antes da geração", async (t) => {
  const fixture = createFixture({
    "7": authenticatedContext({ userId: "7", workspaceId: "11" }),
    "8": authenticatedContext({
      userId: "8",
      workspaceId: "11",
      accountStatus: "pending",
    }),
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  assert.equal(
    (await request(runtime.origin, "/api/leads/generate-ai-mass", {
      method: "POST",
      body: {},
    })).status,
    401,
  );
  assert.equal(
    (await request(runtime.origin, "/api/leads/generate-ai-mass", {
      method: "POST",
      token: fixture.token("8"),
      body: {},
    })).status,
    403,
  );
  assert.equal(fixture.db.calls.length, 0);
});

test("workspaces usam somente seu contexto e IA desligada usa fallback", async (t) => {
  const fixture = createFixture({
    "7": authenticatedContext({ userId: "7", workspaceId: "11" }),
    "8": authenticatedContext({ userId: "8", workspaceId: "12", role: "member" }),
  });
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const workspaceA = await request(
    runtime.origin,
    "/api/leads/generate-ai-mass?workspaceId=12",
    {
      method: "POST",
      token: fixture.token("7"),
      headers: { "X-Workspace-Id": "12" },
      body: { workspace_id: "12", workspaceId: "12" },
    },
  );
  assert.equal(workspaceA.status, 200);
  assert.equal(workspaceA.body.generated_leads[0].custom_message, "Empresa 11.\n---\nCTA 11?");
  assert.equal(fixture.providerCalls.length, 1);

  const workspaceB = await request(runtime.origin, "/api/leads/generate-ai-mass", {
    method: "POST",
    token: fixture.token("8"),
    body: {},
  });
  assert.equal(workspaceB.status, 200);
  assert.match(workspaceB.body.generated_leads[0].custom_message, /Pessoa 12/u);
  assert.match(workspaceB.body.generated_leads[0].custom_message, /CTA 12\?$/u);
  assert.equal(workspaceB.body.generated_leads[0].message_type, "neutral:fallback");
  assert.equal(fixture.providerCalls.length, 1);

  const leadQueries = fixture.db.calls.filter(({ sql }) =>
    /is_ai_ready = false/u.test(sql),
  );
  assert.equal(leadQueries[0].params[0], "11");
  assert.equal(leadQueries[1].params[0], "12");
  const updates = fixture.db.calls.filter(({ sql }) => /UPDATE public\.leads/u.test(sql));
  assert.deepEqual(updates.map(({ params }) => params[7]), ["11", "12"]);
});

test("perfil ausente retorna conflito antes do provider ou UPDATE", async (t) => {
  const fixture = createFixture({
    "9": authenticatedContext({ userId: "9", workspaceId: "13" }),
  });
  fixture.db.leads.push(leadRow(13, "13"));
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const response = await request(runtime.origin, "/api/leads/generate-ai-mass", {
    method: "POST",
    token: fixture.token("9"),
    body: {},
  });
  assert.deepEqual(response, {
    status: 409,
    body: {
      error: "O perfil comercial deste workspace está indisponível.",
      code: "COMMERCIAL_PROFILE_STATE_CONFLICT",
    },
  });
  assert.equal(fixture.providerCalls.length, 0);
  assert.equal(
    fixture.db.calls.some(({ sql }) => /UPDATE public\.leads/u.test(sql)),
    false,
  );
});

test("batch vazio preserva contrato e não carrega contexto", async (t) => {
  const fixture = createFixture({
    "7": authenticatedContext({ userId: "7", workspaceId: "11" }),
  });
  fixture.db.leads[0].is_ai_ready = true;
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const response = await request(runtime.origin, "/api/leads/generate-ai-mass", {
    method: "POST",
    token: fixture.token("7"),
    body: {},
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.success, false);
  assert.equal(response.body.count, 0);
  assert.deepEqual(response.body.generated_leads, []);
  assert.equal(
    fixture.db.calls.some(({ sql }) =>
      /workspace_commercial_profiles|velaris_services|niche_strategies/u.test(sql),
    ),
    false,
  );
});

test("último batch permanece limitado ao workspace autenticado", async (t) => {
  const fixture = createFixture({
    "7": authenticatedContext({ userId: "7", workspaceId: "11" }),
    "8": authenticatedContext({ userId: "8", workspaceId: "12" }),
  });
  fixture.db.leads[0].ai_generation_batch_id = "same-batch";
  fixture.db.leads[1].ai_generation_batch_id = "same-batch";
  const runtime = await listen(fixture.app);
  t.after(runtime.close);

  const response = await request(
    runtime.origin,
    "/api/leads/generate-ai-mass/last?workspaceId=12",
    {
      token: fixture.token("7"),
      headers: { "X-Workspace-Id": "12" },
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.body.count, 1);
  assert.equal(response.body.leads[0].name, "Lead 11");
  assert.equal(Object.hasOwn(response.body.leads[0], "workspace_id"), false);
  const batchQuery = fixture.db.calls.find(({ sql }) =>
    /WHERE ai_generation_batch_id = \$1/u.test(sql),
  );
  assert.deepEqual(batchQuery.params, ["same-batch", "11"]);
});
