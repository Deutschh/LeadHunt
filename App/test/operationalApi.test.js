import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { createOperationalApi } from "../src/services/api.js";
import { createPublicBriefingApi } from "../src/services/publicBriefingApi.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(entryPath);
    return /\.(?:js|jsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

test("adapter operacional usa exclusivamente apiRequest injetado", async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const api = createOperationalApi(async (requestPath, options) => {
    calls.push({ requestPath, options });
    return { ok: true };
  });

  assert.deepEqual(await api.get("/leads", { signal }), {
    data: { ok: true },
  });
  assert.deepEqual(await api.post("/leads/notes", { title: "Nota" }), {
    data: { ok: true },
  });
  assert.deepEqual(calls, [
    {
      requestPath: "/leads",
      options: { method: "GET", data: undefined, signal },
    },
    {
      requestPath: "/leads/notes",
      options: {
        method: "POST",
        data: { title: "Nota" },
        signal: undefined,
      },
    },
  ]);
  assert.equal(JSON.stringify(calls).includes("Authorization"), false);
  assert.equal(JSON.stringify(calls).includes("accessToken"), false);
});

test("adapter reduz erros ao formato compatível sem resposta bruta", async () => {
  const sensitive = new Error("Falha operacional sanitizada");
  sensitive.status = 503;
  sensitive.code = "FEATURE_TEMPORARILY_UNAVAILABLE";
  sensitive.config = { headers: { Authorization: "Bearer secret" } };
  sensitive.request = { cookie: "secret" };

  const api = createOperationalApi(async () => {
    throw sensitive;
  });
  await assert.rejects(api.get("/leads"), (error) => {
    assert.equal(error.status, 503);
    assert.equal(error.code, "FEATURE_TEMPORARILY_UNAVAILABLE");
    assert.equal(error.response.status, 503);
    assert.equal("config" in error, false);
    assert.equal("request" in error, false);
    assert.equal(JSON.stringify(error).includes("Bearer secret"), false);
    return true;
  });
});

test("briefing público usa transporte sem credentials ou Bearer", async () => {
  const createCalls = [];
  const requests = [];
  const api = createPublicBriefingApi({
    baseURL: "https://api.example.test/api",
    axiosModule: {
      create(config) {
        createCalls.push(config);
        return {
          get: async (...args) => requests.push(["get", ...args]),
          post: async (...args) => requests.push(["post", ...args]),
        };
      },
    },
  });
  const signal = new AbortController().signal;

  await api.get("public-token", { signal });
  await api.submit("public-token", { business_name: "Empresa" }, { signal });

  assert.deepEqual(createCalls, [
    {
      baseURL: "https://api.example.test/api",
      withCredentials: false,
      timeout: 10_000,
      allowAbsoluteUrls: false,
    },
  ]);
  assert.deepEqual(requests, [
    ["get", "/public/briefings/public-token", { signal }],
    [
      "post",
      "/public/briefings/public-token/submit",
      { business_name: "Empresa" },
      { signal },
    ],
  ]);
  assert.equal(JSON.stringify(requests).includes("Authorization"), false);

  const appSource = read("src/App.jsx");
  const briefingSource = read("src/sections/PublicBriefing.jsx");
  const publicRouteIndex = appSource.indexOf(
    'path="/briefing/:publicToken"',
  );
  const authProviderIndex = appSource.indexOf("<AuthProvider>");
  assert.ok(publicRouteIndex >= 0);
  assert.ok(authProviderIndex > publicRouteIndex);
  assert.match(
    appSource,
    /<Route path="\/briefing\/:publicToken" element={<PublicBriefing \/>} \/>\s*<Route[\s\S]*?path="\*"[\s\S]*?<AuthProvider>/,
  );
  assert.doesNotMatch(
    briefingSource,
    /AuthProvider|useAuth|authSessionController|\/auth\/(?:refresh|me)/,
  );
});

test("todo App/src fica sem transporte operacional global reutilizável", () => {
  const sourceRoot = path.join(projectRoot, "src");
  const allowedAxiosFiles = new Set([
    path.join(sourceRoot, "auth", "authHttpClient.js"),
    path.join(sourceRoot, "services", "publicBriefingApi.js"),
  ]);
  const allowedBaseUrlFiles = new Set([
    path.join(sourceRoot, "auth", "authHttpClient.js"),
    path.join(sourceRoot, "config", "apiConfig.js"),
    path.join(sourceRoot, "services", "publicBriefingApi.js"),
  ]);
  const allowedAuthorizationFiles = new Set([
    path.join(sourceRoot, "auth", "authHttpClient.js"),
  ]);

  for (const file of listSourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, "utf8");
    if (!allowedAxiosFiles.has(file)) {
      assert.doesNotMatch(source, /\baxios\b/, file);
    }
    if (!allowedBaseUrlFiles.has(file)) {
      assert.doesNotMatch(source, /API_BASE_URL|API_ORIGIN/, file);
    }
    if (!allowedAuthorizationFiles.has(file)) {
      assert.doesNotMatch(source, /Authorization/, file);
    }
    assert.doesNotMatch(source, /\bfetch\s*\(/, file);
  }

  for (const relativePath of [
    "src/sections/Search.jsx",
    "src/sections/Laboratory.jsx",
  ]) {
    const source = read(relativePath);
    assert.match(source, /useOperationalApi/);
    assert.doesNotMatch(source, /from ["']\.\.\/services\/api/);
    assert.doesNotMatch(source, /\baxios\b|\bfetch\s*\(|API_BASE_URL/);
  }

  assert.equal(fs.existsSync(path.join(sourceRoot, "services", "promptService.js")), false);
});

test("Search e Config consomem o contrato camelCase de estratégias de nicho", () => {
  const searchSource = read("src/sections/Search.jsx");
  const configSource = read("src/sections/config.jsx");

  for (const source of [searchSource, configSource]) {
    assert.match(source, /api\.get\("\/leads\/niches"\)/);
    assert.match(source, /nicheName/);
    assert.doesNotMatch(source, /niche_name|call_to_action/);
  }
  assert.match(configSource, /callToAction/);
  assert.match(
    configSource,
    /callToAction:\s*newNiche\.callToAction\.trim\(\)/,
  );
  assert.match(configSource, /!nichePayload\.callToAction/);
  assert.match(configSource, /api\.post\("\/leads\/niches", nichePayload\)/);
  assert.match(configSource, /api\.delete\(`\/leads\/niches\/\$\{id\}`\)/);
});
