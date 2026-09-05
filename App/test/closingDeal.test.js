import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { setImmediate as waitForImmediate } from "node:timers/promises";

import {
  buildClosingServiceOptions,
  chooseAdditionalClosingService,
  createLatestRequestGate,
  getDealItemServiceOptions,
  loadLatestResource,
  resolveClosingDraftInitialization,
} from "../src/sections/closingDealModel.js";

const activeServices = [
  { id: 2, name: "Oferta ativa" },
  { id: 3, name: "Outra oferta" },
];

function unresolved(overrides = {}) {
  return {
    leadResolved: true,
    currentResolved: false,
    servicesResolved: false,
    existingDealDetails: null,
    activeServices: [],
    current: null,
    draftInitialized: false,
    draftDirty: false,
    ...overrides,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await waitForImmediate();
}

test("current e recommendations aplicam respostas assim que cada request resolve", async () => {
  for (const first of ["current", "recommendations"]) {
    const current = deferred();
    const recommendations = deferred();
    const applied = [];
    const currentLoading = loadLatestResource({
      gate: createLatestRequestGate(),
      load: () => current.promise,
      onResolved: (value) => applied.push(["current", value]),
    });
    const recommendationsLoading = loadLatestResource({
      gate: createLatestRequestGate(),
      load: () => recommendations.promise,
      onResolved: (value) => applied.push(["recommendations", value]),
    });

    const firstRequest = first === "current" ? current : recommendations;
    const secondRequest = first === "current" ? recommendations : current;
    firstRequest.resolve(`${first}-response`);
    await flushPromises();
    assert.deepEqual(applied, [[first, `${first}-response`]]);

    const second = first === "current" ? "recommendations" : "current";
    secondRequest.resolve(`${second}-response`);
    await Promise.all([currentLoading, recommendationsLoading]);
    assert.deepEqual(applied, [
      [first, `${first}-response`],
      [second, `${second}-response`],
    ]);
  }
});

test("falha de recommendations não apaga nem atrasa current", async () => {
  const currentState = { value: null };
  const recommendationErrors = [];
  await Promise.all([
    loadLatestResource({
      gate: createLatestRequestGate(),
      load: async () => ({ id: "current-ok" }),
      onResolved: (value) => {
        currentState.value = value;
      },
    }),
    loadLatestResource({
      gate: createLatestRequestGate(),
      load: async () => {
        throw new Error("recommendations indisponíveis");
      },
      onRejected: (error) => recommendationErrors.push(error),
    }),
  ]);
  assert.deepEqual(currentState.value, { id: "current-ok" });
  assert.equal(recommendationErrors.length, 1);
});

test("retry bem-sucedido aplica exatamente suas próprias respostas", async () => {
  const state = { current: null, recommendations: null, errors: 0 };
  const currentGate = createLatestRequestGate();
  const recommendationsGate = createLatestRequestGate();
  const run = (gate, load, field) =>
    loadLatestResource({
      gate,
      load,
      onResolved: (value) => {
        state[field] = value;
      },
      onRejected: () => {
        state.errors += 1;
      },
    });

  await Promise.all([
    run(
      currentGate,
    async () => {
      throw new Error("primeira current falhou");
    },
      "current",
    ),
    run(
      recommendationsGate,
    async () => {
      throw new Error("primeira recommendations falhou");
    },
      "recommendations",
    ),
  ]);
  assert.equal(state.errors, 2);

  await Promise.all([
    run(
      currentGate,
      async () => ({ source: "retry-current" }),
      "current",
    ),
    run(
      recommendationsGate,
      async () => ({ source: "retry-recommendations" }),
      "recommendations",
    ),
  ]);
  assert.deepEqual(state.current, { source: "retry-current" });
  assert.deepEqual(state.recommendations, { source: "retry-recommendations" });
});

test("resposta ou erro tardio de A não sobrescreve sucesso do retry B", async () => {
  for (const lateOutcome of ["resolve", "reject"]) {
    const gate = createLatestRequestGate();
    const requestA = deferred();
    const requestB = deferred();
    const state = { data: null, error: null, loading: false };
    const start = (request) =>
      loadLatestResource({
        gate,
        load: () => request.promise,
        onStart: () => {
          state.loading = true;
          state.error = null;
        },
        onResolved: (value) => {
          state.data = value;
        },
        onRejected: (error) => {
          state.error = error.message;
        },
        onSettled: () => {
          state.loading = false;
        },
      });

    const loadingA = start(requestA);
    const loadingB = start(requestB);
    requestB.resolve("response-B");
    await loadingB;
    assert.deepEqual(state, {
      data: "response-B",
      error: null,
      loading: false,
    });

    if (lateOutcome === "resolve") requestA.resolve("response-A");
    else requestA.reject(new Error("erro-A"));
    assert.deepEqual(await loadingA, { status: "stale" });
    assert.deepEqual(state, {
      data: "response-B",
      error: null,
      loading: false,
    });
  }
});

test("inicialização espera current e catálogo independentemente da ordem", () => {
  const current = {
    service_id: 3,
    service_name: "Outra oferta",
    service_is_active: true,
  };

  assert.equal(
    resolveClosingDraftInitialization(
      unresolved({ servicesResolved: true, activeServices }),
    ),
    null,
  );
  assert.equal(
    resolveClosingDraftInitialization(
      unresolved({ currentResolved: true, current }),
    ),
    null,
  );

  const catalogFirst = resolveClosingDraftInitialization(
    unresolved({
      currentResolved: true,
      servicesResolved: true,
      activeServices,
      current,
    }),
  );
  const currentFirst = resolveClosingDraftInitialization(
    unresolved({
      servicesResolved: true,
      currentResolved: true,
      current,
      activeServices,
    }),
  );
  assert.deepEqual(catalogFirst, currentFirst);
  assert.equal(catalogFirst.dealData.items[0].service_id, 3);
});

test("serviço atual arquivado é a única opção inativa reconstruída", () => {
  const current = {
    service_id: 9,
    service_name: "Oferta histórica",
    service_is_active: false,
  };
  const options = buildClosingServiceOptions(activeServices, current);
  assert.deepEqual(options, [
    { id: 2, name: "Oferta ativa", label: "Oferta ativa", isArchived: false },
    { id: 3, name: "Outra oferta", label: "Outra oferta", isArchived: false },
    {
      id: 9,
      name: "Oferta histórica",
      label: "Oferta histórica (Arquivado)",
      isArchived: true,
    },
  ]);

  const initialized = resolveClosingDraftInitialization(
    unresolved({
      currentResolved: true,
      servicesResolved: true,
      activeServices,
      current,
    }),
  );
  assert.equal(initialized.dealData.items[0].service_id, 9);
  assert.equal(chooseAdditionalClosingService(activeServices).id, 2);
  assert.equal(chooseAdditionalClosingService([]), null);
  assert.deepEqual(
    getDealItemServiceOptions(options, 2).map(({ id }) => id),
    [2, 3],
  );
  assert.deepEqual(
    getDealItemServiceOptions(options, 9).map(({ id }) => id),
    [2, 3, 9],
  );
});

test("sem serviço atual usa primeiro ativo e sem elegíveis mantém vazio", () => {
  const firstActive = resolveClosingDraftInitialization(
    unresolved({
      currentResolved: true,
      servicesResolved: true,
      activeServices,
    }),
  );
  assert.equal(firstActive.dealData.items[0].service_id, 2);

  const empty = resolveClosingDraftInitialization(
    unresolved({ currentResolved: true, servicesResolved: true }),
  );
  assert.deepEqual(empty.dealData.items, []);
});

test("deal_details persistido e rascunho do usuário nunca são sobrescritos", () => {
  const persisted = {
    items: [{ id: "saved", service_id: 99, service_label: "Histórico" }],
    totalInitialValue: 900,
  };
  const hydrated = resolveClosingDraftInitialization(
    unresolved({ existingDealDetails: persisted }),
  );
  assert.equal(hydrated.source, "persisted");
  assert.equal(hydrated.dealData, persisted);

  assert.equal(
    resolveClosingDraftInitialization(
      unresolved({
        currentResolved: true,
        servicesResolved: true,
        activeServices,
        draftDirty: true,
      }),
    ),
    null,
  );
  assert.equal(
    resolveClosingDraftInitialization(
      unresolved({
        currentResolved: true,
        servicesResolved: true,
        activeServices,
        draftInitialized: true,
      }),
    ),
    null,
  );
});

test("LeadDetails usa catálogo ativo e não envia identidade de workspace", () => {
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, "../src/sections/LeadDetails.jsx"),
    "utf8",
  );
  assert.match(source, /api\.get\("\/services\?active=true"\)/);
  assert.doesNotMatch(source, /AVAILABLE_DEAL_SERVICES/);
  assert.doesNotMatch(source, /workspace_id|workspaceId|serviceKey/);
  assert.match(source, /draftDirtyRef\.current/);
  assert.match(source, /draftInitializedRef\.current/);
  assert.match(source, /onClick=\{\(\) => fetchActiveServices\(\)\}/);
  assert.match(
    source,
    /onClick=\{\(\) => retryServiceOpportunityFailures\(\)\}/,
  );
});
