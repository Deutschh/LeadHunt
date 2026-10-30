const db = require("../database/db");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { createWorkspaceLeadEvent } = require("./eventService");
const {
  getFollowupMessage,
  getEligibleFollowupLead,
  scheduleNextFollowup,
  markLeadAsReplied,
} = require("./followupService");
const {
  getAvailableSendingNumber,
  assignNumberToLead,
  incrementNumberUsage,
  getLeadAssignedNumber,
  getSendingNumberByPhone,
  markNumberHealthy,
  markNumberFailure,
  clearExpiredPauses,
  resetDailyCountersIfNeeded,
} = require("./numberRoutingService");

puppeteer.use(StealthPlugin());

const sessions = new Map();
let isLoopRunning = false;
const {workspace,RuntimeError,dispatchPolicy}=require('./jobPolicy');
let workerContext;
let activeLead;
let activeMode;
let activeSendingNumber;
function getWorkspaceId() {
  if (!workerContext) throw new RuntimeError('LEGACY_CONTEXT_REQUIRED',503);
  return workspace(workerContext.workspaceId);
}
async function assertSendingAllowed() {
  await workerContext.assertActive();
  const settings=await getAutomationSettings();
  if (!dispatchPolicy(settings,new Date(),activeMode==='followup'?'followup':'send_message').allowed) throw new RuntimeError('LEGACY_PAUSED',409);
  const row=(await db.query(`SELECT * FROM leads WHERE workspace_id=$1 AND id=$2 AND status=$3 AND is_archived=false
    AND COALESCE(is_invalid_number,false)=false AND last_reply_at IS NULL`,[getWorkspaceId(),activeLead?.id,activeMode==='followup'?'contacted':'pending'])).rows[0];
  if (!row) throw new RuntimeError('LEGACY_LEAD_OBSOLETE',409);
  const sender=await getSendingNumberByPhone(getWorkspaceId(),activeSendingNumber?.phone_number);
  if(!sender?.is_active || sender.status!=='active' || !['healthy','warning'].includes(sender.health_status) || Number(sender.sent_today)>=Number(sender.daily_limit) || (sender.paused_until && new Date(sender.paused_until)>new Date())) throw new RuntimeError('LEGACY_SENDER_UNAVAILABLE',409);
  const total=(await db.query('SELECT COALESCE(sum(sent_today),0)::int AS used FROM sending_numbers WHERE workspace_id=$1',[getWorkspaceId()])).rows[0].used;
  if(total>=Number(settings.daily_limit))throw new RuntimeError('LEGACY_DAILY_LIMIT',409);
  if(activeMode==='followup' && (row.assigned_number!==sender.phone_number || Number(row.followup_count || 0)!==Number(activeLead.followup_count || 0) || Number(row.followup_count || 0)>=Number(settings.followup_max_count) || !row.next_followup_at || new Date(row.next_followup_at)>new Date()))throw new RuntimeError('LEGACY_LEAD_OBSOLETE',409);
  if(activeMode==='initial' && row.custom_message!==activeLead.custom_message)throw new RuntimeError('LEGACY_LEAD_OBSOLETE',409);
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
};

function shouldSendGreetingBubble(lead) {
  const angle = lead.ai_prompt_angle || "";

  if (angle.startsWith("velaris_consultant:")) return false;
  if (angle.startsWith("human_consultative:")) return false;

  return true;
}

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
  await assertSendingAllowed();
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 2000));
}

const log = (message, type = "info") => {
  // Keep browser/commercial text local to the execution stack, never in logs.
  console.log(`[Automação] LOCAL_${type.toUpperCase()}`);
};

function logWithPort(message, type = "info", sendingNumber = null) {
  if (!sendingNumber) {
    log(message, type);
    return;
  }

  const prefix = `[${sendingNumber.label} | porta ${sendingNumber.chrome_port}]`;
  log(`${prefix} ${message}`, type);
}

async function getNextPendingLead() {
  const leadRes = await db.query(`
    SELECT *
    FROM leads
    WHERE workspace_id = $1 AND is_verified = true
      AND status = 'pending'
      AND is_ai_ready = true
      AND is_archived = false
      AND COALESCE(is_invalid_number, false) = false
    ORDER BY RANDOM()
    LIMIT 1
  `,[getWorkspaceId()]);

  return leadRes.rows[0] || null;
}

