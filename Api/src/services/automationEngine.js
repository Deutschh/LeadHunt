const db = require("../database/db");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

let browser = null;
let page = null;
let isLoopRunning = false;

// FUNÇÃO AUXILIAR: Saudação
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
};

/**
 * FUNÇÃO MESTRE: Envia balões separados e unifica parágrafos
 * @param {boolean} isMultiline - Se true, usa Shift+Enter com delays para não disparar o balão
 */
async function sendBubble(page, selector, text, isMultiline = false) {
  await page.waitForSelector(selector);
  await page.click(selector);

  if (isMultiline) {
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      // Digita a linha atual (sem delay entre letras para não demorar demais)
      await page.keyboard.type(lines[i]);

      // Se não for a última linha, faz a manobra do Shift+Enter
      if (i < lines.length - 1) {
        await page.keyboard.down("Shift"); // 1. Aperta Shift
        await new Promise((r) => setTimeout(r, 150)); // 2. DELAY para o navegador registrar o Shift
        await page.keyboard.press("Enter"); // 3. Aperta Enter
        await new Promise((r) => setTimeout(r, 150)); // 4. DELAY para o Enter ser processado
        await page.keyboard.up("Shift"); // 5. Solta o Shift
      }
    }
  } else {
    await page.keyboard.type(text);
  }

  // Finaliza enviando o balão completo
  await new Promise((r) => setTimeout(r, 600));
  await page.keyboard.press("Enter");

  // ESPERA CRÍTICA: Aguarda o balão subir antes de o robô começar a próxima tarefa
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

      // Verificação de Horário
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

      log(`🎯 Abordagem estratégica iniciada para: ${lead.name}`, "info");

      const whatsappUrl = `https://web.whatsapp.com/send?phone=${lead.phone}`;
      await page.goto(whatsappUrl, { waitUntil: "networkidle2" });

      const inputSelector = 'div[contenteditable="true"]';
      await page.waitForSelector(inputSelector, { timeout: 45000 });
      await new Promise((r) => setTimeout(r, 4000));

      // --- PASSO 1: BALÃO 1 (SAUDAÇÃO) ---
      const greetingMsg = `${getGreeting()}! Tudo bem?`;
      await sendBubble(page, inputSelector, greetingMsg);
      log(`👋 Balão 1 (Saudação) enviado.`, "info");

      // --- ESPERA ENTRE BALÃO 1 E 2 (Curiosidade) ---
      const waitTime1 = Math.floor(Math.random() * (15000 - 10000 + 1)) + 10000;
      log(`⏳ Aguardando ${waitTime1 / 1000}s para a proposta...`, "info");
      await new Promise((r) => setTimeout(r, waitTime1));

      // --- PASSO 2: BALÃO 2 (PROPOSTA UNIFICADA) ---
      let rawMessage = lead.custom_message || generateFallbackMessage(lead);
      let bodyMessage = rawMessage
        .replace(/^(Olá|Tudo bem|Bom dia|Boa tarde|Boa noite)[^]*?\?\s*/gi, "")
        .replace(
          /Podemos conversar sobre como implementar isso para você\?/gi,
          "",
        )
        .trim();

      // USA A FUNÇÃO COM DELAYS NO SHIFT+ENTER
      await sendBubble(page, inputSelector, bodyMessage, true);
      log(`✅ Balão 2 (Corpo Unificado) enviado.`, "info");

      // --- ESPERA ENTRE BALÃO 2 E 3 ---
      await new Promise((r) => setTimeout(r, 5000));

      // --- PASSO 3: BALÃO 3 (FECHAMENTO / CTA) ---
      const ctaMessage =
        "Podemos conversar sobre como implementar isso para você?";
      await sendBubble(page, inputSelector, ctaMessage);
      log(`🚀 Balão 3 (CTA) enviado com sucesso!`, "success");

      // Banco de Dados
      await db.query(
        "UPDATE leads SET status = 'contacted', last_contact = NOW() WHERE id = $1",
        [lead.id],
      );
      await db.query(
        "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
        [
          lead.id,
          "Abordagem 1+1+1 (Saudação | Proposta Unificada | CTA)",
          "contact",
        ],
      );

      // Intervalo entre leads
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
  if (lead.market_observation)
    msg += `*Minha análise:* ${lead.market_observation}\n\n`;
  let services = lead.services_offered;
  if (typeof services === "string") services = JSON.parse(services);
  if (Array.isArray(services)) {
    services.forEach((s) => {
      if (templates[s]) msg += `${templates[s]}\n\n`;
    });
  }
  return msg;
}

module.exports = { startAutomation };
