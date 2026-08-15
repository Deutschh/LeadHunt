# AGENTS.md — LeadHunt

## 1. Papel do Codex neste repositório

Você é o executor de engenharia do LeadHunt. Trabalhe em blocos pequenos, revisáveis e testáveis.

Arquitetura, decisões de produto, escopo de cada etapa e decisões visuais são definidos fora do Codex. Não expanda o escopo por iniciativa própria.

## 2. Antes de qualquer alteração

Sempre:

1. Leia este `AGENTS.md`.
2. Inspecione os arquivos realmente envolvidos na tarefa.
3. Execute `git status` e identifique a branch atual.
4. A branch esperada durante a evolução multiusuário é `feature/multiuser-v1`.
5. Se estiver em `main`, em outra branch inesperada, ou houver alterações não relacionadas que possam ser sobrescritas, PARE e informe antes de editar.
6. Preserve alterações existentes do usuário. Nunca use reset/revert/checkout destrutivo para limpar mudanças sem autorização explícita.

## 3. Regra de escopo

- Implemente somente o bloco solicitado no prompt atual.
- Não implemente a etapa inteira do roadmap se o prompt pedir apenas uma subetapa.
- Não aproveite a tarefa para fazer refactors amplos, reorganizações ou "melhorias" não solicitadas.
- Se encontrar algo importante fora do escopo, registre no relatório em `DESCOBERTAS FORA DO ESCOPO` e não implemente.
- Se uma dependência real impedir a tarefa, explique e pare a parte bloqueada em vez de improvisar arquitetura.

## 4. Regras críticas de multi-tenancy

- `workspace_id` é a unidade de isolamento de dados.
- O frontend nunca é fonte confiável para determinar `workspace_id`.
- Nesta fase transitória, o workspace vem de `req.workspaceId`, definido no servidor.
- Futuramente ele virá do usuário/device autenticado.
- Nunca autorize acesso a um objeto apenas por `id`.
- Para entidades do cliente, use `id + workspace_id` ou valide ownership equivalente.
- Acesso a objeto pertencente a outro workspace deve se comportar como `404`, sem revelar que o objeto existe.
- Inserts em tabelas de dados do cliente devem gravar `workspace_id` explicitamente sempre que o fluxo já estiver migrado.
- Não criar novo fallback global que possa misturar dados entre workspaces.
- Não remover o `DEFAULT 1` legado do banco até uma tarefa específica autorizar isso.
- Não criar Workspace 2 real sem tarefa explícita.

## 5. Banco e migrations

- O Codex pode CRIAR e EDITAR migrations SQL, scripts de verificação e rollback quando solicitado.
- NUNCA execute migrations no Neon, produção ou qualquer banco remoto.
- NUNCA execute rollback no Neon/produção.
- NUNCA use `DATABASE_URL` para acessar o banco remoto.
- NUNCA leia, copie, mostre ou altere secrets de `.env`.
- Não alterar dados reais para "testar".
- Se uma migration for necessária, entregue:
  - migration;
  - verificação somente leitura;
  - rollback quando viável;
  - instruções exatas para execução manual.
- Mudanças destrutivas exigem aviso explícito no relatório.

## 6. Agent / Worker

Arquitetura definitiva:

- Cloud/API é a única camada autorizada a acessar PostgreSQL e secrets de IA.
- LeadHunt Agent nunca deve possuir `DATABASE_URL`.
- LeadHunt Agent nunca deve possuir chave da OpenAI.
- Operações dependentes de Chrome/Puppeteer/WhatsApp/Google Maps serão locais no Agent.
- Não antecipe a migração Worker -> Agent fora da etapa solicitada.
- Health checks locais ainda podem existir temporariamente na API legada enquanto a etapa Agent não for executada; não redesenhe isso sem solicitação.

## 7. Socket.io

- Não criar novos broadcasts globais específicos de cliente.
- Na futura migração, eventos específicos devem ser isolados por workspace/device.
- Não refatorar Socket.io antecipadamente fora da tarefa correspondente.

## 8. UI/UX

O Codex NÃO é responsável por inventar o design do LeadHunt.

Pode:
- implementar uma interface quando houver especificação visual clara;
- conectar UI existente a APIs;
- corrigir estados técnicos, loading, erro, acessibilidade e responsividade quando explicitamente solicitado.

Não pode por iniciativa própria:
- redesenhar telas;
- escolher nova identidade visual;
- criar layouts importantes;
- alterar hierarquia visual;
- mudar copy comercial;
- decidir componentes principais.

Se uma tarefa exigir decisão visual não especificada:
1. não invente a solução;
2. implemente apenas o backend/lógica independente, se possível;
3. crie no relatório a seção `PENDÊNCIA VISUAL`, explicando:
   - tela/componente necessário;
   - objetivo;
   - dados necessários;
   - estados necessários;
   - pontos de integração;
   - decisão visual que falta.

