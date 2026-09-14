const MAX_REASON_CODE_POINTS = 500;
const MAX_REASON_BYTES = 2000;
const ALLOWED_FIELDS = new Set(["reason"]);
const MULTILINE_UNSAFE_PATTERN = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/u;

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validationError(fieldErrors) {
  return {
    error: {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Revise os dados da ação administrativa.",
      ...(fieldErrors && Object.keys(fieldErrors).length > 0
        ? { fieldErrors }
        : {}),
    },
  };
}

function validateReason(value) {
  if (typeof value !== "string") return { error: "must_be_string" };

  const lineNormalized = value.replace(/\r\n?/gu, "\n");
  if (MULTILINE_UNSAFE_PATTERN.test(lineNormalized)) {
    return { error: "contains_unsafe_control" };
  }

  const normalized = lineNormalized.trim();
  if (!normalized) return { error: "must_not_be_blank" };
  if (Array.from(normalized).length > MAX_REASON_CODE_POINTS) {
    return { error: "too_many_code_points" };
  }
  if (Buffer.byteLength(normalized, "utf8") > MAX_REASON_BYTES) {
    return { error: "too_many_bytes" };
  }
  return { value: normalized };
}

function validateAdminWorkspaceStatusBody(body) {
  if (!isPlainObject(body)) {
    return validationError({ body: "must_be_object" });
  }

  const fieldErrors = Object.create(null);
  for (const field of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(field)) fieldErrors[field] = "unknown_field";
  }

  if (!Object.hasOwn(body, "reason")) {
    fieldErrors.reason = "required";
  } else {
    const reason = validateReason(body.reason);
    if (reason.error) fieldErrors.reason = reason.error;
    if (Object.keys(fieldErrors).length === 0) {
      return { value: { reason: reason.value } };
    }
  }

  return validationError(fieldErrors);
}

module.exports = {
  MAX_REASON_BYTES,
  MAX_REASON_CODE_POINTS,
  validateAdminWorkspaceStatusBody,
};
