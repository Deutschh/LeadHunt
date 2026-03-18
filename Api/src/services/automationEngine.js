const db = require("../database/db");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

let browser = null;
let page = null;
let isLoopRunning = false;

// FUNÇÃO AUXILIAR: Pega saudação baseada na hora atual
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
};

const log = (message, type = "info") => {
  if (global.remoteLog) {
    global.remoteLog(message, type);
  } else if (global.io) {
    const time = new Date().toLocaleTimeString();
    global.io.emit("automation-log", { time, message, type });
  }
  console.log(`[Automação] ${message}`);
};

const startAutomation = async () => {
  if (isLoopRunning) return;
  isLoopRunning = true;

  log("⚙️ Motor iniciado. Aguardando ativação via Dashboard...", "info");

  const loop = async () => {
    try {
      const settingsRes = await db.query(
        "SELECT * FROM automation_settings WHERE id = 1",
      );
      const settings = settingsRes.rows[0];

      if (!settings || !settings.is_active) {
        if (browser) {
          log("⏸️ Motor pausado. Fechando conexão...", "info");
          await browser.disconnect().catch(() => {});
          browser = null;
          page = null;
        }
        setTimeout(loop, 10000);
        return;
      }

      const now = new Date();
      const currentMinTotal = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = settings.start_hour.split(":").map(Number);
      let [endH, endM] = settings.end_hour.split(":").map(Number);
      if (endH === 0 && endM === 0) endH = 24;
      const startMinTotal = startH * 60 + startM;
      const endMinTotal = endH * 60 + endM;

      if (currentMinTotal < startMinTotal || currentMinTotal >= endMinTotal) {
        log(
          `💤 Fora do horário (${settings.start_hour} - ${settings.end_hour})`,
          "info",
        );
        setTimeout(loop, 60000);
        return;
      }

      const leadRes = await db.query(
        "SELECT * FROM leads WHERE is_verified = true AND status = 'pending' ORDER BY created_at ASC LIMIT 1",
      );

      if (leadRes.rowCount === 0) {
        log("📭 Fila vazia. Aguardando novos leads...", "info");
        setTimeout(loop, 30000);
        return;
      }

      const lead = leadRes.rows[0];

      try {
        if (!browser) {
          browser = await puppeteer.connect({
            browserURL: "http://127.0.0.1:9222",
            defaultViewport: null,
          });
          page = await browser.newPage();
        }
      } catch (err) {
        log("❌ Chrome não detectado na porta 9222.", "error");
        setTimeout(loop, 20000);
        return;
      }

      log(`🎯 Iniciando abordagem em 3 etapas para: ${lead.name}`, "info");

      // --- PASSO 1: BALÃO 1 (CUMPRIMENTO) ---
      const greetingMsg = `${getGreeting()}! Tudo bem?`;
      const whatsappUrl = `https://web.whatsapp.com/send?phone=${lead.phone}&text=${encodeURIComponent(greetingMsg)}`;

      await page.goto(whatsappUrl, { waitUntil: "networkidle2" });

      const inputSelector = 'div[contenteditable="true"]';
      await page.waitForSelector(inputSelector, { timeout: 40000 });
      await new Promise((r) => setTimeout(r, 3000));

      await page.keyboard.press("Enter");
      log(`👋 Balão 1 (Cumprimento) enviado.`, "info");

      // --- ESPERA ENTRE BALÃO 1 E 2 ---
      const waitTime1 = Math.floor(Math.random() * (15000 - 10000 + 1)) + 10000;
      log(`⏳ Aguardando ${waitTime1 / 1000}s para o Balão 2...`, "info");
      await new Promise((r) => setTimeout(r, waitTime1));

      // --- PASSO 2: BALÃO 2 (CORPO DA MENSAGEM) ---
      let rawMessage = lead.custom_message || generateFallbackMessage(lead);

      // LIMPEZA: Removemos a saudação e o fechamento (que será o balão 3)
      let bodyMessage = rawMessage
        .replace(/Olá, tudo bem\? /gi, "")
        .replace(/Bom dia! /gi, "")
        .replace(/Boa tarde! /gi, "")
        .replace(/Boa noite! /gi, "")
        .replace(
          /Podemos conversar sobre como implementar isso para você\?/gi,
          "",
        )
        .trim();

      await page.click(inputSelector);
      await page.type(inputSelector, bodyMessage, { delay: 15 });
      await new Promise((r) => setTimeout(r, 500));
      await page.keyboard.press("Enter");
      log(`✅ Balão 2 (Corpo) enviado.`, "info");

      // --- ESPERA ENTRE BALÃO 2 E 3 (Simula reflexão humana) ---
      const waitTime2 = Math.floor(Math.random() * (5000 - 3000 + 1)) + 3000;
      await new Promise((r) => setTimeout(r, waitTime2));

      // --- PASSO 3: BALÃO 3 (FECHAMENTO / CTA) ---
      const ctaMessage =
        "Podemos conversar sobre como implementar isso para você?";
      await page.type(inputSelector, ctaMessage, { delay: 30 });
      await new Promise((r) => setTimeout(r, 500));
      await page.keyboard.press("Enter");
      log(`🚀 Balão 3 (Chamada) enviado para ${lead.name}`, "success");

      // Atualiza banco de dados
      await db.query(
        "UPDATE leads SET status = 'contacted', last_contact = NOW() WHERE id = $1",
        [lead.id],
      );
      await db.query(
        "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
        [
          lead.id,
          "Sequência de 3 mensagens enviada (Cumprimento + Proposta + CTA)",
          "contact",
        ],
      );

      // Intervalo entre leads
      const min = parseInt(settings.min_interval_minutes);
      const max = parseInt(settings.max_interval_minutes);
      const waitMinutes = Math.floor(Math.random() * (max - min + 1)) + min;

      log(`⏳ Próximo lead em ${waitMinutes} minutos...`, "info");
      setTimeout(loop, waitMinutes * 60000);
    } catch (err) {
      log(`💥 Erro crítico: ${err.message}`, "error");
      setTimeout(loop, 60000);
    }
  };

  loop();
};

function generateFallbackMessage(lead) {
  const templates = {
    website: "Notei que sua empresa ainda não tem um site oficial...",
    automation: "Já pensou em colocar atendimento automático no WhatsApp?",
    ads: "Seus concorrentes estão investindo em anúncios...",
    social: "Seu Instagram tem potencial, vamos profissionalizar?",
  };

  let msg = `Vi a *${lead.name}* aqui no Google e analisei o perfil de vocês.\n\n`;
  if (lead.market_observation)
    msg += `*Minha análise:* ${lead.market_observation}\n\n`;

  let services = lead.services_offered;
  if (typeof services === "string") services = JSON.parse(services);

  if (Array.isArray(services)) {
    services.forEach((s) => {
      if (templates[s]) msg += `${templates[s]}\n\n`;
    });
  }
  // Removida a linha final daqui, pois o robô enviará separadamente no Balão 3
  return msg;
}

module.exports = { startAutomation };
