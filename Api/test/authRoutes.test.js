const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { createAuthRateLimits } = require("../src/middleware/authRateLimits");
const jsonParseErrorHandler = require("../src/middleware/jsonParseErrorHandler");
const {
  RESEND_RESPONSE,
  createAuthRouter,
} = require("../src/routes/authRoutes");
const {
  createAuthCryptoService,
} = require("../src/services/authCryptoService");
const {
  AuthServiceError,
  createAuthService,
} = require("../src/services/authService");
const { createFakeAuthDb } = require("./helpers/fakeAuthDb");

const config = {
  termsVersion: "terms-v1",
  privacyPolicyVersion: "privacy-v1",
};
const noRateLimits = { register: [], verify: [], resend: [] };
const passAuthenticatedContext = (_req, _res, next) => next();

function validRegistration() {
  return {
    name: "Maria Silva",
    email: "maria@example.com",
    password: "senha longa segura",
    termsAccepted: true,
    termsVersion: "terms-v1",
    privacyPolicyAccepted: true,
    privacyPolicyVersion: "privacy-v1",
  };
}

async function withServer(service, rateLimits, operation) {
  const app = express();
  app.set("trust proxy", 0);
  app.use(express.json());
  app.use(jsonParseErrorHandler);
  app.use(
    "/api/auth",
    createAuthRouter({
      service,
      requireAuthenticatedContext: passAuthenticatedContext,
      config,
      rateLimits,
      logger: { error: () => {} },
    }),
  );
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    await operation(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
}

test("register preserva resposta uniforme para todos os no-ops do serviço", async () => {
  const expected = {
    message:
      "Se o cadastro puder ser iniciado ou retomado, enviaremos instruções para o e-mail informado.",
    nextStep: "verify_email",
  };

  for (const register of [async () => {}, async () => undefined]) {
    await withServer(
      { register, resend: async () => {}, verify: async () => ({}) },
      noRateLimits,
      async (baseUrl) => {
        const response = await post(
          baseUrl,
          "/api/auth/register",
          validRegistration(),
        );
        assert.equal(response.status, 202);
        assert.deepEqual(response.body, expected);
      },
    );
  }
});

test("JSON malformado recebe erro JSON seguro antes das rotas", async () => {
  await withServer(
    { register: async () => {}, resend: async () => {}, verify: async () => ({}) },
    noRateLimits,
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"email":',
      });
      const responseText = await response.text();

      assert.equal(response.status, 400);
      assert.match(response.headers.get("content-type"), /^application\/json/);
      assert.deepEqual(JSON.parse(responseText), {
        error: "JSON inválido.",
        code: "VALIDATION_ERROR",
      });
      assert.equal(responseText.includes("SyntaxError"), false);
      assert.equal(responseText.includes("<html"), false);
      assert.equal(responseText.includes('{"email":'), false);
    },
  );
});

test("middleware de JSON delega erros não relacionados ao parser", () => {
  const unrelatedError = new Error("unrelated");
  let delegatedError = null;

  jsonParseErrorHandler(
    unrelatedError,
    {},
    { status: () => assert.fail("não deveria responder") },
    (error) => {
      delegatedError = error;
    },
  );

  assert.equal(delegatedError, unrelatedError);
});

test("resend preserva resposta uniforme para conta real ou inexistente", async () => {
  const expected = {
    message:
      "Se houver um cadastro pendente, um novo código será enviado quando permitido.",
    nextStep: "verify_email",
    retryAfterSeconds: 60,
  };

  await withServer(
    {
      register: async () => {},
      resend: async () => {},
      verify: async () => ({}),
    },
    noRateLimits,
    async (baseUrl) => {
      for (const email of ["real@example.com", "missing@example.com"]) {
        const response = await post(baseUrl, "/api/auth/email/resend", {
          email,
        });
        assert.equal(response.status, 202);
        assert.deepEqual(response.body, expected);
      }
    },
  );
});

