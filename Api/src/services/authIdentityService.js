const VALID_ROLES = new Set(["owner", "member"]);
const VALID_ACCOUNT_STATUSES = new Set(["pending", "active", "suspended"]);
const TRANSIENT_DATABASE_CODES = new Set([
  "40001",
  "40P01",
  "55P03",
  "57014",
]);
const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

class AuthIdentityError extends Error {
  constructor(status, code, publicMessage, reason) {
    super(code);
    this.name = "AuthIdentityError";
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage;
    this.reason = reason;
  }
}

class AuthIdentityUnavailableError extends Error {
  constructor() {
    super("AUTH_TEMPORARILY_UNAVAILABLE");
    this.name = "AuthIdentityUnavailableError";
  }
}

function invalidAccess(reason) {
  return new AuthIdentityError(
    401,
    "INVALID_ACCESS_TOKEN",
    "Token de acesso inválido ou expirado.",
    reason,
  );
}

function stateConflict(reason) {
  return new AuthIdentityError(
    409,
    "AUTH_STATE_CONFLICT",
    "Não foi possível carregar o contexto desta conta.",
    reason,
  );
}

function isTransientDatabaseError(error) {
  const code = typeof error?.code === "string" ? error.code : "";

  if (
    TRANSIENT_NETWORK_CODES.has(code) ||
    TRANSIENT_DATABASE_CODES.has(code) ||
    code.startsWith("08") ||
    code.startsWith("53") ||
    code.startsWith("57P") ||
    code.startsWith("58")
  ) {
    return true;
  }

  return (
    typeof error?.message === "string" &&
    /^(?:timeout exceeded when trying to connect|connection terminated unexpectedly|connection terminated due to connection timeout)$/i.test(
      error.message.trim(),
    )
  );
}

function createAuthIdentityService({ db }) {
  async function resolve({ userId, authVersion }) {
    let result;

    try {
      result = await db.query(
        `/* auth-identity:resolve-context */
         SELECT
           u.id::TEXT AS user_id,
           u.name AS user_name,
           u.email AS user_email,
           u.auth_version,
           u.email_verified_at,
           wm.user_id::TEXT AS membership_user_id,
           wm.workspace_id::TEXT AS membership_workspace_id,
           wm.role AS membership_role,
           w.id::TEXT AS workspace_id,
           w.name AS workspace_name,
           w.account_status AS workspace_account_status,
           w.is_active AS workspace_is_active,
           w.timezone AS workspace_timezone,
           w.release_channel AS workspace_release_channel,
           w.min_profiles AS workspace_min_profiles,
           w.max_profiles AS workspace_max_profiles
         FROM public.users AS u
         LEFT JOIN public.workspace_members AS wm
           ON wm.user_id = u.id
         LEFT JOIN public.workspaces AS w
           ON w.id = wm.workspace_id
         WHERE u.id = $1
         LIMIT 2`,
        [userId],
      );
    } catch (error) {
      if (isTransientDatabaseError(error)) {
        throw new AuthIdentityUnavailableError();
      }

      throw error;
    }

    if (result.rowCount === 0) {
      throw invalidAccess("user_not_found");
    }

    const row = result.rows[0];
    if (
      row.user_id !== userId ||
      !row.email_verified_at ||
      row.auth_version !== authVersion
    ) {
      throw invalidAccess("user_credentials_invalid");
    }

    if (result.rowCount !== 1) {
      throw stateConflict("membership_cardinality_invalid");
    }

    if (
      row.membership_user_id === null ||
      row.membership_workspace_id === null
    ) {
      throw stateConflict("membership_missing");
    }

    if (
      row.workspace_id === null ||
      row.membership_user_id !== row.user_id ||
      row.membership_workspace_id !== row.workspace_id
    ) {
      throw stateConflict("workspace_missing_or_inconsistent");
    }

    if (!VALID_ROLES.has(row.membership_role)) {
      throw stateConflict("membership_role_invalid");
    }

    if (!VALID_ACCOUNT_STATUSES.has(row.workspace_account_status)) {
      throw stateConflict("workspace_account_status_invalid");
    }

    if (
      typeof row.workspace_name !== "string" ||
      typeof row.workspace_is_active !== "boolean" ||
      typeof row.workspace_timezone !== "string" ||
      typeof row.workspace_release_channel !== "string" ||
      !Number.isInteger(row.workspace_min_profiles) ||
      !Number.isInteger(row.workspace_max_profiles)
    ) {
      throw stateConflict("workspace_shape_invalid");
    }

    return {
      user: {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
      },
      membership: {
        userId: row.membership_user_id,
        workspaceId: row.membership_workspace_id,
        role: row.membership_role,
      },
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        accountStatus: row.workspace_account_status,
        isActive: row.workspace_is_active,
        timezone: row.workspace_timezone,
        releaseChannel: row.workspace_release_channel,
        minProfiles: row.workspace_min_profiles,
        maxProfiles: row.workspace_max_profiles,
      },
    };
  }

  return Object.freeze({ resolve });
}

module.exports = {
  AuthIdentityError,
  AuthIdentityUnavailableError,
  createAuthIdentityService,
  isTransientDatabaseError,
};
