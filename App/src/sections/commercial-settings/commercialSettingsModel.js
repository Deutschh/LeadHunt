// eslint-disable-next-line no-control-regex
const SINGLE_LINE_UNSAFE_PATTERN = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u;
// eslint-disable-next-line no-control-regex
const MULTILINE_UNSAFE_PATTERN = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/u;

const PROFILE_FIELDS = Object.freeze({
  senderName: { maxCodePoints: 120, multiline: false },
  businessName: { maxCodePoints: 160, multiline: false },
  businessDescription: { maxCodePoints: 2000, multiline: true },
  salesContext: { maxCodePoints: 4000, multiline: true },
});

const SERVICE_FIELDS = Object.freeze({
  name: { maxCodePoints: 160, multiline: false },
  problemCategory: { maxCodePoints: 160, multiline: false },
  description: { maxCodePoints: 2000, multiline: true },
  howItWorks: { maxCodePoints: 4000, multiline: true },
});

const STRATEGY_FIELDS = Object.freeze({
  nicheName: { maxCodePoints: 160, multiline: false },
  hook: { maxCodePoints: 2000, multiline: true },
  callToAction: { maxCodePoints: 500, multiline: false },
});

export const EMPTY_PROFILE_FORM = Object.freeze({
  senderName: "",
  businessName: "",
  businessDescription: "",
  salesContext: "",
});

export const EMPTY_SERVICE_FORM = Object.freeze({
  name: "",
  type: "universal",
  problemCategory: "",
  description: "",
  howItWorks: "",
  problemsSolved: "",
  targetNiches: "",
});

export const EMPTY_STRATEGY_FORM = Object.freeze({
  nicheName: "",
  hook: "",
  callToAction: "",
});

function countCodePoints(value) {
  return Array.from(value).length;
}

function normalizeText(value, rules, { allowNull = false } = {}) {
  if (typeof value !== "string") {
    return { error: "Informe um texto válido." };
  }

  const lineNormalized = rules.multiline
    ? value.replace(/\r\n?/gu, "\n")
    : value;
  const unsafePattern = rules.multiline
    ? MULTILINE_UNSAFE_PATTERN
    : SINGLE_LINE_UNSAFE_PATTERN;

  if (unsafePattern.test(lineNormalized)) {
    return { error: "Remova caracteres de controle não permitidos." };
  }

  const normalized = lineNormalized.trim();
  if (!normalized) {
    return allowNull
      ? { value: null }
      : { error: "Este campo é obrigatório." };
  }
  if (countCodePoints(normalized) > rules.maxCodePoints) {
    return {
      error: `Use no máximo ${rules.maxCodePoints.toLocaleString("pt-BR")} caracteres.`,
    };
  }
  return { value: normalized };
}

function validationResult(value, errors) {
  return Object.keys(errors).length > 0 ? { errors } : { value };
}

function normalizedPersistedText(value, rules) {
  if (value === null || value === undefined) return null;
  return normalizeText(String(value), rules, { allowNull: true }).value ?? null;
}

export function canManageCommercialSettings(membership) {
  return membership?.role === "owner";
}

export function getNextSettingsTabIndex(currentIndex, key, tabCount) {
  if (
    !Number.isInteger(currentIndex) ||
    !Number.isInteger(tabCount) ||
    tabCount < 1 ||
    currentIndex < 0 ||
    currentIndex >= tabCount
  ) {
    throw new TypeError("Estado de navegação das abas inválido.");
  }

  if (key === "Home") return 0;
  if (key === "End") return tabCount - 1;
  if (key === "ArrowRight") return (currentIndex + 1) % tabCount;
  if (key === "ArrowLeft") return (currentIndex - 1 + tabCount) % tabCount;
  return null;
}

export function profileToForm(profile) {
  const form = {};
  for (const field of Object.keys(PROFILE_FIELDS)) {
    form[field] = typeof profile?.[field] === "string" ? profile[field] : "";
  }
  return form;
}

