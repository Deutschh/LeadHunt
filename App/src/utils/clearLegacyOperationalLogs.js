const LEGACY_OPERATIONAL_LOG_KEYS = ["scraper_logs", "leadhunt_logs"];

export function clearLegacyOperationalLogs(storageOverride) {
  let storage;

  try {
    storage = storageOverride ?? globalThis.localStorage;
  } catch {
    return false;
  }

  let cleanupSucceeded = true;

  for (const key of LEGACY_OPERATIONAL_LOG_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      cleanupSucceeded = false;
    }
  }

  return cleanupSucceeded;
}

export { LEGACY_OPERATIONAL_LOG_KEYS };
