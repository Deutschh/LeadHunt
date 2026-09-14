const MAX_POSTGRES_BIGINT = 9223372036854775807n;
const ACCOUNT_STATUSES = new Set(["pending", "active", "suspended"]);
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;
const ACTIVATED_AT_ISO_EXPRESSION = `CASE
  WHEN activated_at IS NULL THEN NULL
  ELSE TO_CHAR(
    activated_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  )
END`;

const ERROR_REASONS = Object.freeze({
  ADMIN_DENIED: "admin_denied",
  WORKSPACE_NOT_FOUND: "workspace_not_found",
  STATUS_CONFLICT: "status_conflict",
});

const TRANSITIONS = Object.freeze({
  activate: Object.freeze({
    expectedStatus: "pending",
    nextStatus: "active",
    auditAction: "account_activated",
    requiresNullActivatedAt: true,
    setsActivatedAt: true,
  }),
  suspend: Object.freeze({
    expectedStatus: "active",
    nextStatus: "suspended",
    auditAction: "account_suspended",
    requiresNullActivatedAt: false,
    setsActivatedAt: false,
  }),
  reactivate: Object.freeze({
    expectedStatus: "suspended",
    nextStatus: "active",
    auditAction: "account_reactivated",
    requiresNullActivatedAt: false,
    setsActivatedAt: false,
  }),
});

class AdminWorkspaceStatusRepositoryError extends Error {
  constructor(reason) {
    super("Transição administrativa interrompida.");
    this.name = "AdminWorkspaceStatusRepositoryError";
    this.reason = reason;
  }
}

function repositoryAbort(reason) {
  return new AdminWorkspaceStatusRepositoryError(reason);
}

function invalidDatabaseResult() {
  return new TypeError("Resultado transacional administrativo inválido.");
}

function isPositiveBigintString(value) {
  return (
    typeof value === "string" &&
    /^[1-9]\d*$/u.test(value) &&
    value.length <= 19 &&
    BigInt(value) <= MAX_POSTGRES_BIGINT
  );
}

function isIsoTimestampOrNull(value) {
  return (
    value === null ||
    (typeof value === "string" &&
      ISO_TIMESTAMP_PATTERN.test(value) &&
      !Number.isNaN(new Date(value).getTime()))
  );
}

function assertInput({ actorUserId, workspaceId, reason }) {
  if (
    !isPositiveBigintString(actorUserId) ||
    !isPositiveBigintString(workspaceId) ||
    typeof reason !== "string" ||
    !reason ||
    reason.trim() !== reason
  ) {
    throw new TypeError("Entrada transacional administrativa inválida.");
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

async function withTransaction(db, operation) {
  const client = await db.connect();
  if (!client || typeof client.query !== "function" || typeof client.release !== "function") {
    throw new TypeError("Cliente transacional administrativo inválido.");
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

function validateWorkspaceRow(row, workspaceId) {
  if (
    !row ||
    row.workspace_id !== workspaceId ||
    !ACCOUNT_STATUSES.has(row.account_status) ||
    !isIsoTimestampOrNull(row.activated_at_iso)
  ) {
    throw invalidDatabaseResult();
  }
  return row;
}

function createAdminWorkspaceStatusRepository({ db }) {
  if (!db || typeof db.connect !== "function") {
    throw new TypeError("Banco transacional administrativo é obrigatório.");
  }

  async function executeTransition(definition, input) {
    assertInput(input);
    const { actorUserId, workspaceId, reason } = input;

    return withTransaction(db, async (client) => {
      const actorResult = await client.query(
        `/* admin-workspace-status:lock-actor */
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
        `/* admin-workspace-status:lock-workspace */
         SELECT
           id::TEXT AS workspace_id,
           account_status,
           ${ACTIVATED_AT_ISO_EXPRESSION} AS activated_at_iso
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
      if (
        before.account_status !== definition.expectedStatus ||
        (definition.requiresNullActivatedAt && before.activated_at_iso !== null)
      ) {
        throw repositoryAbort(ERROR_REASONS.STATUS_CONFLICT);
      }

      const activationAssignment = definition.setsActivatedAt
        ? ",\n             activated_at = CURRENT_TIMESTAMP"
        : "";
      const activatedAtPredicate = definition.requiresNullActivatedAt
        ? "\n           AND activated_at IS NULL"
        : "";
      const updatedResult = await client.query(
        `/* admin-workspace-status:update-workspace */
         UPDATE public.workspaces
         SET account_status = $2,
             updated_at = CURRENT_TIMESTAMP${activationAssignment}
         WHERE id = $1
           AND account_status = $3${activatedAtPredicate}
         RETURNING
           id::TEXT AS workspace_id,
           account_status,
           ${ACTIVATED_AT_ISO_EXPRESSION} AS activated_at_iso`,
        [workspaceId, definition.nextStatus, definition.expectedStatus],
      );
      if (
        updatedResult &&
        updatedResult.rowCount === 0 &&
        Array.isArray(updatedResult.rows) &&
        updatedResult.rows.length === 0
      ) {
        throw repositoryAbort(ERROR_REASONS.STATUS_CONFLICT);
      }
      const after = validateWorkspaceRow(
        assertSingleRowResult(updatedResult),
        workspaceId,
      );
      if (
        after.account_status !== definition.nextStatus ||
        (definition.setsActivatedAt && after.activated_at_iso === null) ||
        (!definition.setsActivatedAt &&
          after.activated_at_iso !== before.activated_at_iso)
      ) {
        throw invalidDatabaseResult();
      }

      const beforeState = JSON.stringify({
        account_status: before.account_status,
        activated_at: before.activated_at_iso,
      });
      const afterState = JSON.stringify({
        account_status: after.account_status,
        activated_at: after.activated_at_iso,
      });
      const auditResult = await client.query(
        `/* admin-workspace-status:insert-audit */
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
          definition.auditAction,
          reason,
          beforeState,
          afterState,
        ],
      );
      const audit = assertSingleRowResult(auditResult);
      if (!isPositiveBigintString(audit.audit_event_id)) {
        throw invalidDatabaseResult();
      }

      return {
        workspaceId: after.workspace_id,
        accountStatus: after.account_status,
        activatedAtIso: after.activated_at_iso,
      };
    });
  }

  return Object.freeze({
    activateWorkspace: (input) => executeTransition(TRANSITIONS.activate, input),
    suspendWorkspace: (input) => executeTransition(TRANSITIONS.suspend, input),
    reactivateWorkspace: (input) =>
      executeTransition(TRANSITIONS.reactivate, input),
  });
}

module.exports = {
  ACTIVATED_AT_ISO_EXPRESSION,
  AdminWorkspaceStatusRepositoryError,
  ERROR_REASONS,
  ISO_TIMESTAMP_PATTERN,
  createAdminWorkspaceStatusRepository,
};
