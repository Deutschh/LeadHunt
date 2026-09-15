const {
  validateReason,
} = require("./adminWorkspaceStatusValidation");

const RELEASE_CHANNELS = new Set(["internal", "canary", "beta", "stable"]);
const ALLOWED_FIELDS = new Set([
  "releaseChannel",
  "expectedReleaseChannel",
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

function validateReleaseChannel(value) {
  if (typeof value !== "string") return { error: "must_be_string" };
  if (!RELEASE_CHANNELS.has(value)) return { error: "invalid_value" };
  return { value };
}

function validateAdminWorkspaceReleaseChannelBody(body) {
  if (!isPlainObject(body)) {
    return validationError({ body: "must_be_object" });
  }

  const fieldErrors = Object.create(null);
  for (const field of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(field)) fieldErrors[field] = "unknown_field";
  }

  const values = Object.create(null);
  for (const field of ["releaseChannel", "expectedReleaseChannel"]) {
    if (!Object.hasOwn(body, field)) {
      fieldErrors[field] = "required";
      continue;
    }
    const validation = validateReleaseChannel(body[field]);
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
      releaseChannel: values.releaseChannel,
      expectedReleaseChannel: values.expectedReleaseChannel,
      reason: values.reason,
    },
  };
}

module.exports = {
  RELEASE_CHANNELS,
  validateAdminWorkspaceReleaseChannelBody,
};
