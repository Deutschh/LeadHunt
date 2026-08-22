const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { createCorsPolicy } = require("../src/middleware/corsPolicy");
const { createAuthRouter } = require("../src/routes/authRoutes");
const { AuthSessionError } = require("../src/services/authSessionService");
const {
  createRefreshCookieService,
} = require("../src/services/refreshCookieService");

const config = {
  termsVersion: "terms-v1",
  privacyPolicyVersion: "privacy-v1",
  accessTokenTtlSeconds: 600,
  refreshCookieName: "leadhunt_refresh",
  refreshCookiePath: "/api/auth",
  refreshCookieSameSite: "lax",
  refreshCookieSecure: false,
};
const noRateLimits = {
  register: [],
  verify: [],
  resend: [],
  login: [],
  refresh: [],
  logout: [],
};
const registrationService = {
  register: async () => {},
  resend: async () => {},
  verify: async () => ({ accountStatus: "pending" }),
};
const passAuthenticatedContext = (_req, _res, next) => next();

async function withServer({ sessionService, useCors = false }, operation) {
  const app = express();
  if (useCors) {
    const policy = createCorsPolicy([
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);
    app.use(policy.enforceOrigin);
    app.use(policy.middleware);
  }
  app.use(express.json());
  app.use(
    "/api/auth",
    createAuthRouter({
      service: registrationService,
      sessionService,
      cookieService: createRefreshCookieService(config),
      requireAuthenticatedContext: passAuthenticatedContext,
      config,
      rateLimits: noRateLimits,
      logger: { error: () => {} },
    }),
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await operation(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("login retorna access mínimo e cookie HttpOnly host-only com atributos aprovados", async () => {
  await withServer(
    {
      sessionService: {
        login: async () => ({
          accessToken: "access-token",
          refreshToken: "r".repeat(43),
          refreshExpiresAt: new Date(Date.now() + 60_000),
        }),
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: " USER@example.com ",
          password: "exact password",
        }),
      });
      const body = await response.json();
      const cookie = response.headers.get("set-cookie");

      assert.equal(response.status, 200);
      assert.deepEqual(body, {
        accessToken: "access-token",
        tokenType: "Bearer",
        expiresIn: 600,
      });
      assert.match(cookie, /leadhunt_refresh=/);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /Path=\/api\/auth/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.doesNotMatch(cookie, /Domain=/i);
      assert.doesNotMatch(cookie, /; Secure/i);
    },
  );
});

test("cookie de produção adiciona Secure sem definir Domain", () => {
  const service = createRefreshCookieService({
    ...config,
    refreshCookieSecure: true,
  });
  let captured = null;
  service.set(
    {
      cookie: (name, value, options) => {
        captured = { name, value, options };
      },
    },
    "r".repeat(43),
    new Date(Date.now() + 60_000),
  );

  assert.equal(captured.options.secure, true);
  assert.equal(captured.options.httpOnly, true);
  assert.equal(captured.options.sameSite, "lax");
  assert.equal(Object.hasOwn(captured.options, "domain"), false);
});

test("refresh rejeita cookie duplicado sem encaminhar token e limpa cookie", async () => {
  let called = false;
  await withServer(
    {
      sessionService: {
        refresh: async () => {
          called = true;
        },
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: {
          Cookie: "leadhunt_refresh=first; leadhunt_refresh=second",
        },
      });

      assert.equal(response.status, 401);
      assert.equal((await response.json()).code, "INVALID_SESSION");
      assert.equal(called, false);
      assert.match(
        response.headers.get("set-cookie"),
        /Expires=Thu, 01 Jan 1970 00:00:00 GMT/,
      );
    },
  );
});

test("login mantém 401 uniforme e refresh inválido limpa o cookie", async () => {
  const sessionService = {
    login: async () => {
      throw new AuthSessionError(
        401,
        "INVALID_CREDENTIALS",
        "E-mail ou senha inválidos.",
      );
    },
    refresh: async () => {
      throw new AuthSessionError(
        401,
        "INVALID_SESSION",
        "Sessão inválida ou expirada.",
        { clearRefreshCookie: true },
      );
    },
  };

  await withServer({ sessionService }, async (baseUrl) => {
    for (const email of ["missing@example.com", "unverified@example.com"]) {
      const login = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "exact password" }),
      });
      assert.equal(login.status, 401);
      assert.deepEqual(await login.json(), {
        error: "E-mail ou senha inválidos.",
        code: "INVALID_CREDENTIALS",
      });
    }

    const refresh = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `leadhunt_refresh=${"r".repeat(43)}` },
    });
    assert.equal(refresh.status, 401);
    assert.equal((await refresh.json()).code, "INVALID_SESSION");
    assert.match(
      refresh.headers.get("set-cookie"),
      /Expires=Thu, 01 Jan 1970 00:00:00 GMT/,
    );
  });
});

test("logout é 204 e preserva cookie quando há falha real", async () => {
  await withServer(
    { sessionService: { logout: async () => {} } },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
      });
      assert.equal(response.status, 204);
      assert.match(
        response.headers.get("set-cookie"),
        /Expires=Thu, 01 Jan 1970 00:00:00 GMT/,
      );
    },
  );

  await withServer(
    {
      sessionService: {
        logout: async () => {
          throw new Error("database unavailable");
        },
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Cookie: `leadhunt_refresh=${"r".repeat(43)}` },
      });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("set-cookie"), null);
    },
  );
});

test("CORS aceita allowlist/preflight, rejeita origin negada/null e aceita sem Origin", async () => {
  await withServer(
    { sessionService: { logout: async () => {} }, useCors: true },
    async (baseUrl) => {
      const allowed = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Origin: "http://localhost:5173" },
      });
      assert.equal(allowed.status, 204);
      assert.equal(
        allowed.headers.get("access-control-allow-origin"),
        "http://localhost:5173",
      );
      assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");

      const preflight = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "OPTIONS",
        headers: {
          Origin: "http://127.0.0.1:5173",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      assert.equal(preflight.status, 204);
      assert.notEqual(preflight.headers.get("access-control-allow-origin"), "*");

      for (const origin of ["https://evil.example", "null"]) {
        const denied = await fetch(`${baseUrl}/api/auth/logout`, {
          method: "POST",
          headers: { Origin: origin },
        });
        assert.equal(denied.status, 403);
        assert.equal((await denied.json()).code, "ORIGIN_NOT_ALLOWED");
      }

      const noOrigin = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
      });
      assert.equal(noOrigin.status, 204);
    },
  );
});
