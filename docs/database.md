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
- `draft_post_game_comparison_revisions`
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

Snapshots de recomendação vivem em `RecommendationSnapshot` e
`PersistedRecommendation`. `DraftPostGameComparisonRevision` preserva cada
revisão da comparação com hash canônico, versão do algoritmo, IDs de sinais,
cobertura e motivos de indisponibilidade. Ela se vincula à sessão, snapshot,
partida, conta e, quando existente, ao `PostgameReport` geral; nunca
sobrescreve uma revisão histórica. Ver `docs/draft-postgame-comparison.md`.

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
