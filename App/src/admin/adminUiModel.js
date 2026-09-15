export const ACCOUNT_STATUS_META = Object.freeze({
  pending: Object.freeze({ label: "Pending", tone: "amber" }),
  active: Object.freeze({ label: "Active", tone: "green" }),
  suspended: Object.freeze({ label: "Suspended", tone: "red" }),
});

export const RELEASE_CHANNEL_LABELS = Object.freeze({
  internal: "Internal",
  canary: "Canary",
  beta: "Beta",
  stable: "Stable",
});

export const AUDIT_ACTION_LABELS = Object.freeze({
  account_activated: "Conta ativada",
  account_suspended: "Conta suspensa",
  account_reactivated: "Conta reativada",
  max_profiles_changed: "Limite de perfis alterado",
  release_channel_changed: "Canal de release alterado",
});

export const CONFLICT_MESSAGES = Object.freeze({
  ADMIN_WORKSPACE_STATUS_CONFLICT:
    "O status desta conta mudou desde que a tela foi carregada.",
  ADMIN_WORKSPACE_MAX_PROFILES_CONFLICT:
    "O limite de perfis mudou desde que a tela foi carregada.",
  ADMIN_WORKSPACE_RELEASE_CHANNEL_CONFLICT:
    "O canal de release mudou desde que a tela foi carregada.",
});

const SNAPSHOT_LABELS = Object.freeze({
  accountStatus: "Status da conta",
  isActive: "Kill switch",
  activatedAt: "Data de ativação",
  maxProfiles: "Máximo de perfis",
  releaseChannel: "Canal de release",
});

export function getStatusAction(accountStatus) {
  if (accountStatus === "pending") {
    return Object.freeze({ action: "activate", label: "Ativar conta", next: "active" });
  }
  if (accountStatus === "active") {
    return Object.freeze({ action: "suspend", label: "Suspender conta", next: "suspended" });
  }
  if (accountStatus === "suspended") {
    return Object.freeze({ action: "reactivate", label: "Reativar conta", next: "active" });
  }
  return null;
}

export function deriveWorkspacePeople(details) {
  const members = Array.isArray(details?.members) ? details.members : [];
  const owner = members.find((member) => member.role === "owner") || null;
  const lastLoginAt = members.reduce((latest, member) => {
    if (!member.lastLoginAt) return latest;
    return !latest || member.lastLoginAt > latest ? member.lastLoginAt : latest;
  }, null);
  return Object.freeze({ owner, lastLoginAt });
}

export function getAuditActionLabel(action) {
  return AUDIT_ACTION_LABELS[action] || `Evento administrativo · ${action}`;
}

export function getConflictMessage(code) {
  return CONFLICT_MESSAGES[code] || null;
}

export function getSnapshotRows(beforeState, afterState) {
  return Object.keys(SNAPSHOT_LABELS)
    .filter((field) => Object.hasOwn(beforeState, field) || Object.hasOwn(afterState, field))
    .map((field) => Object.freeze({
      field,
      label: SNAPSHOT_LABELS[field],
      before: Object.hasOwn(beforeState, field) ? beforeState[field] : null,
      after: Object.hasOwn(afterState, field) ? afterState[field] : null,
    }));
}

export function formatAdminDate(value, emptyLabel = "Data não registrada") {
  if (!value) return emptyLabel;
  return new Date(value).toLocaleString("pt-BR");
}
