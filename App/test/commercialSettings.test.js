import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  deleteNicheStrategy,
  getCommercialProfile,
  getNicheStrategies,
  getServices,
  patchCommercialProfile,
  patchService,
  postNicheStrategy,
  postService,
} from "../src/sections/commercial-settings/commercialSettingsApi.js";
import {
  buildCommercialProfilePatch,
  buildNicheStrategyPayload,
  buildServiceCreatePayload,
  buildServicePatch,
  buildServiceStatusPatch,
  canManageCommercialSettings,
  getNextSettingsTabIndex,
  profileToForm,
} from "../src/sections/commercial-settings/commercialSettingsModel.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("perfil converte null para formulário vazio e envia somente alterações permitidas", () => {
  const persisted = {
    senderName: null,
    businessName: "Empresa",
    businessDescription: "Descrição",
    salesContext: null,
    presentationPreferences: { untouched: true },
    isComplete: false,
  };
  assert.deepEqual(profileToForm(persisted), {
    senderName: "",
    businessName: "Empresa",
    businessDescription: "Descrição",
    salesContext: "",
  });

  const result = buildCommercialProfilePatch(
    {
      senderName: "  Júlia 🚀  ",
      businessName: "Empresa",
      businessDescription: "   ",
      salesContext: "  Contexto\r\ncomercial  ",
    },
    persisted,
  );
  assert.deepEqual(result, {
    value: {
      senderName: "Júlia 🚀",
      businessDescription: null,
      salesContext: "Contexto\ncomercial",
    },
    unchanged: false,
  });
  assert.equal("presentationPreferences" in result.value, false);
  assert.equal("isComplete" in result.value, false);
  assert.equal("workspaceId" in result.value, false);
});

test("perfil conta code points e rejeita somente o limite excedido", () => {
  const exact = "😀".repeat(120);
  const valid = buildCommercialProfilePatch(
    {
      senderName: exact,
      businessName: "Empresa",
      businessDescription: "Descrição",
      salesContext: "Contexto",
    },
    {},
  );
  assert.equal(valid.errors, undefined);

  const invalid = buildCommercialProfilePatch(
    {
      senderName: `${exact}😀`,
      businessName: "Empresa",
      businessDescription: "Descrição",
      salesContext: "Contexto",
    },
    {},
  );
  assert.match(invalid.errors.senderName, /120/);
});

test("serviço normaliza campos e listas sem enviar estado, ordem ou identidade interna", () => {
  const result = buildServiceCreatePayload({
    name: "  Automação comercial  ",
    type: "nichado",
    problemCategory: "  Eficiência  ",
    description: "  Descrição  ",
    howItWorks: "  Etapa 1\r\nEtapa 2  ",
    problemsSolved: "Processos manuais\n\nRetrabalho",
    targetNiches: "Clínicas\nEscritórios",
  });
  assert.deepEqual(result.value, {
    name: "Automação comercial",
    type: "nichado",
    problemCategory: "Eficiência",
    description: "Descrição",
    howItWorks: "Etapa 1\nEtapa 2",
    problemsSolved: ["Processos manuais", "Retrabalho"],
    targetNiches: ["Clínicas", "Escritórios"],
  });
  for (const forbidden of [
    "displayOrder",
    "isActive",
    "id",
    "serviceKey",
    "workspaceId",
  ]) {
    assert.equal(forbidden in result.value, false);
  }
});

test("serviço rejeita obrigatórios, enum e listas duplicadas", () => {
  const result = buildServiceCreatePayload({
    name: " ",
    type: "global",
    problemCategory: "Categoria",
    description: "Descrição",
    howItWorks: "Como funciona",
    problemsSolved: "Retrabalho\n retrabalho ",
    targetNiches: "Clínicas",
  });
  assert.ok(result.errors.name);
  assert.ok(result.errors.type);
  assert.match(result.errors.problemsSolved, /duplicados/);
});

test("PATCH de serviço preserva omitidos e status usa payload mínimo", () => {
  const service = {
    id: 8,
    name: "Site",
    type: "universal",
    problemCategory: "Presença digital",
    description: "Descrição",
    howItWorks: "Como funciona",
    problemsSolved: ["Baixa conversão"],
    targetNiches: [],
    isActive: true,
    displayOrder: 4,
  };
  const result = buildServicePatch(
    {
      name: "Site novo",
      type: "universal",
      problemCategory: "Presença digital",
      description: "Descrição",
      howItWorks: "Como funciona",
      problemsSolved: "Baixa conversão",
      targetNiches: "",
    },
    service,
  );
  assert.deepEqual(result.value, { name: "Site novo" });
  assert.deepEqual(buildServiceStatusPatch(false), { isActive: false });
  assert.throws(() => buildServiceStatusPatch("false"), TypeError);
});

