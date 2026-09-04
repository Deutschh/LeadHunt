const NICHE_STRATEGY_COLUMNS = Object.freeze([
  "id",
  "niche_name",
  "hook",
  "call_to_action",
]);

function assertPositiveId(value, label) {
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) {
    throw new TypeError(`${label} interno inválido.`);
  }
}

function createNicheStrategyRepository({ db }) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("Banco injetado é obrigatório.");
  }

  return Object.freeze({
    async findAllByWorkspaceId(workspaceId) {
      assertPositiveId(workspaceId, "workspaceId");
      const result = await db.query(
        `SELECT ${NICHE_STRATEGY_COLUMNS.join(", ")}
           FROM public.niche_strategies
          WHERE workspace_id = $1
          ORDER BY niche_name ASC, id ASC`,
        [workspaceId],
      );
      return result.rows;
    },

    async upsertByWorkspaceId(workspaceId, data) {
      assertPositiveId(workspaceId, "workspaceId");
      const result = await db.query(
        `INSERT INTO public.niche_strategies (
           workspace_id,
           niche_name,
           hook,
           call_to_action
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (workspace_id, niche_name)
         DO UPDATE SET
           hook = EXCLUDED.hook,
           call_to_action = EXCLUDED.call_to_action
         RETURNING ${NICHE_STRATEGY_COLUMNS.join(", ")}`,
        [workspaceId, data.nicheName, data.hook, data.callToAction],
      );
      return result.rows[0] || null;
    },

    async deleteByIdAndWorkspaceId(id, workspaceId) {
      assertPositiveId(id, "id");
      assertPositiveId(workspaceId, "workspaceId");
      const result = await db.query(
        `DELETE FROM public.niche_strategies
          WHERE id = $1
            AND workspace_id = $2
      RETURNING id`,
        [id, workspaceId],
      );
      return result.rows[0] || null;
    },

    async findByWorkspaceIdAndNicheName(workspaceId, nicheName) {
      assertPositiveId(workspaceId, "workspaceId");
      const result = await db.query(
        `SELECT ${NICHE_STRATEGY_COLUMNS.join(", ")}
           FROM public.niche_strategies
          WHERE workspace_id = $1
            AND niche_name = $2
          LIMIT 1`,
        [workspaceId, nicheName],
      );
      return result.rows[0] || null;
    },
  });
}

module.exports = {
  createNicheStrategyRepository,
};
