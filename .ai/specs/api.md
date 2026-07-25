# API

Base local: `http://localhost:3333`.

Endpoints:

- `GET /health`
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET /players/:riotName/:tagLine/profile` — real, le `RiotAccount`/`PlayerChampionStats` persistidos
- `POST /players/link-riot-account` (autenticado) — real, chama Account-V1
- `POST /players/sync` (autenticado) — real, sincroniza partidas novas via Match-V5
- `GET /players/:puuid/recent-matches?limit=10` — real
- `GET /players/:puuid/champion-performance` — real
- `POST /drafts/recommendations` — motor real (`@sparta/core`), mas cai no mock (`apps/api/src/routes/mock-data.ts`) pra qualquer campo que o cliente nao mandar
- `POST /drafts/pre-game-analysis` — mock
- `POST /postgame/analyze`, `GET /postgame/:matchId` — mock
- `POST /replays/import`, `GET /replays/:jobId` — nao implementado (fora do MVP)

Swagger UI fica em `/docs`.

## Integrações Riot em uso (backend)

- **Account-V1** (`riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`) — resolve Riot ID pra puuid real em `POST /players/link-riot-account`. Cacheado 24h (`ApiCacheEntry`).
- **Match-V5** — `matches/by-puuid/{puuid}/ids`, `matches/{matchId}` e `matches/{matchId}/timeline`, usados pelo sync incremental (`apps/api/src/modules/sync/riot-sync-service.ts`). Sem cache adicional: a própria tabela `Match` (unicidade por `matchId`) já é o cache permanente.
- **Data Dragon** — catálogo de campeões (`pnpm --filter @sparta/api catalog:sync`, cacheado 7 dias) e assets usados pelo desktop.
- **LCU local read-only** — ver `docs/riot-compliance.md`.

Rate limit da Riot tratado em `packages/riot/src/rate-limit/riot-request.ts`: só retenta 429/502/503/504, respeita o header `Retry-After` quando presente, propaga qualquer outro erro (401/403/404) na hora. O sync inteiro para (não só a partida atual) se um 429 esgota as tentativas.
