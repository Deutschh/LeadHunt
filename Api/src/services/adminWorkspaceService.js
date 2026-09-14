const ACCOUNT_STATUSES = new Set(["pending", "active", "suspended"]);
const RELEASE_CHANNELS = new Set(["internal", "canary", "beta", "stable"]);
const MAX_POSTGRES_BIGINT = 9223372036854775807n;
const SNAPSHOT_FIELDS = Object.freeze({
  account_status: "accountStatus",
  is_active: "isActive",
  activated_at: "activatedAt",
  max_profiles: "maxProfiles",
  release_channel: "releaseChannel",
});

class AdminWorkspaceNotFoundError extends Error {
  constructor() {
    super("Workspace não encontrado.");
    this.name = "AdminWorkspaceNotFoundError";
  }
}

function invalidPersistedData() {
  return new TypeError("Dados administrativos persistidos inválidos.");
}

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveBigintString(value) {
  return (
    typeof value === "string" &&
    /^[1-9]\d*$/u.test(value) &&
    value.length <= 19 &&
    BigInt(value) <= MAX_POSTGRES_BIGINT
  );
}

function mapTimestamp(value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw invalidPersistedData();
  }
  return value.toISOString();
}

function mapWorkspaceBase(row) {
  if (
    !isPlainObject(row) ||
    !isPositiveBigintString(row.workspace_id) ||
    !isNonBlankString(row.workspace_name) ||
    !ACCOUNT_STATUSES.has(row.account_status) ||
    typeof row.is_active !== "boolean" ||
    !RELEASE_CHANNELS.has(row.release_channel) ||
    !Number.isInteger(row.min_profiles) ||
    row.min_profiles < 2 ||
    !Number.isInteger(row.max_profiles) ||
    row.max_profiles < row.min_profiles
  ) {
    throw invalidPersistedData();
  }

  return {
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    accountStatus: row.account_status,
    isActive: row.is_active,
    releaseChannel: row.release_channel,
    minProfiles: row.min_profiles,
    maxProfiles: row.max_profiles,
    createdAt: mapTimestamp(row.created_at),
    activatedAt: mapTimestamp(row.activated_at, { nullable: true }),
  };
}

function mapWorkspaceSummary(row) {
  const workspace = mapWorkspaceBase(row);
  let owner = null;
  if (row.owner_name !== null || row.owner_email !== null) {
    if (!isNonBlankString(row.owner_name) || !isNonBlankString(row.owner_email)) {
      throw invalidPersistedData();
    }
    owner = { name: row.owner_name, email: row.owner_email };
  }

  return {
    ...workspace,
    lastLoginAt: mapTimestamp(row.last_login_at, { nullable: true }),
    owner,
  };
}

function mapWorkspaceDetailsBase(row) {
  const workspace = mapWorkspaceBase(row);
  if (!isNonBlankString(row.timezone)) throw invalidPersistedData();
  return {
    ...workspace,
    timezone: row.timezone,
    updatedAt: mapTimestamp(row.updated_at),
  };
}

function mapMember(row) {
  const nullableFields = [
    row.member_user_id,
    row.member_name,
    row.member_email,
    row.member_role,
    row.member_last_login_at,
    row.member_created_at,
  ];
  if (nullableFields.every((value) => value === null)) return null;

  if (
    !isPositiveBigintString(row.member_user_id) ||
    !isNonBlankString(row.member_name) ||
    !isNonBlankString(row.member_email) ||
    !["owner", "member"].includes(row.member_role)
  ) {
    throw invalidPersistedData();
  }

  return {
    userId: row.member_user_id,
    name: row.member_name,
    email: row.member_email,
    role: row.member_role,
    lastLoginAt: mapTimestamp(row.member_last_login_at, { nullable: true }),
    createdAt: mapTimestamp(row.member_created_at),
  };
}

