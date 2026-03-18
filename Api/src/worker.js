const { startAutomation } = require("./services/automationEngine");
const { io } = require("socket.io-client");
require("dotenv").config();

// Conecta à API no Render
const socket = io("https://leadhunt-api.onrender.com");

console.log("🤖 LeadHunt Worker Iniciado!");

socket.on("connect", () => {
  console.log("✅ Conectado ao Render! Aguardando comandos...");
});

// OUVE O COMANDO DE BUSCA (Vindo do celular via Render)
socket.on("command-start-scraper", (config) => {
  console.log("🔎 Recebi ordem de busca remota!", config);
  const { startScraping } = require("./services/scraper");

  // O scraper roda no SEU computador usando o SEU Chrome
  startScraping(config).catch((err) =>
    console.error("Erro no scraper remoto:", err),
  );
});

// Função global para o motor enviar logs para a nuvem
global.remoteLog = (message, type = "info") => {
  const time = new Date().toLocaleTimeString();
  socket.emit("worker-log", { time, message, type }); // Envia para o Render
  console.log(`[${type.toUpperCase()}] ${message}`); // Mostra no seu terminal
};

startAutomation().catch((err) => {
  console.error("💥 Erro ao iniciar o Worker:", err);
});