test("resend mantém 202 e invalida somente o challenge cuja entrega falhou", async () => {
  const serviceConfig = {
    otpHmacSecret: "h".repeat(32),
    devEmailBypassEnabled: false,
    devEmailBypassCode: "",
    otpExpiresInMinutes: 10,
    otpMaxAttempts: 5,
    resendCooldownSeconds: 60,
    maxChallengesPerHour: 5,
    verificationRetryWindowMinutes: 5,
  };
  const baseCrypto = createAuthCryptoService(serviceConfig);
  const codes = ["111111", "222222", "333333"];
  const cryptoService = {
    ...baseCrypto,
    generateOtp: () => codes.shift(),
    hashPassword: async (password) => `argon2:${password}`,
  };
  const db = createFakeAuthDb();
  let providerFails = false;
  const service = createAuthService({
    db,
    cryptoService,
    emailService: {
      sendVerificationEmail: async () => {
        if (providerFails) {
          throw new Error("provider detail");
        }
      },
    },
    config: serviceConfig,
    logger: { error: () => {}, warn: () => {} },
  });

  await service.register({
    name: "Maria Silva",
    email: "maria@example.com",
    password: "senha longa segura",
    termsVersion: "terms-v1",
    privacyPolicyVersion: "privacy-v1",
  });
  await service.register({
    name: "João Souza",
    email: "joao@example.com",
    password: "outra senha segura",
    termsVersion: "terms-v1",
    privacyPolicyVersion: "privacy-v1",
  });
  const unrelatedChallenge = db.state.challenges[1];
  db.state.now = new Date(db.state.now.getTime() + 61 * 1000);
  providerFails = true;

  await withServer(service, noRateLimits, async (baseUrl) => {
    const response = await post(baseUrl, "/api/auth/email/resend", {
      email: "maria@example.com",
    });
    assert.equal(response.status, 202);
    assert.deepEqual(response.body, RESEND_RESPONSE);
  });

  assert.equal(db.state.challenges.length, 3);
  assert.notEqual(db.state.challenges[0].invalidated_at, null);
  assert.equal(unrelatedChallenge.invalidated_at, null);
  assert.notEqual(db.state.challenges[2].invalidated_at, null);
  assert.equal(db.state.challenges[2].user_id, db.state.users[0].id);
});

test("verify mapeia sucesso e erro público sem IDs internos", async () => {
  let shouldFail = false;
  const service = {
    register: async () => {},
    resend: async () => {},
    verify: async () => {
      if (shouldFail) {
        throw new AuthServiceError(
          400,
          "INVALID_OR_EXPIRED_CODE",
          "Código inválido ou expirado.",
        );
      }
      return { accountStatus: "pending" };
    },
  };

  await withServer(service, noRateLimits, async (baseUrl) => {
    const success = await post(baseUrl, "/api/auth/email/verify", {
      email: "maria@example.com",
      code: "123456",
    });
    assert.deepEqual(success, {
      status: 200,
      body: { verified: true, accountStatus: "pending" },
    });

    shouldFail = true;
    const failure = await post(baseUrl, "/api/auth/email/verify", {
      email: "maria@example.com",
      code: "000000",
    });
    assert.deepEqual(failure, {
      status: 400,
      body: {
        error: "Código inválido ou expirado.",
        code: "INVALID_OR_EXPIRED_CODE",
      },
    });
  });
});

test("rate limit por e-mail normalizado retorna contrato 429", async () => {
  const service = {
    register: async () => {},
    resend: async () => {},
    verify: async () => ({ accountStatus: "pending" }),
  };

  await withServer(service, createAuthRateLimits(), async (baseUrl) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await post(
        baseUrl,
        "/api/auth/register",
        validRegistration(),
      );
      assert.equal(response.status, 202);
    }

    const limited = await post(baseUrl, "/api/auth/register", {
      ...validRegistration(),
      email: " MARIA@EXAMPLE.COM ",
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.code, "RATE_LIMITED");
  });
});
