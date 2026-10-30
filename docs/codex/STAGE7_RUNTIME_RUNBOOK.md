# Etapa 7 — contrato, validação e operação

## Limites

Esta entrega é a fundação Cloud de jobs e runtime distribuído. Não provisiona
devices em produção, não cria Workspace 2 real e não ativa producers comerciais.
Os executores dos testes são sintéticos: nenhum teste inicia Chrome, Puppeteer,
WhatsApp, Maps, OpenAI ou envio. O Agent instalável/API-only é da Etapa 8;
pairing, emissão definitiva de credenciais e um computador ativo são da 9;
perfis são da 10; integração comercial e controles finais são da 11.

A API continua CommonJS e utiliza as dependências já existentes. O consumer de
teste comunica-se por HTTP/Socket.io; não recebe PostgreSQL ou secrets de IA.
O gateway Socket.io deve ter **uma única instância** nesta entrega. Rooms não
possuem adapter entre processos; múltiplos gateways exigem trabalho específico.

## Regra V1 de concorrência

`ux_jobs_v1_active_lane` permite uma execução leased/running por workspace/lane.
É uma **política da V1**, não uma limitação arquitetural permanente. Uma futura
migration explícita poderá substituí-la por lanes/limites por perfil quando o
paralelismo por perfis for introduzido. Não remover o índice isoladamente: a
política de pacing, reservas e testes de concorrência também deve evoluir.

`search` usa lane `search`; `send_message` e `followup` usam `automation`.
O cliente não determina workspace nem escolhe uma room ou identidade de device.

## Estado, lease e retry

- Job: queued → leased → running → completed/failed/cancelled.
- Claim cria attempt e incrementa o contador na mesma transação, com bloqueio da
  lane e `FOR UPDATE SKIP LOCKED`. Uma resposta de claim perdida ainda consome
  uma das três tentativas. Renovações e replays não criam attempts.
- Lease: 90s; consumer renova a cada 20s, explicitamente. Heartbeat não renova.
- Heartbeat: 15s; frescor máximo 45s. Sessão stale não pode ser ressuscitada por
  heartbeat: reconectar e autenticar novamente. Disconnect não apaga jobs.
- Deadline: busca 30min; envio/follow-up 5min, mesmo havendo heartbeat/renew.
- Reaper Cloud a cada 5s, lotes de até 100. Retry: 30s exponencial, jitter até
  20%, teto 15min, no máximo três tentativas. available_at é persistido.
- Prazo, identidade da tentativa, device, sessão, estado e workspace são
  verificados sob transação. Relógio de autoridade: PostgreSQL.
- Cancel de queued/leased é imediato. Running recebe cancel_requested_at; novos
  efeitos são recusados, mas recibos de efeitos já iniciados podem chegar. Uma
  conclusão concorrente de trabalho efetivamente concluído pode vencer o cancel.
- Cancelamento não reabre estado terminal nem reescreve attempts já encerrados.

Falha transitória segura pode reabrir a fila; falha definitiva não. Efeito
iniciado sem recibo gera `EFFECT_OUTCOME_UNKNOWN`, terminal e sem reenvio.
Recibos completos permitem finalizar persistência após a queda sem repetir envio.
Reconciliação de resultado incerto exige evidência e intervenção Cloud; esta
entrega deliberadamente não expõe um botão/endpoint de reenvio ou de override.

## Idempotência e efeitos

Producers são funções Cloud internas; não há POST público genérico de criação.
Mesma idempotency_key/fingerprint retorna o mesmo job; conteúdo diferente dá 409.
Payloads são validados por tipo e limitados a 16KiB no banco; resultados têm
allowlist e limite de 2KiB. Erros contêm somente códigos e resumos controlados.

Chave de efeito é derivada no servidor: envio por lead/versão da mensagem;
follow-up por lead/etapa/vencimento; segmento por ordinal. A hash de mensagem
usa `jobPolicy.fingerprint`, isto é, SHA-256 do JSON canônico. O texto não é
recebido livremente pelo endpoint de efeito. Não incluir secrets no payload.

1. Chamar start com attemptId atual.
2. Chamar begin para o ordinal autorizado. Executar localmente **somente** se
   execute=true nessa resposta. Se a resposta se perder, não presumir permissão.
3. Se begin retornar execute=false/acknowledged, reutilizar o recibo e pular o
   segmento. started/uncertain não autoriza uma segunda execução.
4. Depois do efeito confirmado, enviar ack com result.outcome=applied.
5. Chamar complete com resultado resumido. Replays equivalentes são inócuos.

Segments são sequenciais. Efeitos reconhecidos sobrevivem ao retry do job.
Contadores, transições protegidas de lead, evento de envio e conclusão Cloud
comitam uma única vez. Mudança manual de status/resposta/arquivamento não é
sobrescrita pela conclusão. Leads usam a constraint existente por workspace/phone.
A ingestão completa dos resultados reais de busca permanece na Etapa 8/11.

