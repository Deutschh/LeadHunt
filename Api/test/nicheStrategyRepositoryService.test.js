const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createNicheStrategyRepository,
} = require("../src/repositories/nicheStrategyRepository");
const {
  NicheStrategyNotFoundError,
  createNicheStrategyService,
} = require("../src/services/nicheStrategyService");

function row(overrides = {}) {
  return {
    id: 7,
    niche_name: "Dentistas",
    hook: "Foco comercial",
    call_to_action: "Podemos conversar?",
    ...overrides,
  };
}

function data(overrides = {}) {
  return {
    nicheName: "Dentistas",
    hook: "Foco comercial",
    callToAction: "Podemos conversar?",
    ...overrides,
  };
}

test("repository lista e resolve somente por workspace com matching exato", async () => {
  const calls = [];
  const repository = createNicheStrategyRepository({
    db: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [row()] };
      },
    },
  });

  await repository.findAllByWorkspaceId("41");
  assert.match(calls[0].sql, /FROM public\.niche_strategies/);
  assert.match(calls[0].sql, /WHERE workspace_id = \$1/);
  assert.match(calls[0].sql, /ORDER BY niche_name ASC, id ASC/);
  assert.doesNotMatch(calls[0].sql, /SELECT \*|workspace_id,/);
  assert.deepEqual(calls[0].params, ["41"]);

  await repository.findByWorkspaceIdAndNicheName("41", "Dentistas");
  assert.match(
    calls[1].sql,
    /WHERE workspace_id = \$1\s+AND niche_name = \$2\s+LIMIT 1/,
  );
  assert.doesNotMatch(calls[1].sql, /LOWER|ILIKE|unaccent/iu);
  assert.deepEqual(calls[1].params, ["41", "Dentistas"]);
});

test("upsert grava workspace server-side e usa a UNIQUE composta", async () => {
  const calls = [];
  const repository = createNicheStrategyRepository({
    db: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [row()] };
      },
    },
  });

  await repository.upsertByWorkspaceId("9", data());
  assert.match(calls[0].sql, /INSERT INTO public\.niche_strategies/);
  assert.match(calls[0].sql, /workspace_id,\s*niche_name,/);
  assert.match(calls[0].sql, /ON CONFLICT \(workspace_id, niche_name\)/);
  assert.match(calls[0].sql, /hook = EXCLUDED\.hook/);
  assert.deepEqual(calls[0].params, [
    "9",
    "Dentistas",
    "Foco comercial",
    "Podemos conversar?",
  ]);
});

test("delete sempre combina id e workspace", async () => {
  const calls = [];
  const repository = createNicheStrategyRepository({
    db: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [{ id: 7 }] };
      },
    },
  });

  await repository.deleteByIdAndWorkspaceId("7", "9");
  assert.match(calls[0].sql, /WHERE id = \$1\s+AND workspace_id = \$2/);
  assert.deepEqual(calls[0].params, ["7", "9"]);
});

test("service neutraliza o contrato e falha fechado para linha incompatível", async () => {
  const repository = {
    async findAllByWorkspaceId(workspaceId) {
      assert.equal(workspaceId, "9");
      return [row({ workspace_id: "9", created_at: "interno" })];
    },
    async upsertByWorkspaceId() { return row(); },
    async deleteByIdAndWorkspaceId() { return { id: 7 }; },
    async findByWorkspaceIdAndNicheName() { return row(); },
  };
  const service = createNicheStrategyService({ repository });

  assert.deepEqual(await service.listByWorkspaceId("9"), [
    {
      id: 7,
      nicheName: "Dentistas",
      hook: "Foco comercial",
      callToAction: "Podemos conversar?",
    },
  ]);

  repository.findAllByWorkspaceId = async () => [row({ hook: "" })];
  await assert.rejects(service.listByWorkspaceId("9"), /persistida inválida/);
});

test("resolver retorna somente a estratégia exata do workspace ou null", async () => {
  const calls = [];
  const repository = {
    async findAllByWorkspaceId() { return []; },
    async upsertByWorkspaceId() { return row(); },
    async deleteByIdAndWorkspaceId() { return { id: 7 }; },
    async findByWorkspaceIdAndNicheName(workspaceId, nicheName) {
      calls.push([workspaceId, nicheName]);
      if (workspaceId === "11" && nicheName === "Dentistas") return row();
      return null;
    },
  };
  const service = createNicheStrategyService({ repository });

  assert.deepEqual(
    await service.resolveWorkspaceNicheStrategy("11", "  Dentistas  "),
    {
      id: 7,
      nicheName: "Dentistas",
      hook: "Foco comercial",
      callToAction: "Podemos conversar?",
    },
  );
  assert.equal(
    await service.resolveWorkspaceNicheStrategy("12", "Dentistas"),
    null,
  );
  assert.deepEqual(calls, [
    ["11", "Dentistas"],
    ["12", "Dentistas"],
  ]);

  const callsBeforeInvalid = calls.length;
  for (const invalid of [null, "", "  ", "A\nB", "x".repeat(161)]) {
    assert.equal(
      await service.resolveWorkspaceNicheStrategy("11", invalid),
      null,
    );
  }
  assert.equal(calls.length, callsBeforeInvalid);
  await assert.rejects(
    service.resolveWorkspaceNicheStrategy("0", "Dentistas"),
    TypeError,
  );
});

test("upsert e delete propagam contrato e ausência própria", async () => {
  const calls = [];
  const repository = {
    async findAllByWorkspaceId() { return []; },
    async findByWorkspaceIdAndNicheName() { return null; },
    async upsertByWorkspaceId(workspaceId, payload) {
      calls.push(["upsert", workspaceId, payload]);
      return row();
    },
    async deleteByIdAndWorkspaceId(id, workspaceId) {
      calls.push(["delete", id, workspaceId]);
      return null;
    },
  };
  const service = createNicheStrategyService({ repository });
  assert.deepEqual(await service.upsertByWorkspaceId("9", data()), {
    id: 7,
    ...data(),
  });
  await assert.rejects(
    service.deleteByIdAndWorkspaceId("7", "9"),
    NicheStrategyNotFoundError,
  );
  assert.deepEqual(calls, [
    ["upsert", "9", data()],
    ["delete", "7", "9"],
  ]);
});
