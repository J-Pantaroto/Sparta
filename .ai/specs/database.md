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

O snapshot da recomendação fica em `pick_recommendations.snapshotJson` para comparação pós-game.
