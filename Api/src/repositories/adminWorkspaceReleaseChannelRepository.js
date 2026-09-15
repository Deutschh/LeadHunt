const MAX_POSTGRES_BIGINT = 9223372036854775807n;
const RELEASE_CHANNELS = new Set(["internal", "canary", "beta", "stable"]);

const ERROR_REASONS = Object.freeze({
  ADMIN_DENIED: "admin_denied",
  WORKSPACE_NOT_FOUND: "workspace_not_found",
  CONFLICT: "release_channel_conflict",
});

class AdminWorkspaceReleaseChannelRepositoryError extends Error {
  constructor(reason) {
    super("Alteração administrativa de canal interrompida.");
    this.name = "AdminWorkspaceReleaseChannelRepositoryError";
    this.reason = reason;
  }
}

function repositoryAbort(reason) {
  return new AdminWorkspaceReleaseChannelRepositoryError(reason);
}

function invalidDatabaseResult() {
  return new TypeError("Resultado transacional de canal inválido.");
}

function isPositiveBigintString(value) {
  return (
    typeof value === "string" &&
    /^[1-9]\d*$/u.test(value) &&
    value.length <= 19 &&
    BigInt(value) <= MAX_POSTGRES_BIGINT
  );
}

function isReleaseChannel(value) {
  return typeof value === "string" && RELEASE_CHANNELS.has(value);
}

function assertInput({
  actorUserId,
  workspaceId,
  releaseChannel,
  expectedReleaseChannel,
  reason,
}) {
  if (
    !isPositiveBigintString(actorUserId) ||
    !isPositiveBigintString(workspaceId) ||
    !isReleaseChannel(releaseChannel) ||
    !isReleaseChannel(expectedReleaseChannel) ||
    typeof reason !== "string" ||
    !reason ||
    reason.trim() !== reason
  ) {
    throw new TypeError("Entrada transacional de canal inválida.");
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
    !isReleaseChannel(row.release_channel)
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
    throw new TypeError("Cliente transacional de canal inválido.");
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

function createAdminWorkspaceReleaseChannelRepository({ db }) {
  if (!db || typeof db.connect !== "function") {
    throw new TypeError("Banco transacional de canal é obrigatório.");
  }

  async function updateReleaseChannel(input) {
    assertInput(input);
    const {
      actorUserId,
      workspaceId,
      releaseChannel,
      expectedReleaseChannel,
      reason,
    } = input;

    return withTransaction(db, async (client) => {
      const actorResult = await client.query(
        `/* admin-workspace-release-channel:lock-actor */
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
        `/* admin-workspace-release-channel:lock-workspace */
         SELECT
           id::TEXT AS workspace_id,
           release_channel
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

      if (before.release_channel === releaseChannel) {
        return {
          workspaceId: before.workspace_id,
          releaseChannel: before.release_channel,
          changed: false,
        };
      }
      if (before.release_channel !== expectedReleaseChannel) {
        throw repositoryAbort(ERROR_REASONS.CONFLICT);
      }

      const updatedResult = await client.query(
        `/* admin-workspace-release-channel:update-workspace */
         UPDATE public.workspaces
         SET release_channel = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND release_channel = $3
         RETURNING
           id::TEXT AS workspace_id,
           release_channel`,
        [workspaceId, releaseChannel, expectedReleaseChannel],
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
      if (after.release_channel !== releaseChannel) {
        throw invalidDatabaseResult();
      }

      const auditResult = await client.query(
        `/* admin-workspace-release-channel:insert-audit */
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
          "release_channel_changed",
          reason,
          JSON.stringify({ release_channel: before.release_channel }),
          JSON.stringify({ release_channel: after.release_channel }),
        ],
      );
      const audit = assertSingleRowResult(auditResult);
      if (!isPositiveBigintString(audit.audit_event_id)) {
        throw invalidDatabaseResult();
      }

      return {
        workspaceId: after.workspace_id,
        releaseChannel: after.release_channel,
        changed: true,
      };
    });
  }

  return Object.freeze({ updateReleaseChannel });
}

module.exports = {
  AdminWorkspaceReleaseChannelRepositoryError,
  ERROR_REASONS,
  createAdminWorkspaceReleaseChannelRepository,
};