Não existe transação atômica PostgreSQL/WhatsApp Web. Não prometer exactly-once
no navegador: um efeito incerto fica rastreável e bloqueado para reconciliação.

## HTTP e Socket.io

Web: GET /api/jobs, GET /api/jobs/:id, GET /api/jobs/:id/attempts,
POST /api/jobs/:id/cancel. Todas exigem Auth **e** requireOperationalAccess:
pending, suspended e workspace inativo não operam jobs. /account é independente.
Listas são limitadas a 100 jobs recentes; os endpoints por ID permitem consultar
o restante do histórico. Respostas web não incluem payload, credenciais ou keys.

Agent: POST /api/agent/jobs/claim com lane; POST /:id/start, renew, complete,
fail com attemptId; POST /:id/effects/:ordinal/begin ou ack. Bearer do device e
header X-LeadHunt-Runtime-Session são exigidos. Autenticação é repetida e a sessão
deve estar conectada/fresca. Nenhuma operação confia em workspaceId/deviceId do
body. Cross-workspace dá 404; lease stale no contexto autorizado dá 409.

Socket /agent: handshake.auth contém deviceToken e agentVersion. O backend
resolve workspace/device e devolve runtime:ready com sessionId e intervalos.
runtime:heartbeat aceita agentVersion, status online/degraded/updating e
runtimeState idle/busy/paused. Uma conexão começa pausada até o primeiro heartbeat.
Updating/paused não admite claim/start/novo efeito. Uma tentativa já em execução
pode renovar, reconhecer efeito anterior, falhar ou concluir graciosamente,
sempre com sessão fresca, credencial operacional e lease válido. Valores
reportados não removem pausa Cloud.

Socket /workspace: accessToken web, identidade atual e gate operacional.
Rooms workspace:<id> e device:<id> são preenchidas pelo servidor. Join livre é
recusado. Namespace raiz e eventos operacionais legados não autorizam execução.
jobs:available é apenas hint; o consumer deve consultar claim periodicamente
(5s com jitter até 1s), mesmo sem notificação, para jobs futuros/retries e hints
perdidos. Essa obrigação será mantida pelo runtime da Etapa 8. job:updated inclui
updatedAt e é sinal para reler a API, sem aplicar estado atrasado cegamente.
job:updated e device:status levam metadados mínimos
ao workspace autorizado. Há snapshot de presença ao conectar o web client e
revalidação antes de emissão. Sem transmissão global de dados de cliente.

Rotas e sockets novos falham fechados sem schema. Aplicar migrations não ativa
automaticamente um gateway que iniciou indisponível: reiniciar a API depois.

## Pausa e backlog

O controle Cloud por lane persiste pausa e next_dispatch_at. Claim é unitário,
sem prefetch. Pausa não apaga agendamento. Uma unidade já autorizada pode
concluir; disconnect impede nova autorização de efeito. Cooldown é contado
também a partir do término/falha, sem créditos acumulados enquanto offline.

Fila usa scheduled_at, created_at e id entre jobs disponíveis. Trabalho com
impedimento temporário é adiado sem consumir attempt, evitando bloquear toda a
lane; trabalho obsoleto é cancelado. Checam-se status/resposta/arquivamento,
vencimento/etapa, quotas e estado do remetente, janela e timezone, is_active,
followup_enabled e intervalo. followups_per_cycle=0 bloqueia follow-up; a montagem
de ciclos mistos e seus lotes comerciais completos é integração da Etapa 11.
O producer final não pode gerar mais itens por ciclo do que a configuração prevê.

Não se convertem timestamps antigos nem se redesenha o reset diário legado.
Os contadores existentes são tratados conservadoramente; sua semântica de
timezone/reset será consolidada com os contratos e integração das Etapas 8/11.

## Ponte do Worker legado

O entrypoint legado exige LEGACY_WORKSPACE_ID explicitamente igual ao workspace
interno reservado (1), validado por slug internal-main, canal internal e conta
operacional. Não há fallback para outro workspace. Essa é uma restrição da ponte,
não uma regra de autorização dos novos devices.

O Worker retém banco direto SOMENTE na máquina interna confiável, sem distribuição.
Usa advisory lock de sessão dedicado e recusa segundo runner. Ao perder o lock,
não inicia novos efeitos e exige reinício manual. Nenhum socket antigo é conectado.
Queries, números, atividades, follow-ups, resets e scraper têm workspace explícito.
Logs do navegador não são retransmitidos; erros persistidos são códigos controlados.

Antes de provisionar qualquer device operacional no futuro: parar/drenar o Worker,
reconciliar envios incertos, confirmar ausência de processo antigo e só então
fazer cutover. A ponte recusa execução quando encontra credencial de device ativa
no workspace interno. Sua remoção é responsabilidade das Etapas 8/11.

