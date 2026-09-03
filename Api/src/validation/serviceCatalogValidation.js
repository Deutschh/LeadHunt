const MAX_INT_32 = 2147483647;

const TEXT_FIELDS = Object.freeze({
  name: Object.freeze({ maxCodePoints: 160, maxBytes: 640, multiline: false }),
  problemCategory: Object.freeze({
    maxCodePoints: 160,
    maxBytes: 640,
    multiline: false,
  }),
  description: Object.freeze({
    maxCodePoints: 2000,
    maxBytes: 8000,
    multiline: true,
  }),
  howItWorks: Object.freeze({
    maxCodePoints: 4000,
    maxBytes: 16000,
    multiline: true,
  }),
});

const ARRAY_FIELDS = Object.freeze({
  problemsSolved: Object.freeze({ maxCodePoints: 300, maxBytes: 1200 }),
  targetNiches: Object.freeze({ maxCodePoints: 160, maxBytes: 640 }),
});

const ALLOWED_FIELDS = Object.freeze([
  ...Object.keys(TEXT_FIELDS),
  "type",
  ...Object.keys(ARRAY_FIELDS),
  "isActive",
  "displayOrder",
]);
const ALLOWED_FIELD_SET = new Set(ALLOWED_FIELDS);
const REQUIRED_CREATE_FIELDS = Object.freeze([
  "name",
  "type",
  "problemCategory",
  "description",
  "howItWorks",
]);
const SERVICE_TYPES = new Set(["universal", "nichado"]);
const SINGLE_LINE_UNSAFE_PATTERN =
  /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u;
const MULTILINE_UNSAFE_PATTERN = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/u;

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function countCodePoints(value) {
  return Array.from(value).length;
}

function normalizeString(value, rules) {
  if (typeof value !== "string") return { error: "must_be_string" };

  const lineNormalized = rules.multiline
    ? value.replace(/\r\n?/gu, "\n")
    : value;
  const unsafePattern = rules.multiline
    ? MULTILINE_UNSAFE_PATTERN
    : SINGLE_LINE_UNSAFE_PATTERN;

  if (unsafePattern.test(lineNormalized)) {
    return { error: "contains_unsafe_control" };
  }
  const normalized = lineNormalized.trim();
  if (normalized.length === 0) return { error: "must_not_be_blank" };
  if (countCodePoints(normalized) > rules.maxCodePoints) {
    return { error: "too_many_code_points" };
  }
  if (Buffer.byteLength(normalized, "utf8") > rules.maxBytes) {
    return { error: "too_many_bytes" };
  }
  return { value: normalized };
}

function normalizeStringArray(value, rules) {
  if (!Array.isArray(value)) return { error: "must_be_array" };
  if (value.length > 50) return { error: "too_many_items" };

  const normalized = [];
  const seen = new Set();
  for (const item of value) {
    const result = normalizeString(item, { ...rules, multiline: false });
    if (result.error) return { error: `item_${result.error}` };

    const comparisonKey = result.value.toLocaleLowerCase("pt-BR");
    if (seen.has(comparisonKey)) return { error: "duplicate_items" };
    seen.add(comparisonKey);
    normalized.push(result.value);
  }
  return { value: normalized };
}

function validationError(fieldErrors) {
  return {
    error: {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Revise os dados do serviço.",
      ...(fieldErrors ? { fieldErrors } : {}),
    },
  };
}

function validateFields(body, { requireCreateFields }) {
  if (!isPlainObject(body)) return validationError();

  const inputFields = Object.keys(body);
  if (
    inputFields.length === 0 ||
    inputFields.some((field) => !ALLOWED_FIELD_SET.has(field)) ||
    (requireCreateFields &&
      REQUIRED_CREATE_FIELDS.some((field) => !Object.hasOwn(body, field)))
  ) {
    return validationError();
  }

  const value = {};
  const fieldErrors = {};

  for (const [fieldName, rules] of Object.entries(TEXT_FIELDS)) {
    if (!Object.hasOwn(body, fieldName)) continue;
    const result = normalizeString(body[fieldName], rules);
    if (result.error) fieldErrors[fieldName] = result.error;
    else value[fieldName] = result.value;
  }

  if (Object.hasOwn(body, "type")) {
    const result = normalizeString(body.type, {
      maxCodePoints: 20,
      maxBytes: 80,
      multiline: false,
    });
    if (result.error || !SERVICE_TYPES.has(result.value)) {
      fieldErrors.type = result.error || "invalid_value";
    } else {
      value.type = result.value;
    }
  }

  for (const [fieldName, rules] of Object.entries(ARRAY_FIELDS)) {
    if (!Object.hasOwn(body, fieldName)) continue;
    const result = normalizeStringArray(body[fieldName], rules);
    if (result.error) fieldErrors[fieldName] = result.error;
    else value[fieldName] = result.value;
  }

  if (Object.hasOwn(body, "isActive")) {
    if (typeof body.isActive !== "boolean") {
      fieldErrors.isActive = "must_be_boolean";
    } else {
      value.isActive = body.isActive;
    }
  }

  if (Object.hasOwn(body, "displayOrder")) {
    if (
      !Number.isInteger(body.displayOrder) ||
      body.displayOrder < 0 ||
      body.displayOrder > MAX_INT_32
    ) {
      fieldErrors.displayOrder = "must_be_non_negative_integer";
    } else {
      value.displayOrder = body.displayOrder;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return validationError(fieldErrors);
  }
  if (Object.keys(value).length === 0) return validationError();
  return { value };
}

function validateServiceCreate(body) {
  const result = validateFields(body, { requireCreateFields: true });
  if (result.error) return result;
  return {
    value: {
      ...result.value,
      problemsSolved: result.value.problemsSolved || [],
      targetNiches: result.value.targetNiches || [],
      isActive: result.value.isActive ?? true,
    },
  };
}

function validateServicePatch(body) {
  return validateFields(body, { requireCreateFields: false });
}

function validateServiceId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/u.test(value) ||
    Number(value) > MAX_INT_32
  ) {
    return validationError({ serviceId: "must_be_positive_integer" });
  }
  return { value };
}

function validateActiveFilter(value) {
  if (value === undefined) return { value: undefined };
  if (value === "true") return { value: true };
  if (value === "false") return { value: false };
  return validationError({ active: "must_be_boolean" });
}

module.exports = {
  ALLOWED_FIELDS,
  ARRAY_FIELDS,
  MAX_INT_32,
  TEXT_FIELDS,
  countCodePoints,
  validateActiveFilter,
  validateServiceCreate,
  validateServiceId,
  validateServicePatch,
};
