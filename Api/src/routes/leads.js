const express = require("express");
const router = express.Router();
const db = require("../database/db");
const { generateLeadMessage } = require("../services/aiService");

// 1. Listar todos os leads (GET /api/leads)
router.get("/", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM leads ORDER BY created_at DESC, id DESC",
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao carregar lista:", err);
    res.status(500).json({ error: "Erro ao carregar lista de leads." });
  }
});

// ROTA: Listar todos os nichos estratégicos
router.get("/niches", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM niche_strategies ORDER BY niche_name ASC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar nichos." });
  }
});

// ROTA: Adicionar ou Atualizar um nicho
router.post("/niches", async (req, res) => {
  const { niche_name, hook, call_to_action } = req.body;
  try {
    const query = `
        INSERT INTO niche_strategies (niche_name, hook, call_to_action)
        VALUES ($1, $2, $3)
        ON CONFLICT (niche_name) 
        DO UPDATE SET hook = $2, call_to_action = $3
        RETURNING *;
      `;
    const result = await db.query(query, [niche_name, hook, call_to_action]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao salvar nicho." });
  }
});

// ROTA: Deletar um nicho
router.delete("/niches/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM niche_strategies WHERE id = $1", [
      req.params.id,
    ]);
    res.json({ message: "Nicho removido com sucesso." });
  } catch (err) {
    res.status(500).json({ error: "Erro ao deletar nicho." });
  }
});

// 2. Buscar detalhes de UM lead (GET /api/leads/:id)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query("SELECT * FROM leads WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Lead não encontrado" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/:id/activities
router.get("/:id/activities", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      "SELECT * FROM lead_activities WHERE lead_id = $1 ORDER BY created_at DESC",
      [id],
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao carregar histórico." });
  }
});

// Buscar notas ativas
router.get("/notes/active", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM home_notes WHERE expires_at >= CURRENT_DATE OR expires_at IS NULL ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar notas" });
  }
});

// Criar nova nota
router.post("/notes", async (req, res) => {
  const { title, content, expires_at } = req.body;
  try {
    const result = await db.query(
      "INSERT INTO home_notes (title, content, expires_at) VALUES ($1, $2, $3) RETURNING *",
      [title, content, expires_at || null],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao criar nota" });
  }
});

// Deletar nota
router.delete("/notes/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM home_notes WHERE id = $1", [req.params.id]);
    res.json({ message: "Nota removida" });
  } catch (err) {
    res.status(500).json({ error: "Erro ao deletar nota" });
  }
});

// 1. Rota para Verificar/Aprovar um lead para automação
router.patch("/:id/verify", async (req, res) => {
  const { id } = req.params;
  const { is_verified } = req.body;
  try {
    const result = await db.query(
      "UPDATE leads SET is_verified = $1 WHERE id = $2 RETURNING *",
      [is_verified, id],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao verificar lead." });
  }
});

// 2. Rota para buscar configurações de automação
router.get("/automation/settings", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM automation_settings WHERE id = 1",
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar configurações." });
  }
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    status,
    market_observation,
    internal_notes,
    services_offered,
    competitor_url,
    interest_level, // Pontuação manual (opcional)
    update_contact,
    deal_details,
    snooze_until,
    acquisition_cost,
    is_archived,
    name,
    is_verified,
    custom_message,
    ai_message_suggestion,
    is_ai_ready,
    lead_category,
    lead_city,
    // --- NOVOS CAMPOS PARA SCORING ---
    price_requested,
    preview_sent,
    sale_value
  } = req.body;

  try {
    // 1. Busca estado atual para comparar mudanças e evitar pontuação duplicada
    const oldRes = await db.query(
      "SELECT status, interest_level, price_requested, preview_sent FROM leads WHERE id = $1",
      [id]
    );

    if (oldRes.rowCount === 0) return res.status(404).json({ error: "Lead não encontrado." });
    const current = oldRes.rows[0];
    
    // 2. Lógica de Scoring Automático 
    let newScore = current.interest_level || 0;

    // Se o status mudou para 'responded' agora
    if (status === 'responded' && current.status !== 'responded') {
      newScore += 2;
    }

    // Se marcou que pediu preço agora
    if (price_requested === true && current.price_requested === false) {
      newScore += 3;
    }

    // Se enviou o preview agora
    if (preview_sent === true && current.preview_sent === false) {
      newScore += 2;
    }

    // 3. Update no Banco de Dados
    const query = `
      UPDATE leads 
      SET 
        status = COALESCE($1, status),
        market_observation = COALESCE($2, market_observation),
        internal_notes = COALESCE($3, internal_notes),
        services_offered = COALESCE($4, services_offered),
        competitor_url = COALESCE($5, competitor_url),
        interest_level = $6, -- Score atualizado
        last_contact = CASE WHEN $7 = true THEN NOW() ELSE last_contact END,
        deal_details = COALESCE($8, deal_details),
        snooze_until = COALESCE($9, snooze_until),
        acquisition_cost = COALESCE($10, acquisition_cost),
        is_archived = COALESCE($11, is_archived),
        name = COALESCE($12, name),
        is_verified = COALESCE($13, is_verified),
        custom_message = COALESCE($14, custom_message),
        ai_message_suggestion = COALESCE($15, ai_message_suggestion),
        is_ai_ready = COALESCE($16, is_ai_ready),
        lead_category = COALESCE($17, lead_category),
        lead_city = COALESCE($18, lead_city),
        price_requested = COALESCE($19, price_requested),
        preview_sent = COALESCE($20, preview_sent),
        sale_value = COALESCE($21, sale_value),
        responded_at = CASE WHEN $1 = 'responded' AND status != 'responded' THEN NOW() ELSE responded_at END,
        preview_sent_at = CASE WHEN $20 = true AND preview_sent = false THEN NOW() ELSE preview_sent_at END
      WHERE id = $22
      RETURNING *;
    `;

    const values = [
      status, market_observation, internal_notes,
      services_offered ? JSON.stringify(services_offered) : null,
      competitor_url, newScore, update_contact || false,
      deal_details ? JSON.stringify(deal_details) : null,
      snooze_until, acquisition_cost, is_archived, name, is_verified,
      custom_message, ai_message_suggestion, is_ai_ready,
      lead_category, lead_city, price_requested, preview_sent, sale_value, id
    ];

    const result = await db.query(query, values);
    const updatedLead = result.rows[0];

    // 4. Registrar Atividades para o CRM 
    if (newScore !== current.interest_level) {
      await db.query(
        "INSERT INTO lead_activities (lead_id, description, type) VALUES ($1, $2, $3)",
        [id, `Temperatura subiu: Lead atingiu ${newScore} pontos de interesse.`, "interest_change"]
      );
    }

    res.json({ message: "Lead atualizado e temperatura recalculada!", lead: updatedLead });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao processar atualização e scoring." });
  }
});

