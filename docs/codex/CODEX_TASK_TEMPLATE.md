# TEMPLATE — Tarefa Codex do LeadHunt

Use este formato para cada bloco. Não substitua o `AGENTS.md`; este arquivo só define o escopo da tarefa atual.

## Contexto do planejamento

Etapa:
Subetapa/bloco:
Progresso antes:
Progresso esperado depois:

## Objetivo único desta execução

[Descrever um resultado pequeno e verificável.]

## Arquivos/áreas permitidos

- [caminho]
- [caminho]

Você pode ler outros arquivos para entender dependências, mas não os altere sem necessidade estritamente ligada ao objetivo. Se precisar alterar arquivo não previsto, explique o motivo no relatório.

## Deve implementar

- [...]
- [...]
- [...]

## Não deve implementar

- [...]
- [...]
- [...]

## Regras específicas desta tarefa

- Respeitar `req.workspaceId`.
- Não confiar em `workspace_id` vindo do frontend.
- Não executar migrations remotas.
- Não fazer commit/push.
- Não alterar UI sem especificação.
- Não disparar automações/mensagens reais.

## Critérios de aceitação

- [...]
- [...]
- [...]

## Validações

O Codex deve:
1. inspecionar branch e working tree antes de editar;
2. revisar os arquivos relacionados;
3. implementar somente este bloco;
4. executar verificações seguras/relevantes;
5. revisar o próprio diff;
6. entregar o relatório obrigatório definido em `AGENTS.md`.

## Regra de parada

Se a solução exigir:
- mudança arquitetural não prevista;
- migration destrutiva;
- alteração visual não especificada;
- secret;
- acesso ao Neon/produção;
- refactor amplo fora do escopo;

PARE essa parte, explique no relatório e não improvise.
