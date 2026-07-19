const express = require("express");
const router = express.Router();
const db = require("../database/db");

/**
 * GET /api/service-opportunities/services
 *
 * Retorna o catálogo ativo de serviços da Velaris.
 */
router.get("/services", async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
        service_key,
        service_name,
        service_type,
        problem_category,
        description,
        how_it_works,
        problems_solved,
        target_niches,
        is_active,
        display_order,
        created_at,
        updated_at
      FROM velaris_services
      WHERE is_active = TRUE
      ORDER BY display_order ASC, service_name ASC
    `);

    return res.json({
      success: true,
      count: result.rowCount,
      services: result.rows,
    });
  } catch (error) {
    console.error("Erro ao carregar catálogo de serviços:", error);

    return res.status(500).json({
      success: false,
      error: "Erro ao carregar o catálogo de serviços.",
    });
  }
});

module.exports = router;