export function createEmptyDealData() {
  return {
    items: [],
    totalInitialValue: 0,
    monthlyRecurringValue: 0,
    closingDate: new Date().toISOString().split("T")[0],
  };
}

function mapActiveService(service) {
  return {
    id: Number(service.id),
    name: service.name,
    label: service.name,
    isArchived: false,
  };
}

export function buildClosingServiceOptions(activeServices, current) {
  const options = (Array.isArray(activeServices) ? activeServices : []).map(
    mapActiveService,
  );
  const currentId = Number(current?.service_id);
  if (
    Number.isInteger(currentId) &&
    currentId > 0 &&
    current?.service_is_active === false &&
    !options.some((service) => service.id === currentId)
  ) {
    options.push({
      id: currentId,
      name: current.service_name,
      label: `${current.service_name} (Arquivado)`,
      isArchived: true,
    });
  }
  return options;
}

export function chooseInitialClosingService(activeServices, current) {
  const options = buildClosingServiceOptions(activeServices, current);
  const currentId = Number(current?.service_id);
  const currentOption = options.find((service) => service.id === currentId);
  return currentOption || options.find((service) => !service.isArchived) || null;
}

export function chooseAdditionalClosingService(activeServices) {
  const firstActive = Array.isArray(activeServices) ? activeServices[0] : null;
  return firstActive ? mapActiveService(firstActive) : null;
}

export function getDealItemServiceOptions(options, itemServiceId) {
  const currentItemId = Number(itemServiceId);
  return options.filter(
    (service) => !service.isArchived || service.id === currentItemId,
  );
}

export function createDealItem(service, id = `item_${Date.now()}`) {
  if (!service) return null;
  return {
    id,
    service_id: Number(service.id),
    service_label: service.name,
    icon: "🧩",
    billing_type: "recurring",
    amount: "",
    frequency: "monthly",
    due_day: "",
    deadline: "",
    notes: "",
  };
}

export function createLatestRequestGate() {
  let generation = 0;
  return Object.freeze({
    begin() {
      generation += 1;
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    isCurrent(requestGeneration) {
      return requestGeneration === generation;
    },
  });
}

export async function loadLatestResource({
  gate,
  load,
  onStart,
  onResolved,
  onRejected,
  onSettled,
}) {
  const requestGeneration = gate.begin();
  onStart?.();

  try {
    const value = await load();
    if (!gate.isCurrent(requestGeneration)) return { status: "stale" };
    onResolved?.(value);
    return { status: "fulfilled", value };
  } catch (error) {
    if (!gate.isCurrent(requestGeneration)) return { status: "stale" };
    onRejected?.(error);
    return { status: "rejected", reason: error };
  } finally {
    if (gate.isCurrent(requestGeneration)) onSettled?.();
  }
}

export function resolveClosingDraftInitialization({
  leadResolved,
  currentResolved,
  servicesResolved,
  existingDealDetails,
  activeServices,
  current,
  draftInitialized,
  draftDirty,
}) {
  if (!leadResolved || draftInitialized || draftDirty) return null;

  if (
    existingDealDetails &&
    typeof existingDealDetails === "object" &&
    Array.isArray(existingDealDetails.items)
  ) {
    return { source: "persisted", dealData: existingDealDetails };
  }

  if (!currentResolved || !servicesResolved) return null;

  const dealData = createEmptyDealData();
  const service = chooseInitialClosingService(activeServices, current);
  if (service) dealData.items = [createDealItem(service, "item_initial")];
  return { source: service ? "default" : "empty", dealData };
}
