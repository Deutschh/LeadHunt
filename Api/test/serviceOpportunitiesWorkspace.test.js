const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const {
  createServiceOpportunitiesRouter,
} = require("../src/routes/serviceOpportunities");
const {
  CommercialProfileStateError,
} = require("../src/services/commercialProfileService");

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function request(origin, path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method || "GET",
    headers:
      options.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() };
}

function createApp({
  db,
  workspaceId = "11",
  guideService,
  commercialProfileService,
  nicheStrategyService,
} = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.workspaceId = workspaceId;
    next();
  });
  app.use(
    "/api/service-opportunities",
    createServiceOpportunitiesRouter({
      db,
      logger: { error() {} },
      negotiationGuideService:
        guideService || { async generateNegotiationGuide() {} },
      commercialProfileService: commercialProfileService || {
        async getByWorkspaceId() {
          return {
            senderName: "Pessoa",
            businessName: "Empresa",
            businessDescription: null,
            salesContext: null,
          };
        },
      },
      nicheStrategyService: nicheStrategyService || {
        async resolveWorkspaceNicheStrategy() {
          return null;
        },
      },
    }),
  );
  return app;
}

function currentDb({ serviceActive = true, leadWorkspace = "11" } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      const statement = String(sql);
      calls.push({ sql: statement, params });
      if (/FROM leads\s+WHERE id = \$1/u.test(statement)) {
        const rows = params[1] === leadWorkspace
          ? [{ id: 4, name: "Lead", lead_category: "Clínicas" }]
          : [];
        return { rows, rowCount: rows.length };
      }
      if (/FROM lead_service_opportunities opportunity/u.test(statement)) {
        const rows = [{
          id: 20,
          lead_id: 4,
          service_id: 7,
          is_active: true,
          service_is_active: serviceActive,
          service_name: "Oferta",
        }];
        return { rows, rowCount: rows.length };
      }
      throw new Error("SQL inesperado no teste de current");
    },
    async connect() {
      throw new Error("connect não esperado");
    },
  };
}

test("current distingue oportunidade ativa de serviço ativo/arquivado", async (t) => {
  for (const serviceActive of [true, false]) {
    const db = currentDb({ serviceActive });
    const runtime = await listen(createApp({ db }));
    t.after(runtime.close);
    const response = await request(
      runtime.origin,
      "/api/service-opportunities/leads/4/current",
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.opportunity.is_active, true);
    assert.equal(response.body.opportunity.service_is_active, serviceActive);
    const opportunityCall = db.calls.at(-1);
    assert.match(
      opportunityCall.sql,
      /service\.is_active AS service_is_active/u,
    );
    assert.match(
      opportunityCall.sql,
      /service\.workspace_id = opportunity\.workspace_id/u,
    );
    assert.deepEqual(opportunityCall.params, [4, "11"]);
  }
});

test("current cross-workspace retorna 404 sem consultar oportunidade", async (t) => {
  const db = currentDb({ leadWorkspace: "11" });
  const runtime = await listen(createApp({ db, workspaceId: "12" }));
  t.after(runtime.close);
  const response = await request(
    runtime.origin,
    "/api/service-opportunities/leads/4/current",
  );
  assert.equal(response.status, 404);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [4, "12"]);
});

test("stats valida o vínculo do lead e qualifica o contrato histórico por workspace", async (t) => {
  const calls = [];
  const db = {
    async query(sql, params) {
      const statement = String(sql);
      calls.push({ sql: statement, params });
      if (/FROM velaris_services\s+WHERE/u.test(statement)) {
        return { rows: [], rowCount: 0 };
      }
      if (/GROUP BY/u.test(statement)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [{}], rowCount: 1 };
    },
    async connect() {
      throw new Error("connect não esperado");
    },
  };
  const runtime = await listen(createApp({ db }));
  t.after(runtime.close);

  const response = await request(
    runtime.origin,
    "/api/service-opportunities/stats?period=all",
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 5);

  const opportunityQueries = calls.filter(({ sql }) =>
    /FROM lead_service_opportunities/u.test(sql),
  );
  assert.equal(opportunityQueries.length, 4);
  for (const call of opportunityQueries) {
    assert.deepEqual(call.params, ["11"]);
    assert.match(
      call.sql,
      /lead\.workspace_id = opportunity\.workspace_id/u,
    );
  }
  const availableNiches = opportunityQueries.find(({ sql }) =>
    /AS niche_label[\s\S]*AS opportunities/u.test(sql) &&
    !/velaris_services/u.test(sql),
  );
  assert.match(availableNiches.sql, /TRIM\(opportunity\.lead_category\)/u);
  assert.match(availableNiches.sql, /SELECT\s+opportunity\.niche_key/u);
});

