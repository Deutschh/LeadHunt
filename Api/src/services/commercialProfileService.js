const {
  normalizeTextValue,
  validatePresentationPreferences,
} = require("../validation/commercialProfileValidation");

class CommercialProfileStateError extends Error {
  constructor(reason = "missing_profile") {
    super("O perfil comercial deste workspace está indisponível.");
    this.name = "CommercialProfileStateError";
    this.reason = reason;
  }
}

const PERSISTED_TEXT_FIELDS = Object.freeze([
  ["senderName", "sender_name"],
  ["businessName", "business_name"],
  ["businessDescription", "business_description"],
  ["salesContext", "sales_context"],
]);

function mapPersistedProfile(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new CommercialProfileStateError("invalid_persisted_profile");
  }

  const profile = {};
  for (const [fieldName, columnName] of PERSISTED_TEXT_FIELDS) {
    const result = normalizeTextValue(fieldName, row[columnName], {
      allowBlank: true,
    });
    if (result.error) {
      throw new CommercialProfileStateError("invalid_persisted_profile");
    }
    profile[fieldName] = row[columnName];
  }

  const preferences = validatePresentationPreferences(
    row.presentation_preferences,
  );
  if (preferences.error) {
    throw new CommercialProfileStateError("invalid_persisted_profile");
  }
  profile.presentationPreferences = preferences.value;
  profile.isComplete =
    typeof profile.senderName === "string" &&
    profile.senderName.trim().length > 0 &&
    typeof profile.businessName === "string" &&
    profile.businessName.trim().length > 0;

  return profile;
}

function createCommercialProfileService({ repository }) {
  if (
    !repository ||
    typeof repository.findByWorkspaceId !== "function" ||
    typeof repository.updateByWorkspaceId !== "function"
  ) {
    throw new TypeError("Repository de perfil comercial é obrigatório.");
  }

  return Object.freeze({
    async getByWorkspaceId(workspaceId) {
      const row = await repository.findByWorkspaceId(workspaceId);
      if (!row) throw new CommercialProfileStateError();
      return mapPersistedProfile(row);
    },

    async updateByWorkspaceId(workspaceId, patch) {
      const row = await repository.updateByWorkspaceId(workspaceId, patch);
      if (!row) throw new CommercialProfileStateError();
      return mapPersistedProfile(row);
    },
  });
}

module.exports = {
  CommercialProfileStateError,
  createCommercialProfileService,
  mapPersistedProfile,
};
