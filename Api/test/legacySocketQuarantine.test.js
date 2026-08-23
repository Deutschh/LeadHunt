const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const express = require("express");
const { io: createSocketClient } = require("socket.io-client");

const { createSystemRouter } = require("../src/routes/systemRoutes");
const {
  QUARANTINE_UNAVAILABLE_EVENT,
  attachLegacySocketQuarantine,
} = require("../src/socket/legacySocketQuarantine");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function closeHttpServer(server) {
  if (!server.listening) return Promise.resolve();

  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function connectClient(origin) {
  const socket = createSocketClient(origin, {
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error("socket connection timeout"));
    }, 2000);

    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForQuietPeriod(milliseconds = 80) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requestJson(origin, pathname, { method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      new URL(pathname, origin),
      { method },
      (response) => {
        let rawBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          rawBody += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode,
            body: JSON.parse(rawBody),
          });
        });
      },
    );

    request.once("error", reject);
    request.end();
  });
}

async function createRuntime() {
  const app = express();
  app.use(createSystemRouter());
  const server = http.createServer(app);
  const quarantine = attachLegacySocketQuarantine({
    httpServer: server,
    corsOrigins: ["http://localhost:5173"],
  });
  const address = await listen(server);

  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
    quarantine,
  };
}

test("socket arbitrário não identifica Worker nem injeta ou recebe eventos legados", async (t) => {
  const runtime = await createRuntime();
  const attacker = await connectClient(runtime.origin);
  const observer = await connectClient(runtime.origin);
  const receivedEvents = [];
  const forbiddenEvents = [
    "worker-status-update",
    "automation-log",
    "scraper-log",
    "command-start-scraper",
  ];

  for (const eventName of forbiddenEvents) {
    observer.on(eventName, (payload) => {
      receivedEvents.push({ eventName, payload });
    });
  }

  t.after(async () => {
    attacker.disconnect();
    observer.disconnect();
    await runtime.quarantine.close();
    await closeHttpServer(runtime.server);
  });

  attacker.emit("worker-identify");
  attacker.emit("worker-log", {
    time: "10:00",
    message: "lead e telefone sensíveis",
    type: "info",
  });
  attacker.emit("scraper-log", {
    message: "empresa, nicho e localização sensíveis",
    type: "info",
  });
  await waitForQuietPeriod();

  attacker.disconnect();
  await waitForQuietPeriod();

  assert.deepEqual(receivedEvents, []);
});

test("health é genérico e run-scraper permanece em quarentena sem broadcast", async (t) => {
  const runtime = await createRuntime();
  const observer = await connectClient(runtime.origin);
  const commands = [];
  observer.on("command-start-scraper", (payload) => commands.push(payload));

  t.after(async () => {
    observer.disconnect();
    await runtime.quarantine.close();
    await closeHttpServer(runtime.server);
  });

  const health = await requestJson(runtime.origin, "/");
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { status: "ok" });
  assert.equal("worker_online" in health.body, false);
  assert.equal("mode" in health.body, false);

  const scraper = await requestJson(runtime.origin, "/run-scraper", {
    method: "POST",
  });
  assert.equal(scraper.status, 404);
  assert.deepEqual(scraper.body, {
    error: "Recurso não encontrado.",
    code: "NOT_FOUND",
  });

  await waitForQuietPeriod();
  assert.deepEqual(commands, []);
});

test("falha do transporte vazio mantém HTTP seguro e não cria fallback", async (t) => {
  const app = express();
  app.use(createSystemRouter());
  const server = http.createServer(app);
  const loggedEvents = [];
  const quarantine = attachLegacySocketQuarantine({
    httpServer: server,
    createSocketServer() {
      throw new Error("synthetic failure");
    },
    logger: {
      error(eventName) {
        loggedEvents.push(eventName);
      },
    },
  });
  const address = await listen(server);
  const origin = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await quarantine.close();
    await closeHttpServer(server);
  });

  assert.equal(quarantine.enabled, false);
  assert.deepEqual(loggedEvents, [QUARANTINE_UNAVAILABLE_EVENT]);
  assert.deepEqual(await requestJson(origin, "/"), {
    status: 200,
    body: { status: "ok" },
  });
});

test("runtime web não contém fallback de eventos Socket sensíveis", () => {
  const projectRoot = path.resolve(__dirname, "..");
  const runtimeFiles = [
    "src/index.js",
    "src/socket/legacySocketQuarantine.js",
    "src/services/automationEngine.js",
  ];
  const forbiddenPatterns = [
    /global\.io/,
    /worker-identify/,
    /worker-status-update/,
    /worker-log/,
    /automation-log/,
    /scraper-log/,
    /command-start-scraper/,
    /\.emit\(/,
    /\.on\(/,
  ];

  for (const relativePath of runtimeFiles) {
    const source = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${relativePath}: ${pattern}`);
    }
  }
});
