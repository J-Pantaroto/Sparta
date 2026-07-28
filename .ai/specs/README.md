# Specs (espelho de `docs/`)

Esta pasta é uma cópia espelhada de `docs/` (specs técnicas do projeto), mantida dentro de
`.ai/` para consulta rápida por agentes de IA (Claude/Codex/Agents, via symlink) sem precisar
navegar pra fora de `.ai/`.

**`docs/` continua sendo a fonte de verdade.** Se `docs/` mudar de forma relevante (nova spec,
edição significativa numa existente), atualize este espelho copiando o(s) arquivo(s) de novo.
Não edite os arquivos aqui diretamente esperando que isso reflita em `docs/` — é uma via de
mão única (`docs/` → `.ai/specs/`).

Snapshot gerado em: 2026-07-25 (atualizado em 2026-07-27).

## Índice

- `architecture.md` — visão geral da arquitetura.
- `api.md` — endpoints da API.
- `data-provenance.md` — origem, disponibilidade e confiança dos dados.
- `database.md` — schema inicial do banco.
- `design-system.md` — design system do desktop (tokens, componentes).
- `docker.md` — infraestrutura via Docker Compose.
- `draft-recommendation.md` — motor de recomendação de draft.
- `player-champion-pool.md` — pool pessoal por posição, origens, API e contrato 5+3.
- `champion-execution-risk.md` — dificuldade oficial, evidência pessoal e risco de execução.
- `champion-capabilities.md` — capacidades rastreadas até passivas, habilidades e metadados oficiais.
- `draft-strategic-analysis.md` — motor estratégico 5×5 compartilhado pelo ranking e pré-game.
- `github.md` — configuração de repositório/CI.
- `postgame-analysis.md` — análise pós-game.
- `pre-game-analysis.md` — análise pré-game derivada do draft atual.
- `champion-tags.md` — origem, derivação e revisão das `ChampionTag`.
- `draft-persistence.md` — sessões de draft e snapshots imutáveis de recomendação.
- `personal-loadout-evidence.md` — inventários finais, runas e feitiços pessoais agregados por posição.
- `adr/0002-global-meta-source.md` — decisão da fonte global, contratos e condições para integração.
- `replay-analysis.md` — análise de replay (experimental).
- `riot-compliance.md` — limites de produto e compliance com a Riot.
- `scoring-model.md` — modelo de scoring de desempenho.
- `setup.md` — setup do ambiente local.
- `adr/` — Architecture Decision Records.

Spec de produto original (histórico completo do pedido inicial): `.ai/SPARTA_CODEX_INSTRUCTIONS.md`.
Contexto de continuidade fase a fase (histórico vivo, sempre o mais atualizado): `.ai/CLAUDE.md`.
