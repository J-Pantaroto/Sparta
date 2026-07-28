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
- `GET /players/pool?role=MID` (autenticado) — materializa observações pessoais e consulta o pool explícito por posição, com contagens para todas as posições
- `POST /players/pool` (autenticado) — adiciona `{ championId, role }` como `USER_PROVIDED`; idempotente e sem aceitar origem enviada pelo cliente
- `PATCH /players/pool/:championId` (autenticado) — desabilita entrada manual com `{ role, enabled: false }`; não altera observações reais
- `POST /drafts/recommendations` (autenticado) — motor real (`@sparta/core`) sobre o pool consolidado. Retorna até cinco principais, três alternativas e `poolSummary`; mantém temporariamente o alias legado `recommendations`
- `POST /drafts/pre-game-analysis` (autenticado) — real, derivado do draft atual pelo motor puro `generatePreGameAnalysis` (`@sparta/core`). Responde `422` `PLAYER_ROLE_UNAVAILABLE` sem posição e `422` `SELECTED_CHAMPION_UNAVAILABLE` sem campeão confirmado (ou com campeão fora do catálogo). Ver `docs/pre-game-analysis.md`
- `POST /postgame/analyze`, `GET /postgame/:matchId` — mock
- `POST /replays/import`, `GET /replays/:jobId` — nao implementado (fora do MVP)

Swagger UI fica em `/docs`.

O contrato e as regras de origem do pool estão em
`docs/player-champion-pool.md`. `PATCH` está explicitamente liberado no CORS
para o desktop; a allowlist de origens permanece restrita.

As recomendações atuais também carregam `CHAMPION_DIFFICULTY`,
`PERSONAL_EXPERIENCE` e `EXECUTION_RISK` em `metricDetails`. Resposta
anterior sem esses campos é adaptada para `UNAVAILABLE`, sem neutros
artificiais. Ver `docs/champion-execution-risk.md`.

## Erros externos

Falhas externas seguem `.ai/specs/http-resilience.md`. A resposta pública contém apenas
`code`, mensagem controlada, integração e `retryAfterMs` quando aplicável; nunca contém URL,
headers, token, payload ou stack.

## Integrações Riot em uso (backend)

- **Account-V1** (`riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`) — resolve Riot ID pra puuid real em `POST /players/link-riot-account`. Cacheado 24h (`ApiCacheEntry`).
- **Match-V5** — `matches/by-puuid/{puuid}/ids`, `matches/{matchId}` e `matches/{matchId}/timeline`, usados pelo sync incremental (`apps/api/src/modules/sync/riot-sync-service.ts`). Sem cache adicional: a própria tabela `Match` (unicidade por `matchId`) já é o cache permanente.
- **Data Dragon** — catálogo de campeões (`pnpm --filter @sparta/api catalog:sync`, cacheado 7 dias) e assets usados pelo desktop.
- **LCU local read-only** — ver `docs/riot-compliance.md`.

Rate limit da Riot tratado em `packages/riot/src/rate-limit/riot-request.ts`: só retenta 429/502/503/504, respeita o header `Retry-After` quando presente, propaga qualquer outro erro (401/403/404) na hora. O sync inteiro para (não só a partida atual) se um 429 esgota as tentativas.
