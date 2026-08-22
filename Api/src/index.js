require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const db = require("./database/db");
const leadsRoutes = require("./routes/leads");
const previewRoutes = require("./routes/previewRoutes");
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
  createRefreshCookieService,
} = require("./services/refreshCookieService");
const {
  createResendEmailProvider,
} = require("./services/email/resendEmailProvider");
const {
  createVerificationEmailService,
} = require("./services/email/verificationEmailService");
const legacyWorkspaceContext = require("./middleware/legacyWorkspaceContext");

// Nota: startScraping e startAutomation não são chamados aqui no modo Produção
// mas mantemos o import se necessário para o modo Desenvolvimento local.
const { startScraping } = require("./services/scraper");
const { startAutomation } = require("./services/automationEngine");

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

const emailProvider = authConfig.devEmailBypassEnabled
  ? { sendEmail: async () => {} }
  : createResendEmailProvider({
      apiKey: authConfig.resendApiKey,
      from: authConfig.emailFrom,
    });
const verificationEmailService = createVerificationEmailService({
  provider: emailProvider,
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
const refreshCookieService = createRefreshCookieService(authConfig);
const authRouter = createAuthRouter({
  service: authService,
  sessionService: authSessionService,
  cookieService: refreshCookieService,
  config: authConfig,
  rateLimits: createAuthRateLimits(authConfig),
});

const server = http.createServer(app);

// --- Configuração do Socket.io ---
const io = new Server(server, {
  cors: {
    // Permite conexões do seu localhost e do seu link da Vercel
    origin: ["http://localhost:5173", process.env.FRONTEND_URL].filter(Boolean),
    methods: ["GET", "POST"],
  },
});

// Tornamos o 'io' global para que outros arquivos (se necessário) acessem
global.io = io;

let workerSocketId = null; // Rastreia o ID do seu computador (Worker)

// --- Gestão de Conexões Real-time ---
io.on("connection", (socket) => {
  console.log("⚡ Novo dispositivo conectado ao Centro de Comando");

  // 1. Envia o status atual do motor assim que alguém conecta (Celular/Site)
  socket.emit("worker-status-update", workerSocketId !== null);

  // 2. O seu PC (Worker) avisa que chegou
  socket.on("worker-identify", () => {
    workerSocketId = socket.id;
    io.emit("worker-status-update", true);
    console.log("🤖 Motor Hunter identificado e ONLINE");
  });

  // 3. Quando o Worker fofoca um log, a API repassa para o Celular/Site
  socket.on("worker-log", (data) => {
    io.emit("automation-log", data);
  });

  socket.on("scraper-log", (data) => {
    io.emit("scraper-log", data); // Repassa para o Frontend
  });

  // 4. Se o dispositivo desconectar, checamos se era o Worker
  socket.on("disconnect", () => {
    if (socket.id === workerSocketId) {
      workerSocketId = null;
      io.emit("worker-status-update", false);
      console.log("❌ Motor Hunter ficou OFFLINE");
    }
  });
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

// --- Contexto temporário de Workspace ---
// Enquanto a autenticação ainda não existe, todas as rotas /api recebem
// workspace_id exclusivamente do servidor (LEGACY_WORKSPACE_ID, padrão 1).
// O frontend NÃO escolhe o workspace.
app.use("/api", legacyWorkspaceContext);

// --- Rotas API ---
app.use("/api/leads", leadsRoutes);
app.use("/api/previews", previewRoutes);
app.use("/api/briefings", briefingRoutes);
app.use("/api/service-opportunities", serviceOpportunitiesRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "LeadHunt API online! 🚀",
    mode: process.env.NODE_ENV,
    worker_online: workerSocketId !== null,
  });
});

// --- Rota de Comando: Iniciar Scraper Remotamente ---
app.post("/run-scraper", async (req, res) => {
  const { niche, location, limit, minRating, minReviews, websiteFilter } =
    req.body;

  if (!niche || typeof niche !== "string") {
    return res.status(400).json({
      error: "O nicho é obrigatório para a busca.",
    });
  }

  if (!location || typeof location !== "string") {
    return res.status(400).json({
      error: "Localização é obrigatória para a busca.",
    });
  }

  const allowedWebsiteFilters = ["any", "with", "without"];

  const normalizedWebsiteFilter = websiteFilter || "any";

  if (!allowedWebsiteFilters.includes(normalizedWebsiteFilter)) {
    return res.status(400).json({
      error: 'Filtro de site inválido. Use "any", "with" ou "without".',
    });
  }

  const normalizedLimit = Math.max(1, parseInt(limit, 10) || 10);

  const normalizedMinRating = Math.max(0, parseFloat(minRating) || 0);

  const normalizedMinReviews = Math.max(0, parseInt(minReviews, 10) || 0);

  const scraperConfig = {
    niche: niche.trim(),
    location: location.trim(),
    limit: normalizedLimit,
    minRating: normalizedMinRating,
    minReviews: normalizedMinReviews,
    websiteFilter: normalizedWebsiteFilter,
  };

  io.emit("command-start-scraper", scraperConfig);

  console.log("🔎 Ordem de busca enviada para o Worker:", scraperConfig);

  return res.json({
    success: true,
    message: "Comando enviado com sucesso ao Worker local! 🔎",
    config: scraperConfig,
  });
});

// --- Inicialização ---
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