function recommendationsDb() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      const statement = String(sql);
      calls.push({ sql: statement, params });
      if (/SELECT\s+id,\s+name,[\s\S]*has_website/u.test(statement)) {
        return {
          rows: [{
            id: 4,
            name: `Lead ${params[1]}`,
            status: "responded",
            pipeline_stage: "responded",
            responded_at: new Date(),
            lead_category: "Clínicas",
            lead_city: "Recife",
            rating: 5,
            reviews_count: 20,
          }],
          rowCount: 1,
        };
      }
      if (/SELECT\s+opportunity\.id,\s+opportunity\.service_id/u.test(statement)) {
        return { rows: [], rowCount: 0 };
      }
      if (/WITH service_stats AS/u.test(statement)) {
        return {
          rows: [{
            id: Number(params[1]),
            service_key: `svc_${params[1]}`,
            service_name: `Oferta ${params[1]}`,
            service_type: "universal",
            problem_category: "Operação",
            description: "Descrição",
            how_it_works: "Execução",
            problems_solved: [],
            target_niches: [],
            display_order: 0,
            times_selected: 0,
            total_points: 0,
            average_score: 0,
          }],
          rowCount: 1,
        };
      }
      throw new Error("SQL inesperado no teste de recommendations");
    },
    async connect() {
      throw new Error("connect não esperado");
    },
  };
}

test("recommendations isola ranking por workspace e considera somente ativos", async (t) => {
  for (const workspaceId of ["11", "12"]) {
    const db = recommendationsDb();
    const runtime = await listen(createApp({ db, workspaceId }));
    t.after(runtime.close);
    const response = await request(
      runtime.origin,
      "/api/service-opportunities/leads/4/recommendations",
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.all_services[0].service_name, `Oferta ${workspaceId}`);
    const rankingCall = db.calls.find(({ sql }) => /WITH service_stats AS/u.test(sql));
    assert.deepEqual(rankingCall.params, ["clinicas", workspaceId]);
    assert.match(rankingCall.sql, /historical_lead\.workspace_id = opportunity\.workspace_id/u);
    assert.match(rankingCall.sql, /service\.workspace_id = \$2/u);
    assert.match(rankingCall.sql, /service\.is_active = TRUE/u);
  }
});

test("guia falha fechado quando o perfil estrutural está ausente", async (t) => {
  let providerCalls = 0;
  const db = {
    async query(sql, params) {
      const statement = String(sql);
      if (/FROM leads l/u.test(statement)) {
        return {
          rows: [{
            lead_id: 4,
            lead_name: "Lead",
            lead_category: "Clínicas",
            opportunity_id: 20,
            service_id: 9,
            service_name: "Oferta",
            service_type: "universal",
            problem_category: "Operação",
            service_description: "Descrição",
            how_it_works: "Execução",
            problems_solved: [],
            target_niches: [],
            analysis_notes: "Análise",
            pain_points: [],
          }],
          rowCount: 1,
        };
      }
      if (/FROM lead_activities/u.test(statement)) {
        assert.deepEqual(params, [4, "11"]);
        return { rows: [], rowCount: 0 };
      }
      throw new Error("UPDATE não deveria ser executado");
    },
    async connect() {
      throw new Error("connect não esperado");
    },
  };
  const runtime = await listen(
    createApp({
      db,
      guideService: {
        async generateNegotiationGuide() {
          providerCalls += 1;
        },
      },
      commercialProfileService: {
        async getByWorkspaceId() {
          throw new CommercialProfileStateError();
        },
      },
    }),
  );
  t.after(runtime.close);
  const response = await request(
    runtime.origin,
    "/api/service-opportunities/leads/4/guide",
    { method: "POST", body: {} },
  );
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "COMMERCIAL_PROFILE_STATE_CONFLICT");
  assert.equal(providerCalls, 0);
});

