const db = require("../database/db");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { createLeadEvent } = require("./eventService");
const {
  getFollowupMessage,
  getEligibleFollowupLead,
  scheduleNextFollowup,
} = require("./followupService");
const {
  getAvailableSendingNumber,
  assignNumberToLead,
  incrementNumberUsage,
  getLeadAssignedNumber,
  getSendingNumberByPhone,
} = require("./numberRoutingService");

puppeteer.use(StealthPlugin());

let browser = null;
let page = null;
let isLoopRunning = false;

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
};

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

async function getNextPendingLead() {
  const leadRes = await db.query(`
    SELECT *
    FROM leads
    WHERE is_verified = true
      AND status = 'pending'
      AND is_ai_ready = true
      AND is_archived = false
      AND COALESCE(is_invalid_number, false) = false
    ORDER BY RANDOM()
    LIMIT 1
  `);

  return leadRes.rows[0] || null;
}

async function ensureBrowserPage() {
  try {
    if (!browser) {
      browser = await puppeteer.connect({
        browserURL: "http://127.0.0.1:9222",
        defaultViewport: null,
      });
      page = await browser.newPage();
    }
    return page;
  } catch (err) {
    throw new Error("Chrome não detectado na porta 9222.");
  }
}

async function validateWhatsAppNumber(currentPage, lead) {
  const inputSelector = 'div[contenteditable="true"]';
  const whatsappUrl = `https://web.whatsapp.com/send?phone=${lead.phone}`;

  await currentPage.goto(whatsappUrl, { waitUntil: "networkidle2" });

  try {
    await currentPage.waitForSelector(inputSelector, { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 2000));
    return { valid: true, inputSelector };
  } catch (err) {
    return { valid: false, inputSelector: null };
  }
}

async function markInvalidNumber(lead) {
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
      assigned_number: lead.assigned_number || null,
    },
  );

  await db.query(
    "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
    [lead.id, "Número inválido detectado na automação.", "invalid_number"],
  );
}

async function resolveSendingNumberForInitialLead(lead) {
  if (lead.assigned_number) {
    const existingNumber = await getSendingNumberByPhone(lead.assigned_number);
    if (
      existingNumber &&
      existingNumber.is_active &&
      existingNumber.status === "active"
    ) {
      return existingNumber;
    }
  }

  const availableNumber = await getAvailableSendingNumber();

  if (!availableNumber) {
    return null;
  }

  await assignNumberToLead(lead.id, availableNumber);
  lead.assigned_number = availableNumber.phone_number;

  return availableNumber;
}

async function resolveSendingNumberForFollowup(lead) {
  const assignedPhone = await getLeadAssignedNumber(lead.id);

  if (!assignedPhone) {
    return null;
  }

  const sendingNumber = await getSendingNumberByPhone(assignedPhone);

  if (
    !sendingNumber ||
    !sendingNumber.is_active ||
    sendingNumber.status !== "active"
  ) {
    return null;
  }

  return sendingNumber;
}

async function handleInitialApproach(
  currentPage,
  lead,
  inputSelector,
  sendingNumber,
) {
  log(
    `🎯 Abordagem estratégica iniciada para: ${lead.name} | Chip: ${sendingNumber.label} (${sendingNumber.phone_number})`,
    "info",
  );

  const greetingMsg = `${getGreeting()}! Tudo bem?`;
  await sendBubble(currentPage, inputSelector, greetingMsg);
  log(`👋 Balão 1 (Saudação) enviado.`, "info");

  const waitTime1 = Math.floor(Math.random() * (15000 - 10000 + 1)) + 10000;
  log(`⏳ Aguardando ${waitTime1 / 1000}s para a proposta...`, "info");
  await new Promise((r) => setTimeout(r, waitTime1));

  if (lead.custom_message && lead.custom_message.includes("---")) {
    log(`🤖 Mensagem dividida detectada para ${lead.name}`, "info");

    const parts = lead.custom_message.split("---");

    const messagePart1 = parts[0].trim();
    await sendBubble(currentPage, inputSelector, messagePart1, true);

    await new Promise((r) => setTimeout(r, 6000));

    const messagePart2 = parts[1].trim();
    await sendBubble(currentPage, inputSelector, messagePart2, true);

    log(`🚀 Fluxo de 3 balões concluído.`, "success");
  } else {
    log(`⚠️ Mensagem sem separador ou padrão. Enviando bloco único.`, "info");
    const msg = lead.custom_message || generateFallbackMessage(lead);
    await sendBubble(currentPage, inputSelector, msg, true);
  }

  await db.query(
    `
    UPDATE leads
    SET 
      status = 'contacted',
      pipeline_stage = 'contacted',
      last_contact = NOW(),
      next_followup_at = NOW() + INTERVAL '24 hours',
      assigned_number = $2
    WHERE id = $1
    `,
    [lead.id, sendingNumber.phone_number],
  );

  await incrementNumberUsage(sendingNumber.phone_number);

  await createLeadEvent(
    lead.id,
    "message_sent",
    sendingNumber.phone_number,
    "automation",
    {
      phone: lead.phone,
      lead_name: lead.name,
      message_type: "initial",
      sending_number_label: sendingNumber.label,
      sending_number_profile: sendingNumber.whatsapp_profile_name || null,
    },
  );

  await db.query(
    "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
    [
      lead.id,
      `Abordagem inicial enviada pelo número ${sendingNumber.label}.`,
      "contact",
    ],
  );
}

