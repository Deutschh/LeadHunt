const { startAutomation } = require("./services/automationEngine");
require("dotenv").config();

console.log("🤖 LeadHunt Worker Iniciado!");
console.log("📡 Conectando ao banco de dados na nuvem...");

// Inicia apenas o motor de busca e disparos
startAutomation().catch(err => {
  console.error("💥 Erro ao iniciar o Worker:", err);
});