async function getPageForPort(port) {
  if (!port) {
    throw new Error("Chrome port não informado.");
  }

  if (sessions.has(port)) {
    return sessions.get(port).page;
  }

  try {
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${port}`,
      defaultViewport: null,
    });

    const page = await browser.newPage();

    sessions.set(port, { browser, page });

    log(`🧠 Sessão criada na porta ${port}`, "info");

    return page;
  } catch (err) {
    throw new Error(`Chrome não detectado na porta ${port}`);
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

function parseWhatsAppDate(prePlainText) {
  if (!prePlainText) return null;

  // Exemplo: "[16:21, 26/04/2026] Nome:"
  const match = prePlainText.match(
    /\[(\d{1,2}):(\d{2}),\s(\d{1,2})\/(\d{1,2})\/(\d{4})\]/,
  );

  if (!match) return null;

  const [, hour, minute, day, month, year] = match;

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
}

async function checkIfLeadReplied(currentPage, lead) {
  try {
    if (lead.last_reply_at) return false;

    await new Promise((r) => setTimeout(r, 1500));

    const referenceDate = lead.last_followup_at
      ? new Date(lead.last_followup_at)
      : lead.last_contact
        ? new Date(lead.last_contact)
        : null;

    if (!referenceDate) return false;

    const incomingMessages = await currentPage.$$eval(
      "div.message-in span.copyable-text",
      (els) =>
        els.map((el) => ({
          text: (el.innerText || "").trim(),
          prePlainText: el.getAttribute("data-pre-plain-text") || "",
        })),
    );

    const validMessages = incomingMessages
      .map((msg) => ({
        ...msg,
        date: parseWhatsAppDate(msg.prePlainText),
      }))
      .filter((msg) => msg.text && msg.date);

    return validMessages.some((msg) => msg.date > referenceDate);
  } catch (err) {
    return false;
  }
}

async function handleDetectedReply(lead, sendingNumber) {
  await markLeadAsReplied(getWorkspaceId(), lead.id);

  await createWorkspaceLeadEvent(getWorkspaceId(),
    lead.id,
    "lead_replied_detected",
    sendingNumber.phone_number,
    "automation",
    {
      lead_name: lead.name,
      sending_number: sendingNumber.phone_number,
      sending_number_label: sendingNumber.label,
      chrome_port: sendingNumber.chrome_port || null,
    },
  );

  await db.query(
    `
    INSERT INTO lead_activities (workspace_id,lead_id, description, type)
    SELECT workspace_id,id,$2,$3 FROM leads WHERE id=$1 AND workspace_id=$4
    `,
    [
      lead.id,
      `Resposta detectada automaticamente. Follow-up interrompido no número ${sendingNumber.label}.`,
      "reply_detected",
      getWorkspaceId(),
    ],
  );
}

async function markInvalidNumber(lead) {
  await db.query(
    `
    UPDATE leads
    SET
      is_invalid_number = true,
      status = 'lost',
      pipeline_stage = 'lost',
      lost_reason = 'invalid_number',
      next_followup_at = NULL
    WHERE id = $1 AND workspace_id=$2
    `,
    [lead.id,getWorkspaceId()],
  );

  await createWorkspaceLeadEvent(getWorkspaceId(),
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
    "INSERT INTO lead_activities (workspace_id,lead_id, description, type) SELECT workspace_id,id,$2,$3 FROM leads WHERE id=$1 AND workspace_id=$4",
    [lead.id, "Número inválido detectado na automação.", "invalid_number",getWorkspaceId()],
  );
}

async function resolveSendingNumberForInitialLead(lead) {
  if (lead.assigned_number) {
    const existingNumber = await getSendingNumberByPhone(getWorkspaceId(), lead.assigned_number);

    if (
      existingNumber &&
      existingNumber.is_active &&
      existingNumber.status === "active" &&
      existingNumber.chrome_port
    ) {
      return existingNumber;
    }
  }

  const availableNumber = await getAvailableSendingNumber(getWorkspaceId());

  if (!availableNumber) {
    return null;
  }

  await assignNumberToLead(getWorkspaceId(), lead.id, availableNumber);
  lead.assigned_number = availableNumber.phone_number;

  return availableNumber;
}

async function resolveSendingNumberForFollowup(lead) {
  const assignedPhone = await getLeadAssignedNumber(getWorkspaceId(), lead.id);

  if (!assignedPhone) {
    return null;
  }

  const sendingNumber = await getSendingNumberByPhone(getWorkspaceId(), assignedPhone);

  if (
    !sendingNumber ||
    !sendingNumber.is_active ||
    sendingNumber.status !== "active" ||
    !sendingNumber.chrome_port
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
  activeLead=lead;activeMode='initial';activeSendingNumber=sendingNumber;
  logWithPort("🚀 MODO: ABORDAGEM INICIAL", "info", sendingNumber);

  logWithPort(
    `🎯 Abordagem estratégica iniciada para: ${lead.name}`,
    "info",
    sendingNumber,
  );

  if (shouldSendGreetingBubble(lead)) {
    const greetingMsg = `${getGreeting()}! Tudo bem?`;
    await sendBubble(currentPage, inputSelector, greetingMsg);
    logWithPort("👋 Balão 1 (Saudação) enviado.", "info", sendingNumber);

    const waitTime1 = Math.floor(Math.random() * (15000 - 10000 + 1)) + 10000;
    logWithPort(
      `⏳ Aguardando ${waitTime1 / 1000}s para a proposta...`,
      "info",
      sendingNumber,
    );
    await new Promise((r) => setTimeout(r, waitTime1));
  } else {
    logWithPort(
      "👋 Saudação separada ignorada: mensagem já possui abertura consultiva.",
      "info",
      sendingNumber,
    );

    await new Promise((r) => setTimeout(r, 3000));
  }

  if (lead.custom_message && lead.custom_message.includes("---")) {
    logWithPort(
      `🤖 Mensagem dividida detectada para ${lead.name}`,
      "info",
      sendingNumber,
    );

    const parts = lead.custom_message.split("---");

    const messagePart1 = parts[0].trim();
    await sendBubble(currentPage, inputSelector, messagePart1, true);

    await new Promise((r) => setTimeout(r, 6000));

    const messagePart2 = parts[1].trim();
    await sendBubble(currentPage, inputSelector, messagePart2, true);

    logWithPort("🚀 Fluxo de 3 balões concluído.", "success", sendingNumber);
  } else {
    logWithPort(
      "⚠️ Mensagem sem separador ou padrão. Enviando bloco único.",
      "info",
      sendingNumber,
    );
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
      followup_count = 0,
      last_followup_at = NULL,
      last_reply_at = NULL,
      assigned_number = $2
    WHERE id = $1 AND workspace_id=$3 AND status='pending' AND last_reply_at IS NULL AND is_archived=false
    `,
    [lead.id, sendingNumber.phone_number,getWorkspaceId()],
  );

  await incrementNumberUsage(getWorkspaceId(), sendingNumber.phone_number);

  await createWorkspaceLeadEvent(getWorkspaceId(),
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
      chrome_port: sendingNumber.chrome_port || null,
    },
  );

  await db.query(
    "INSERT INTO lead_activities (workspace_id,lead_id, description, type) SELECT workspace_id,id,$2,$3 FROM leads WHERE id=$1 AND workspace_id=$4",
    [
      lead.id,
      `Abordagem inicial enviada pelo número ${sendingNumber.label}.`,
      "contact",
      getWorkspaceId(),
    ],
  );
}