function parseTotalItems(value) {
  if (typeof value !== "string" || !/^\d+$/u.test(value)) {
    throw invalidPersistedData();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw invalidPersistedData();
  return parsed;
}

function pagination(page, pageSize, totalItems) {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}

function mapWorkspaceList(rows, { page, pageSize }) {
  if (!Array.isArray(rows) || rows.length === 0) throw invalidPersistedData();
  const totalItems = parseTotalItems(rows[0].total_items);
  if (rows.some((row) => row.total_items !== rows[0].total_items)) {
    throw invalidPersistedData();
  }

  const workspaceRows = rows.filter((row) => row.workspace_id !== null);
  if (workspaceRows.length > pageSize || (totalItems === 0 && workspaceRows.length)) {
    throw invalidPersistedData();
  }
  return {
    workspaces: workspaceRows.map(mapWorkspaceSummary),
    pagination: pagination(page, pageSize, totalItems),
  };
}

function mapWorkspaceDetails(rows) {
  if (!Array.isArray(rows)) throw invalidPersistedData();
  if (rows.length === 0) throw new AdminWorkspaceNotFoundError();

  const workspace = mapWorkspaceDetailsBase(rows[0]);
  const members = [];
  const memberIds = new Set();
  for (const row of rows) {
    const currentWorkspace = mapWorkspaceDetailsBase(row);
    if (JSON.stringify(currentWorkspace) !== JSON.stringify(workspace)) {
      throw invalidPersistedData();
    }

    const member = mapMember(row);
    if (!member) continue;
    if (memberIds.has(member.userId)) throw invalidPersistedData();
    memberIds.add(member.userId);
    members.push(member);
  }

  return { ...workspace, members };
}

function mapSnapshotTimestamp(value) {
  if (value === null) return null;
  if (typeof value !== "string") throw invalidPersistedData();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw invalidPersistedData();
  return date.toISOString();
}

function mapSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw invalidPersistedData();
  const mapped = {};
  for (const [field, value] of Object.entries(snapshot)) {
    if (!Object.hasOwn(SNAPSHOT_FIELDS, field)) throw invalidPersistedData();
    const publicField = SNAPSHOT_FIELDS[field];

    if (field === "account_status" && !ACCOUNT_STATUSES.has(value)) {
      throw invalidPersistedData();
    }
    if (field === "is_active" && typeof value !== "boolean") {
      throw invalidPersistedData();
    }
    if (
      field === "max_profiles" &&
      (!Number.isInteger(value) || value < 2 || value > 32767)
    ) {
      throw invalidPersistedData();
    }
    if (field === "release_channel" && !RELEASE_CHANNELS.has(value)) {
      throw invalidPersistedData();
    }

    mapped[publicField] =
      field === "activated_at" ? mapSnapshotTimestamp(value) : value;
  }
  return mapped;
}

function mapAuditEvent(row) {
  if (
    !isPlainObject(row) ||
    !isPositiveBigintString(row.audit_event_id) ||
    !isNonBlankString(row.action) ||
    !isNonBlankString(row.reason) ||
    !isPositiveBigintString(row.actor_user_id) ||
    !isNonBlankString(row.actor_name) ||
    !isNonBlankString(row.actor_email)
  ) {
    throw invalidPersistedData();
  }

  return {
    id: row.audit_event_id,
    action: row.action,
    reason: row.reason,
    beforeState: mapSnapshot(row.before_state),
    afterState: mapSnapshot(row.after_state),
    createdAt: mapTimestamp(row.created_at),
    actor: {
      userId: row.actor_user_id,
      name: row.actor_name,
      email: row.actor_email,
    },
  };
}

function mapWorkspaceAudit(rows, workspaceId, { page, pageSize }) {
  if (!Array.isArray(rows) || rows.length === 0 || !isPlainObject(rows[0])) {
    throw invalidPersistedData();
  }
  if (typeof rows[0].workspace_exists !== "boolean") {
    throw invalidPersistedData();
  }
  const totalItems = parseTotalItems(rows[0].total_items);
  if (!rows[0].workspace_exists) {
    if (totalItems !== 0 || rows.some((row) => row.audit_event_id !== null)) {
      throw invalidPersistedData();
    }
    throw new AdminWorkspaceNotFoundError();
  }
  if (
    rows.some(
      (row) =>
        row.workspace_exists !== true ||
        row.total_items !== rows[0].total_items,
    )
  ) {
    throw invalidPersistedData();
  }

  const eventRows = rows.filter((row) => row.audit_event_id !== null);
  if (eventRows.length > pageSize || (totalItems === 0 && eventRows.length)) {
    throw invalidPersistedData();
  }
  return {
    workspaceId,
    auditEvents: eventRows.map(mapAuditEvent),
    pagination: pagination(page, pageSize, totalItems),
  };
}

function createAdminWorkspaceService({ repository }) {
  if (
    !repository ||
    typeof repository.listWorkspaces !== "function" ||
    typeof repository.findWorkspaceDetailsById !== "function" ||
    typeof repository.listWorkspaceAudit !== "function"
  ) {
    throw new TypeError("Repository administrativo é obrigatório.");
  }

  return Object.freeze({
    async listWorkspaces(options) {
      const rows = await repository.listWorkspaces(options);
      return mapWorkspaceList(rows, options);
    },

    async getWorkspaceDetails(workspaceId) {
      const rows = await repository.findWorkspaceDetailsById(workspaceId);
      return mapWorkspaceDetails(rows);
    },

    async listWorkspaceAudit(workspaceId, options) {
      const rows = await repository.listWorkspaceAudit(workspaceId, options);
      return mapWorkspaceAudit(rows, workspaceId, options);
    },
  });
}

module.exports = {
  AdminWorkspaceNotFoundError,
  SNAPSHOT_FIELDS,
  createAdminWorkspaceService,
  mapAuditEvent,
  mapSnapshot,
  mapWorkspaceDetails,
  mapWorkspaceList,
};
