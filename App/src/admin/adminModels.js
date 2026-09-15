const MAX_POSTGRES_BIGINT = 9223372036854775807n;
const MAX_SMALLINT = 32767;
const ACCOUNT_STATUSES = new Set(["pending", "active", "suspended"]);
const RELEASE_CHANNELS = new Set(["internal", "canary", "beta", "stable"]);
const MEMBER_ROLES = new Set(["owner", "member"]);
const SNAPSHOT_FIELDS = new Set([
  "accountStatus",
  "isActive",
  "activatedAt",
  "maxProfiles",
  "releaseChannel",
]);

export class AdminContractError extends Error {
  constructor(code = "INVALID_ADMIN_RESPONSE") {
    super("A resposta administrativa recebida é inválida.");
    this.name = "AdminContractError";
    this.status = 0;
    this.code = code;
    this.retryable = true;
  }
}

export class AdminInputError extends Error {
  constructor(fieldErrors) {
    super("Revise os dados da ação administrativa.");
    this.name = "AdminInputError";
    this.status = 400;
    this.code = "VALIDATION_ERROR";
    this.fieldErrors = Object.freeze({ ...fieldErrors });
    this.retryable = false;
  }
}

function invalidResponse() {
  throw new AdminContractError();
}

function inputError(field, detail) {
  throw new AdminInputError({ [field]: detail });
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactFields(value, fields) {
  if (!isPlainObject(value)) invalidResponse();
  const keys = Object.keys(value);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  ) {
    invalidResponse();
  }
  return value;
}

function freezeObject(value) {
  return Object.freeze(value);
}

function normalizeNonBlank(value) {
  if (typeof value !== "string" || value.trim().length === 0) invalidResponse();
  return value;
}

function normalizeIdResponse(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/u.test(value) ||
    value.length > 19 ||
    BigInt(value) > MAX_POSTGRES_BIGINT
  ) {
    invalidResponse();
  }
  return value;
}

export function normalizeAdminWorkspaceId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/u.test(value) ||
    value.length > 19 ||
    BigInt(value) > MAX_POSTGRES_BIGINT
  ) {
    inputError("workspaceId", "must_be_positive_bigint");
  }
  return value;
}

function normalizeIso(value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string") invalidResponse();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    invalidResponse();
  }
  return value;
}

function normalizeProfileLimitResponse(value, minimum = 2) {
  if (!Number.isInteger(value) || value < minimum || value > MAX_SMALLINT) {
    invalidResponse();
  }
  return value;
}

function normalizeOwner(value) {
  if (value === null) return null;
  assertExactFields(value, ["name", "email"]);
  return freezeObject({
    name: normalizeNonBlank(value.name),
    email: normalizeNonBlank(value.email),
  });
}

function normalizeWorkspaceBase(value) {
  const minProfiles = normalizeProfileLimitResponse(value.minProfiles);
  const maxProfiles = normalizeProfileLimitResponse(value.maxProfiles, minProfiles);
  if (!ACCOUNT_STATUSES.has(value.accountStatus)) invalidResponse();
  if (!RELEASE_CHANNELS.has(value.releaseChannel)) invalidResponse();
  if (typeof value.isActive !== "boolean") invalidResponse();
  return {
    workspaceId: normalizeIdResponse(value.workspaceId),
    workspaceName: normalizeNonBlank(value.workspaceName),
    accountStatus: value.accountStatus,
    isActive: value.isActive,
    releaseChannel: value.releaseChannel,
    minProfiles,
    maxProfiles,
    createdAt: normalizeIso(value.createdAt),
    activatedAt: normalizeIso(value.activatedAt, { nullable: true }),
  };
}

export function normalizeAdminWorkspaceSummary(value) {
  assertExactFields(value, [
    "workspaceId",
    "workspaceName",
    "accountStatus",
    "isActive",
    "releaseChannel",
    "minProfiles",
    "maxProfiles",
    "createdAt",
    "activatedAt",
    "lastLoginAt",
    "owner",
  ]);
  return freezeObject({
    ...normalizeWorkspaceBase(value),
    lastLoginAt: normalizeIso(value.lastLoginAt, { nullable: true }),
    owner: normalizeOwner(value.owner),
  });
}

