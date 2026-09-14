const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_POSTGRES_BIGINT = 9223372036854775807n;
const MAX_SEARCH_CODE_POINTS = 160;
const MAX_SEARCH_BYTES = 640;
const ACCOUNT_STATUSES = new Set(["pending", "active", "suspended"]);
const LIST_QUERY_FIELDS = new Set(["page", "pageSize", "status", "search"]);
const AUDIT_QUERY_FIELDS = new Set(["page", "pageSize"]);
const SINGLE_LINE_UNSAFE_PATTERN =
  /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u;

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
      message: "Revise os parâmetros administrativos.",
      ...(fieldErrors && Object.keys(fieldErrors).length > 0
        ? { fieldErrors }
        : {}),
    },
  };
}

function collectUnknownFields(query, allowedFields) {
  if (!isPlainObject(query)) return { query: "must_be_object" };

  const fieldErrors = Object.create(null);
  for (const field of Object.keys(query)) {
    if (!allowedFields.has(field)) fieldErrors[field] = "unknown_field";
  }
  return fieldErrors;
}

function parsePositiveSafeInteger(value, defaultValue, maximum) {
  if (value === undefined) return { value: defaultValue };
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) {
    return { error: "must_be_positive_integer" };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return { error: "must_be_safe_integer" };
  if (maximum !== undefined && parsed > maximum) {
    return { error: `must_be_at_most_${maximum}` };
  }
  return { value: parsed };
}

function validatePagination(query, allowedFields) {
  const fieldErrors = collectUnknownFields(query, allowedFields);
  if (!isPlainObject(query)) return validationError(fieldErrors);

  const page = parsePositiveSafeInteger(query.page, DEFAULT_PAGE);
  const pageSize = parsePositiveSafeInteger(
    query.pageSize,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );
  if (page.error) fieldErrors.page = page.error;
  if (pageSize.error) fieldErrors.pageSize = pageSize.error;

  if (!page.error && !pageSize.error) {
    const offset = (page.value - 1) * pageSize.value;
    if (!Number.isSafeInteger(offset)) fieldErrors.page = "offset_too_large";
  }

  return Object.keys(fieldErrors).length > 0
    ? validationError(fieldErrors)
    : { page: page.value, pageSize: pageSize.value };
}

function validateSearch(value) {
  if (value === undefined) return { value: undefined };
  if (typeof value !== "string") return { error: "must_be_string" };
  if (SINGLE_LINE_UNSAFE_PATTERN.test(value)) {
    return { error: "contains_unsafe_control" };
  }

  const normalized = value.trim();
  if (normalized.length === 0) return { error: "must_not_be_blank" };
  if (Array.from(normalized).length > MAX_SEARCH_CODE_POINTS) {
    return { error: "too_many_code_points" };
  }
  if (Buffer.byteLength(normalized, "utf8") > MAX_SEARCH_BYTES) {
    return { error: "too_many_bytes" };
  }
  return { value: normalized };
}

function validateWorkspaceListQuery(query) {
  const pagination = validatePagination(query, LIST_QUERY_FIELDS);
  if (pagination.error) return pagination;

  const fieldErrors = {};
  if (
    query.status !== undefined &&
    (typeof query.status !== "string" || !ACCOUNT_STATUSES.has(query.status))
  ) {
    fieldErrors.status = "invalid_value";
  }

  const search = validateSearch(query.search);
  if (search.error) fieldErrors.search = search.error;
  if (Object.keys(fieldErrors).length > 0) return validationError(fieldErrors);

  return {
    value: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: query.status,
      search: search.value,
    },
  };
}

function validateWorkspaceAuditQuery(query) {
  const pagination = validatePagination(query, AUDIT_QUERY_FIELDS);
  return pagination.error
    ? pagination
    : { value: { page: pagination.page, pageSize: pagination.pageSize } };
}

function validateEmptyQuery(query) {
  const fieldErrors = collectUnknownFields(query, new Set());
  return Object.keys(fieldErrors).length > 0
    ? validationError(fieldErrors)
    : { value: {} };
}

function validateWorkspaceId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/u.test(value) ||
    value.length > 19
  ) {
    return validationError({ workspaceId: "must_be_positive_bigint" });
  }

  if (BigInt(value) > MAX_POSTGRES_BIGINT) {
    return validationError({ workspaceId: "must_be_positive_bigint" });
  }
  return { value };
}

module.exports = {
  ACCOUNT_STATUSES,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_POSTGRES_BIGINT,
  MAX_SEARCH_BYTES,
  MAX_SEARCH_CODE_POINTS,
  validateEmptyQuery,
  validateWorkspaceAuditQuery,
  validateWorkspaceId,
  validateWorkspaceListQuery,
};
