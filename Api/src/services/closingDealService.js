class ClosingDealValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ClosingDealValidationError";
  }
}

class ClosingDealServiceNotFoundError extends Error {
  constructor() {
    super("Um ou mais serviços do fechamento não estão disponíveis.");
    this.name = "ClosingDealServiceNotFoundError";
  }
}

const DEAL_METADATA_FIELDS = Object.freeze([
  "totalInitialValue",
  "oneTimeValue",
  "monthlyRecurringValue",
  "closingDate",
  "closedAt",
]);

const DEAL_ITEM_CLIENT_FIELDS = Object.freeze([
  "id",
  "icon",
  "billing_type",
  "amount",
  "frequency",
  "due_day",
  "deadline",
  "notes",
]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseDealAmount(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const normalized = value.trim().replace(/\./gu, "").replace(",", ".");
  return normalized ? Number(normalized) : Number.NaN;
}

function normalizeServiceId(value) {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0
    ? numericValue
    : null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function validateOptionalString(source, key, maxCodePoints) {
  if (!hasOwn(source, key)) return undefined;
  const value = source[key];
  if (
    value !== null &&
    (typeof value !== "string" || Array.from(value).length > maxCodePoints)
  ) {
    throw new ClosingDealValidationError(`Campo ${key} inválido.`);
  }
  return value;
}

function validateOptionalNumber(source, key) {
  if (!hasOwn(source, key)) return undefined;
  const value = source[key];
  if (
    value !== null &&
    (typeof value !== "number" || !Number.isFinite(value) || value < 0)
  ) {
    throw new ClosingDealValidationError(`Campo ${key} inválido.`);
  }
  return value;
}

function assignPresent(target, source, fields) {
  for (const field of fields) {
    if (hasOwn(source, field)) target[field] = source[field];
  }
  return target;
}

function validateClosingDealDetails(dealDetails) {
  if (!isPlainObject(dealDetails) || !Array.isArray(dealDetails.items)) {
    throw new ClosingDealValidationError("Detalhes do fechamento inválidos.");
  }
  if (dealDetails.items.length === 0 || dealDetails.items.length > 50) {
    throw new ClosingDealValidationError(
      "O fechamento deve possuir entre 1 e 50 serviços.",
    );
  }

  const serviceIds = [];
  const items = dealDetails.items.map((item) => {
    if (!isPlainObject(item)) {
      throw new ClosingDealValidationError("Item do fechamento inválido.");
    }
    const serviceId = normalizeServiceId(item.service_id);
    if (!serviceId) {
      throw new ClosingDealValidationError("Serviço do fechamento inválido.");
    }
    if (!["one_time", "recurring"].includes(item.billing_type)) {
      throw new ClosingDealValidationError("Tipo de cobrança inválido.");
    }
    const amount = parseDealAmount(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ClosingDealValidationError(
        "O valor de cada serviço deve ser maior que zero.",
      );
    }

    const id = validateOptionalString(item, "id", 200);
    const icon = validateOptionalString(item, "icon", 64);
    const frequency = validateOptionalString(item, "frequency", 50);
    const dueDay = validateOptionalString(item, "due_day", 10);
    const deadline = validateOptionalString(item, "deadline", 100);
    const notes = validateOptionalString(item, "notes", 4000);

    serviceIds.push(serviceId);
    const projectedItem = {
      service_id: serviceId,
      billing_type: item.billing_type,
      amount: item.amount,
    };
    if (id !== undefined) projectedItem.id = id;
    if (icon !== undefined) projectedItem.icon = icon;
    if (frequency !== undefined) projectedItem.frequency = frequency;
    if (dueDay !== undefined) projectedItem.due_day = dueDay;
    if (deadline !== undefined) projectedItem.deadline = deadline;
    if (notes !== undefined) projectedItem.notes = notes;
    return projectedItem;
  });

  const totalInitialValue = validateOptionalNumber(
    dealDetails,
    "totalInitialValue",
  );
  const oneTimeValue = validateOptionalNumber(dealDetails, "oneTimeValue");
  const monthlyRecurringValue = validateOptionalNumber(
    dealDetails,
    "monthlyRecurringValue",
  );
  const closingDate = validateOptionalString(dealDetails, "closingDate", 100);
  const closedAt = validateOptionalString(dealDetails, "closedAt", 100);

  const projectedDealDetails = { items };
  if (totalInitialValue !== undefined) {
    projectedDealDetails.totalInitialValue = totalInitialValue;
  }
  if (oneTimeValue !== undefined) {
    projectedDealDetails.oneTimeValue = oneTimeValue;
  }
  if (monthlyRecurringValue !== undefined) {
    projectedDealDetails.monthlyRecurringValue = monthlyRecurringValue;
  }
  if (closingDate !== undefined) projectedDealDetails.closingDate = closingDate;
  if (closedAt !== undefined) projectedDealDetails.closedAt = closedAt;

  return {
    dealDetails: projectedDealDetails,
    serviceIds: [...new Set(serviceIds)],
  };
}

function canonicalizeClosingDealDetails({
  dealDetails,
  services,
  selectedServiceId,
}) {
  const servicesById = new Map(
    services.map((service) => [Number(service.id), service]),
  );
  const canonicalItems = dealDetails.items.map((item) => {
    const service = servicesById.get(Number(item.service_id));
    const isSelectedService =
      selectedServiceId !== null &&
      Number(item.service_id) === Number(selectedServiceId);
    if (!service || (service.is_active !== true && !isSelectedService)) {
      throw new ClosingDealServiceNotFoundError();
    }
    return assignPresent(
      {
        service_id: Number(service.id),
        service_label: service.service_name,
      },
      item,
      DEAL_ITEM_CLIENT_FIELDS,
    );
  });

  return assignPresent(
    { items: canonicalItems },
    dealDetails,
    DEAL_METADATA_FIELDS,
  );
}

module.exports = {
  ClosingDealServiceNotFoundError,
  ClosingDealValidationError,
  canonicalizeClosingDealDetails,
  parseDealAmount,
  validateClosingDealDetails,
};
