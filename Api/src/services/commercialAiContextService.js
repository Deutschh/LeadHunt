function assertWorkspaceId(workspaceId) {
  if (typeof workspaceId !== "string" || !/^[1-9]\d*$/u.test(workspaceId)) {
    throw new TypeError("workspaceId interno inválido.");
  }
}

function safeSingleLine(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/u.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function mapLeadContext(lead) {
  const rating = Number(lead?.rating);
  const reviewsCount = Number(lead?.reviews_count);
  return Object.freeze({
    name: safeSingleLine(lead?.name),
    category: safeSingleLine(lead?.lead_category),
    city: safeSingleLine(lead?.lead_city),
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    reviewsCount:
      Number.isInteger(reviewsCount) && reviewsCount > 0 ? reviewsCount : null,
  });
}

function mapCommercialProfile(profile) {
  return Object.freeze({
    senderName: profile.senderName,
    businessName: profile.businessName,
    businessDescription: profile.businessDescription,
    salesContext: profile.salesContext,
  });
}

function mapService(service) {
  return Object.freeze({
    name: service.name,
    type: service.type,
    problemCategory: service.problemCategory,
    description: service.description,
    howItWorks: service.howItWorks,
    problemsSolved: Object.freeze([...service.problemsSolved]),
    targetNiches: Object.freeze([...service.targetNiches]),
  });
}

function mapNicheStrategy(strategy) {
  if (!strategy) return null;
  return Object.freeze({
    nicheName: strategy.nicheName,
    hook: strategy.hook,
    callToAction: strategy.callToAction,
  });
}

function createCommercialAiContextService({
  commercialProfileService,
  serviceCatalogService,
  nicheStrategyService,
}) {
  if (
    !commercialProfileService ||
    typeof commercialProfileService.getByWorkspaceId !== "function" ||
    !serviceCatalogService ||
    typeof serviceCatalogService.listByWorkspaceId !== "function" ||
    !nicheStrategyService ||
    typeof nicheStrategyService.resolveWorkspaceNicheStrategy !== "function"
  ) {
    throw new TypeError("Dependências do contexto comercial são obrigatórias.");
  }

  return Object.freeze({
    async prepareBatchContext(workspaceId, leads) {
      assertWorkspaceId(workspaceId);
      if (!Array.isArray(leads)) {
        throw new TypeError("Leads da operação são obrigatórios.");
      }

      const [profile, services] = await Promise.all([
        commercialProfileService.getByWorkspaceId(workspaceId),
        serviceCatalogService.listByWorkspaceId(workspaceId, { active: true }),
      ]);

      const nicheNames = [
        ...new Set(
          leads
            .map((lead) => safeSingleLine(lead?.lead_category))
            .filter(Boolean),
        ),
      ];
      const strategies = await Promise.all(
        nicheNames.map(async (nicheName) => [
          nicheName,
          await nicheStrategyService.resolveWorkspaceNicheStrategy(
            workspaceId,
            nicheName,
          ),
        ]),
      );
      const strategiesByNiche = new Map(strategies);
      const stableContext = Object.freeze({
        commercialProfile: mapCommercialProfile(profile),
        services: Object.freeze(services.map(mapService)),
      });

      return Object.freeze({
        forLead(lead) {
          const mappedLead = mapLeadContext(lead);
          return Object.freeze({
            ...stableContext,
            lead: mappedLead,
            nicheStrategy: mapNicheStrategy(
              mappedLead.category
                ? strategiesByNiche.get(mappedLead.category)
                : null,
            ),
          });
        },
      });
    },
  });
}

module.exports = {
  createCommercialAiContextService,
  mapLeadContext,
};