export function normalizeAdminWorkspaceMember(value) {
  assertExactFields(value, [
    "userId",
    "name",
    "email",
    "role",
    "lastLoginAt",
    "createdAt",
  ]);
  if (!MEMBER_ROLES.has(value.role)) invalidResponse();
  return freezeObject({
    userId: normalizeIdResponse(value.userId),
    name: normalizeNonBlank(value.name),
    email: normalizeNonBlank(value.email),
    role: value.role,
    lastLoginAt: normalizeIso(value.lastLoginAt, { nullable: true }),
    createdAt: normalizeIso(value.createdAt),
  });
}

export function normalizeAdminWorkspaceDetails(value) {
  assertExactFields(value, [
    "workspaceId",
    "workspaceName",
    "accountStatus",
    "isActive",
    "releaseChannel",
    "minProfiles",
    "maxProfiles",
    "createdAt",
    "activatedAt",
    "timezone",
    "updatedAt",
    "members",
  ]);
  if (!Array.isArray(value.members)) invalidResponse();
  return freezeObject({
    ...normalizeWorkspaceBase(value),
    timezone: normalizeNonBlank(value.timezone),
    updatedAt: normalizeIso(value.updatedAt),
    members: freezeObject(value.members.map(normalizeAdminWorkspaceMember)),
  });
}

export function normalizeAdminPagination(value) {
  assertExactFields(value, ["page", "pageSize", "totalItems", "totalPages"]);
  if (
    !Number.isSafeInteger(value.page) ||
    value.page < 1 ||
    !Number.isSafeInteger(value.pageSize) ||
    value.pageSize < 1 ||
    value.pageSize > 100 ||
    !Number.isSafeInteger(value.totalItems) ||
    value.totalItems < 0 ||
    !Number.isSafeInteger(value.totalPages) ||
    value.totalPages < 0 ||
    value.totalPages !==
      (value.totalItems === 0 ? 0 : Math.ceil(value.totalItems / value.pageSize))
  ) {
    invalidResponse();
  }
  return freezeObject({ ...value });
}

function normalizeSnapshot(value) {
  if (!isPlainObject(value)) invalidResponse();
  const normalized = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    if (!SNAPSHOT_FIELDS.has(field)) invalidResponse();
    if (field === "accountStatus") {
      if (!ACCOUNT_STATUSES.has(fieldValue)) invalidResponse();
      normalized[field] = fieldValue;
    } else if (field === "isActive") {
      if (typeof fieldValue !== "boolean") invalidResponse();
      normalized[field] = fieldValue;
    } else if (field === "activatedAt") {
      normalized[field] = normalizeIso(fieldValue, { nullable: true });
    } else if (field === "maxProfiles") {
      normalized[field] = normalizeProfileLimitResponse(fieldValue);
    } else if (field === "releaseChannel") {
      if (!RELEASE_CHANNELS.has(fieldValue)) invalidResponse();
      normalized[field] = fieldValue;
    }
  }
  return freezeObject(normalized);
}

export function normalizeAdminAuditEvent(value) {
  assertExactFields(value, [
    "id",
    "action",
    "reason",
    "beforeState",
    "afterState",
    "createdAt",
    "actor",
  ]);
  assertExactFields(value.actor, ["userId", "name", "email"]);
  return freezeObject({
    id: normalizeIdResponse(value.id),
    action: normalizeNonBlank(value.action),
    reason: normalizeNonBlank(value.reason),
    beforeState: normalizeSnapshot(value.beforeState),
    afterState: normalizeSnapshot(value.afterState),
    createdAt: normalizeIso(value.createdAt),
    actor: freezeObject({
      userId: normalizeIdResponse(value.actor.userId),
      name: normalizeNonBlank(value.actor.name),
      email: normalizeNonBlank(value.actor.email),
    }),
  });
}

export function normalizeAdminMeResponse(value) {
  assertExactFields(value, ["admin"]);
  if (value.admin !== true) invalidResponse();
  return freezeObject({ admin: true });
}

export function normalizeWorkspaceListResponse(value) {
  assertExactFields(value, ["workspaces", "pagination"]);
  if (!Array.isArray(value.workspaces)) invalidResponse();
  return freezeObject({
    workspaces: freezeObject(value.workspaces.map(normalizeAdminWorkspaceSummary)),
    pagination: normalizeAdminPagination(value.pagination),
  });
}

export function normalizeWorkspaceAuditResponse(value) {
  assertExactFields(value, ["workspaceId", "auditEvents", "pagination"]);
  if (!Array.isArray(value.auditEvents)) invalidResponse();
  return freezeObject({
    workspaceId: normalizeIdResponse(value.workspaceId),
    auditEvents: freezeObject(value.auditEvents.map(normalizeAdminAuditEvent)),
    pagination: normalizeAdminPagination(value.pagination),
  });
}

