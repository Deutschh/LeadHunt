const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createServiceCatalogRepository,
} = require("../src/repositories/serviceCatalogRepository");
const {
  SERVICE_KEY_CONSTRAINT,
  ServiceKeyConflictError,
  ServiceNotFoundError,
  createServiceCatalogService,
  isServiceKeyCollision,
} = require("../src/services/serviceCatalogService");

function row(overrides = {}) {
  return {
    id: 7,
    service_name: "Automação",
    service_type: "universal",
    problem_category: "Eficiência",
    description: "Descrição",
    how_it_works: "Execução",
    problems_solved: ["Retrabalho"],
    target_niches: ["Clínicas"],
    is_active: true,
    display_order: 1,
    ...overrides,
  };
}

function createData(overrides = {}) {
  return {
    name: "Automação",
    type: "universal",
    problemCategory: "Eficiência",
    description: "Descrição",
    howItWorks: "Execução",
    problemsSolved: ["Retrabalho"],
    targetNiches: ["Clínicas"],
    isActive: true,
    ...overrides,
  };
}

test("repository lista somente o workspace, filtra active e ordena deterministicamente", async () => {
  const calls = [];
  const repository = createServiceCatalogRepository({
    db: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [row()] };
      },
    },
  });

  await repository.findAllByWorkspaceId("41");
  assert.match(calls[0].sql, /FROM public\.velaris_services/);
  assert.match(calls[0].sql, /WHERE workspace_id = \$1/);
  assert.match(calls[0].sql, /ORDER BY display_order ASC, id ASC/);
  assert.doesNotMatch(calls[0].sql, /service_key|workspace_id,/);
  assert.deepEqual(calls[0].params, ["41"]);

  await repository.findAllByWorkspaceId("41", { active: false });
  assert.match(calls[1].sql, /AND is_active = \$2/);
  assert.deepEqual(calls[1].params, ["41", false]);
});

test("POST grava workspace e calcula displayOrder omitido dentro do INSERT", async () => {
  const calls = [];
  const repository = createServiceCatalogRepository({
    db: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [row()] };
      },
    },
  });

  await repository.createByWorkspaceId("9", "svc_opaque", createData());
  assert.match(calls[0].sql, /INSERT INTO public\.velaris_services/);
  assert.match(calls[0].sql, /workspace_id,\s*service_key,/);
  assert.match(
    calls[0].sql,
    /SELECT COALESCE\(MAX\(display_order\)::bigint \+ 1, 0\)[\s\S]*WHERE workspace_id = \$1/,
  );
  assert.doesNotMatch(calls[0].sql, /FOR UPDATE|LOCK|BEGIN/);
  assert.deepEqual(calls[0].params, [
    "9",
    "svc_opaque",
    "Automação",
    "universal",
    "Eficiência",
    "Descrição",
    "Execução",
    '["Retrabalho"]',
    '["Clínicas"]',
    true,
  ]);

  await repository.createByWorkspaceId(
    "9",
    "svc_explicit",
    createData({ displayOrder: 4 }),
  );
  assert.match(calls[1].sql, /\$11\)/);
  assert.doesNotMatch(calls[1].sql, /MAX\(display_order\)/);
  assert.equal(calls[1].params.at(-1), 4);
});

test("PATCH usa id + workspace, altera somente campos presentes e não reordena outros", async () => {
  const calls = [];
  const repository = createServiceCatalogRepository({
    db: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [row({ display_order: 1, is_active: false })] };
      },
    },
  });

  await repository.updateByIdAndWorkspaceId("7", "9", {
    problemsSolved: [],
    isActive: false,
    displayOrder: 1,
  });
  assert.match(
    calls[0].sql,
    /SET problems_solved = \$3::jsonb, is_active = \$4, display_order = \$5/,
  );
  assert.match(calls[0].sql, /WHERE id = \$1\s+AND workspace_id = \$2/);
  assert.doesNotMatch(calls[0].sql, /updated_at|CASE|ROW_NUMBER|WITH /);
  assert.deepEqual(calls[0].params, ["7", "9", "[]", false, 1]);

  let queryCalls = 0;
  const guarded = createServiceCatalogRepository({
    db: { async query() { queryCalls += 1; } },
  });
  await assert.rejects(
    guarded.updateByIdAndWorkspaceId("7", "9", {}),
    /Patch sem campos persistíveis/,
  );
  assert.equal(queryCalls, 0);
});