export function buildCommercialProfilePatch(form, persistedProfile) {
  const value = {};
  const errors = {};

  for (const [field, rules] of Object.entries(PROFILE_FIELDS)) {
    const result = normalizeText(form?.[field], rules, { allowNull: true });
    if (result.error) {
      errors[field] = result.error;
      continue;
    }

    const persisted = normalizedPersistedText(persistedProfile?.[field], rules);
    if (result.value !== persisted) value[field] = result.value;
  }

  const validated = validationResult(value, errors);
  return validated.errors
    ? validated
    : { value, unchanged: Object.keys(value).length === 0 };
}

function parseList(value, { field, maxCodePoints }) {
  if (typeof value !== "string") {
    return { error: "Informe uma lista válida." };
  }

  const items = value
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length > 50) {
    return { error: "Use no máximo 50 itens." };
  }

  const seen = new Set();
  for (const item of items) {
    const normalized = normalizeText(item, {
      maxCodePoints,
      multiline: false,
    });
    if (normalized.error) return { error: normalized.error };

    const comparisonKey = normalized.value.toLocaleLowerCase("pt-BR");
    if (seen.has(comparisonKey)) {
      return { error: `Remova itens duplicados de ${field}.` };
    }
    seen.add(comparisonKey);
  }

  return { value: items };
}

function normalizeServiceForm(form) {
  const value = {};
  const errors = {};

  for (const [field, rules] of Object.entries(SERVICE_FIELDS)) {
    const result = normalizeText(form?.[field], rules);
    if (result.error) errors[field] = result.error;
    else value[field] = result.value;
  }

  if (!new Set(["universal", "nichado"]).has(form?.type)) {
    errors.type = "Selecione um tipo válido.";
  } else {
    value.type = form.type;
  }

  const problems = parseList(form?.problemsSolved, {
    field: "problemas resolvidos",
    maxCodePoints: 300,
  });
  if (problems.error) errors.problemsSolved = problems.error;
  else value.problemsSolved = problems.value;

  const niches = parseList(form?.targetNiches, {
    field: "nichos-alvo",
    maxCodePoints: 160,
  });
  if (niches.error) errors.targetNiches = niches.error;
  else value.targetNiches = niches.value;

  return validationResult(value, errors);
}

export function serviceToForm(service) {
  return {
    name: service?.name || "",
    type: service?.type || "universal",
    problemCategory: service?.problemCategory || "",
    description: service?.description || "",
    howItWorks: service?.howItWorks || "",
    problemsSolved: Array.isArray(service?.problemsSolved)
      ? service.problemsSolved.join("\n")
      : "",
    targetNiches: Array.isArray(service?.targetNiches)
      ? service.targetNiches.join("\n")
      : "",
  };
}

export function buildServiceCreatePayload(form) {
  return normalizeServiceForm(form);
}

export function buildServicePatch(form, persistedService) {
  const normalized = normalizeServiceForm(form);
  if (normalized.errors) return normalized;

  const persisted = {
    name: persistedService.name,
    type: persistedService.type,
    problemCategory: persistedService.problemCategory,
    description: persistedService.description,
    howItWorks: persistedService.howItWorks,
    problemsSolved: persistedService.problemsSolved,
    targetNiches: persistedService.targetNiches,
  };
  const value = {};
  for (const [field, nextValue] of Object.entries(normalized.value)) {
    if (JSON.stringify(nextValue) !== JSON.stringify(persisted[field])) {
      value[field] = nextValue;
    }
  }
  return { value, unchanged: Object.keys(value).length === 0 };
}

export function buildServiceStatusPatch(isActive) {
  if (typeof isActive !== "boolean") {
    throw new TypeError("Status de serviço inválido.");
  }
  return { isActive };
}

export function buildNicheStrategyPayload(form) {
  const value = {};
  const errors = {};

  for (const [field, rules] of Object.entries(STRATEGY_FIELDS)) {
    const result = normalizeText(form?.[field], rules);
    if (result.error) errors[field] = result.error;
    else value[field] = result.value;
  }
  return validationResult(value, errors);
}

export function sortServices(services) {
  return [...services].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.id - right.id,
  );
}

export function sortStrategies(strategies) {
  return [...strategies].sort(
    (left, right) =>
      left.nicheName.localeCompare(right.nicheName, "pt-BR") ||
      left.id - right.id,
  );
}
