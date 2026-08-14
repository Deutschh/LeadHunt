/**
 * Contexto de workspace temporário da fase de migração.
 *
 * IMPORTANTE:
 * - Não lê workspace_id do frontend.
 * - Não aceita header/query/body para escolher workspace.
 * - Enquanto não existe autenticação, toda a API opera no Workspace 1.
 * - Depois, este middleware será substituído pelo contexto derivado do
 *   usuário/device autenticado.
 */
function legacyWorkspaceContext(req, res, next) {
  const rawWorkspaceId = process.env.LEGACY_WORKSPACE_ID || "1";
  const workspaceId = Number.parseInt(rawWorkspaceId, 10);

  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    console.error(
      "❌ LEGACY_WORKSPACE_ID inválido. Configure um inteiro positivo.",
    );

    return res.status(500).json({
      error: "Configuração de workspace inválida no servidor.",
    });
  }

  req.workspaceId = workspaceId;
  req.workspace = {
    id: workspaceId,
    source: "legacy-server-context",
  };

  next();
}

module.exports = legacyWorkspaceContext;
