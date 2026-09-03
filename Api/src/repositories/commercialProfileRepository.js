const PROFILE_COLUMNS = Object.freeze([
  "sender_name",
  "business_name",
  "business_description",
  "sales_context",
  "presentation_preferences",
]);

const PATCH_COLUMNS = Object.freeze([
  ["senderName", "sender_name"],
  ["businessName", "business_name"],
  ["businessDescription", "business_description"],
  ["salesContext", "sales_context"],
  ["presentationPreferences", "presentation_preferences"],
]);

function assertWorkspaceId(workspaceId) {
  if (typeof workspaceId !== "string" || !/^[1-9]\d*$/.test(workspaceId)) {
    throw new TypeError("workspaceId interno inválido.");
  }
}

function createCommercialProfileRepository({ db }) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("Banco injetado é obrigatório.");
  }

  return Object.freeze({
    async findByWorkspaceId(workspaceId) {
      assertWorkspaceId(workspaceId);
      const result = await db.query(
        `SELECT ${PROFILE_COLUMNS.join(", ")}
           FROM public.workspace_commercial_profiles
          WHERE workspace_id = $1
          LIMIT 1`,
        [workspaceId],
      );
      return result.rows[0] || null;
    },

    async updateByWorkspaceId(workspaceId, patch) {
      assertWorkspaceId(workspaceId);
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new TypeError("Patch validado é obrigatório.");
      }

      const assignments = [];
      const params = [workspaceId];
      for (const [fieldName, columnName] of PATCH_COLUMNS) {
        if (!Object.hasOwn(patch, fieldName)) continue;
        const value =
          fieldName === "presentationPreferences"
            ? JSON.stringify(patch[fieldName])
            : patch[fieldName];
        params.push(value);
        assignments.push(`${columnName} = $${params.length}`);
      }

      if (assignments.length === 0) {
        throw new TypeError("Patch sem campos persistíveis.");
      }

      const result = await db.query(
        `UPDATE public.workspace_commercial_profiles
            SET ${assignments.join(", ")}, updated_at = NOW()
          WHERE workspace_id = $1
      RETURNING ${PROFILE_COLUMNS.join(", ")}`,
        params,
      );
      return result.rows[0] || null;
    },
  });
}

module.exports = {
  createCommercialProfileRepository,
};
