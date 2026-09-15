const MAX_POSTGRES_BIGINT = 9223372036854775807n;
const MIN_MAX_PROFILES = 2;
const MAX_SMALLINT = 32767;

const ERROR_REASONS = Object.freeze({
  ADMIN_DENIED: "admin_denied",
  WORKSPACE_NOT_FOUND: "workspace_not_found",
  CONFLICT: "max_profiles_conflict",
  BELOW_MINIMUM: "max_profiles_below_minimum",
});

class AdminWorkspaceMaxProfilesRepositoryError extends Error {
  constructor(reason) {
    super("Alteração administrativa de perfis interrompida.");
    this.name = "AdminWorkspaceMaxProfilesRepositoryError";
    this.reason = reason;
  }
}

function repositoryAbort(reason) {
  return new AdminWorkspaceMaxProfilesRepositoryError(reason);
}

function invalidDatabaseResult() {
  return new TypeError("Resultado transacional de perfis inválido.");
}

function isPositiveBigintString(value) {
  return (
    typeof value === "string" &&
    /^[1-9]\d*$/u.test(value) &&
    value.length <= 19 &&
    BigInt(value) <= MAX_POSTGRES_BIGINT
  );
}

function isValidProfileLimit(value) {
  return (
    Number.isInteger(value) &&
    value >= MIN_MAX_PROFILES &&
    value <= MAX_SMALLINT
  );
}

function assertInput({
  actorUserId,
  workspaceId,
  maxProfiles,
  expectedMaxProfiles,
  reason,
}) {
  if (
    !isPositiveBigintString(actorUserId) ||
    !isPositiveBigintString(workspaceId) ||
    !isValidProfileLimit(maxProfiles) ||
    !isValidProfileLimit(expectedMaxProfiles) ||
    typeof reason !== "string" ||
    !reason ||
    reason.trim() !== reason
  ) {
    throw new TypeError("Entrada transacional de perfis inválida.");
  }
}

function assertSingleRowResult(result) {
  if (
    !result ||
    !Array.isArray(result.rows) ||
    !Number.isInteger(result.rowCount) ||
    result.rowCount !== 1 ||
    result.rows.length !== 1
  ) {
    throw invalidDatabaseResult();
  }
  return result.rows[0];
}

function assertAtMostOneRowResult(result) {
  if (
    !result ||
    !Array.isArray(result.rows) ||
    !Number.isInteger(result.rowCount) ||
    result.rowCount !== result.rows.length ||
    result.rowCount > 1
  ) {
    throw invalidDatabaseResult();
  }
}

function validateWorkspaceRow(row, workspaceId) {
  if (
    !row ||
    row.workspace_id !== workspaceId ||
    !isValidProfileLimit(row.min_profiles) ||
    !isValidProfileLimit(row.max_profiles) ||
    row.max_profiles < row.min_profiles
  ) {
    throw invalidDatabaseResult();
  }
  return row;
}

async function withTransaction(db, operation) {
  const client = await db.connect();
  if (
    !client ||
    typeof client.query !== "function" ||
    typeof client.release !== "function"
  ) {
    throw new TypeError("Cliente transacional de perfis inválido.");
  }

  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '30s'");

    const result = await operation(client);
    await client.query("COMMIT");
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) {
      await client.query("ROLLBACK").catch(() => {});
    }
    throw error;
  } finally {
    client.release();
  }
}

