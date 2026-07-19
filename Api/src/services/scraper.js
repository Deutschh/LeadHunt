const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const db = require("../database/db");

const logScraper = (message, type = "info") => {
  if (global.workerSocket) {
    global.workerSocket.emit("scraper-log", { message, type });
  }
  console.log(`[Buscador] ${message}`);
};

puppeteer.use(StealthPlugin());

async function startScraping({
  niche,
  location,
  limit = 10,
  minRating = 0,
  minReviews = 0,
  websiteFilter = "any",
}) {
  let browser;
  let page;
  let savedCount = 0;

  const targetLimit = Math.max(1, parseInt(limit, 10) || 10);

  const minimumRating = Math.max(0, Number(minRating) || 0);

  const minimumReviews = Math.max(0, parseInt(minReviews, 10) || 0);

  const allowedWebsiteFilters = ["any", "with", "without"];

  const normalizedWebsiteFilter = allowedWebsiteFilters.includes(websiteFilter)
    ? websiteFilter
    : "any";

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
      browserURL: "http://127.0.0.1:9333",
      defaultViewport: null,
    });

    page = await browser.newPage();

    const query = `${niche} em ${location}`;
    const url = `https://www.google.com.br/maps/search/${encodeURIComponent(query)}`;

    const websiteFilterLabels = {
      any: "qualquer presença de site",
      with: "somente empresas com site",
      without: "somente empresas sem site",
    };

    logScraper(
      `🚀 MISSÃO INICIADA: Procurando ${targetLimit} leads | ` +
        `Nota mínima: ${minimumRating} | ` +
        `Avaliações mínimas: ${minimumReviews} | ` +
        `${websiteFilterLabels[normalizedWebsiteFilter]}`,
      "info",
    );

    await page.goto(url, { waitUntil: "networkidle2" });
    await page.waitForSelector("a.hfpxzc", { timeout: 15000 });

    let currentIndex = 3;

    while (savedCount < targetLimit && currentIndex < 250) {
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

        const data = await page.evaluate((_extraSelectors) => {
          const h1s = Array.from(document.querySelectorAll("h1"));
          const nameEl = h1s.find(
            (h) =>
              h.innerText.trim() &&
              !h.innerText.includes("Resultados") &&
              !h.innerText.includes("Patrocinado"),
          );

          const name = nameEl?.innerText?.trim() || null;
          const painel = nameEl
            ? nameEl.closest('div[role="main"]')
            : document.body;

          const ratingContainer = painel
            ? painel.querySelector(".F7nice")
            : null;

          let rating = 0;
          let reviewsCount = 0;

          if (ratingContainer) {
            const spans = Array.from(ratingContainer.querySelectorAll("span"));

            const ratingSpan = spans.find((s) => s.innerText.includes(","));
            if (ratingSpan) {
              rating = parseFloat(ratingSpan.innerText.replace(",", ".")) || 0;
            }

            const reviewsSpan = spans.find(
              (s) =>
                (s.innerText.includes("(") && s !== ratingSpan) ||
                (s.ariaLabel && s.ariaLabel.includes("avaliações")),
            );

            if (reviewsSpan) {
              const rawReviews = reviewsSpan.ariaLabel || reviewsSpan.innerText;
              reviewsCount = parseInt(rawReviews.replace(/\D/g, "")) || 0;
            }
          }

          return {
            name,
            hasWebsite: !!painel?.querySelector(
              'a[data-tooltip="Abrir website"]',
            ),
            phone:
              painel
                ?.querySelector(
                  'button[data-tooltip="Copiar número de telefone"]',
                )
                ?.innerText.replace(/[^0-9]/g, "") || null,
            rating,
            reviewsCount,
            neighborhood:
              painel
                ?.querySelector('button[data-item-id="address"]')
                ?.innerText.split(",")[1]
                ?.trim() || "Centro",
            niche:
              painel?.querySelector('button[data-item-id="category"]')
                ?.innerText || "Geral",
          };
        }, dynamicSelectors);

        let localPhone = data.phone;

        if (localPhone?.startsWith("55") && localPhone.length === 13) {
          localPhone = localPhone.slice(2);
        }

        const hasPhone = Boolean(localPhone);

        const isMobilePhone =
          localPhone?.length === 11 && localPhone[2] === "9";

        const phoneFormatado = isMobilePhone ? `55${localPhone}` : null;

        const matchesWebsiteFilter =
          normalizedWebsiteFilter === "any" ||
          (normalizedWebsiteFilter === "with" && data.hasWebsite === true) ||
          (normalizedWebsiteFilter === "without" && data.hasWebsite === false);

        const matchesRating = Number(data.rating || 0) >= minimumRating;

        const matchesReviews = Number(data.reviewsCount || 0) >= minimumReviews;

        const itemHeader =
          `🔎 [${data.name || "Sem nome"}] | ` +
          `⭐ ${data.rating} (${data.reviewsCount} revs) | ` +
          `📍 ${data.neighborhood} | ` +
          `🌐 ${data.hasWebsite ? "Com site" : "Sem site"}`;

        const leadMatchesSearch =
          Boolean(data.name) &&
          Boolean(phoneFormatado) &&
          matchesWebsiteFilter &&
          matchesRating &&
          matchesReviews;

        if (leadMatchesSearch) {
          const jaExiste = await db.query(
            "SELECT id FROM leads WHERE phone = $1",
            [phoneFormatado],
          );

          if (jaExiste.rowCount > 0) {
            logScraper(`${itemHeader} ⏭️ Já cadastrado.`, "skip");
          } else {
            await db.query(
              `
      INSERT INTO leads (
        name,
        phone,
        has_website,
        status,
        niche,
        rating,
        neighborhood,
        reviews_count,
        interest_level,
        lead_category,
        lead_city
      )
      VALUES (
        $1,
        $2,
        $3,
        'pending',
        $4,
        $5,
        $6,
        $7,
        0,
        $8,
        $9
      )
      ON CONFLICT DO NOTHING
      `,
              [
                data.name,
                phoneFormatado,
                data.hasWebsite,
                data.niche,
                data.rating,
                data.neighborhood,
                data.reviewsCount,
                niche,
                location.split(",")[0].trim(),
              ],
            );

            savedCount++;

            logScraper(
              `${itemHeader} ✨ SALVO! [${savedCount}/${targetLimit}]`,
              "success",
            );
          }
        } else {
          let reason = "Não corresponde aos filtros";

          if (!data.name) {
            reason = "Erro de leitura";
          } else if (!hasPhone) {
            reason = "Telefone ausente";
          } else if (!isMobilePhone) {
            reason = "Não é celular";
          } else if (!matchesWebsiteFilter) {
            reason =
              normalizedWebsiteFilter === "with"
                ? "Empresa sem site"
                : "Empresa com site";
          } else if (!matchesRating) {
            reason =
              `Nota abaixo do mínimo ` + `(${data.rating} < ${minimumRating})`;
          } else if (!matchesReviews) {
            reason =
              `Avaliações abaixo do mínimo ` +
              `(${data.reviewsCount} < ${minimumReviews})`;
          }

          logScraper(`${itemHeader} ⏭️ Pulado (${reason})`, "skip");
        }
      } catch (innerErr) {
        logScraper(`⚠️ Erro ao processar item: ${innerErr.message}`, "error");
        continue;
      }
    }
  } catch (e) {
    logScraper(`❌ ERRO CRÍTICO: ${e.message}`, "error");
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.disconnect().catch(() => {});
    logScraper(`🏁 MISSÃO CONCLUÍDA: ${savedCount} leads prontos!`, "success");
  }
}

module.exports = { startScraping };
