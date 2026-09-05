function assertWorkspaceId(workspaceId) {
  if (typeof workspaceId !== "string" || !/^[1-9]\d*$/u.test(workspaceId)) {
    throw new TypeError("workspaceId interno inválido.");
  }
}

function createNegotiationGuideContextService({
  commercialProfileService,
  nicheStrategyService,
}) {
  if (
    !commercialProfileService ||
    typeof commercialProfileService.getByWorkspaceId !== "function"
  ) {
    throw new TypeError("Serviço de perfil comercial é obrigatório.");
  }
  if (
    !nicheStrategyService ||
    typeof nicheStrategyService.resolveWorkspaceNicheStrategy !== "function"
  ) {
    throw new TypeError("Serviço de estratégia de nicho é obrigatório.");
  }

  return Object.freeze({
    async compose({ workspaceId, row, recentActivities = [] }) {
      assertWorkspaceId(workspaceId);
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new TypeError("Dados da oportunidade são obrigatórios.");
      }

      const nicheName =
        typeof row.lead_category === "string" && row.lead_category.trim()
          ? row.lead_category
          : null;
      const [commercialProfile, nicheStrategy] = await Promise.all([
        commercialProfileService.getByWorkspaceId(workspaceId),
        nicheName
          ? nicheStrategyService.resolveWorkspaceNicheStrategy(
              workspaceId,
              nicheName,
            )
          : Promise.resolve(null),
      ]);

      return {
        seller: {
          sender_name: commercialProfile.senderName,
          business_name: commercialProfile.businessName,
          business_description: commercialProfile.businessDescription,
          sales_context: commercialProfile.salesContext,
        },
        niche_strategy: nicheStrategy
          ? {
              niche_name: nicheStrategy.nicheName,
              hook: nicheStrategy.hook,
              call_to_action: nicheStrategy.callToAction,
            }
          : null,
        lead: {
          name: row.lead_name,
          lead_category: row.lead_category,
          city: row.lead_city,
          rating: row.rating === null || row.rating === undefined
            ? null
            : Number(row.rating),
          reviews_count:
            row.reviews_count === null || row.reviews_count === undefined
              ? null
              : Number(row.reviews_count),
          has_website: row.has_website,
          status: row.lead_status,
          pipeline_stage: row.pipeline_stage,
          market_observation: row.market_observation || "",
          internal_notes: row.internal_notes || "",
          current_message:
            row.custom_message || row.ai_message_suggestion || "",
        },
        selected_service: {
          name: row.service_name,
          type: row.service_type,
          problem_category: row.problem_category,
          description: row.service_description,
          how_it_works: row.how_it_works,
          problems_solved: Array.isArray(row.problems_solved)
            ? row.problems_solved
            : [],
          target_niches: Array.isArray(row.target_niches)
            ? row.target_niches
            : [],
        },
        human_analysis: {
          notes: row.analysis_notes || "",
          perceived_goal: row.perceived_goal || "",
          pain_points: Array.isArray(row.pain_points) ? row.pain_points : [],
        },
        commercial_progress: {
          opportunity_score: Number(row.total_score || 0),
          interest_registered: Number(row.interest_score || 0) > 0,
          preview_registered: Number(row.preview_score || 0) > 0,
          price_registered: Number(row.price_score || 0) > 0,
          closed: Number(row.closed_score || 0) > 0,
        },
        recent_activities: recentActivities.map((activity) => ({
          type: activity.type,
          description: activity.description,
          created_at: activity.created_at,
        })),
      };
    },
  });
}

module.exports = {
  createNegotiationGuideContextService,
};
