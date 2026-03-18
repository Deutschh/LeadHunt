require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./database/db");
const { startScraping } = require("./services/scraper");
const leadsRoutes = require("./routes/leads");
const http = require("http");
const { Server } = require("socket.io");
const { startAutomation } = require("./services/automationEngine");

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares ---
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// Configuração do Socket.io dinâmica (Local + URL do Deploy)
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", process.env.FRONTEND_URL].filter(Boolean),
    methods: ["GET", "POST"],
  },
});

// Tornamos o 'io' global para que os serviços consigam emitir logs para o Front
global.io = io;

// --- Lógica de Ambiente (ÚNICO BLOCO) ---
if (process.env.NODE_ENV === "production") {
  console.log("☁️  LeadHunt API: Modo PRODUÇÃO");
  console.log(
    "⚠️  Atenção: Motor e Scraper desativados nesta instância (Rode o local worker)",
  );
} else {
  console.log("🛠️  LeadHunt API: Modo DESENVOLVIMENTO");
  // Descomente a linha abaixo se quiser que o motor ligue junto com a API no seu PC
  // startAutomation();
}

// --- Rotas ---
app.use("/api/leads", leadsRoutes);

app.get("/", (req, res) => {
  res.json({ message: "LeadHunt API online! 🚀", mode: process.env.NODE_ENV });
});

// Rota do Scraper (Lembrando que na nuvem ela falhará sem o Worker local)
app.post("/run-scraper", async (req, res) => {
  const { niche, location, limit, minRating } = req.body;
  
  if (!location) return res.status(400).json({ error: "Localização obrigatória." });

  // Em vez de rodar aqui no servidor (onde não tem Chrome), 
  // enviamos um "grito" via Socket que o seu PC vai ouvir.
  io.emit("command-start-scraper", { niche, location, limit, minRating });

  res.json({ message: "Comando de busca enviado para o Worker local! 🔎" });
});

// Configuração do Socket
io.on("connection", (socket) => {
  console.log("⚡ Novo dispositivo conectado ao Centro de Comando");

  // O Worker (seu PC) envia um log -> A API repassa para o Celular
  socket.on("worker-log", (data) => {
    io.emit("automation-log", data); 
  });
});

server.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
});
