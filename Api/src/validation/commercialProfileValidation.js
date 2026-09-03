const TEXT_FIELDS = Object.freeze({
  senderName: Object.freeze({
    maxCodePoints: 120,
    maxBytes: 480,
    multiline: false,
  }),
  businessName: Object.freeze({
    maxCodePoints: 160,
    maxBytes: 640,
    multiline: false,
  }),
  businessDescription: Object.freeze({
    maxCodePoints: 2000,
    maxBytes: 8000,
    multiline: true,
  }),
  salesContext: Object.freeze({
    maxCodePoints: 4000,
    maxBytes: 16000,
    multiline: true,
  }),
});

const ALLOWED_FIELDS = Object.freeze([
  ...Object.keys(TEXT_FIELDS),
  "presentationPreferences",
]);
const ALLOWED_FIELD_SET = new Set(ALLOWED_FIELDS);
const BLOCKED_JSON_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const SINGLE_LINE_UNSAFE_PATTERN =
  /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u;
const MULTILINE_UNSAFE_PATTERN = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/u;
const JSON_KEY_UNSAFE_PATTERN = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u;

const PREFERENCES_LIMITS = Object.freeze({
  maxBytes: 16 * 1024,
  maxDepth: 4,
  maxEntries: 100,
  maxArrayLength: 50,
  maxKeyCodePoints: 64,
  maxStringCodePoints: 500,
  maxStringBytes: 2000,
});

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

function normalizeTextValue(fieldName, value, { allowBlank = false } = {}) {
  const rules = TEXT_FIELDS[fieldName];
  if (!rules || (value !== null && typeof value !== "string")) {
    return { error: "must_be_string_or_null" };
  }

  if (value === null) {
    return { value: null };
  }

  let normalized = rules.multiline
    ? value.replace(/\r\n?/gu, "\n")
    : value;
  const unsafePattern = rules.multiline
    ? MULTILINE_UNSAFE_PATTERN
    : SINGLE_LINE_UNSAFE_PATTERN;
  if (unsafePattern.test(normalized)) {
    return { error: "contains_unsafe_control" };
  }

  normalized = normalized.trim();
  if (!allowBlank && normalized.length === 0) {
    return { error: "must_not_be_blank" };
  }

  if (countCodePoints(normalized) > rules.maxCodePoints) {
    return { error: "too_many_code_points" };
  }

  if (Buffer.byteLength(normalized, "utf8") > rules.maxBytes) {
    return { error: "too_many_bytes" };
  }

  return { value: normalized };
}

function validatePreferencesTree(value) {
  const seen = new WeakSet();
  let entries = 0;

  function visit(current, depth) {
    if (depth > PREFERENCES_LIMITS.maxDepth) {
      return "too_deep";
    }

    if (
      current === null ||
      typeof current === "boolean" ||
      typeof current === "string"
    ) {
      if (
        typeof current === "string" &&
        (countCodePoints(current) > PREFERENCES_LIMITS.maxStringCodePoints ||
          Buffer.byteLength(current, "utf8") >
            PREFERENCES_LIMITS.maxStringBytes)
      ) {
        return "string_too_long";
      }
      return null;
    }

    if (typeof current === "number") {
      return Number.isFinite(current) ? null : "number_must_be_finite";
    }

    if (typeof current !== "object") {
      return "non_json_value";
    }

    if (seen.has(current)) {
      return "cyclic_or_repeated_reference";
    }
    seen.add(current);

    if (Array.isArray(current)) {
      if (current.length > PREFERENCES_LIMITS.maxArrayLength) {
        return "array_too_long";
      }
      entries += current.length;
      if (entries > PREFERENCES_LIMITS.maxEntries) {
        return "too_many_entries";
      }
      for (const item of current) {
        const error = visit(item, depth + 1);
        if (error) return error;
      }
      return null;
    }

    if (!isPlainObject(current)) {
      return "non_plain_object";
    }

    const keys = Object.keys(current);
    entries += keys.length;
    if (entries > PREFERENCES_LIMITS.maxEntries) {
      return "too_many_entries";
    }

    for (const key of keys) {
      const keyLength = countCodePoints(key);
      if (
        keyLength < 1 ||
        keyLength > PREFERENCES_LIMITS.maxKeyCodePoints ||
        JSON_KEY_UNSAFE_PATTERN.test(key) ||
        BLOCKED_JSON_KEYS.has(key)
      ) {
        return "unsafe_key";
      }

      const error = visit(current[key], depth + 1);
      if (error) return error;
    }
    return null;
  }

  const treeError = visit(value, 0);
  if (treeError) {
    return { error: treeError };
  }

  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (_error) {
    return { error: "not_serializable" };
  }

  if (
    typeof serialized !== "string" ||
    Buffer.byteLength(serialized, "utf8") > PREFERENCES_LIMITS.maxBytes
  ) {
    return { error: "serialized_value_too_large" };
  }

  return { value, serialized };
}

function validatePresentationPreferences(value) {
  if (!isPlainObject(value)) {
    return { error: "must_be_plain_object" };
  }
  return validatePreferencesTree(value);
}

function validationError(fieldErrors) {
  return {
    error: {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Revise os dados do perfil comercial.",
      ...(fieldErrors ? { fieldErrors } : {}),
    },
  };
}

function validateCommercialProfilePatch(body) {
  if (!isPlainObject(body)) {
    return validationError();
  }

  const inputFields = Object.keys(body);
  if (
    inputFields.length === 0 ||
    inputFields.some((field) => !ALLOWED_FIELD_SET.has(field))
  ) {
    return validationError();
  }

  const value = {};
  const fieldErrors = {};

  for (const fieldName of Object.keys(TEXT_FIELDS)) {
    if (!Object.hasOwn(body, fieldName)) continue;
    const result = normalizeTextValue(fieldName, body[fieldName]);
    if (result.error) {
      fieldErrors[fieldName] = result.error;
    } else {
      value[fieldName] = result.value;
    }
  }

  if (Object.hasOwn(body, "presentationPreferences")) {
    const result = validatePresentationPreferences(
      body.presentationPreferences,
    );
    if (result.error) {
      fieldErrors.presentationPreferences = result.error;
    } else {
      value.presentationPreferences = result.value;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return validationError(fieldErrors);
  }

  if (Object.keys(value).length === 0) {
    return validationError();
  }

  return { value };
}

module.exports = {
  ALLOWED_FIELDS,
  PREFERENCES_LIMITS,
  TEXT_FIELDS,
  countCodePoints,
  isPlainObject,
  normalizeTextValue,
  validateCommercialProfilePatch,
  validatePresentationPreferences,
};