async function handleFollowup(currentPage, lead, inputSelector, sendingNumber) {
  activeLead=lead;activeMode='followup';activeSendingNumber=sendingNumber;
  logWithPort("🔁 MODO: FOLLOW-UP", "info", sendingNumber);

  const currentFollowupCount = Number(lead.followup_count || 0);
  const message = getFollowupMessage(lead, currentFollowupCount);

  logWithPort(
    `🔁 Iniciando follow-up ${currentFollowupCount + 1} para: ${lead.name}`,
    "info",
    sendingNumber,
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
    WHERE id = $1 AND workspace_id=$4 AND status='contacted' AND last_reply_at IS NULL AND is_archived=false
    `,
    [lead.id, newFollowupCount, sendingNumber.phone_number,getWorkspaceId()],
  );

  await scheduleNextFollowup(getWorkspaceId(), lead.id, newFollowupCount);
  await incrementNumberUsage(getWorkspaceId(), sendingNumber.phone_number);

  await createWorkspaceLeadEvent(getWorkspaceId(),
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
      chrome_port: sendingNumber.chrome_port || null,
    },
  );

  await db.query(
    "INSERT INTO lead_activities (workspace_id,lead_id, description, type) SELECT workspace_id,id,$2,$3 FROM leads WHERE id=$1 AND workspace_id=$4",
    [
      lead.id,
      `Follow-up ${newFollowupCount} enviado automaticamente pelo número ${sendingNumber.label}.`,
      "followup",
      getWorkspaceId(),
    ],
  );

  logWithPort(
    `✅ Follow-up ${newFollowupCount} enviado para ${lead.name}`,
    "success",
    sendingNumber,
  );
}

const startAutomation = async (context) => {
  if (isLoopRunning) return;
  workspace(context?.workspaceId);
  if (typeof context.assertActive!=='function') throw new RuntimeError('LEGACY_CONTEXT_REQUIRED',503);
  await context.assertActive();workerContext=context;
  isLoopRunning = true;

  log("⚙️ Motor iniciado. Aguardando ativação...", "info");

  const loop = async () => {
    try {
      await workerContext.assertActive();
      await resetDailyCountersIfNeeded(getWorkspaceId());
      await clearExpiredPauses(getWorkspaceId());

      const settings = await getAutomationSettings();

      if (!settings || !settings.is_active) {
        if (sessions.size > 0) {
          log("⏸️ Motor pausado.", "info");

          for (const [, session] of sessions.entries()) {
            try {
              await session.browser.disconnect();
            } catch (err) {
              // ignora erro de desconexão
            }
          }

          sessions.clear();
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

      let lead = null;
      let mode = null;
      let sendingNumber = null;

      let followupsSentInCycle = 0;

      const newLead = await getNextPendingLead();

      if (newLead) {
        lead = newLead;
        mode = "initial";
      } else {
        const followupLead = await getEligibleFollowupLead(getWorkspaceId());

        if (followupLead) {
          lead = followupLead;
          mode = "followup";
        }
      }
      if (!lead || !mode) {
        log("📭 Fila vazia (nem novos nem follow-ups disponíveis)...", "info");
        setTimeout(loop, 30000);
        return;
      }

      log(
        `🎯 Selecionado: ${lead.name} | modo: ${mode} | followups: ${lead.followup_count || 0}`,
        "info",
      );

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
            "INSERT INTO lead_activities (workspace_id,lead_id, description, type) SELECT workspace_id,id,$2,$3 FROM leads WHERE id=$1 AND workspace_id=$4",
            [
              lead.id,
              "Follow-up não enviado: número atribuído ausente ou inválido.",
              "followup_error",
              getWorkspaceId(),
            ],
          );

          setTimeout(loop, 15000);
          return;
        }
      }

      if (!sendingNumber.chrome_port) {
        logWithPort(
          `⚠️ O número ${sendingNumber.label} não possui chrome_port configurada.`,
          "warning",
          sendingNumber,
        );
        setTimeout(loop, 15000);
        return;
      }

      try {
        const currentPage = await getPageForPort(sendingNumber.chrome_port);
        const validation = await validateWhatsAppNumber(currentPage, lead);

        if (!validation.valid) {
          logWithPort(
            `⚠️ Número inexistente ou inválido: ${lead.phone}. Pulando lead...`,
            "error",
            sendingNumber,
          );

          await markInvalidNumber(lead);
          await markNumberFailure(getWorkspaceId(),
            sendingNumber.phone_number,
            `Número inválido ou conversa não abriu para o lead ${lead.phone}`,
          );

          setTimeout(loop, 5000);
          return;
        }

        if (mode === "initial" && lead.status !== "pending") {
          logWithPort(
            `⚠️ Lead ${lead.name} já não está mais pendente. Pulando...`,
            "warning",
            sendingNumber,
          );
          setTimeout(loop, 5000);
          return;
        }

        if (mode === "followup" && lead.last_reply_at) {
          logWithPort(
            `🛑 Lead ${lead.name} já respondeu. Cancelando follow-up.`,
            "warning",
            sendingNumber,
          );
          setTimeout(loop, 5000);
          return;
        }

        if (mode === "followup") {
          const hasReply = await checkIfLeadReplied(currentPage, lead);

          if (hasReply) {
            await handleDetectedReply(lead, sendingNumber);

            await markNumberHealthy(getWorkspaceId(), sendingNumber.phone_number);

            setTimeout(loop, 10000);

            return;
          }
        }

        const typingDelay = Math.floor(Math.random() * 3000) + 2000;
        logWithPort(
          `⌛ Simulando digitação por ${typingDelay / 1000}s...`,
          "info",
          sendingNumber,
        );
        await new Promise((r) => setTimeout(r, typingDelay));

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

        await markNumberHealthy(getWorkspaceId(), sendingNumber.phone_number);

        if (mode === "initial") {
          await wait(Number(settings.followup_gap_seconds || 30) * 1000);

          followupsSentInCycle = await executeFollowupsBatch();

          if (followupsSentInCycle > 0) {
            log(
              `🔁 ${followupsSentInCycle} followups enviados neste ciclo.`,
              "success",
            );
          }
        }
      } catch (err) {
        if (err instanceof RuntimeError) {log('Execução pausada.','warning');setTimeout(loop,10000);return;}
        if (sendingNumber?.phone_number) {
          await markNumberFailure(getWorkspaceId(), sendingNumber.phone_number, err.message);
        }

        if (err.message.includes("Chrome não detectado")) {
          logWithPort(`❌ ${err.message}`, "error", sendingNumber);
          setTimeout(loop, 20000);
          return;
        }

        logWithPort(
          `💥 Falha na sessão: ${err.message}`,
          "error",
          sendingNumber,
        );
        setTimeout(loop, 30000);
        return;
      }

      const min = parseInt(settings.min_interval_minutes, 10);
      const max = parseInt(settings.max_interval_minutes, 10);
      const waitMinutes = Math.floor(Math.random() * (max - min + 1)) + min;

      log(`⏳ Próximo disparo em ${waitMinutes} minutos...`, "info");
      const consumed =
        mode === "initial"
          ? Number(settings.followup_gap_seconds || 30) *
            Number(followupsSentInCycle || 0)
          : 0;

      const finalDelay =
        mode === "followup"
          ? Number(settings.followup_gap_seconds || 30)
          : Math.max(waitMinutes * 60 - consumed, 30);

      log(`⏳ Próximo ciclo em ${finalDelay}s`, "info");

      setTimeout(loop, finalDelay * 1000);
    } catch (err) {
      log(`💥 Erro crítico: ${err.message}`, "error");
      setTimeout(loop, 60000);
    }
  };

  loop();
};

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getAutomationSettings() {
  const result = await db.query(`
    SELECT s.*,w.timezone
    FROM automation_settings s JOIN workspaces w ON w.id=s.workspace_id
    WHERE s.workspace_id=$1
  `,[getWorkspaceId()]);

  return result.rows[0];
}

async function executeFollowupsBatch() {
  const settings = await getAutomationSettings();

  if (!settings?.is_active || !settings.followup_enabled) {
    return 0;
  }

  const maxBatch = Number(settings.followups_per_cycle || 0);

  const gap = Number(settings.followup_gap_seconds || 30);

  let executed = 0;

  for (let i = 0; i < maxBatch; i++) {
    await workerContext.assertActive();
    const currentSettings=await getAutomationSettings();
    if(!currentSettings?.is_active || !currentSettings.followup_enabled)break;
    const lead = await getEligibleFollowupLead(getWorkspaceId());

    if (!lead) {
      break;
    }

    const sendingNumber = await resolveSendingNumberForFollowup(lead);

    if (!sendingNumber) {
      continue;
    }

    try {
      const page = await getPageForPort(sendingNumber.chrome_port);

      const validation = await validateWhatsAppNumber(page, lead);

      if (!validation.valid) {
        continue;
      }

      await handleFollowup(page, lead, validation.inputSelector, sendingNumber);

      executed++;

      if (i < maxBatch - 1) {
        await wait(gap * 1000);
      }
    } catch (err) {
      log(`Erro followup lote: ${err.message}`, "error");
    }
  }

  return executed;
}

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
