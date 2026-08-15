# Configuração Codex — LeadHunt

Arquivos deste pacote:

- `AGENTS.md`
  Regras permanentes do projeto para o Codex.

- `.codex/config.toml`
  Configuração local recomendada de modelo, raciocínio, sandbox e aprovações.

- `CODEX_TASK_TEMPLATE.md`
  Modelo para futuras tarefas pequenas.

- `CODEX_PILOT_STEP6.md`
  Primeiro prompt real para testar o novo fluxo.

## Onde colocar

Na raiz Git do LeadHunt:

LeadHunt/
├── AGENTS.md
├── .codex/
│   └── config.toml
├── docs/
│   └── codex/
│       ├── README_SETUP.md
│       ├── CODEX_TASK_TEMPLATE.md
│       └── CODEX_PILOT_STEP6.md
├── Api/
├── App/
└── ...

Abra no Codex a pasta `LeadHunt/`, e não apenas `Api/`, para que as instruções e a configuração do projeto sejam descobertas corretamente.

Antes da primeira implementação, peça ao Codex em modo de leitura/planejamento:

"Leia as instruções do projeto e resuma as regras que governam este repositório. Não altere arquivos."

Depois confira se ele menciona:
- branch feature/multiuser-v1;
- não executar migrations;
- não commit/push;
- workspace_id;
- 404 em ownership externo;
- UI não inventada;
- relatório obrigatório.

Só então execute o prompt `docs/codex/CODEX_PILOT_STEP6.md`.
