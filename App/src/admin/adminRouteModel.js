export function resolveAdminRoute(authStatus, adminStatus) {
  if (authStatus !== "authenticated") return "login";
  if (adminStatus === "unknown" || adminStatus === "checking") return "checking";
  if (adminStatus === "admin") return "allow";
  if (adminStatus === "notAdmin") return "deny";
  return "error";
}
