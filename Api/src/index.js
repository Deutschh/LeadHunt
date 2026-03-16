require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./database/db");
const { startScraping } = require("./services/scraper");
const leadsRoutes = require('./routes/leads');
const http = require("http");
const { Server } = require("socket.io");
const { startAutomation } = require("./services/automationEngine");

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares ---
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // URL do seu Vite
    methods: ["GET", "POST"],
  },
});

// Tornamos o 'io' global para que o scraper consiga emitir logs
global.io = io;

startAutomation(); // Inicia o gerenciador de fila

// Rotas Centralizadas (Agora acessíveis via /api/leads)
app.use('/api/leads', leadsRoutes);

// --- Rotas de Sistema ---
app.get("/", (req, res) => {
  res.json({ message: "LeadHunt API online! 🚀" });
});

app.post("/run-scraper", async (req, res) => {
  const { niche, location, limit, minRating } = req.body;
  if (!location) return res.status(400).json({ error: "Localização obrigatória." });

  // Inicia o robô sem travar a resposta da requisição
  startScraping({
    niche,
    location,
    limit: parseInt(limit) || 10,
    minRating: parseFloat(minRating) || 0,
  }).catch((err) => console.error(`[LeadHunt] Erro:`, err));

  res.json({ message: "O robô LeadHunt foi lançado com sucesso! 🚀" });
});

// Configuração do Socket
io.on("connection", (socket) => {
  console.log("⚡ Novo cliente conectado ao Terminal");
});

server.listen(PORT, () => {
  console.log(`✅ Servidor + WebSocket rodando em http://localhost:${PORT}`);
});