## 9. Laboratório

- O módulo Laboratório está fora do escopo da V1 multiusuário.
- Não expandir, migrar ou redesenhar o Laboratório.
- Se alguma alteração transversal tocar nele inevitavelmente, preserve compatibilidade e registre no relatório.

## 10. Briefing

- Na V1 inicial, o briefing público usará identidade padrão LeadHunt.
- Não implementar branding individual por workspace nesta fase sem tarefa específica.
- O acesso público futuro deve usar token imprevisível/revogável, nunca apenas `lead_id`.

## 11. Código e compatibilidade

- Preserve CommonJS onde a API atual usa CommonJS.
- Evite dependências novas sem necessidade.
- Não instalar dependência de produção sem autorização explícita.
- Preserve contratos atuais do frontend quando a tarefa não exigir mudança de contrato.
- Evite renomeações físicas de tabelas/rotas fora de migrations planejadas.
- `velaris_services` só será renomeada fisicamente em etapa específica.
- `sale_value` é o campo de receita/venda existente; não criar `deal_value`.

## 12. Testes e validação

Antes de encerrar:

1. Inspecione os scripts disponíveis no `package.json`. Não assuma que `npm test` é válido.
2. Rode apenas verificações relevantes e seguras que já existam ou que possam ser executadas sem acessar produção.
3. Se não houver suíte automatizada adequada, faça validações estáticas/sintáticas e descreva testes manuais.
4. Não iniciar automação real de WhatsApp, follow-ups ou envios apenas para testar código.
5. Não disparar mensagens reais.
6. Não executar operações destrutivas.
7. Se um teste falhar, tente corrigir dentro do escopo. Não esconda a falha.

## 13. Git

Por padrão, o Codex pode:
- inspecionar `git status`;
- inspecionar diff;
- editar arquivos;
- rodar testes.

Por padrão, o Codex NÃO pode:
- `git commit`;
- `git push`;
- `git merge`;
- trocar para `main`;
- apagar branches/tags;
- reescrever histórico.

Somente faça essas operações se o prompt atual autorizar explicitamente.

## 14. Secrets e arquivos sensíveis

Nunca incluir em relatório, diff ou novos arquivos:
- `.env`;
- chaves/API keys;
- `DATABASE_URL`;
- cookies;
- sessões de navegador;
- `user_data`;
- perfis Chrome reais;
- tokens;
- backups completos de dados.

Não adicionar `node_modules`, perfis locais ou arquivos de sessão ao Git.

## 15. Definição de pronto

Uma tarefa só está pronta quando:

- o escopo solicitado foi implementado;
- nenhuma alteração fora do escopo foi feita sem justificativa;
- ownership/workspace foi verificado quando aplicável;
- verificações relevantes foram executadas;
- o diff foi revisado;
- há instruções claras de teste manual;
- pendências e riscos foram registrados;
- nenhum commit/push foi feito sem autorização.

## 16. Relatório obrigatório

Toda implementação deve terminar com exatamente estas seções:

### RELATÓRIO DE IMPLEMENTAÇÃO

#### 1. Objetivo executado
Explique de forma objetiva o bloco implementado.

#### 2. Arquivos alterados
Para cada arquivo:
- caminho;
- por que foi alterado;
- principais mudanças.

#### 3. Arquivos criados/removidos
Liste e justifique. Se nenhum, diga `Nenhum`.

#### 4. Banco / migrations
Informe:
- se houve mudança de schema;
- migration criada;
- migration executada: deve ser `NÃO`, salvo autorização explícita;
- instruções manuais necessárias.

#### 5. Workspace e segurança
Explique como ownership/isolamento foi preservado e qualquer risco restante.

#### 6. Alterações funcionais
Descreva o comportamento antes/depois.

#### 7. Testes automáticos/verificações executadas
Para cada comando:
- comando;
- resultado;
- falhas conhecidas.

#### 8. Testes manuais obrigatórios
Forneça passos numerados, resultado esperado e como reverter dados de teste.

#### 9. PENDÊNCIA VISUAL
Use `Nenhuma` se não houver.
Se houver, descreva sem inventar design.

#### 10. Descobertas fora do escopo
Liste o que encontrou e deliberadamente não alterou.

#### 11. Riscos / observações
Inclua compatibilidade, dívida técnica temporária e pontos para próxima etapa.

#### 12. Resumo do diff
Informe quantidade de arquivos modificados/criados/removidos e resumo curto.

#### 13. Git
Informe:
- branch detectada;
- working tree antes;
- working tree depois;
- commit realizado: SIM/NÃO;
- push realizado: SIM/NÃO.
