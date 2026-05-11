const express = require("express");
const router = express.Router();
const db = require("../database/db");

router.get("/", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM preview_projects
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Erro ao buscar previews",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      project_name,
      niche,
      city,
      template_key,
      whatsapp,
      instagram,
      primary_color,
      headline,
      subheadline,
    } = req.body;

    const result = await db.query(
      `
      INSERT INTO preview_projects (
        project_name,
        niche,
        city,
        template_key,
        whatsapp,
        instagram,
        primary_color,
        headline,
        subheadline
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
      `,
      [
        project_name,
        niche,
        city,
        template_key,
        whatsapp,
        instagram,
        primary_color,
        headline,
        subheadline,
      ],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erro ao criar preview",
    });
  }
});

module.exports = router;    