test("service mapeia contrato neutro sem expor key ou workspace", async () => {
  const service = createServiceCatalogService({
    repository: {
      async findAllByWorkspaceId(workspaceId, options) {
        assert.equal(workspaceId, "9");
        assert.deepEqual(options, { active: true });
        return [row({ service_key: "site", workspace_id: "9" })];
      },
      async createByWorkspaceId() { return row(); },
      async updateByIdAndWorkspaceId() { return row(); },
    },
  });
  assert.deepEqual(await service.listByWorkspaceId("9", { active: true }), [
    {
      id: 7,
      name: "Automação",
      type: "universal",
      problemCategory: "Eficiência",
      description: "Descrição",
      howItWorks: "Execução",
      problemsSolved: ["Retrabalho"],
      targetNiches: ["Clínicas"],
      isActive: true,
      displayOrder: 1,
    },
  ]);
});

test("service falha fechado para forma persistida incompatível com o contrato", async () => {
  const service = createServiceCatalogService({
    repository: {
      async findAllByWorkspaceId() {
        return [row({ problems_solved: [42] })];
      },
      async createByWorkspaceId() { return row(); },
      async updateByIdAndWorkspaceId() { return row(); },
    },
  });
  await assert.rejects(service.listByWorkspaceId("9"), /persistido inválido/);
});

test("service gera key opaca e só repete a constraint workspace/key confirmada", async () => {
  const keys = ["one", "two", "three"];
  const calls = [];
  const repository = {
    async findAllByWorkspaceId() { return []; },
    async updateByIdAndWorkspaceId() { return row(); },
    async createByWorkspaceId(workspaceId, key) {
      calls.push([workspaceId, key]);
      if (calls.length < 3) {
        throw { code: "23505", constraint: SERVICE_KEY_CONSTRAINT };
      }
      return row();
    },
  };
  const service = createServiceCatalogService({
    repository,
    keyFactory: () => `svc_${keys.shift()}`,
  });
  await service.createByWorkspaceId("9", createData());
  assert.deepEqual(calls, [
    ["9", "svc_one"],
    ["9", "svc_two"],
    ["9", "svc_three"],
  ]);

  assert.equal(
    isServiceKeyCollision({ code: "23505", constraint: SERVICE_KEY_CONSTRAINT }),
    true,
  );
  for (const error of [
    { code: "23505", constraint: "another_unique" },
    { code: "22000", constraint: SERVICE_KEY_CONSTRAINT },
  ]) assert.equal(isServiceKeyCollision(error), false);
});

test("service não repete outros 23505 e encerra após três colisões da key", async () => {
  let calls = 0;
  const baseRepository = {
    async findAllByWorkspaceId() { return []; },
    async updateByIdAndWorkspaceId() { return null; },
    async createByWorkspaceId() {
      calls += 1;
      throw { code: "23505", constraint: "other_constraint" };
    },
  };
  let service = createServiceCatalogService({ repository: baseRepository });
  await assert.rejects(service.createByWorkspaceId("9", createData()));
  assert.equal(calls, 1);

  calls = 0;
  service = createServiceCatalogService({
    repository: {
      ...baseRepository,
      async createByWorkspaceId() {
        calls += 1;
        throw { code: "23505", constraint: SERVICE_KEY_CONSTRAINT };
      },
    },
  });
  await assert.rejects(
    service.createByWorkspaceId("9", createData()),
    ServiceKeyConflictError,
  );
  assert.equal(calls, 3);
  await assert.rejects(
    service.updateByIdAndWorkspaceId("88", "9", { isActive: false }),
    ServiceNotFoundError,
  );
});