## Validação local reproduzível

No diretório Api:

    node --test test/stage7Policy.test.js test/stage7WebRoutes.test.js test/stage7Legacy.test.js
    npm run test:stage7:postgres
    node --require ./test/helpers/safeTestEnvironment.js --test "test/*.test.js"

No diretório App:

    npm test

O runner PostgreSQL usa C:\Program Files\PostgreSQL\17\bin no Windows ou
/usr/lib/postgresql/17/bin no Linux. LEADHUNT_TEST_PG_BIN pode apontar para outro
diretório de binários 17+. Ele cria seu próprio cluster temporário, bind exclusivo
em 127.0.0.1/porta efêmera, usuário/banco de teste fixos e auth local descartável.
Não lê .env, DATABASE_URL, configuração da instância existente ou banco remoto.
Aplica baseline e 001–008 APENAS nesse cluster, verifica rollback vazio e recusa
rollback com uso. Cleanup para o cluster e remove somente o diretório que criou.
Ausência de PostgreSQL é erro BLOQUEANTE, nunca skip aprovado. Não rodar como root.

O cenário dos 80 follow-ups executa requests HTTP reais e efeitos sintéticos.
Para não esperar 40 minutos, só os timestamps de despacho das fixtures são
avançados; após cada conclusão há assert de cooldown persistido e de claim
imediato recusado. Também se testam dois consumers A/B simultâneos, perda de
sessão, reclaim, efeitos incertos, replays e corridas no PostgreSQL real.

Revisar git diff --check e node --check nos JS alterados. App lint/build somente
se o frontend for alterado. Não existe lint/build da API no package atual.

## Migrations manuais — operador, não automação remota

Nenhum comando desta entrega executa SQL remoto. Em janela de manutenção,
o operador usa sua conexão administrativa já configurada, sem copiar secrets:

1. Confirmar branch/backup e versão 006 aplicada; revisar os seis arquivos novos.
2. Executar integralmente 007_jobs_core_foundation.sql.
3. Executar 007_verify.sql; todos os indicadores devem ser true.
4. Executar integralmente 008_distributed_runtime_foundation.sql.
5. Executar 008_verify.sql; todos os indicadores devem ser true.
6. Reiniciar API; verificar Auth/Conta/Admin e rotas existentes. Não criar devices,
   Workspace 2 ou jobs comerciais para validar esta fase.

Rollback: somente enquanto estruturas novas estiverem vazias e sem migrations
posteriores, executar 008_rollback.sql e depois 007_rollback.sql. São DDLs
destrutivos, com guards: qualquer uso aborta. Se já houver dados, preservar schema,
parar o novo runtime e preparar correção aditiva; não apagar recibos/histórico.

## Logs, review e retenção

Eventos mínimos: claim/start/complete/fail/cancel, lease expired, retry scheduled,
device online/offline e socket rejected. Somente IDs operacionais, estado e erro
controlado; sem conversa, conteúdo comercial, headers, tokens ou stack bruta.
Heartbeat é snapshot; renew/heartbeat bem-sucedidos não geram stream de logs.
Attempts são limitados por job. Não purgar automaticamente recibos e chaves de
idempotência; política abrangente de retenção/observabilidade é da Etapa 14.

O review P0–P3 deve incluir concorrência, isolamento, efeitos, autenticação,
histórico imutável, pacing e legado. Corrigir findings acionáveis e repetir os
testes afetados antes de declarar os Gates A/B e a etapa concluídos.

### Review desta implementação (2026-10-30)

P0: nenhum encontrado. Findings P1/P2 corrigidos e cobertos por regressão:

- cooldown contado também no término, impedindo burst depois de execução longa;
- heartbeat expirado não reativa sessão antiga; primeiro online requer heartbeat;
- conflitos de lease retornam 409, sem confundir validação de input com conflito;
- cancel de retry não reescreve o histórico do attempt encerrado;
- fila com remetente temporariamente indisponível não bloqueia toda a lane;
- start que encontra impedimento transitório reagenda; não descarta o job;
- ack aceita somente efeito confirmado como aplicado;
- pausa bloqueia admissão, permitindo finalizar graciosamente tentativa válida;
- eventos do legado usam ownership explícito e updates não regridem status manual;
- shutdown aguarda desconexões e snapshot não confunde handshake com heartbeat.
- dependência de persistência removida após ack gera falha explícita com recibo,
  sem prender lease vencido ou interromper a recuperação dos demais jobs.

Não há finding acionável P0–P3 deixado aberto dentro do escopo. Limites futuros
(pairing, runtime instalável, ingestão completa de busca, ciclos comerciais,
timezone histórica e múltiplos gateways) permanecem delimitados acima.