function progressDb({ dealServices }) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      const statement = String(sql);
      calls.push({ sql: statement, params });
      if (/^(BEGIN|COMMIT|ROLLBACK)$/u.test(statement)) return { rows: [], rowCount: 0 };
      if (/SELECT\s+id,\s+name,[\s\S]*FROM leads/u.test(statement)) {
        return {
          rows: [{
            id: 4,
            name: "Lead",
            status: "negotiation",
            pipeline_stage: "negotiation",
            sale_value: null,
            deal_details: null,
          }],
          rowCount: 1,
        };
      }
      if (/SELECT\s+opportunity\.\*/u.test(statement)) {
        return {
          rows: [{
            id: 20,
            lead_id: 4,
            service_id: 9,
            service_name: "Histórico",
            selected_score: 1,
            interest_score: 1,
            preview_score: 1,
            price_score: 1,
            closed_score: 0,
          }],
          rowCount: 1,
        };
      }
      if (/SELECT\s+id,\s+service_name,\s+is_active/u.test(statement)) {
        return { rows: dealServices, rowCount: dealServices.length };
      }
      if (/UPDATE lead_service_opportunities/u.test(statement)) {
        return {
          rows: [{
            id: 20,
            service_id: 9,
            selected_score: 1,
            interest_score: 1,
            preview_score: 1,
            price_score: 1,
            closed_score: 4,
            total_score: 8,
          }],
          rowCount: 1,
        };
      }
      if (/UPDATE leads/u.test(statement)) {
        return {
          rows: [{ id: 4, status: "closed", sale_value: params[2] }],
          rowCount: 1,
        };
      }
      if (/FROM lead_events/u.test(statement)) {
        return { rows: [{ id: 1 }], rowCount: 1 };
      }
      throw new Error(`SQL inesperado no teste de progress: ${statement}`);
    },
    release() {},
  };
  return {
    calls,
    async query() {
      throw new Error("db.query não esperado");
    },
    async connect() {
      return client;
    },
  };
}

function closedPayload(serviceId) {
  return {
    event: "closed",
    sale_value: 900,
    deal_details: {
      items: [{
        id: "item-1",
        service_id: serviceId,
        service_label: "Label forjado",
        billing_type: "recurring",
        amount: "900,00",
      }],
    },
  };
}

test("fechamento aceita o serviço selecionado arquivado e canonicaliza label", async (t) => {
  const db = progressDb({
    dealServices: [{ id: 9, service_name: "Histórico", is_active: false }],
  });
  const runtime = await listen(createApp({ db }));
  t.after(runtime.close);
  const response = await request(
    runtime.origin,
    "/api/service-opportunities/leads/4/progress",
    { method: "PATCH", body: closedPayload(9) },
  );
  assert.equal(response.status, 200);
  const serviceCall = db.calls.find(({ sql }) => /id = ANY/u.test(sql));
  assert.deepEqual(serviceCall.params, ["11", [9]]);
  const leadUpdate = db.calls.find(({ sql }) => /UPDATE leads/u.test(sql));
  assert.equal(leadUpdate.params[2], 900);
  assert.equal(
    JSON.parse(leadUpdate.params[3]).items[0].service_label,
    "Histórico",
  );
});

test("fechamento rejeita outro arquivado ou serviço cross-workspace como 404", async (t) => {
  for (const dealServices of [
    [{ id: 8, service_name: "Outro arquivado", is_active: false }],
    [],
  ]) {
    const db = progressDb({ dealServices });
    const runtime = await listen(createApp({ db }));
    t.after(runtime.close);
    const response = await request(
      runtime.origin,
      "/api/service-opportunities/leads/4/progress",
      { method: "PATCH", body: closedPayload(8) },
    );
    assert.equal(response.status, 404);
    assert.equal(response.body.code, "DEAL_SERVICE_NOT_FOUND");
    assert.equal(db.calls.some(({ sql }) => /UPDATE leads/u.test(sql)), false);
  }
});
