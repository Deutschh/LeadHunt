const puppeteer = require('puppeteer');
const db = require('../database/db');

async function startScraping(location = 'São Paulo') {
    const browser = await puppeteer.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const query = `empresas e serviços em ${location}`;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    
    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        console.log(`🔎 Buscando em: ${location}...`);

        // Espera os resultados aparecerem
        await page.waitForSelector('a.hfpxzc', { timeout: 15000 });

        // Tenta encontrar os itens
        let items = await page.$$('a.hfpxzc');
        console.log(`📍 Encontrados ${items.length} possíveis candidatos.`);

        for (let i = 0; i < items.length; i++) {
            try {
                // RE-BUSCAR os itens a cada loop para evitar que fiquem "velhos" (stale)
                const currentItems = await page.$$('a.hfpxzc');
                const leadElement = currentItems[i];

                if (!leadElement) continue;

                // Rola até o elemento antes de clicar
                await page.evaluate(el => el.scrollIntoView(), leadElement);
                await new Promise(r => setTimeout(r, 1000));
                
                await leadElement.click();
                
                // Espera o painel lateral carregar (importante!)
                await new Promise(r => setTimeout(r, 3000)); 

                const data = await page.evaluate(() => {
                    const name = document.querySelector('h1')?.innerText || 'Sem nome';
                    const website = document.querySelector('a[data-tooltip="Abrir website"]') || 
                                    document.querySelector('a[aria-label*="website"]') || null;
                    const phone = document.querySelector('button[data-tooltip="Copiar número de telefone"]') || 
                                  document.querySelector('button[aria-label*="Telefone"]') || null;
                    
                    return { 
                        name, 
                        hasWebsite: !!website, 
                        phone: phone ? phone.innerText : null 
                    };
                });

                if (!data.hasWebsite && data.phone) {
                    console.log(`✅ Oportunidade: ${data.name} | 📞 ${data.phone}`);
                    await db.query(
                        'INSERT INTO leads (name, phone, has_website, status) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
                        [data.name, data.phone, false, 'pending']
                    );
                } else {
                    console.log(`⏩ Pulando ${data.name} (Possui site ou sem telefone)`);
                }

            } catch (innerErr) {
                // Log mais detalhado para sabermos PORQUE falhou
                console.log(`❌ Erro no item ${i + 1}: ${innerErr.message.substring(0, 50)}...`);
            }
        }

    } catch (e) {
        console.error("❌ Erro crítico na busca:", e.message);
    }

    console.log("🏁 Busca finalizada!");
    await browser.close();
}

module.exports = { startScraping };