import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LEGACY_OPERATIONAL_LOG_KEYS,
  clearLegacyOperationalLogs,
} from "../src/utils/clearLegacyOperationalLogs.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(testDirectory, "..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
}

test("cleanup remove somente as duas chaves legadas conhecidas", () => {
  const calls = [];
  const storage = {
    removeItem(key) {
      calls.push(["removeItem", key]);
    },
    clear() {
      calls.push(["clear"]);
    },
  };

  assert.equal(clearLegacyOperationalLogs(storage), true);
  assert.deepEqual(LEGACY_OPERATIONAL_LOG_KEYS, [
    "scraper_logs",
    "leadhunt_logs",
  ]);
  assert.deepEqual(calls, [
    ["removeItem", "scraper_logs"],
    ["removeItem", "leadhunt_logs"],
  ]);
});

test("cleanup falha fechado sem impedir startup quando storage está indisponível", () => {
  const attemptedKeys = [];
  const storage = {
    removeItem(key) {
      attemptedKeys.push(key);
      if (key === "scraper_logs") {
        throw new Error("storage unavailable");
      }
    },
  };

  assert.equal(clearLegacyOperationalLogs(storage), false);
  assert.deepEqual(attemptedKeys, ["scraper_logs", "leadhunt_logs"]);
});

test("cleanup ocorre antes da montagem React", () => {
  const source = readSource("src/main.jsx");
  const cleanupIndex = source.indexOf("clearLegacyOperationalLogs();");
  const createRootIndex = source.indexOf("createRoot(");

  assert.notEqual(cleanupIndex, -1);
  assert.notEqual(createRootIndex, -1);
  assert.ok(cleanupIndex < createRootIndex);
});

test("frontend alcançável não conecta Socket nem persiste logs sensíveis", () => {
  const sourcePaths = [
    "src/App.jsx",
    "src/components/Sidebar.jsx",
    "src/sections/Home.jsx",
    "src/sections/Automation.jsx",
  ];
  const combinedSource = sourcePaths.map(readSource).join("\n");

  assert.doesNotMatch(combinedSource, /socket\.io-client/);
  assert.doesNotMatch(combinedSource, /worker-status-update/);
  assert.doesNotMatch(combinedSource, /automation-log/);
  assert.doesNotMatch(combinedSource, /scraper-log/);
  assert.doesNotMatch(combinedSource, /run-scraper/);
  assert.doesNotMatch(combinedSource, /health-check/);
  assert.doesNotMatch(combinedSource, /localStorage/);
  assert.doesNotMatch(combinedSource, /activeTab === "search"/);
  assert.doesNotMatch(combinedSource, /activeTab === "laboratory"/);
});
