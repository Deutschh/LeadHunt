const {
  validateReason,
} = require("./adminWorkspaceStatusValidation");

const MIN_MAX_PROFILES = 2;
const MAX_SMALLINT = 32767;
const ALLOWED_FIELDS = new Set([
  "maxProfiles",
  "expectedMaxProfiles",
  "reason",
]);

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

function validateProfileLimit(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { error: "must_be_finite_number" };
  }
  if (!Number.isInteger(value)) return { error: "must_be_integer" };
  if (value < MIN_MAX_PROFILES || value > MAX_SMALLINT) {
    return { error: "must_be_between_2_and_32767" };
  }
  return { value };
}

function validateAdminWorkspaceMaxProfilesBody(body) {
  if (!isPlainObject(body)) {
    return validationError({ body: "must_be_object" });
  }

  const fieldErrors = Object.create(null);
  for (const field of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(field)) fieldErrors[field] = "unknown_field";
  }

  const values = Object.create(null);
  for (const field of ["maxProfiles", "expectedMaxProfiles"]) {
    if (!Object.hasOwn(body, field)) {
      fieldErrors[field] = "required";
      continue;
    }
    const validation = validateProfileLimit(body[field]);
    if (validation.error) fieldErrors[field] = validation.error;
    else values[field] = validation.value;
  }

  if (!Object.hasOwn(body, "reason")) {
    fieldErrors.reason = "required";
  } else {
    const reason = validateReason(body.reason);
    if (reason.error) fieldErrors.reason = reason.error;
    else values.reason = reason.value;
  }

  if (Object.keys(fieldErrors).length > 0) return validationError(fieldErrors);
  return {
    value: {
      maxProfiles: values.maxProfiles,
      expectedMaxProfiles: values.expectedMaxProfiles,
      reason: values.reason,
    },
  };
}

module.exports = {
  MAX_SMALLINT,
  MIN_MAX_PROFILES,
  validateAdminWorkspaceMaxProfilesBody,
};
