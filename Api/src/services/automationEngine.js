const db = require("../database/db");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { createLeadEvent } = require("./eventService");

puppeteer.use(StealthPlugin());

let browser = null;
let page = null;
let isLoopRunning = false;

// Saudação por horário
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
};

// Envia um balão no WhatsApp
async function sendBubble(page, selector, text, isMultiline = false) {
  await page.waitForSelector(selector);
  await page.click(selector);

  if (isMultiline) {
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      await page.keyboard.type(lines[i]);

      if (i < lines.length - 1) {
        await page.keyboard.down("Shift");
        await new Promise((r) => setTimeout(r, 150));
        await page.keyboard.press("Enter");
        await new Promise((r) => setTimeout(r, 150));
        await page.keyboard.up("Shift");
      }
    }
  } else {
    await page.keyboard.type(text);
  }

  await new Promise((r) => setTimeout(r, 600));
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 2000));
}

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

  log("⚙️ Motor iniciado. Aguardando ativação...", "info");

  const loop = async () => {
    try {
      const settingsRes = await db.query(
        "SELECT * FROM automation_settings WHERE id = 1",
      );
      const settings = settingsRes.rows[0];

      if (!settings || !settings.is_active) {
        if (browser) {
          log("⏸️ Motor pausado.", "info");
          await browser.disconnect().catch(() => {});
          browser = null;
          page = null;
        }
        setTimeout(loop, 10000);
        return;
      }

      // Verificação de horário
      const now = new Date();
      const currentMinTotal = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = settings.start_hour.split(":").map(Number);
      let [endH, endM] = settings.end_hour.split(":").map(Number);

      if (endH === 0 && endM === 0) endH = 24;

      if (
        currentMinTotal < startH * 60 + startM ||
        currentMinTotal >= endH * 60 + endM
      ) {
        log(
          `💤 Fora do horário (${settings.start_hour} - ${settings.end_hour})`,
          "info",
        );
        setTimeout(loop, 60000);
        return;
      }

      const leadRes = await db.query(
        `
        SELECT *
        FROM leads
        WHERE is_verified = true
          AND status = 'pending'
          AND is_ai_ready = true
          AND is_archived = false
          AND COALESCE(is_invalid_number, false) = false
        ORDER BY RANDOM()
        LIMIT 1
        `,
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

      log(`🎯 Abordagem estratégica iniciada para: ${lead.name}`, "info");

      const whatsappUrl = `https://web.whatsapp.com/send?phone=${lead.phone}`;
      await page.goto(whatsappUrl, { waitUntil: "networkidle2" });

      const inputSelector = 'div[contenteditable="true"]';

      // Validação de número existente
      try {
        await page.waitForSelector(inputSelector, { timeout: 15000 });
        await new Promise((r) => setTimeout(r, 2000));

        log(
          `✅ Conexão estabelecida com ${lead.name}. Iniciando disparos...`,
          "info",
        );
      } catch (err) {
        log(
          `⚠️ Número inexistente ou inválido: ${lead.phone}. Pulando lead...`,
          "error",
        );

        await db.query(
          `
          UPDATE leads
          SET 
            is_invalid_number = true,
            status = 'lost',
            pipeline_stage = 'lost',
            lost_reason = 'invalid_number'
          WHERE id = $1
          `,
          [lead.id],
        );

        await createLeadEvent(
          lead.id,
          "invalid_number_detected",
          lead.phone,
          "automation",
          {
            lead_name: lead.name,
          },
        );

        await db.query(
          "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
          [
            lead.id,
            "Número inválido detectado na automação.",
            "invalid_number",
          ],
        );

        setTimeout(loop, 5000);
        return;
      }

      // Balão 1: saudação
      const greetingMsg = `${getGreeting()}! Tudo bem?`;
      await sendBubble(page, inputSelector, greetingMsg);
      log(`👋 Balão 1 (Saudação) enviado.`, "info");

      const waitTime1 = Math.floor(Math.random() * (15000 - 10000 + 1)) + 10000;
      log(`⏳ Aguardando ${waitTime1 / 1000}s para a proposta...`, "info");
      await new Promise((r) => setTimeout(r, waitTime1));

      // Balões 2 e 3
      if (lead.custom_message && lead.custom_message.includes("---")) {
        log(`🤖 Mensagem dividida detectada para ${lead.name}`, "info");

        const parts = lead.custom_message.split("---");

        const messagePart1 = parts[0].trim();
        await sendBubble(page, inputSelector, messagePart1, true);

        await new Promise((r) => setTimeout(r, 6000));

        const messagePart2 = parts[1].trim();
        await sendBubble(page, inputSelector, messagePart2, true);

        log(`🚀 Fluxo de 3 balões concluído.`, "success");
      } else {
        log(
          `⚠️ Mensagem sem separador ou padrão. Enviando bloco único.`,
          "info",
        );
        const msg = lead.custom_message || generateFallbackMessage(lead);
        await sendBubble(page, inputSelector, msg, true);
      }

      // Atualização do lead após envio
      await db.query(
        `
        UPDATE leads
        SET 
          status = 'contacted',
          pipeline_stage = 'contacted',
          last_contact = NOW()
        WHERE id = $1
        `,
        [lead.id],
      );

      await createLeadEvent(
        lead.id,
        "message_sent",
        lead.assigned_number || "default",
        "automation",
        {
          phone: lead.phone,
          lead_name: lead.name,
        },
      );

      await db.query(
        "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
        [
          lead.id,
          "Abordagem 1+1+1 enviada (Saudação | Mensagem | CTA)",
          "contact",
        ],
      );

      const min = parseInt(settings.min_interval_minutes, 10);
      const max = parseInt(settings.max_interval_minutes, 10);
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

function generateFallbackMessage(lead) {
  const templates = {
    website:
      "Notei que sua empresa ainda não tem um site oficial. Isso faz com que você perca muitos clientes que buscam no Google.",
    automation:
      "Vi que vocês têm um fluxo alto. Já pensou em colocar um sistema de atendimento automático no WhatsApp?",
    ads: "Analisei sua região e seus concorrentes estão investindo em anúncios. Podemos te colocar no topo hoje.",
    social:
      "Seu Instagram tem potencial, mas percebi que as postagens estão pouco frequentes. Vamos profissionalizar?",
  };

  let msg = `Sou o Guilherme, vi a *${lead.name}* aqui no Google...\n\n`;

  if (lead.market_observation) {
    msg += `*Minha análise:* ${lead.market_observation}\n\n`;
  }

  let services = lead.services_offered;
  if (typeof services === "string") {
    services = JSON.parse(services);
  }

  if (Array.isArray(services)) {
    services.forEach((s) => {
      if (templates[s]) {
        msg += `${templates[s]}\n\n`;
      }
    });
  }

  return msg;
}

module.exports = { startAutomation };
