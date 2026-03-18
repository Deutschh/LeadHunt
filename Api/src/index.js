require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const db = require("./database/db");
const leadsRoutes = require("./routes/leads");

// Nota: startScraping e startAutomation não são chamados aqui no modo Produção
// mas mantemos o import se necessário para o modo Desenvolvimento local.
const { startScraping } = require("./services/scraper");
const { startAutomation } = require("./services/automationEngine");

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares ---
app.use(cors());
app.use(express.json());

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

// --- Rotas API ---
app.use("/api/leads", leadsRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "LeadHunt API online! 🚀",
    mode: process.env.NODE_ENV,
    worker_online: workerSocketId !== null,
  });
});

// --- Rota de Comando: Iniciar Scraper Remotamente ---
app.post("/run-scraper", async (req, res) => {
  const { niche, location, limit, minRating } = req.body;

  if (!location) {
    return res
      .status(400)
      .json({ error: "Localização é obrigatória para a busca." });
  }

  // Envia a ordem de busca via Socket. O seu PC (Worker) vai ouvir e abrir o Chrome.
  io.emit("command-start-scraper", {
    niche,
    location,
    limit: parseInt(limit) || 10,
    minRating: parseFloat(minRating) || 0,
  });

  console.log(
    `🔎 Ordem de busca enviada para o Worker: ${niche} em ${location}`,
  );
  res.json({ message: "Comando enviado com sucesso ao Worker local! 🔎" });
});

// --- Inicialização ---
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
