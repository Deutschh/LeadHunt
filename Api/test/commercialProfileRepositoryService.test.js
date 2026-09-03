const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createCommercialProfileRepository,
} = require("../src/repositories/commercialProfileRepository");
const {
  CommercialProfileStateError,
  createCommercialProfileService,
  mapPersistedProfile,
} = require("../src/services/commercialProfileService");

function persistedRow(overrides = {}) {
  return {
    sender_name: null,
    business_name: null,
    business_description: null,
    sales_context: null,
    presentation_preferences: {},
    ...overrides,
  };
}

test("repository lê somente o singleton do workspace recebido", async () => {
  const calls = [];
  const repository = createCommercialProfileRepository({
    db: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [persistedRow()] };
      },
    },
  });

  await repository.findByWorkspaceId("41");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FROM public\.workspace_commercial_profiles/);
  assert.match(calls[0].sql, /WHERE workspace_id = \$1/);
  assert.doesNotMatch(calls[0].sql, /created_at|updated_at/);
  assert.deepEqual(calls[0].params, ["41"]);
});

test("repository monta UPDATE allowlisted em ordem canônica e retorna estado persistido", async () => {
  const calls = [];
  const row = persistedRow({ sender_name: "Ana", business_name: "Acme" });
  const repository = createCommercialProfileRepository({
    db: {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [row] };
      },
    },
  });

  const result = await repository.updateByWorkspaceId("9", {
    presentationPreferences: { tone: "direto" },
    salesContext: null,
    senderName: "Ana",
  });

  assert.equal(result, row);
  assert.match(
    calls[0].sql,
    /SET sender_name = \$2, sales_context = \$3, presentation_preferences = \$4, updated_at = NOW\(\)/,
  );
  assert.match(calls[0].sql, /WHERE workspace_id = \$1/);
  assert.match(calls[0].sql, /RETURNING sender_name, business_name/);
  assert.deepEqual(calls[0].params, [
    "9",
    "Ana",
    null,
    JSON.stringify({ tone: "direto" }),
  ]);
});

test("repository nunca executa UPDATE sem campo persistível", async () => {
  let queryCalls = 0;
  const repository = createCommercialProfileRepository({
    db: { async query() { queryCalls += 1; } },
  });
  await assert.rejects(
    repository.updateByWorkspaceId("9", {}),
    /Patch sem campos persistíveis/,
  );
  assert.equal(queryCalls, 0);
});

test("service mapeia camelCase e deriva completude do row retornado", async () => {
  const repository = {
    async findByWorkspaceId() {
      return persistedRow();
    },
    async updateByWorkspaceId(workspaceId, patch) {
      assert.equal(workspaceId, "7");
      assert.deepEqual(patch, { businessDescription: "Nova descrição" });
      return persistedRow({
        sender_name: "  Júlia  ",
        business_name: "  Empresa  ",
        business_description: "Nova descrição",
        presentation_preferences: { tone: "direto" },
      });
    },
  };
  const service = createCommercialProfileService({ repository });

  assert.deepEqual(await service.getByWorkspaceId("7"), {
    senderName: null,
    businessName: null,
    businessDescription: null,
    salesContext: null,
    presentationPreferences: {},
    isComplete: false,
  });
  assert.deepEqual(
    await service.updateByWorkspaceId("7", {
      businessDescription: "Nova descrição",
    }),
    {
      senderName: "  Júlia  ",
      businessName: "  Empresa  ",
      businessDescription: "Nova descrição",
      salesContext: null,
      presentationPreferences: { tone: "direto" },
      isComplete: true,
    },
  );
});

test("service trata ausência ou forma persistida inválida como conflito estrutural", async () => {
  for (const row of [null, persistedRow({ presentation_preferences: [] })]) {
    const service = createCommercialProfileService({
      repository: {
        async findByWorkspaceId() { return row; },
        async updateByWorkspaceId() { return row; },
      },
    });
    await assert.rejects(
      service.getByWorkspaceId("7"),
      CommercialProfileStateError,
    );
  }
  assert.throws(() => mapPersistedProfile(undefined), CommercialProfileStateError);
});