router.post("/generate-ai-mass", async (req, res) => {
  // Adicionamos 'category' aqui para receber o filtro do modal
  const { limit = 10, minRating = 0, status = "pending", category } = req.body;

  try {
    // A query agora filtra por categoria se ela for enviada
    let query = `
        SELECT * FROM leads 
        WHERE status = $1 
        AND is_ai_ready = false 
        AND is_archived = false 
        AND rating >= $2
      `;

    const queryParams = [status, minRating];

    if (category) {
      query += ` AND lead_category = $3`;
      queryParams.push(category);
    }

    query += ` ORDER BY rating DESC, reviews_count DESC LIMIT $${queryParams.length + 1}`;
    queryParams.push(limit);

    const leads = await db.query(query, queryParams);

    if (leads.rowCount === 0) {
      return res.json({
        message: "Nenhum lead encontrado com esses critérios.",
      });
    }

    for (let lead of leads.rows) {
      try {
        const suggestion = await generateLeadMessage(lead);

        // ATUALIZAÇÃO AQUI: Salvamos a sugestão também no 'custom_message'
        await db.query(
          `UPDATE leads 
       SET ai_message_suggestion = $1, 
           custom_message = $1,     -- Isso faz o lead já ter a mensagem pronta!
           is_ai_ready = true, 
           is_verified = true 
       WHERE id = $2`,
          [suggestion, lead.id],
        );
      } catch (aiErr) {
        console.error(`Erro no lead ${lead.id}:`, aiErr);
      }
    }

    res.json({
      success: true,
      count: leads.rowCount,
      message: `${leads.rowCount} leads processados com estratégia de nicho aplicada!`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro na geração inteligente." });
  }
});

// ROTA: Dashboard de Métricas Profissional (V3.0)
router.get("/stats/dashboard", async (req, res) => {
  const { period = "30" } = req.query; // Padrão 30 dias
  const interval = `${period} days`;

  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE status = 'contacted') as sent,
        COUNT(*) FILTER (WHERE status = 'responded') as replied,
        COUNT(*) FILTER (WHERE status = 'interested') as engaged,
        COUNT(*) FILTER (WHERE preview_sent = true) as previews,
        COUNT(*) FILTER (WHERE status = 'negociacao') as negotiation,
        COUNT(*) FILTER (WHERE status = 'fechado') as closed,
        SUM(sale_value) as total_revenue
      FROM leads
      WHERE (last_contact >= CURRENT_DATE - INTERVAL '${interval}' OR last_contact IS NULL)
    `);

    const s = stats.rows[0];
    const sent = parseInt(s.sent || 0);
    const replied = parseInt(s.replied || 0);
    const engaged = parseInt(s.engaged || 0);
    const closed = parseInt(s.closed || 0);

    // Cálculos de Taxas (%) [cite: 21, 202]
    const response_rate = sent > 0 ? (replied / sent) * 100 : 0;
    const interest_rate = replied > 0 ? (engaged / replied) * 100 : 0;
    const conversion_rate = sent > 0 ? (closed / sent) * 100 : 0;

    // Métricas por Nicho com Taxas [cite: 28, 100]
    const nicheStats = await db.query(`
      SELECT 
        lead_category as nicho, 
        COUNT(*) as leads,
        COUNT(*) FILTER (WHERE status = 'responded') as respostas,
        COUNT(*) FILTER (WHERE status = 'fechado') as vendas
      FROM leads 
      WHERE (last_contact >= CURRENT_DATE - INTERVAL '${interval}' OR last_contact IS NULL)
      GROUP BY lead_category 
      ORDER BY leads DESC
    `);

    res.json({
      core: { ...s, response_rate, interest_rate, conversion_rate },
      niches: nicheStats.rows.map((n) => ({
        ...n,
        taxa_res:
          n.leads > 0 ? ((n.respostas / n.leads) * 100).toFixed(1) + "%" : "0%",
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
