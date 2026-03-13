require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./database/db");
const { startScraping } = require("./services/scraper");

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares ---
app.use(cors()); // Permite que o seu React acesse a API
app.use(express.json()); // Permite que a API entenda JSON no corpo das requisições

// --- Rotas de Monitoramento ---

// 1. Verificação básica de saúde da API
app.get("/", (req, res) => {
  res.json({
    message: "LeadHunt API online! 🚀",
    status: "OK",
  });
});

// 2. Teste real de conexão com o Neon DB
app.get("/test-db", async (req, res) => {
  try {
    const result = await db.query("SELECT NOW()");
    res.json({
      status: "Conectado ao Neon DB com sucesso!",
      server_time: result.rows[0].now,
    });
  } catch (err) {
    console.error("Erro no banco:", err);
    res.status(500).json({ error: "Falha na conexão com o banco de dados." });
  }
});

// --- Rotas de Negócio (LeadHunt) ---

// 3. Iniciar o Robô Scraper
// Exemplo de uso: POST para /run-scraper com { "location": "São Bernardo do Campo" }
app.post("/run-scraper", async (req, res) => {
  const { niche, location, limit, minRating } = req.body;

  if (!location) {
    return res
      .status(400)
      .json({ error: "Nicho e localização são obrigatórios." });
  }

  // O robô roda de forma assíncrona (não "trava" a resposta da API)
  // Ele vai salvando os leads no banco enquanto você faz outras coisas
  startScraping({
    niche,
    location,
    limit: parseInt(limit) || 10,
    minRating: parseFloat(minRating) || 0,
  }).catch((err) => console.error(`[LeadHunt] Erro:`, err));

  res.json({ message: "O robô LeadHunt foi lançado com sucesso! 🚀" });
});

app.post("/settings/selectors", async (req, res) => {
  const { tags } = req.body;
  try {
    await db.query(
      "INSERT INTO scraper_config (selector_type, tags) VALUES ('business_name', $1) " +
        "ON CONFLICT (selector_type) DO UPDATE SET tags = EXCLUDED.tags",
      [tags],
    );
    res.json({ message: "Seletores atualizados com sucesso!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao salvar seletores." });
  }
});

// 4. Listar todos os leads encontrados
app.get("/leads", async (req, res) => {
  try {
    // Busca os leads mais recentes primeiro
    const result = await db.query(
      "SELECT * FROM leads ORDER BY created_at DESC, id DESC",
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar leads:", err);
    res.status(500).json({ error: "Erro ao carregar lista de leads." });
  }
});

// 5. Atualizar o status de um lead (Ex: marcou como 'contacted' no dashboard)
// Atualizar o status de um lead (ex: de 'pending' para 'contacted')
// 5. Atualizar o status de um lead
app.patch("/leads/:id", async (req, res) => {
  const { id } = req.params;
  const { status, interest_level } = req.body;

  try {
    const result = await db.query(
      "UPDATE leads SET status = COALESCE($1, status), interest_level = COALESCE($2, interest_level) WHERE id = $3 RETURNING *",
      [status, interest_level, id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Lead não encontrado." });
    }

    // Retorna o lead atualizado
    res.json({ message: "Lead atualizado com sucesso!", lead: result.rows[0] });
  } catch (err) {
    console.error("Erro ao atualizar status:", err);
    res
      .status(500)
      .json({ error: "Erro interno ao atualizar o banco de dados." });
  }
});

// --- Inicialização do Servidor ---
app.listen(PORT, () => {
  console.log(`--------------------------------------------------`);
  console.log(`✅ LeadHunt API rodando na porta ${PORT}`);
  console.log(`🔗 Teste o servidor em: http://localhost:${PORT}`);
  console.log(`--------------------------------------------------`);
});