function createAdminWorkspaceMaxProfilesRepository({ db }) {
  if (!db || typeof db.connect !== "function") {
    throw new TypeError("Banco transacional de perfis é obrigatório.");
  }

  async function updateMaxProfiles(input) {
    assertInput(input);
    const {
      actorUserId,
      workspaceId,
      maxProfiles,
      expectedMaxProfiles,
      reason,
    } = input;

    return withTransaction(db, async (client) => {
      const actorResult = await client.query(
        `/* admin-workspace-max-profiles:lock-actor */
         SELECT id::TEXT AS user_id, is_admin
         FROM public.users
         WHERE id = $1
         FOR SHARE`,
        [actorUserId],
      );
      assertAtMostOneRowResult(actorResult);
      if (actorResult.rowCount === 0) {
        throw repositoryAbort(ERROR_REASONS.ADMIN_DENIED);
      }
      const actor = actorResult.rows[0];
      if (actor.user_id !== actorUserId || typeof actor.is_admin !== "boolean") {
        throw invalidDatabaseResult();
      }
      if (actor.is_admin !== true) {
        throw repositoryAbort(ERROR_REASONS.ADMIN_DENIED);
      }

      const workspaceResult = await client.query(
        `/* admin-workspace-max-profiles:lock-workspace */
         SELECT
           id::TEXT AS workspace_id,
           min_profiles,
           max_profiles
         FROM public.workspaces
         WHERE id = $1
         FOR UPDATE`,
        [workspaceId],
      );
      assertAtMostOneRowResult(workspaceResult);
      if (workspaceResult.rowCount === 0) {
        throw repositoryAbort(ERROR_REASONS.WORKSPACE_NOT_FOUND);
      }
      const before = validateWorkspaceRow(workspaceResult.rows[0], workspaceId);

      if (before.max_profiles === maxProfiles) {
        return {
          workspaceId: before.workspace_id,
          minProfiles: before.min_profiles,
          maxProfiles: before.max_profiles,
          changed: false,
        };
      }
      if (before.max_profiles !== expectedMaxProfiles) {
        throw repositoryAbort(ERROR_REASONS.CONFLICT);
      }
      if (maxProfiles < before.min_profiles) {
        throw repositoryAbort(ERROR_REASONS.BELOW_MINIMUM);
      }

      const updatedResult = await client.query(
        `/* admin-workspace-max-profiles:update-workspace */
         UPDATE public.workspaces
         SET max_profiles = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND max_profiles = $3
           AND min_profiles <= $2
         RETURNING
           id::TEXT AS workspace_id,
           min_profiles,
           max_profiles`,
        [workspaceId, maxProfiles, expectedMaxProfiles],
      );
      if (
        updatedResult &&
        updatedResult.rowCount === 0 &&
        Array.isArray(updatedResult.rows) &&
        updatedResult.rows.length === 0
      ) {
        throw repositoryAbort(ERROR_REASONS.CONFLICT);
      }
      const after = validateWorkspaceRow(
        assertSingleRowResult(updatedResult),
        workspaceId,
      );
      if (
        after.min_profiles !== before.min_profiles ||
        after.max_profiles !== maxProfiles
      ) {
        throw invalidDatabaseResult();
      }

      const auditResult = await client.query(
        `/* admin-workspace-max-profiles:insert-audit */
         INSERT INTO public.admin_audit_events (
           actor_user_id,
           target_workspace_id,
           action,
           reason,
           before_state,
           after_state
         )
         VALUES ($1, $2, $3, $4, $5::JSONB, $6::JSONB)
         RETURNING id::TEXT AS audit_event_id`,
        [
          actorUserId,
          workspaceId,
          "max_profiles_changed",
          reason,
          JSON.stringify({ max_profiles: before.max_profiles }),
          JSON.stringify({ max_profiles: after.max_profiles }),
        ],
      );
      const audit = assertSingleRowResult(auditResult);
      if (!isPositiveBigintString(audit.audit_event_id)) {
        throw invalidDatabaseResult();
      }

      return {
        workspaceId: after.workspace_id,
        minProfiles: after.min_profiles,
        maxProfiles: after.max_profiles,
        changed: true,
      };
    });
  }

  return Object.freeze({ updateMaxProfiles });
}

module.exports = {
  AdminWorkspaceMaxProfilesRepositoryError,
  ERROR_REASONS,
  createAdminWorkspaceMaxProfilesRepository,
};
