const SERVICE_COLUMNS = Object.freeze([
  "id",
  "service_name",
  "service_type",
  "problem_category",
  "description",
  "how_it_works",
  "problems_solved",
  "target_niches",
  "is_active",
  "display_order",
]);

const PATCH_COLUMNS = Object.freeze([
  ["name", "service_name"],
  ["type", "service_type"],
  ["problemCategory", "problem_category"],
  ["description", "description"],
  ["howItWorks", "how_it_works"],
  ["problemsSolved", "problems_solved"],
  ["targetNiches", "target_niches"],
  ["isActive", "is_active"],
  ["displayOrder", "display_order"],
]);

function assertPositiveId(value, label) {
  if (typeof value !== "string" || !/^[1-9]\d*$/u.test(value)) {
    throw new TypeError(`${label} interno inválido.`);
  }
}

function serializeJsonField(fieldName, value) {
  return fieldName === "problemsSolved" || fieldName === "targetNiches"
    ? JSON.stringify(value)
    : value;
}

function createServiceCatalogRepository({ db }) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError("Banco injetado é obrigatório.");
  }

  return Object.freeze({
    async findAllByWorkspaceId(workspaceId, { active } = {}) {
      assertPositiveId(workspaceId, "workspaceId");
      const params = [workspaceId];
      const activeClause =
        typeof active === "boolean"
          ? ` AND is_active = $${params.push(active)}`
          : "";
      const result = await db.query(
        `SELECT ${SERVICE_COLUMNS.join(", ")}
           FROM public.velaris_services
          WHERE workspace_id = $1${activeClause}
          ORDER BY display_order ASC, id ASC`,
        params,
      );
      return result.rows;
    },

    async createByWorkspaceId(workspaceId, serviceKey, data) {
      assertPositiveId(workspaceId, "workspaceId");
      const params = [
        workspaceId,
        serviceKey,
        data.name,
        data.type,
        data.problemCategory,
        data.description,
        data.howItWorks,
        JSON.stringify(data.problemsSolved),
        JSON.stringify(data.targetNiches),
        data.isActive,
      ];
      const displayOrderExpression = Object.hasOwn(data, "displayOrder")
        ? `$${params.push(data.displayOrder)}`
        : `(SELECT COALESCE(MAX(display_order)::bigint + 1, 0)
              FROM public.velaris_services
             WHERE workspace_id = $1)`;

      const result = await db.query(
        `INSERT INTO public.velaris_services (
           workspace_id,
           service_key,
           service_name,
           service_type,
           problem_category,
           description,
           how_it_works,
           problems_solved,
           target_niches,
           is_active,
           display_order
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, ${displayOrderExpression})
         RETURNING ${SERVICE_COLUMNS.join(", ")}`,
        params,
      );
      return result.rows[0] || null;
    },

    async updateByIdAndWorkspaceId(serviceId, workspaceId, patch) {
      assertPositiveId(serviceId, "serviceId");
      assertPositiveId(workspaceId, "workspaceId");
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        throw new TypeError("Patch validado é obrigatório.");
      }

      const assignments = [];
      const params = [serviceId, workspaceId];
      for (const [fieldName, columnName] of PATCH_COLUMNS) {
        if (!Object.hasOwn(patch, fieldName)) continue;
        params.push(serializeJsonField(fieldName, patch[fieldName]));
        const cast =
          fieldName === "problemsSolved" || fieldName === "targetNiches"
            ? "::jsonb"
            : "";
        assignments.push(`${columnName} = $${params.length}${cast}`);
      }
      if (assignments.length === 0) {
        throw new TypeError("Patch sem campos persistíveis.");
      }

      const result = await db.query(
        `UPDATE public.velaris_services
            SET ${assignments.join(", ")}
          WHERE id = $1
            AND workspace_id = $2
      RETURNING ${SERVICE_COLUMNS.join(", ")}`,
        params,
      );
      return result.rows[0] || null;
    },
  });
}

module.exports = {
  createServiceCatalogRepository,
};
