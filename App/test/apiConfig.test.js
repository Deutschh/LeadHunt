import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiConfig } from "../src/config/apiConfig.js";

test("configuração preserva o hostname local e centraliza /api", () => {
  assert.deepEqual(
    resolveApiConfig({ browserHostname: "localhost" }),
    {
      API_ORIGIN: "http://localhost:3001",
      API_BASE_URL: "http://localhost:3001/api",
    },
  );
  assert.deepEqual(
    resolveApiConfig({ browserHostname: "127.0.0.1" }),
    {
      API_ORIGIN: "http://127.0.0.1:3001",
      API_BASE_URL: "http://127.0.0.1:3001/api",
    },
  );
});

test("produção exige origem HTTPS explícita e segura", () => {
  for (const configuredUrl of [
    undefined,
    "http://api.example.com",
    "https://user:pass@api.example.com",
    "https://api.example.com/path",
    "https://api.example.com?query=1",
    "https://api.example.com#fragment",
  ]) {
    assert.throws(() =>
      resolveApiConfig({ configuredUrl, isProduction: true }),
    );
  }

  assert.deepEqual(
    resolveApiConfig({
      configuredUrl: "https://api.example.com/",
      isProduction: true,
    }),
    {
      API_ORIGIN: "https://api.example.com",
      API_BASE_URL: "https://api.example.com/api",
    },
  );
});

test("desenvolvimento fora dos hosts locais exige VITE_API_URL", () => {
  assert.throws(() =>
    resolveApiConfig({ browserHostname: "192.168.1.10" }),
  );
});