test("estratégia exige CTA, preserva camelCase e não normaliza caixa", () => {
  const invalid = buildNicheStrategyPayload({
    nicheName: "Dentistas",
    hook: "Foco",
    callToAction: "   ",
  });
  assert.ok(invalid.errors.callToAction);

  const valid = buildNicheStrategyPayload({
    nicheName: "  Dentistas  ",
    hook: "  Foco\r\ncomercial  ",
    callToAction: "  Podemos conversar?  ",
  });
  assert.deepEqual(valid.value, {
    nicheName: "Dentistas",
    hook: "Foco\ncomercial",
    callToAction: "Podemos conversar?",
  });
  assert.equal("niche_name" in valid.value, false);
  assert.notEqual(valid.value.nicheName, "dentistas");
});

test("somente owner recebe habilitação de escrita comercial", () => {
  assert.equal(canManageCommercialSettings({ role: "owner" }), true);
  assert.equal(canManageCommercialSettings({ role: "member" }), false);
  assert.equal(canManageCommercialSettings({ role: "admin" }), false);
  assert.equal(canManageCommercialSettings(null), false);
});

test("navegação das tabs é circular e suporta Home e End", () => {
  assert.equal(getNextSettingsTabIndex(0, "ArrowRight", 3), 1);
  assert.equal(getNextSettingsTabIndex(2, "ArrowRight", 3), 0);
  assert.equal(getNextSettingsTabIndex(2, "ArrowLeft", 3), 1);
  assert.equal(getNextSettingsTabIndex(0, "ArrowLeft", 3), 2);
  assert.equal(getNextSettingsTabIndex(1, "Home", 3), 0);
  assert.equal(getNextSettingsTabIndex(1, "End", 3), 2);
  assert.equal(getNextSettingsTabIndex(1, "Enter", 3), null);
});

test("painéis permanecem montados e tabs mantêm o contrato acessível", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "src", "sections", "config.jsx"),
    "utf8",
  );

  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /aria-selected=\{active\}/);
  assert.match(source, /aria-controls=\{`settings-panel-\$\{tab\.id\}`\}/);
  assert.match(source, /tabIndex=\{active \? 0 : -1\}/);
  assert.equal((source.match(/role="tabpanel"/g) || []).length, 3);

  for (const tab of ["identity", "services", "strategies"]) {
    assert.match(source, new RegExp(`id="settings-panel-${tab}"`));
    assert.match(source, new RegExp(`aria-labelledby="settings-tab-${tab}"`));
    assert.match(
      source,
      new RegExp(`hidden=\\{activeTab !== "${tab}"\\}`),
    );
  }

  assert.doesNotMatch(source, /activeTab === "identity"\s*&&/);
  assert.doesNotMatch(source, /activeTab === "services"\s*&&/);
  assert.doesNotMatch(source, /activeTab === "strategies"\s*&&/);
  assert.match(source, /event\.key/);
  assert.match(source, /tabRefs\.current\[nextIndex\]\?\.focus\(\)/);
});

test("wrappers usam paths relativos à base /api e encaminham signal", async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const api = {
    get: async (...args) => {
      calls.push(["get", ...args]);
      if (args[0] === "/services") return { data: { services: [] } };
      if (args[0] === "/leads/niches") return { data: [] };
      return { data: { isComplete: false } };
    },
    post: async (...args) => {
      calls.push(["post", ...args]);
      return { data: { id: 1 } };
    },
    patch: async (...args) => {
      calls.push(["patch", ...args]);
      return { data: { id: 1 } };
    },
    delete: async (...args) => {
      calls.push(["delete", ...args]);
      return { data: { message: "ok" } };
    },
  };

  await getCommercialProfile(api, { signal });
  await patchCommercialProfile(api, { senderName: "Ana" });
  await getServices(api, { signal });
  await postService(api, { name: "Serviço" });
  await patchService(api, 4, { name: "Novo" });
  await getNicheStrategies(api, { signal });
  await postNicheStrategy(api, { nicheName: "Saúde" });
  await deleteNicheStrategy(api, 9);

  assert.deepEqual(
    calls.map(([method, requestPath]) => [method, requestPath]),
    [
      ["get", "/commercial-profile"],
      ["patch", "/commercial-profile"],
      ["get", "/services"],
      ["post", "/services"],
      ["patch", "/services/4"],
      ["get", "/leads/niches"],
      ["post", "/leads/niches"],
      ["delete", "/leads/niches/9"],
    ],
  );
  assert.equal(calls.some(([, requestPath]) => requestPath.startsWith("/api/")), false);
  assert.equal(calls[0][2].signal, signal);
  assert.equal(calls[2][2].signal, signal);
  assert.equal(calls[5][2].signal, signal);
});

test("Config comercial não cria transporte nem envia workspace", () => {
  const sourceDirectory = path.join(
    projectRoot,
    "src",
    "sections",
    "commercial-settings",
  );
  const source = fs
    .readdirSync(sourceDirectory)
    .filter((file) => /\.(?:js|jsx)$/.test(file))
    .map((file) => fs.readFileSync(path.join(sourceDirectory, file), "utf8"))
    .join("\n");

  assert.doesNotMatch(source, /\baxios\b|\bfetch\s*\(|API_BASE_URL|Authorization/);
  assert.doesNotMatch(source, /["'`]\/api\//);
  assert.doesNotMatch(source, /workspace_id/);
  assert.doesNotMatch(source, /database\/db/);
});