async function handleFollowup(currentPage, lead, inputSelector, sendingNumber) {
  const currentFollowupCount = Number(lead.followup_count || 0);
  const message = getFollowupMessage(lead, currentFollowupCount);

  log(
    `🔁 Iniciando follow-up ${currentFollowupCount + 1} para: ${lead.name} | Chip: ${sendingNumber.label} (${sendingNumber.phone_number})`,
    "info",
  );

  await sendBubble(currentPage, inputSelector, message, true);

  const newFollowupCount = currentFollowupCount + 1;

  await db.query(
    `
    UPDATE leads
    SET
      followup_count = $2,
      last_followup_at = NOW(),
      last_contact = NOW(),
      assigned_number = $3
    WHERE id = $1
    `,
    [lead.id, newFollowupCount, sendingNumber.phone_number],
  );

  await scheduleNextFollowup(lead.id, newFollowupCount);
  await incrementNumberUsage(sendingNumber.phone_number);

  await createLeadEvent(
    lead.id,
    "followup_sent",
    String(newFollowupCount),
    "automation",
    {
      phone: lead.phone,
      lead_name: lead.name,
      followup_count: newFollowupCount,
      sending_number: sendingNumber.phone_number,
      sending_number_label: sendingNumber.label,
      sending_number_profile: sendingNumber.whatsapp_profile_name || null,
    },
  );

  await db.query(
    "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
    [
      lead.id,
      `Follow-up ${newFollowupCount} enviado automaticamente pelo número ${sendingNumber.label}.`,
      "followup",
    ],
  );

  log(`✅ Follow-up ${newFollowupCount} enviado para ${lead.name}`, "success");
}

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

      // Alternância inteligente: 70% lead novo, 30% follow-up
      let lead = null;
      let mode = null;
      let sendingNumber = null;

      const shouldPickNew = Math.random() < 0.7;

      if (shouldPickNew) {
        lead = await getNextPendingLead();
        mode = lead ? "initial" : null;

        if (!lead) {
          lead = await getEligibleFollowupLead();
          mode = lead ? "followup" : null;
        }
      } else {
        lead = await getEligibleFollowupLead();
        mode = lead ? "followup" : null;

        if (!lead) {
          lead = await getNextPendingLead();
          mode = lead ? "initial" : null;
        }
      }

      if (!lead || !mode) {
        log("📭 Fila vazia (nem novos nem follow-ups disponíveis)...", "info");
        setTimeout(loop, 30000);
        return;
      }

      if (mode === "initial") {
        sendingNumber = await resolveSendingNumberForInitialLead(lead);

        if (!sendingNumber) {
          log(
            "⚠️ Nenhum número disponível para novos envios no momento.",
            "warning",
          );
          setTimeout(loop, 30000);
          return;
        }
      } else {
        sendingNumber = await resolveSendingNumberForFollowup(lead);

        if (!sendingNumber) {
          log(
            `⚠️ Lead ${lead.name} sem número atribuído válido para follow-up. Pulando.`,
            "warning",
          );

          await db.query(
            "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
            [
              lead.id,
              "Follow-up não enviado: número atribuído ausente ou inválido.",
              "followup_error",
            ],
          );

          setTimeout(loop, 15000);
          return;
        }
      }

      try {
        const currentPage = await ensureBrowserPage();
        const validation = await validateWhatsAppNumber(currentPage, lead);

        if (!validation.valid) {
          log(
            `⚠️ Número inexistente ou inválido: ${lead.phone}. Pulando lead...`,
            "error",
          );
          await markInvalidNumber(lead);
          setTimeout(loop, 5000);
          return;
        }

        if (mode === "initial") {
          await handleInitialApproach(
            currentPage,
            lead,
            validation.inputSelector,
            sendingNumber,
          );
        } else {
          await handleFollowup(
            currentPage,
            lead,
            validation.inputSelector,
            sendingNumber,
          );
        }
      } catch (err) {
        if (err.message.includes("Chrome não detectado")) {
          log("❌ Chrome não detectado na porta 9222.", "error");
          setTimeout(loop, 20000);
          return;
        }
        throw err;
      }

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
