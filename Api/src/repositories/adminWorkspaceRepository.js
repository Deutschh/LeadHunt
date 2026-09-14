const ACCOUNT_STATUSES = new Set(["pending", "active", "suspended"]);
const MAX_POSTGRES_BIGINT = 9223372036854775807n;

function assertWorkspaceId(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/u.test(value) ||
    value.length > 19 ||
    BigInt(value) > MAX_POSTGRES_BIGINT
  ) {
    throw new TypeError("workspaceId administrativo inválido.");
  }
}

function assertPagination({ page, pageSize }) {
  const offset = (page - 1) * pageSize;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isSafeInteger(offset)
  ) {
    throw new TypeError("Paginação administrativa inválida.");
  }
  return offset;
}

function escapeLikePattern(value) {
  return value.replace(/[\\%_]/gu, "\\$&");
}

function createAdminWorkspaceRepository({ db }) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("Banco administrativo injetado é obrigatório.");
  }

  return Object.freeze({
    async listWorkspaces({ page, pageSize, status, search }) {
      const offset = assertPagination({ page, pageSize });
      if (status !== undefined && !ACCOUNT_STATUSES.has(status)) {
        throw new TypeError("Status administrativo inválido.");
      }
      if (
        search !== undefined &&
        (typeof search !== "string" || search.trim() !== search || !search)
      ) {
        throw new TypeError("Busca administrativa inválida.");
      }

      const params = [];
      const predicates = [];
      if (status !== undefined) {
        params.push(status);
        predicates.push(`w.account_status = $${params.length}`);
      }
      if (search !== undefined) {
        params.push(escapeLikePattern(search));
        const parameter = `$${params.length}`;
        predicates.push(`(
          w.name ILIKE ('%' || ${parameter} || '%') ESCAPE '\\'
          OR EXISTS (
            SELECT 1
            FROM public.workspace_members AS search_membership
            INNER JOIN public.users AS search_user
              ON search_user.id = search_membership.user_id
            WHERE search_membership.workspace_id = w.id
              AND (
                search_user.name ILIKE ('%' || ${parameter} || '%') ESCAPE '\\'
                OR search_user.email ILIKE ('%' || ${parameter} || '%') ESCAPE '\\'
              )
          )
        )`);
      }

      params.push(pageSize, String(offset));
      const pageSizeParameter = `$${params.length - 1}`;
      const offsetParameter = `$${params.length}`;
      const whereClause =
        predicates.length > 0 ? `WHERE ${predicates.join(" AND ")}` : "";

      const result = await db.query(
        `/* admin-workspaces:list */
         WITH filtered_workspaces AS (
           SELECT
             w.id,
             w.name,
             w.account_status,
             w.is_active,
             w.release_channel,
             w.min_profiles,
             w.max_profiles,
             w.created_at,
             w.activated_at
           FROM public.workspaces AS w
           ${whereClause}
         ),
         paged_workspaces AS (
           SELECT *
           FROM filtered_workspaces
           ORDER BY created_at DESC, id DESC
           LIMIT ${pageSizeParameter}::INTEGER
           OFFSET ${offsetParameter}::BIGINT
         ),
         pagination AS (
           SELECT COUNT(*)::TEXT AS total_items
           FROM filtered_workspaces
         )
         SELECT
           pagination.total_items,
           paged.id::TEXT AS workspace_id,
           paged.name AS workspace_name,
           paged.account_status,
           paged.is_active,
           paged.release_channel,
           paged.min_profiles,
           paged.max_profiles,
           paged.created_at,
           paged.activated_at,
           owner.name AS owner_name,
           owner.email AS owner_email,
           member_activity.last_login_at
         FROM pagination
         LEFT JOIN paged_workspaces AS paged ON TRUE
         LEFT JOIN LATERAL (
           SELECT owner_user.name, owner_user.email
           FROM public.workspace_members AS owner_membership
           INNER JOIN public.users AS owner_user
             ON owner_user.id = owner_membership.user_id
           WHERE owner_membership.workspace_id = paged.id
             AND owner_membership.role = 'owner'
           ORDER BY owner_membership.created_at ASC, owner_membership.user_id ASC
           LIMIT 1
         ) AS owner ON paged.id IS NOT NULL
         LEFT JOIN LATERAL (
           SELECT MAX(member_user.last_login_at) AS last_login_at
           FROM public.workspace_members AS member_membership
           INNER JOIN public.users AS member_user
             ON member_user.id = member_membership.user_id
           WHERE member_membership.workspace_id = paged.id
         ) AS member_activity ON paged.id IS NOT NULL
         ORDER BY paged.created_at DESC NULLS LAST, paged.id DESC NULLS LAST`,
        params,
      );
      return result.rows;
    },

    async findWorkspaceDetailsById(workspaceId) {
      assertWorkspaceId(workspaceId);
      const result = await db.query(
        `/* admin-workspaces:details */
         SELECT
           w.id::TEXT AS workspace_id,
           w.name AS workspace_name,
           w.account_status,
           w.is_active,
           w.timezone,
           w.release_channel,
           w.min_profiles,
           w.max_profiles,
           w.created_at,
           w.updated_at,
           w.activated_at,
           member_user.id::TEXT AS member_user_id,
           member_user.name AS member_name,
           member_user.email AS member_email,
           membership.role AS member_role,
           member_user.last_login_at AS member_last_login_at,
           membership.created_at AS member_created_at
         FROM public.workspaces AS w
         LEFT JOIN public.workspace_members AS membership
           ON membership.workspace_id = w.id
         LEFT JOIN public.users AS member_user
           ON member_user.id = membership.user_id
         WHERE w.id = $1
         ORDER BY
           CASE WHEN membership.role = 'owner' THEN 0 ELSE 1 END ASC,
           membership.created_at ASC,
           membership.user_id ASC`,
        [workspaceId],
      );
      return result.rows;
    },

    async listWorkspaceAudit(workspaceId, { page, pageSize }) {
      assertWorkspaceId(workspaceId);
      const offset = assertPagination({ page, pageSize });
      const result = await db.query(
        `/* admin-workspaces:audit */
         WITH target_workspace AS (
           SELECT id
           FROM public.workspaces
           WHERE id = $1
         ),
         filtered_events AS (
           SELECT
             audit_event.id,
             audit_event.action,
             audit_event.reason,
             audit_event.before_state,
             audit_event.after_state,
             audit_event.created_at,
             actor.id AS actor_user_id,
             actor.name AS actor_name,
             actor.email AS actor_email
           FROM public.admin_audit_events AS audit_event
           INNER JOIN target_workspace AS target
             ON audit_event.target_workspace_id = target.id
           INNER JOIN public.users AS actor
             ON actor.id = audit_event.actor_user_id
         ),
         paged_events AS (
           SELECT *
           FROM filtered_events
           ORDER BY created_at DESC, id DESC
           LIMIT $2::INTEGER
           OFFSET $3::BIGINT
         ),
         metadata AS (
           SELECT
             EXISTS (SELECT 1 FROM target_workspace) AS workspace_exists,
             (SELECT COUNT(*)::TEXT FROM filtered_events) AS total_items
         )
         SELECT
           metadata.workspace_exists,
           metadata.total_items,
           paged.id::TEXT AS audit_event_id,
           paged.action,
           paged.reason,
           paged.before_state,
           paged.after_state,
           paged.created_at,
           paged.actor_user_id::TEXT AS actor_user_id,
           paged.actor_name,
           paged.actor_email
         FROM metadata
         LEFT JOIN paged_events AS paged ON TRUE
         ORDER BY paged.created_at DESC NULLS LAST, paged.id DESC NULLS LAST`,
        [workspaceId, pageSize, String(offset)],
      );
      return result.rows;
    },
  });
}

module.exports = {
  createAdminWorkspaceRepository,
  escapeLikePattern,
};