export function normalizeStatusMutationResponse(value) {
  assertExactFields(value, ["workspace"]);
  assertExactFields(value.workspace, ["workspaceId", "accountStatus", "activatedAt"]);
  if (!["active", "suspended"].includes(value.workspace.accountStatus)) {
    invalidResponse();
  }
  return freezeObject({
    workspace: freezeObject({
      workspaceId: normalizeIdResponse(value.workspace.workspaceId),
      accountStatus: value.workspace.accountStatus,
      activatedAt: normalizeIso(value.workspace.activatedAt, { nullable: true }),
    }),
  });
}

export function normalizeMaxProfilesMutationResponse(value) {
  assertExactFields(value, ["workspace"]);
  assertExactFields(value.workspace, ["workspaceId", "minProfiles", "maxProfiles"]);
  const minProfiles = normalizeProfileLimitResponse(value.workspace.minProfiles);
  return freezeObject({
    workspace: freezeObject({
      workspaceId: normalizeIdResponse(value.workspace.workspaceId),
      minProfiles,
      maxProfiles: normalizeProfileLimitResponse(
        value.workspace.maxProfiles,
        minProfiles,
      ),
    }),
  });
}

export function normalizeReleaseChannelMutationResponse(value) {
  assertExactFields(value, ["workspace"]);
  assertExactFields(value.workspace, ["workspaceId", "releaseChannel"]);
  if (!RELEASE_CHANNELS.has(value.workspace.releaseChannel)) invalidResponse();
  return freezeObject({
    workspace: freezeObject({
      workspaceId: normalizeIdResponse(value.workspace.workspaceId),
      releaseChannel: value.workspace.releaseChannel,
    }),
  });
}

export function normalizeWorkspaceFilters(filters = {}) {
  if (!isPlainObject(filters)) inputError("filters", "must_be_object");
  const allowed = new Set(["page", "pageSize", "status", "search"]);
  const unknown = Object.keys(filters).find((field) => !allowed.has(field));
  if (unknown) inputError(unknown, "unknown_field");

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  if (!Number.isSafeInteger(page) || page < 1) inputError("page", "invalid_value");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    inputError("pageSize", "invalid_value");
  }
  if (filters.status !== undefined && !ACCOUNT_STATUSES.has(filters.status)) {
    inputError("status", "invalid_value");
  }

  let search;
  if (filters.search !== undefined) {
    if (typeof filters.search !== "string") inputError("search", "must_be_string");
    search = filters.search.trim();
    if (
      search.length === 0 ||
      [...search].length > 160 ||
      new TextEncoder().encode(search).length > 640
    ) {
      inputError("search", "invalid_value");
    }
  }

  return freezeObject({
    page,
    pageSize,
    ...(filters.status !== undefined ? { status: filters.status } : {}),
    ...(search !== undefined ? { search } : {}),
  });
}

export function normalizeAuditPagination(value = {}) {
  if (!isPlainObject(value)) inputError("pagination", "must_be_object");
  const unknown = Object.keys(value).find(
    (field) => !["page", "pageSize"].includes(field),
  );
  if (unknown) inputError(unknown, "unknown_field");
  return normalizeWorkspaceFilters({
    page: value.page ?? 1,
    pageSize: value.pageSize ?? 25,
  });
}

export function normalizeReason(value) {
  if (typeof value !== "string") inputError("reason", "must_be_string");
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (!normalized) inputError("reason", "required");
  if (
    [...normalized].some((character) => {
      const codePoint = character.codePointAt(0);
      return (
        (codePoint <= 31 && codePoint !== 10 && codePoint !== 9) ||
        (codePoint >= 127 && codePoint <= 159)
      );
    })
  ) {
    inputError("reason", "contains_forbidden_control_character");
  }
  if (
    [...normalized].length > 500 ||
    new TextEncoder().encode(normalized).length > 2000
  ) {
    inputError("reason", "too_long");
  }
  return normalized;
}

export function normalizeProfileLimit(value, field) {
  if (!Number.isInteger(value) || value < 2 || value > MAX_SMALLINT) {
    inputError(field, "must_be_between_2_and_32767");
  }
  return value;
}

export function normalizeReleaseChannel(value, field) {
  if (typeof value !== "string") inputError(field, "must_be_string");
  if (!RELEASE_CHANNELS.has(value)) inputError(field, "invalid_value");
  return value;
}
