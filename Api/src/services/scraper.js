const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const db = require("../database/db");

puppeteer.use(StealthPlugin());

async function startScraping({ niche, location, limit, minRating }) {
  let browser;
  let savedCount = 0;

  try {
    // 1. CONEXÃO COM O CÉREBRO (Configurações Dinâmicas)
    // Buscamos os seletores que você "cadastrou" no banco
    const configRes = await db.query(
      "SELECT tags FROM scraper_config WHERE selector_type = 'business_name'",
    );
    const dbTags = configRes.rows[0]?.tags || "";

    // Convertemos a string do banco em uma array de seletores
    const dynamicSelectors = dbTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);

    // 2. CONEXÃO COM O NAVEGADOR (Modo Carona)
    browser = await puppeteer.connect({
      browserURL: "http://127.0.0.1:9222",
      defaultViewport: null,
    });

    const page = await browser.newPage();
    const query = `${niche} em ${location}`;
    const url = `https://www.google.com.br/maps/search/${encodeURIComponent(query)}`;

    console.log(`\n🚀 MISSÃO HUNTER INICIADA`);
    console.log(`--------------------------------------------------`);
    console.log(`🎯 Alvo: ${limit} leads de "${niche}" em "${location}"`);
    console.log(
      `🛠️ Seletores Ativos: ${[...dynamicSelectors, "H1"].join(" | ")}`,
    );
    console.log(`--------------------------------------------------\n`);

    await page.goto(url, { waitUntil: "networkidle2" });
    await page.waitForSelector("a.hfpxzc", { timeout: 15000 });

    let currentIndex = 3; // Começa no 3 para pular os anúncios do topo
    let lastProcessedName = "";

    while (savedCount < limit && currentIndex < 80) {
      const items = await page.$$("a.hfpxzc");

      if (currentIndex >= items.length) {
        console.log("🔄 Fim da lista. Scrollando para carregar mais...");
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

        // ESPERA INTELIGENTE (Paciência de Hunter)
        await page
          .waitForFunction(
            (oldName) => {
              // Verifica os seletores comuns para saber se o painel mudou
              const h1 =
                document.querySelector("h1.DUwDve") ||
                document.querySelector("h1.DUwDbe") ||
                document.querySelector(".lfPiob");
              const name = h1 ? h1.innerText.trim() : "";
              return (
                name.length > 0 && name !== oldName && name !== "Resultados"
              );
            },
            { timeout: 7000 },
            lastProcessedName,
          )
          .catch(() => {});

        await new Promise((r) => setTimeout(r, 1500));

        // 3. EXTRAÇÃO CIRÚRGICA (O Coração do Robô)
        const data = await page.evaluate((extraSelectors) => {
          // Lista de prioridade de busca
          const selectors = [
            ...extraSelectors, // Primeiro o que você cadastrou no banco
            "h1.DUwDve.lfPiob",
            "h1.DUwDvf.lfPIob",
            "h1.DUwDve",
            "h1.DUwDbe",
            ".lfPiob",
            "div[role='main'] h1",
            "h1",
          ];

          let name = "";
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
              const text = el.innerText.trim();
              // Validação: não pode ser vazio, nem "Resultados", nem apenas o texto do anúncio
              if (
                text &&
                text !== "Resultados" &&
                !text.includes("Patrocinado")
              ) {
                name = text;
                break;
              }
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

          // Lógica de Bairro Robusta (Trata nomes e números)
          let neighborhood = "Não identificado";
          if (fullAddress.includes(",")) {
            const parts = fullAddress.split(",");
            let possibleNb = parts[1] ? parts[1].split("-")[0].trim() : "";

            // Se o bairro vier como número (ex: 123), tenta a parte após o traço
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
              ? phoneEl.innerText.replace(/[^0-9()\- ]/g, "").trim()
              : null,
            rating,
            neighborhood,
            niche:
              document.querySelector('button[data-item-id="category"]')
                ?.innerText || "Geral",
          };
        }, dynamicSelectors);

        lastProcessedName = data.name;

        // LIMPEZA E VALIDAÇÃO DE CELULAR
        const apenasNumeros = data.phone ? data.phone.replace(/\D/g, "") : "";
        const ehCelular =
          apenasNumeros.length === 11 && apenasNumeros[2] === "9";

        // 4. FEEDBACK EM TEMPO REAL NO TERMINAL
        console.log(
          `🔎 Item ${currentIndex}: [${data.name || "NOME NÃO ENCONTRADO"}]`,
        );
        console.log(
          `   📍 ${data.neighborhood} | ⭐ ${data.rating} | 📞 ${data.phone || "S/ Tel"}`,
        );
        console.log(`   🌐 Site: ${data.hasWebsite ? "Sim ✅" : "Não ❌"}`);

        if (
          data.name &&
          data.phone &&
          ehCelular &&
          !data.hasWebsite &&
          data.rating >= minRating
        ) {
          const res = await db.query(
            `INSERT INTO leads (name, phone, has_website, status, niche, rating, neighborhood, interest_level)
             VALUES ($1, $2, $3, 'pending', $4, $5, $6, 0)
             ON CONFLICT (phone) DO NOTHING`,
            [
              data.name,
              data.phone,
              false,
              data.niche,
              data.rating,
              data.neighborhood,
            ],
          );

          if (res.rowCount > 0) {
            savedCount++;
            console.log(`   ✨ STATUS: SALVO! [${savedCount}/${limit}]`);
          } else {
            console.log(`   ⏩ STATUS: Já cadastrado.`);
          }
        } else {
          // Melhora o motivo do descarte para o seu feedback no terminal
          let reason = "Filtro de nota";
          if (!data.name) reason = "Falha na leitura";
          else if (data.hasWebsite) reason = "Já tem site";
          else if (!data.phone) reason = "Sem telefone";
          else if (!ehCelular)
            reason = "Telefone Fixo (Ignorado)"; // <--- Agora você sabe o que aconteceu
          else if (data.rating < minRating)
            reason = `Nota baixa (${data.rating})`;

          console.log(`   ⏭️ STATUS: Pulado (${reason})`);
        }
        console.log(`--------------------------------------------------`);
      } catch (innerErr) {
        console.log("⚠️ Erro ao processar item, tentando próximo...");
        continue;
      }
    }
  } catch (e) {
    console.error("❌ ERRO FATAL NO SCRAPER:", e.message);
  } finally {
    if (browser) await browser.disconnect();
    console.log(`\n🏁 MISSÃO CUMPRIDA`);
    console.log(`✅ ${savedCount} novos leads prontos para contato!\n`);
  }
}

module.exports = { startScraping };
