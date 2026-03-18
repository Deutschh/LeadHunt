const db = require("../database/db");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

let browser = null;
let page = null;
let isLoopRunning = false;

const log = (message, type = "info") => {
  // Se o remoteLog existir (no worker), ele envia para a nuvem
  if (global.remoteLog) {
    global.remoteLog(message, type);
  } else if (global.io) {
    // Se estiver rodando na API local
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

      log(`🎯 Preparando abordagem para: ${lead.name}`, "info");

      // PEGA A MENSAGEM (Customizada ou Gera uma nova)
      const message = lead.custom_message || generateFallbackMessage(lead);
      const whatsappUrl = `https://web.whatsapp.com/send?phone=${lead.phone}&text=${encodeURIComponent(message)}`;

      await page.goto(whatsappUrl, { waitUntil: "networkidle2" });

      // Espera a caixa de texto aparecer (garante que o chat carregou)
      try {
        await page.waitForSelector('div[contenteditable="true"]', {
          timeout: 30000,
        });
        await new Promise((r) => setTimeout(r, 3000)); // Pausa humana para carregar o texto

        // APERTA ENTER (O tiro certeiro para enviar)
        await page.keyboard.press("Enter");

        log(`✅ Mensagem enviada para ${lead.name}`, "success");

        await db.query(
          "UPDATE leads SET status = 'contacted', last_contact = NOW() WHERE id = $1",
          [lead.id],
        );

        await db.query(
          "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
          [lead.id, "Mensagem automática enviada via Motor Hunter", "contact"],
        );
      } catch (err) {
        log(`❌ Erro no envio para ${lead.name}. O Zap está logado?`, "error");
      }

      const min = parseInt(settings.min_interval_minutes);
      const max = parseInt(settings.max_interval_minutes);
      const waitMinutes = Math.floor(Math.random() * (max - min + 1)) + min;

      log(`⏳ Próximo disparo em ${waitMinutes} minutos...`, "info");
      setTimeout(loop, waitMinutes * 60000);
    } catch (err) {
      log(`💥 Erro crítico: ${err.message}`, "error");
      setTimeout(loop, 60000);
    }
  };

  loop();
};

// Se não houver mensagem customizada, ele gera uma baseada nos serviços
function generateFallbackMessage(lead) {
  const templates = {
    website: "Notei que sua empresa ainda não tem um site oficial...",
    automation: "Já pensou em colocar atendimento automático no WhatsApp?",
    ads: "Seus concorrentes estão investindo em anúncios...",
    social: "Seu Instagram tem potencial, vamos profissionalizar?",
  };

  let msg = `Olá, tudo bem? Sou o Guilherme, vi a *${lead.name}* aqui no Google...\n\n`;
  if (lead.market_observation)
    msg += `*Minha análise:* ${lead.market_observation}\n\n`;

  let services = lead.services_offered;
  if (typeof services === "string") services = JSON.parse(services);

  if (Array.isArray(services)) {
    services.forEach((s) => {
      if (templates[s]) msg += `${templates[s]}\n\n`;
    });
  }
  msg += "Podemos conversar sobre como implementar isso para você?";
  return msg;
}

module.exports = { startAutomation };
