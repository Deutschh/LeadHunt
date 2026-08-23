const RESERVED_PREFIXES = [
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/pending",
  "/suspended",
  "/inactive",
  "/briefing",
];

export function sanitizeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  if (
    value.includes("\\") ||
    /^[a-z][a-z\d+.-]*:/i.test(value) ||
    [...value].some((character) => {
      const code = character.codePointAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(value, "https://leadhunt.invalid");
  } catch {
    return null;
  }
  if (parsed.origin !== "https://leadhunt.invalid") return null;
  if (RESERVED_PREFIXES.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`))) {
    return null;
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function getAccountDestination(auth, returnTo) {
  if (auth?.status !== "authenticated" || !auth.workspace) return "/login";
  if (auth.workspace.isActive === false) return "/inactive";
  if (auth.workspace.accountStatus === "pending") return "/pending";
  if (auth.workspace.accountStatus === "suspended") return "/suspended";
  if (auth.workspace.accountStatus === "active" && auth.workspace.isActive === true) {
    return sanitizeReturnTo(returnTo) || "/";
  }
  return "/inactive";
}

export function getInternalLocation(location) {
  return sanitizeReturnTo(
    `${location?.pathname || "/"}${location?.search || ""}${location?.hash || ""}`,
  );
}
