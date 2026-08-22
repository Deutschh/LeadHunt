const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const { createAuthRateLimits } = require("../src/middleware/authRateLimits");
const jsonParseErrorHandler = require("../src/middleware/jsonParseErrorHandler");
const {
  FORGOT_PASSWORD_RESPONSE,
  RESEND_RESPONSE,
  RESET_PASSWORD_RESPONSE,
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
const {
  PasswordRecoveryError,
  PasswordRecoveryUnavailableError,
  createPasswordRecoveryService,
} = require("../src/services/passwordRecoveryService");
const {
  createConfiguredEmailProvider,
} = require("../src/services/email/resendEmailProvider");
const {
  createPasswordResetEmailService,
} = require("../src/services/email/passwordResetEmailService");

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

async function withServer(
  service,
  rateLimits,
  operation,
  passwordRecoveryService = { forgot: async () => {}, reset: async () => {} },
) {
  const app = express();
  app.set("trust proxy", 0);
  app.use(express.json());
  app.use(jsonParseErrorHandler);
  app.use(
    "/api/auth",
    createAuthRouter({
      service,
      passwordRecoveryService,
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

test("forgot mantém 202 uniforme para todos os estados públicos", async () => {
  const now = new Date("2026-08-18T12:00:00.000Z");
  const scenarios = [
    { name: "eligible", verified: true, present: true, providerFails: false },
    { name: "missing", verified: false, present: false, providerFails: false },
    { name: "unverified", verified: false, present: true, providerFails: false },
    { name: "provider-failure", verified: true, present: true, providerFails: true },
  ];
  const responses = [];

  for (const scenario of scenarios) {
    const db = createFakeAuthDb({
      now,
      users: scenario.present
        ? [
            {
              id: 7,
              name: "Maria Silva",
              email: "user@example.com",
              password_hash: "hash",
              email_verified_at: scenario.verified ? now : null,
              auth_version: 0,
            },
          ]
        : [],
    });
    const cryptoService = createAuthCryptoService({
      otpHmacSecret: "h".repeat(32),
      devEmailBypassEnabled: false,
      devEmailBypassCode: "",
    });
    const sent = [];
    const provider = {
      sendEmail: async (message) => {
        sent.push(message);
        if (scenario.providerFails) {
          throw new Error("controlled provider failure");
        }
      },
    };
    const passwordRecoveryService = createPasswordRecoveryService({
      db,
      cryptoService,
      emailService: createPasswordResetEmailService({
        provider,
        passwordResetUrl: "https://app.example.com/reset-password",
      }),
      config: { passwordResetTtlMinutes: 30 },
      logger: { error: () => {} },
    });

    await withServer(
      { register: async () => {}, resend: async () => {}, verify: async () => ({}) },
      noRateLimits,
      async (baseUrl) => {
        const response = await post(baseUrl, "/api/auth/password/forgot", {
          email: " USER@example.com ",
        });
        responses.push(response);
      },
      passwordRecoveryService,
    );

    const openTokens = db.state.passwordResetTokens.filter(
      (token) => token.consumed_at === null && token.invalidated_at === null,
    );
    assert.equal(openTokens.length, scenario.name === "eligible" ? 1 : 0);
    assert.equal(sent.length, scenario.present && scenario.verified ? 1 : 0);
  }

  for (const response of responses) {
    assert.deepEqual(response, {
      status: 202,
      body: FORGOT_PASSWORD_RESPONSE,
    });
  }
});

test("rate limits HTTP bloqueiam forgot e reset antes do serviço", async () => {
  const service = {
    register: async () => {},
    resend: async () => {},
    verify: async () => ({ accountStatus: "pending" }),
  };
  const calls = { forgot: 0, resetArgonBoundary: 0 };
  const passwordRecoveryService = {
    forgot: async () => {
      calls.forgot += 1;
    },
    reset: async () => {
      calls.resetArgonBoundary += 1;
    },
  };

  await withServer(
    service,
    createAuthRateLimits(),
    async (baseUrl) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const forgot = await post(baseUrl, "/api/auth/password/forgot", {
          email: "limited@example.com",
        });
        assert.equal(forgot.status, 202);

        const reset = await post(baseUrl, "/api/auth/password/reset", {
          token: "a".repeat(43),
          password: "nova senha longa segura",
        });
        assert.equal(reset.status, 200);
      }

      const limitedForgot = await post(baseUrl, "/api/auth/password/forgot", {
        email: " LIMITED@EXAMPLE.COM ",
      });
      const limitedReset = await post(baseUrl, "/api/auth/password/reset", {
        token: "a".repeat(43),
        password: "outra senha longa segura",
      });

      assert.equal(limitedForgot.status, 429);
      assert.equal(limitedForgot.body.code, "RATE_LIMITED");
      assert.equal(limitedReset.status, 429);
      assert.equal(limitedReset.body.code, "RATE_LIMITED");
      assert.deepEqual(calls, { forgot: 5, resetArgonBoundary: 5 });
    },
    passwordRecoveryService,
  );
});

test("forgot sem provider mantém 202 e não deixa reset token aberto", async () => {
  const now = new Date("2026-08-18T12:00:00.000Z");
  const db = createFakeAuthDb({
    now,
    users: [
      {
        id: 7,
        name: "Maria Silva",
        email: "maria@example.com",
        password_hash: "hash",
        email_verified_at: now,
        auth_version: 0,
      },
    ],
  });
  const cryptoService = createAuthCryptoService({
    otpHmacSecret: "h".repeat(32),
    devEmailBypassEnabled: true,
    devEmailBypassCode: "123456",
  });
  const unavailableProvider = createConfiguredEmailProvider({ enabled: false });
  const passwordRecoveryService = createPasswordRecoveryService({
    db,
    cryptoService,
    emailService: createPasswordResetEmailService({
      provider: unavailableProvider,
      passwordResetUrl: null,
    }),
    config: { passwordResetTtlMinutes: 30 },
    logger: { error: () => {} },
  });

  await withServer(
    { register: async () => {}, resend: async () => {}, verify: async () => ({}) },
    noRateLimits,
    async (baseUrl) => {
      const response = await post(baseUrl, "/api/auth/password/forgot", {
        email: "maria@example.com",
      });

      assert.deepEqual(response, {
        status: 202,
        body: FORGOT_PASSWORD_RESPONSE,
      });
    },
    passwordRecoveryService,
  );

  assert.equal(db.state.passwordResetTokens.length, 1);
  assert.notEqual(db.state.passwordResetTokens[0].invalidated_at, null);
  assert.equal(
    db.state.passwordResetTokens.filter(
      (token) => token.consumed_at === null && token.invalidated_at === null,
    ).length,
    0,
  );
});

test("reset retorna sucesso sem sessão e erro de token uniforme", async () => {
  let shouldFail = false;
  await withServer(
    { register: async () => {}, resend: async () => {}, verify: async () => ({}) },
    noRateLimits,
    async (baseUrl) => {
      const success = await post(baseUrl, "/api/auth/password/reset", {
        token: "a".repeat(43),
        password: "nova senha longa segura",
      });
      assert.deepEqual(success, { status: 200, body: RESET_PASSWORD_RESPONSE });

      shouldFail = true;
      const failure = await post(baseUrl, "/api/auth/password/reset", {
        token: "a".repeat(43),
        password: "outra senha longa segura",
      });
      assert.deepEqual(failure, {
        status: 400,
        body: {
          error: "Token de recuperação inválido ou expirado.",
          code: "INVALID_RESET_TOKEN",
        },
      });
      assert.equal(success.body.accessToken, undefined);
    },
    {
      forgot: async () => {},
      reset: async () => {
        if (shouldFail) {
          throw new PasswordRecoveryError(
            400,
            "INVALID_RESET_TOKEN",
            "Token de recuperação inválido ou expirado.",
          );
        }
      },
    },
  );
});

test("recovery separa indisponibilidade transitória de erro interno", async () => {
  const cases = [
    {
      error: new PasswordRecoveryUnavailableError(),
      status: 503,
      code: "AUTH_TEMPORARILY_UNAVAILABLE",
    },
    { error: new TypeError("programming detail"), status: 500, code: "INTERNAL_ERROR" },
  ];

  for (const item of cases) {
    await withServer(
      { register: async () => {}, resend: async () => {}, verify: async () => ({}) },
      noRateLimits,
      async (baseUrl) => {
        const response = await post(baseUrl, "/api/auth/password/forgot", {
          email: "user@example.com",
        });
        assert.equal(response.status, item.status);
        assert.equal(response.body.code, item.code);
        assert.equal(JSON.stringify(response.body).includes("programming detail"), false);
      },
      { forgot: async () => Promise.reject(item.error), reset: async () => {} },
    );
  }
});
