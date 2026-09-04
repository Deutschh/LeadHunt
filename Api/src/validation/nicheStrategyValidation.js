const MAX_INT_32 = 2147483647;

const TEXT_FIELDS = Object.freeze({
  nicheName: Object.freeze({
    maxCodePoints: 160,
    maxBytes: 640,
    multiline: false,
  }),
  hook: Object.freeze({
    maxCodePoints: 2000,
    maxBytes: 8000,
    multiline: true,
  }),
  callToAction: Object.freeze({
    maxCodePoints: 500,
    maxBytes: 2000,
    multiline: false,
  }),
});

const ALLOWED_FIELDS = Object.freeze(Object.keys(TEXT_FIELDS));
const ALLOWED_FIELD_SET = new Set(ALLOWED_FIELDS);
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

function normalizeText(value, rules) {
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

function validationError(fieldErrors) {
  return {
    error: {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Revise os dados da estratégia de nicho.",
      ...(fieldErrors ? { fieldErrors } : {}),
    },
  };
}

function validateNicheStrategyPayload(body) {
  if (!isPlainObject(body)) return validationError();

  const inputFields = Object.keys(body);
  if (
    inputFields.length === 0 ||
    inputFields.some((field) => !ALLOWED_FIELD_SET.has(field)) ||
    ALLOWED_FIELDS.some((field) => !Object.hasOwn(body, field))
  ) {
    return validationError();
  }

  const value = {};
  const fieldErrors = {};
  for (const [fieldName, rules] of Object.entries(TEXT_FIELDS)) {
    const result = normalizeText(body[fieldName], rules);
    if (result.error) fieldErrors[fieldName] = result.error;
    else value[fieldName] = result.value;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return validationError(fieldErrors);
  }
  return { value };
}

function normalizeNicheNameForLookup(value) {
  return normalizeText(value, TEXT_FIELDS.nicheName);
}

function validateNicheStrategyId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/u.test(value) ||
    Number(value) > MAX_INT_32
  ) {
    return validationError({ id: "must_be_positive_integer" });
  }
  return { value };
}

module.exports = {
  ALLOWED_FIELDS,
  MAX_INT_32,
  TEXT_FIELDS,
  countCodePoints,
  normalizeNicheNameForLookup,
  validateNicheStrategyId,
  validateNicheStrategyPayload,
};
