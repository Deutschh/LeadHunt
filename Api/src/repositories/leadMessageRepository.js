const LEAD_CONTEXT_COLUMNS = Object.freeze([
  "id",
  "name",
  "lead_category",
  "lead_city",
  "rating",
  "reviews_count",
]);

const GENERATED_LEAD_COLUMNS = Object.freeze([
  "id",
  "name",
  "phone",
  "lead_category",
  "lead_city",
  "rating",
  "reviews_count",
  "ai_prompt_angle",
  "ai_prompt_label",
  "ai_prompt_version",
  "ai_generation_batch_id",
  "ai_message_generated_at",
  "custom_message",
  "offer_type",
  "offer_label",
  "offer_reason",
  "message_type",
]);

const LAST_BATCH_COLUMNS = Object.freeze([
  "id",
  "name",
  "phone",
  "lead_category",
  "lead_city",
  "rating",
  "reviews_count",
  "ai_prompt_angle",
  "ai_prompt_label",
  "ai_prompt_version",
  "ai_generation_batch_id",
  "ai_message_generated_at",
  "custom_message",
]);

function assertWorkspaceId(workspaceId) {
  if (typeof workspaceId !== "string" || !/^[1-9]\d*$/u.test(workspaceId)) {
    throw new TypeError("workspaceId interno inválido.");
  }
}

function assertLeadId(leadId) {
  if (!Number.isInteger(leadId) || leadId <= 0) {
    throw new TypeError("leadId interno inválido.");
  }
}

function createLeadMessageRepository({ db }) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("Banco injetado é obrigatório.");
  }

  return Object.freeze({
    async findEligibleByWorkspaceId(workspaceId, filters) {
      assertWorkspaceId(workspaceId);
      const {
        limit,
        minRating,
        status,
        category,
        categories,
        random,
      } = filters;
      const params = [workspaceId, status, minRating];
      let categoryClause = "";

      if (categories.length > 0) {
        params.push(categories);
        categoryClause = ` AND lead_category = ANY($${params.length})`;
      } else if (category) {
        params.push(category);
        categoryClause = ` AND lead_category = $${params.length}`;
      }

      const orderClause = random
        ? "ORDER BY RANDOM()"
        : "ORDER BY rating DESC, reviews_count DESC, created_at DESC";
      params.push(limit);

      const result = await db.query(
        `SELECT ${LEAD_CONTEXT_COLUMNS.join(", ")}
           FROM public.leads
          WHERE workspace_id = $1
            AND status = $2
            AND is_ai_ready = false
            AND is_archived = false
            AND rating >= $3${categoryClause}
          ${orderClause}
          LIMIT $${params.length}`,
        params,
      );
      return result.rows;
    },

    async isAiEnabledByWorkspaceId(workspaceId) {
      assertWorkspaceId(workspaceId);
      const result = await db.query(
        `SELECT is_ai_enabled
           FROM public.automation_settings
          WHERE workspace_id = $1
          LIMIT 1`,
        [workspaceId],
      );
      return result.rows[0]?.is_ai_enabled === true;
    },

    async updateGeneratedMessageByIdAndWorkspaceId(
      leadId,
      workspaceId,
      batchId,
      generated,
    ) {
      assertLeadId(leadId);
      assertWorkspaceId(workspaceId);
      const result = await db.query(
        `UPDATE public.leads
            SET ai_message_suggestion = $1,
                custom_message = $1,
                is_ai_ready = true,
                is_verified = true,
                ai_prompt_angle = $2,
                ai_prompt_version = $3,
                ai_prompt_label = $4,
                ai_message_generated_at = NOW(),
                ai_generation_batch_id = $5,
                offer_type = NULL,
                offer_label = NULL,
                offer_reason = NULL,
                message_type = $6
          WHERE id = $7
            AND workspace_id = $8
      RETURNING ${GENERATED_LEAD_COLUMNS.join(", ")}`,
        [
          generated.message,
          generated.meta.angle,
          generated.meta.version,
          generated.meta.angle_label,
          batchId,
          generated.meta.message_type,
          leadId,
          workspaceId,
        ],
      );
      return result.rows[0] || null;
    },

    async findLatestBatchIdByWorkspaceId(workspaceId) {
      assertWorkspaceId(workspaceId);
      const result = await db.query(
        `SELECT ai_generation_batch_id
           FROM public.leads
          WHERE workspace_id = $1
            AND ai_generation_batch_id IS NOT NULL
          ORDER BY ai_message_generated_at DESC
          LIMIT 1`,
        [workspaceId],
      );
      return result.rows[0]?.ai_generation_batch_id || null;
    },

    async findByBatchIdAndWorkspaceId(batchId, workspaceId) {
      assertWorkspaceId(workspaceId);
      const result = await db.query(
        `SELECT ${LAST_BATCH_COLUMNS.join(", ")}
           FROM public.leads
          WHERE ai_generation_batch_id = $1
            AND workspace_id = $2
          ORDER BY ai_message_generated_at DESC, id DESC`,
        [batchId, workspaceId],
      );
      return result.rows;
    },
  });
}

module.exports = {
  createLeadMessageRepository,
};
