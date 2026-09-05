const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ClosingDealServiceNotFoundError,
  ClosingDealValidationError,
  canonicalizeClosingDealDetails,
  validateClosingDealDetails,
} = require("../src/services/closingDealService");

function deal(serviceIds) {
  return {
    items: serviceIds.map((serviceId, index) => ({
      id: `item-${index}`,
      service_id: serviceId,
      service_label: "Valor vindo do cliente",
      billing_type: "recurring",
      amount: "1.250,00",
    })),
    totalInitialValue: 1250,
  };
}

test("valida itens, normaliza IDs e preserva sale details compatíveis", () => {
  const result = validateClosingDealDetails(deal(["7"]));
  assert.deepEqual(result.serviceIds, [7]);
  assert.equal(result.dealDetails.items[0].service_id, 7);
});

test("rejeita objeto, serviço, cobrança e valor inválidos", () => {
  assert.throws(
    () => validateClosingDealDetails(null),
    ClosingDealValidationError,
  );
  assert.throws(
    () => validateClosingDealDetails(deal([0])),
    ClosingDealValidationError,
  );
  assert.throws(
    () =>
      validateClosingDealDetails({
        items: [
          {
            service_id: 1,
            billing_type: "unknown",
            amount: 10,
          },
        ],
      }),
    ClosingDealValidationError,
  );
});

test("aceita ativo e serviço selecionado arquivado, canonicalizando label", () => {
  const clientDeal = deal([2, 9]);
  Object.assign(clientDeal, {
    oneTimeValue: 250,
    monthlyRecurringValue: 1000,
    closingDate: "2026-09-04",
    closedAt: "2026-09-04T12:00:00.000Z",
    workspace_id: 999,
    unknownRoot: "não persistir",
  });
  Object.assign(clientDeal.items[0], {
    icon: "🧩",
    frequency: "monthly",
    due_day: "5",
    deadline: "",
    notes: "Contrato anual",
    service_key: "forjado",
    unknownItem: true,
  });
  const validated = validateClosingDealDetails(clientDeal);
  const result = canonicalizeClosingDealDetails({
    dealDetails: validated.dealDetails,
    services: [
      { id: 2, service_name: "Ativo A", is_active: true },
      { id: 9, service_name: "Histórico", is_active: false },
    ],
    selectedServiceId: 9,
  });
  assert.deepEqual(
    result.items.map(({ service_id, service_label }) => ({
      service_id,
      service_label,
    })),
    [
      { service_id: 2, service_label: "Ativo A" },
      { service_id: 9, service_label: "Histórico" },
    ],
  );
  assert.equal(result.items[0].service_id, 2);
  assert.equal(result.items[0].service_label, "Ativo A");
  assert.equal(result.items[0].notes, "Contrato anual");
  assert.equal(result.items[0].frequency, "monthly");
  assert.equal(result.monthlyRecurringValue, 1000);
  assert.equal(result.closingDate, "2026-09-04");
  assert.equal("workspace_id" in result, false);
  assert.equal("unknownRoot" in result, false);
  assert.equal("service_key" in result.items[0], false);
  assert.equal("unknownItem" in result.items[0], false);
});

test("rejeita outro arquivado e serviço ausente/cross-workspace", () => {
  const validated = validateClosingDealDetails(deal([8]));
  assert.throws(
    () =>
      canonicalizeClosingDealDetails({
        dealDetails: validated.dealDetails,
        services: [{ id: 8, service_name: "Arquivado", is_active: false }],
        selectedServiceId: 9,
      }),
    ClosingDealServiceNotFoundError,
  );
  assert.throws(
    () =>
      canonicalizeClosingDealDetails({
        dealDetails: validated.dealDetails,
        services: [],
        selectedServiceId: 8,
      }),
    ClosingDealServiceNotFoundError,
  );
});
