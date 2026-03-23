const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const db = require("../database/db");

// Função para enviar os logs para a nuvem (Render) e depois para o Site
const logScraper = (message, type = "info") => {
  if (global.workerSocket) {
    global.workerSocket.emit("scraper-log", { message, type });
  }
  console.log(`[Buscador] ${message}`);
};

puppeteer.use(StealthPlugin());

async function startScraping({ niche, location, limit, minRating }) {
  let browser;
  let savedCount = 0;

  try {
    const configRes = await db.query(
      "SELECT tags FROM scraper_config WHERE selector_type = 'business_name'",
    );
    const dbTags = configRes.rows[0]?.tags || "";
    const dynamicSelectors = dbTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);

    browser = await puppeteer.connect({
      browserURL: "http://127.0.0.1:9222",
      defaultViewport: null,
    });

    const page = await browser.newPage();
    const query = `${niche} em ${location}`;
    const url = `https://www.google.com.br/maps/search/${encodeURIComponent(query)}`;

    // CORRIGIDO: Usando logScraper
    logScraper(`🚀 MISSÃO INICIADA: Procurando ${limit} leads...`, "info");

    await page.goto(url, { waitUntil: "networkidle2" });
    await page.waitForSelector("a.hfpxzc", { timeout: 15000 });

    let currentIndex = 3;

    while (savedCount < limit && currentIndex < 80) {
      const items = await page.$$("a.hfpxzc");

      if (currentIndex >= items.length) {
        await page.evaluate(() => {
          const feed = document.querySelector('div[role="feed"]');
          if (feed) feed.scrollTop += 1200;
        });
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      const leadElement = items[currentIndex];
      currentIndex++;

      try {
        await page.evaluate((el) => el.scrollIntoView(), leadElement);
        await new Promise((r) => setTimeout(r, 1200));
        await leadElement.click();
        await new Promise((r) => setTimeout(r, 2000));

        const data = await page.evaluate((extraSelectors) => {
          const selectors = [
            ...extraSelectors,
            "h1.DUwDve",
            "h1.DUwDbe",
            ".lfPiob",
            "h1",
          ];
          let name = "";
          for (const s of selectors) {
            const el = document.querySelector(s);
            if (
              el &&
              el.innerText.trim() &&
              !el.innerText.includes("Patrocinado")
            ) {
              name = el.innerText.trim();
              break;
            }
          }

          const website = document.querySelector(
            'a[data-tooltip="Abrir website"]',
          );
          const phoneEl = document.querySelector(
            'button[data-tooltip="Copiar número de telefone"]',
          );
          const addressEl = document.querySelector(
            'button[data-item-id="address"]',
          );
          const fullAddress = addressEl ? addressEl.innerText.trim() : "";

          let neighborhood = "Não identificado";
          if (fullAddress.includes(",")) {
            const parts = fullAddress.split(",");
            let possibleNb = parts[1] ? parts[1].split("-")[0].trim() : "";
            if (/^\d+$/.test(possibleNb) && parts[1].includes("-")) {
              possibleNb = parts[1].split("-")[1]?.split(",")[0].trim();
            }
            neighborhood = possibleNb || "Centro";
          }

          const ratingText =
            document.querySelector('span[role="img"][aria-label*="estrelas"]')
              ?.ariaLabel || "0";
          const rating =
            parseFloat(ratingText.replace(",", ".").split(" ")[0]) || 0;

          return {
            name,
            hasWebsite: !!website,
            phone: phoneEl
              ? phoneEl.innerText.replace(/[^0-9]/g, "").trim()
              : null,
            rating,
            neighborhood,
            niche:
              document.querySelector('button[data-item-id="category"]')
                ?.innerText || "Geral",
          };
        }, dynamicSelectors);

        const ehCelular = data.phone?.length === 11 && data.phone[2] === "9";
        const phoneFormatado = ehCelular ? `55${data.phone}` : null;
        const itemHeader = `🔎 [${data.name || "S/ Nome"}] | ⭐ ${data.rating} | 📍 ${data.neighborhood}`;

        if (
          data.name &&
          phoneFormatado &&
          !data.hasWebsite &&
          data.rating >= minRating
        ) {
          const jaExiste = await db.query(
            "SELECT id FROM leads WHERE phone = $1",
            [phoneFormatado],
          );

          if (jaExiste.rowCount > 0) {
            // CORRIGIDO: Usando logScraper
            logScraper(`${itemHeader} ⏭️ Já cadastrado.`, "skip");
          } else {
            await db.query(
              `INSERT INTO leads (name, phone, has_website, status, niche, rating, neighborhood, interest_level)
               VALUES ($1, $2, $3, 'pending', $4, $5, $6, 0) ON CONFLICT DO NOTHING`,
              [
                data.name,
                phoneFormatado,
                false,
                data.niche,
                data.rating,
                data.neighborhood,
              ],
            );
            savedCount++;
            // CORRIGIDO: Usando logScraper
            logScraper(
              `${itemHeader} ✨ SALVO! [${savedCount}/${limit}]`,
              "success",
            );
          }
        } else {
          let reason = "Nota baixa";
          if (!data.name) reason = "Erro leitura";
          else if (data.hasWebsite) reason = "Já possui site";
          else if (!phoneFormatado) reason = "Não é celular";

          // CORRIGIDO: Usando logScraper
          logScraper(`${itemHeader} ⏭️ Pulado (${reason})`, "skip");
        }
      } catch (innerErr) {
        continue;
      }
    }
  } catch (e) {
    logScraper(`❌ ERRO CRÍTICO: ${e.message}`, "error");
  } finally {
    if (browser) await browser.disconnect();
    // CORRIGIDO: Usando logScraper
    logScraper(`🏁 MISSÃO CONCLUÍDA: ${savedCount} leads prontos!`, "success");
  }
}

module.exports = { startScraping };
