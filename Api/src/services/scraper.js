const puppeteer = require("puppeteer");
const db = require("../database/db");

async function startScraping({ niche, location, limit, minRating }) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const query = `${niche} em ${location}`;
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

  let leadsFound = 0; // Nosso contador de meta

  try {
    await page.goto(url, { waitUntil: "networkidle2" });
    console.log(
      `🚀 Missão iniciada: Buscar ${limit} leads de "${niche}" com nota ${minRating}+`,
    );

    await page.waitForSelector("a.hfpxzc", { timeout: 15000 });

    // Loop principal
    while (leadsFound < limit) {
      let items = await page.$$("a.hfpxzc");

      for (let i = 0; i < items.length; i++) {
        if (leadsFound >= limit) break; // Para tudo se bater a meta

        try {
          const currentItems = await page.$$("a.hfpxzc");
          const leadElement = currentItems[i];
          if (!leadElement) continue;

          await page.evaluate((el) => el.scrollIntoView(), leadElement);
          await leadElement.click();
          await new Promise((r) => setTimeout(r, 3000));

          const data = await page.evaluate(() => {
            const name = document.querySelector("h1")?.innerText || "Sem nome";
            const website =
              document.querySelector('a[data-tooltip="Abrir website"]') || null;
            const phone =
              document.querySelector(
                'button[data-tooltip="Copiar número de telefone"]',
              )?.innerText || null;

            // Captura o Nicho (Ex: "Oficina Mecânica")
            const niche =
              document.querySelector('button[class*="DByne"]')?.innerText ||
              "Geral";

            // Captura a Nota e Quantidade de Avaliações
            const ratingText =
              document.querySelector('span[role="img"]')?.ariaLabel || "0";
            const rating =
              parseFloat(ratingText.replace(",", ".").split(" ")[0]) || 0;

            const reviewsText =
              document.querySelector('button[aria-label*="avaliações"]')
                ?.innerText || "0";
            const reviewsCount = parseInt(reviewsText.replace(/\D/g, "")) || 0;

            // Captura Endereço para extrair o Bairro
            const address =
              document.querySelector('button[data-item-id="address"]')
                ?.innerText || "";
            const parts = address.split(" - ");
            const neighborhood =
              parts.length > 1
                ? parts[1].split(",")[0].trim()
                : "Não identificado";

            return {
              name,
              hasWebsite: !!website,
              phone,
              niche,
              rating,
              reviewsCount,
              neighborhood,
            };
          });

          // LÓGICA DE FILTRO: Sem site + Nota mínima + Ter Telefone
          if (!data.hasWebsite && data.phone && data.rating >= minRating) {
            console.log(
              `🎯 [${leadsFound + 1}/${limit}] Oportunidade: ${data.name} | ⭐ ${data.rating}`,
            );

            await db.query(
              `INSERT INTO leads 
        (name, phone, has_website, status, niche, rating, reviews_count, neighborhood, interest_level) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0) 
        ON CONFLICT (phone) DO NOTHING`,
              [
                data.name,
                data.phone,
                false,
                "pending",
                data.niche,
                data.rating,
                data.reviewsCount,
                data.neighborhood,
              ],
            );

            leadsFound++; // Incrementa só quando salva um lead válido
          } else {
            console.log(
              `⏩ Ignorado: ${data.name} (Nota: ${data.rating} | Site: ${data.hasWebsite})`,
            );
          }
        } catch (innerErr) {
          continue;
        }
      }

      // Se ainda não bateu a meta, tenta rolar a lista para carregar mais leads
      if (leadsFound < limit) {
        console.log("🔄 Buscando mais resultados na lista...");
        await page.evaluate(() => {
          const scrollableSection = document.querySelector('div[role="feed"]');
          if (scrollableSection) scrollableSection.scrollTop += 1000;
        });
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } catch (e) {
    console.error("❌ Erro na operação:", e.message);
  }

  console.log(`🏁 Missão cumprida! ${leadsFound} leads capturados.`);
  await browser.close();
}

module.exports = { startScraping };
