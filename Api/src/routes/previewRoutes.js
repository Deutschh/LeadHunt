const express = require("express");
const { randomUUID } = require("crypto");
const router = express.Router();
const db = require("../database/db");

function generateSlug(projectName) {
  const base = String(projectName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "preview";

  return `${base}-${randomUUID()}`;
}

router.get("/", async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    const result = await db.query(
      `
        SELECT *
        FROM preview_projects
        WHERE workspace_id = $1
        ORDER BY created_at DESC
      `,
      [workspaceId],
    );

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
    const workspaceId = req.workspaceId;
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
    const slug = generateSlug(project_name);

    const result = await db.query(
      `
      INSERT INTO preview_projects (
        workspace_id,
        slug,
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
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
      `,
      [
        workspaceId,
        slug,
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
