require("dotenv").config();
const express = require("express");
const http = require("http");
const db = require("./database/db");
const leadsRoutes = require("./routes/leads");
const briefingRoutes = require("./routes/briefingRoutes");
const publicBriefingRoutes = require("./routes/publicBriefingRoutes");
const serviceOpportunitiesRoutes = require("./routes/serviceOpportunities");
const { createAuthRouter } = require("./routes/authRoutes");
const { loadAuthConfig } = require("./config/authConfig");
const { loadServerConfig } = require("./config/serverConfig");
const { createAuthRateLimits } = require("./middleware/authRateLimits");
const { createCorsPolicy } = require("./middleware/corsPolicy");
const jsonParseErrorHandler = require("./middleware/jsonParseErrorHandler");
const { createAuthCryptoService } = require("./services/authCryptoService");
const { createAuthService } = require("./services/authService");
const { createAccessTokenService } = require("./services/accessTokenService");
const { createAuthSessionService } = require("./services/authSessionService");
const {
  createPasswordRecoveryService,
} = require("./services/passwordRecoveryService");
const {
  createAuthIdentityService,
} = require("./services/authIdentityService");
const {
  createRequireAuthenticatedContext,
} = require("./middleware/requireAuthenticatedContext");
const {
  createRequireOperationalAccess,
} = require("./middleware/requireOperationalAccess");
const {
  createRefreshCookieService,
} = require("./services/refreshCookieService");
const {
  createConfiguredEmailProvider,
} = require("./services/email/resendEmailProvider");
const {
  createVerificationEmailService,
} = require("./services/email/verificationEmailService");
const {
  createPasswordResetEmailService,
} = require("./services/email/passwordResetEmailService");
const { createSystemRouter } = require("./routes/systemRoutes");
const {
  createOperationalWebRouter,
} = require("./routes/operationalWebRoutes");
const {
  attachLegacySocketQuarantine,
} = require("./socket/legacySocketQuarantine");

const app = express();
const PORT = process.env.PORT || 3001;
const serverConfig = loadServerConfig(process.env);
const authConfig = loadAuthConfig(process.env);

app.set("trust proxy", serverConfig.trustProxyHops);

// --- Middlewares ---
const corsPolicy = createCorsPolicy(serverConfig.corsAllowedOrigins);
app.use(corsPolicy.enforceOrigin);
app.use(corsPolicy.middleware);
app.use(express.json());
app.use(jsonParseErrorHandler);

const emailProvider = createConfiguredEmailProvider({
  enabled: authConfig.emailProviderConfigured,
  apiKey: authConfig.resendApiKey,
  from: authConfig.emailFrom,
});
const verificationEmailService = createVerificationEmailService({
  provider: authConfig.devEmailBypassEnabled
    ? { sendEmail: async () => {} }
    : emailProvider,
});
const passwordResetEmailService = createPasswordResetEmailService({
  provider: emailProvider,
  passwordResetUrl: authConfig.passwordResetUrl,
});
const authCryptoService = createAuthCryptoService(authConfig);
const authService = createAuthService({
  db,
  cryptoService: authCryptoService,
  emailService: verificationEmailService,
  config: authConfig,
});
const accessTokenService = createAccessTokenService(authConfig);
const authSessionService = createAuthSessionService({
  db,
  cryptoService: authCryptoService,
  accessTokenService,
  config: authConfig,
});
const passwordRecoveryService = createPasswordRecoveryService({
  db,
  cryptoService: authCryptoService,
  emailService: passwordResetEmailService,
  config: authConfig,
});
const authIdentityService = createAuthIdentityService({ db });
const requireAuthenticatedContext = createRequireAuthenticatedContext({
  accessTokenService,
  identityService: authIdentityService,
});
const requireOperationalAccess = createRequireOperationalAccess();
const refreshCookieService = createRefreshCookieService(authConfig);
const authRouter = createAuthRouter({
  service: authService,
  sessionService: authSessionService,
  passwordRecoveryService,
  cookieService: refreshCookieService,
  requireAuthenticatedContext,
  config: authConfig,
  rateLimits: createAuthRateLimits(authConfig),
});

const server = http.createServer(app);
attachLegacySocketQuarantine({
  httpServer: server,
  corsOrigins: ["http://localhost:5173", process.env.FRONTEND_URL].filter(
    Boolean,
  ),
});

// --- Lógica de Ambiente ---
if (process.env.NODE_ENV === "production") {
  console.log("☁️  LeadHunt API: Modo PRODUÇÃO");
  console.log(
    "⚠️  Atenção: Motor e Scraper desativados nesta instância (Rode o local worker)",
  );
} else {
  console.log("🛠️  LeadHunt API: Modo DESENVOLVIMENTO");
  // startAutomation(); // Descomente para rodar automação junto com a API localmente
}

// --- Rotas públicas sem contexto de workspace ---
app.use("/api/public/briefings", publicBriefingRoutes);
app.use("/api/auth", authRouter);

// --- Rotas web operacionais autenticadas ---
app.use(
  "/api",
  createOperationalWebRouter({
    requireAuthenticatedContext,
    requireOperationalAccess,
    leadsRouter: leadsRoutes,
    briefingRouter: briefingRoutes,
    serviceOpportunitiesRouter: serviceOpportunitiesRoutes,
  }),
);
app.use(createSystemRouter());

// --- Inicialização ---
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
