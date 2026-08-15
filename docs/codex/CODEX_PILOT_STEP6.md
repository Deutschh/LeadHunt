# LEADHUNT — CODEX PILOT STEP 6

Leia primeiro o `AGENTS.md` da raiz e siga todas as regras dele.

## Contexto do planejamento

Etapa: ETAPA 3 — Workspace e Migração Multiusuário
Bloco: Step 6 — geração em massa de IA + dashboard/stats
Progresso antes: aproximadamente 58%
Progresso esperado após validação manual: aproximadamente 66%

As Steps anteriores já:
- criaram Workspace 1;
- adicionaram `workspace_id` às tabelas legadas;
- criaram contexto temporário `req.workspaceId`;
- isolaram Home Notes;
- isolaram rotas principais de leads;
- isolaram update/scoring/eventos/atividades;
- migraram niches e automation_settings;
- migraram sending_numbers;
- trocaram unicidades globais relevantes por unicidades por workspace.

## Objetivo único desta execução

Isolar por workspace:
1. geração em massa de mensagens IA;
2. consulta da última geração IA;
3. métricas do dashboard.

Preservar exatamente os contratos HTTP atuais para o frontend do Workspace 1.

## Arquivos permitidos

Principal:
- `Api/src/routes/leads.js`

Pode LER, mas não alterar sem necessidade estritamente comprovada:
- `Api/src/services/aiService.js`
- `Api/src/database/db.js`
- `Api/src/middleware/legacyWorkspaceContext.js`
- arquivos do frontend que consomem esses endpoints.

Não alterar outros arquivos apenas por oportunidade de refactor.

## Deve implementar

### A. POST `/api/leads/generate-ai-mass`

- Obter `const workspaceId = req.workspaceId`.
- A seleção inicial de leads deve obrigatoriamente incluir `workspace_id = workspaceId`.
- Manter os filtros existentes:
  - status;
  - is_ai_ready;
  - is_archived;
  - rating;
  - category/categories;
  - random;
  - limit.
- Não mudar a estratégia/copy da IA nesta Step.
- `ai_prompt_configs` permanece GLOBAL nesta fase.
- Ao atualizar cada lead gerado, exigir:
  - `id = lead.id`;
  - `workspace_id = workspaceId`.
- Se um lead deixar de pertencer ao workspace ou não for atualizado, não adicionar `undefined` a `generatedLeads`; tratar de forma segura e registrar erro.
- Não aceitar workspace_id do body/query/header.

### B. GET `/api/leads/generate-ai-mass/last`

- Buscar o último `ai_generation_batch_id` apenas entre leads do workspace atual.
- Ao buscar os leads daquele batch, exigir também `workspace_id = workspaceId`.
- Workspace sem geração deve retornar o mesmo formato atual de resposta vazia.
- Um `batch_id` coincidentemente igual em outro workspace jamais pode misturar resultados.

### C. GET `/api/leads/stats/dashboard`

- Todas as consultas sobre `leads` devem filtrar `workspace_id = workspaceId`.
- Isso inclui:
  - core stats;
  - nichos;
  - prompts/copies.
- Manter `ai_prompt_configs` como tabela global e preservar o LEFT JOIN atual.
- Preservar:
  - `period`;
  - `includeArchived`;
  - shape atual da resposta;
  - cálculos atuais de response_rate, interest_rate e conversion_rate.
- Não redesenhar métricas nesta Step.
- Não alterar timezone nesta Step; apenas registrar a questão de `CURRENT_DATE` em `Descobertas fora do escopo` se ainda existir.

## Não deve implementar

- identidade comercial por workspace;
- alteração do prompt da IA;
- consumo/AI usage;
- service opportunities;
- previews;
- briefing;
- follow-ups;
- Worker/Agent;
- Socket.io;
- autenticação;
- Workspace 2;
- remoção do DEFAULT 1;
- UI;
- Laboratório;
- refactor geral de `leads.js`.

## Banco

Não há migration planejada para esta Step.

Se concluir que uma migration é indispensável:
- NÃO execute nada;
- pare essa parte;
- explique por que seria necessária.

## Segurança

O frontend não pode escolher workspace.

O resultado esperado para um contexto sem dados (`LEGACY_WORKSPACE_ID=999`) é:
- geração em massa encontra zero leads;
- última geração retorna batch nulo/lista vazia;
- dashboard retorna métricas zeradas/vazias;
- nenhuma operação acessa ou atualiza leads do Workspace 1.

## Validações obrigatórias do Codex

Antes:
- `git status`;
- confirmar branch `feature/multiuser-v1`;
- se houver alterações não relacionadas, não sobrescrevê-las.

Depois:
- verificar sintaxe do(s) arquivo(s) Node alterado(s), usando mecanismo seguro disponível;
- inspecionar os scripts do package.json antes de escolher qualquer comando de teste;
- não rodar automação real;
- não chamar OpenAI apenas para teste;
- não executar health checks reais;
- revisar o diff final;
- confirmar que as três rotas têm filtro explícito por workspace em todas as queries de `leads`.

## Testes manuais que devem constar no relatório

Forneça instruções exatas para:

### Workspace 1
1. abrir Dashboard e comparar métricas;
2. consultar última geração de IA;
3. realizar geração IA apenas se o usuário decidir que é seguro — não execute você;
4. verificar no Neon manualmente, se necessário, que leads atualizados pertencem ao workspace 1.

### Workspace 999
1. configurar temporariamente `LEGACY_WORKSPACE_ID=999`;
2. reiniciar API;
3. validar Dashboard zerado;
4. validar última geração vazia;
5. validar que gerar IA retorna nenhum lead e NÃO chama a IA;
6. voltar para Workspace 1.

Não altere `.env`; apenas descreva o teste.

## Git

NÃO faça commit.
NÃO faça push.
NÃO faça merge.

## Saída obrigatória

Entregue o `RELATÓRIO DE IMPLEMENTAÇÃO` completo definido no `AGENTS.md`.

Além do relatório, comece a resposta final com:

`STATUS: PRONTO PARA TESTE MANUAL`

ou, se algo estiver bloqueado:

`STATUS: BLOQUEADO — NÃO TESTAR AINDA`
