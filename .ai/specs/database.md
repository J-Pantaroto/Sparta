# Database

O schema Prisma inicial está em `apps/api/prisma/schema.prisma`.

Tabelas principais:

- `users`
- `riot_accounts`
- `player_profiles`
- `matches`
- `match_participants`
- `match_timelines`
- `champions`
- `champion_tags`
- `player_champion_stats`
- `player_champion_pool_entries`
- `draft_sessions`
- `pick_recommendations`
- `postgame_reports`
- `replay_import_jobs`
- `api_cache_entries`

Índices relevantes:

- `puuid`;
- `matchId`;
- `championId`;
- unicidade de partidas por `matchId`;
- unicidade de estatística por jogador, campeão e role.
- unicidade de entrada do pool por conta Riot, campeão e posição;
- consulta do pool por conta Riot, posição e estado `enabled`.

O snapshot da recomendação fica em `pick_recommendations.snapshotJson` para comparação pós-game.

`PlayerChampionPoolEntry` persiste somente a seleção de candidatos por
posição: `source` (`PERSONAL_OBSERVED` ou `USER_PROVIDED`), `enabled` e
timestamps auditáveis. A origem observada é derivada das `MatchObservation`
normalizadas; desabilitar uma entrada manual não remove partidas,
participantes ou observações. Draft e ranking não são persistidos pela Etapa 12. Ver `docs/player-champion-pool.md`.

`Champion` preserva o `info.difficulty` oficial da Data Dragon em
`dataDragonDifficulty`, junto do valor 0-100 e da versão do algoritmo de
normalização. Esses campos são nullable e não substituem
`ChampionTag.difficulty`, que continua sendo uma dimensão estratégica
derivada/curável. Ver `docs/champion-execution-risk.md`.

`DraftPostGameComparisonRevision` (Etapa 22) preserva revisões imutáveis do
comparativo draft/partida, vinculadas à conta, sessão, snapshot, partida e ao
`PostgameReport` geral quando existe. Persiste revisão, hash canônico dos
inputs, versão do algoritmo, versões de fonte, IDs de sinais do snapshot,
cobertura, status, motivos de indisponibilidade e o relatório completo.
Unicidade por `draftSessionId + inputHash + algorithmVersion` torna a geração
idempotente sem impedir nova revisão quando a fonte ou o algoritmo muda.
