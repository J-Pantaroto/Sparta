# API

## Acesso e onboarding (Etapa 31D)

O backend calcula o estado de onboarding e bloqueia toda rota pessoal até `READY`. Endpoints de
acesso: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`,
`POST /auth/email-verification/resend`, `POST /auth/email-verification/confirm`,
`GET /auth/onboarding-status`, `GET /auth/me` e `PATCH /auth/account/email`. O erro uniforme é
`403 ONBOARDING_INCOMPLETE` com `requiredStep`. Produção aceita somente vínculo Riot
`VERIFIED_BY_RSO` e falha no boot sem provider transacional de email realmente configurado. Ver
`docs/account-access-onboarding.md`.

## Identidade e autorização (Etapa 31C)

A matriz fail-closed está em `apps/api/src/modules/auth/authorization-policy.ts`; o boot recusa
rota registrada sem classificação. Inventário: `docs/route-authorization-audit.md`. Produção
exige `IDENTITY_MODE=RSO_REQUIRED`, e dados pessoais exigem `VERIFIED_BY_RSO`. O provider real
permanece desabilitado até aprovação/onboarding da Riot.

## Identidade e autorização (Etapa 31C)

A matriz fail-closed está em `apps/api/src/modules/auth/authorization-policy.ts`; o boot recusa
rota registrada sem classificação. Inventário: `docs/route-authorization-audit.md`. Produção
exige `IDENTITY_MODE=RSO_REQUIRED`, e dados pessoais exigem `VERIFIED_BY_RSO`. O provider real
permanece desabilitado até aprovação/onboarding da Riot.

Etapa 23:

- `GET /players/:playerId/recommendation-observability` expõe o relatório
  longitudinal descritivo;
- `GET /players/:playerId/recommendation-observability/versions` preserva a
  segmentação central por versões;
- `GET /players/:playerId/recommendation-observability/roles/:role` fixa o
  recorte de posição;
- filtros opcionais cobrem período, patch, fila, posição, campeão, grupo e
  versão, sempre antes do cálculo de numeradores e denominadores;
- `displaySampleThreshold` é configurável e explicitamente apenas um limite
  de apresentação;
- o `playerId` precisa pertencer ao usuário autenticado e o cliente nunca
  envia agregados prontos.

Base local: `http://localhost:3333`.

Endpoints:

- `GET /patches`, `GET /patches/current`, `GET /patches/:patch` — releases oficiais importados e revisionados da Riot
- `GET /patches/:patch/impacts` — interpretações teóricas versionadas por campeão, sem score de força
- `GET /patches/:patch/champions/:championId` — mudanças oficiais do campeão e `theoreticalImpact` separado
- `GET /health` — liveness do processo, sem consultar dependências
- `GET /ready` — readiness; consulta Postgres com timeout e responde `503` sem vazar detalhe
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET /players/:riotName/:tagLine/profile` — real, le `RiotAccount`/`PlayerChampionStats` persistidos
- `POST /players/link-riot-account` (autenticado) — real, chama Account-V1
- `POST /players/sync` (autenticado) — real, sincroniza partidas novas via Match-V5
- `GET /players/:puuid/recent-matches?limit=10` — real
- `GET /players/:puuid/champion-performance` — real
- `GET /players/pool?role=MID` (autenticado) — materializa observações pessoais e consulta o pool explícito por posição, com contagens para todas as posições
- `POST /players/pool` (autenticado) — adiciona `{ championId, role }` como `USER_PROVIDED`; idempotente e sem aceitar origem enviada pelo cliente
- `PATCH /players/pool/:championId` (autenticado) — desabilita entrada manual com `{ role, enabled: false }`; não altera observações reais
- `GET /players/:playerId/champions/:championId/roles/:role/loadout-evidence` (autenticado) — agrega inventários finais, runas e feitiços pessoais da posição. Aceita `patch`, `queueId`, `from`, `to` e `recentMatches`; `:playerId` precisa ser o puuid da própria conta vinculada
- `GET /drafts/sessions`, `GET /drafts/sessions/active`, `GET /drafts/sessions/:id`, `GET /drafts/sessions/:id/snapshots`, `POST /drafts/sessions/:id/lock-in`, `POST /drafts/sessions/:id/status` (autenticadas) — sessões de draft persistidas. Ver `docs/draft-persistence.md`
- `POST /drafts/recommendations` (autenticado) — motor real (`@sparta/core`) sobre o pool consolidado. Retorna até cinco principais, três alternativas e `poolSummary`; mantém temporariamente o alias legado `recommendations`
- `POST /drafts/pre-game-analysis` (autenticado) — real, derivado do draft atual pelo motor puro `generatePreGameAnalysis` (`@sparta/core`). Responde `422` `PLAYER_ROLE_UNAVAILABLE` sem posição e `422` `SELECTED_CHAMPION_UNAVAILABLE` sem campeão confirmado (ou com campeão fora do catálogo). Ver `docs/pre-game-analysis.md`
- `POST /postgame/analyze`, `GET /postgame/:matchId` — análise geral real a partir de Match-V5 e timeline
- `GET /draft-sessions/:sessionId/post-game-comparison`, `GET /matches/:matchId/draft-comparison` (autenticados) — consulta a revisão histórica “Draft versus partida”, distinguindo vínculo, snapshot, timeline, parcialidade e geração
- `POST /draft-sessions/:sessionId/post-game-comparison/generate` (autenticado) — gera idempotentemente somente a partir das fontes persistidas no servidor; ignora métricas ou conclusões do cliente
- `POST /replays/import`, `GET /replays/:jobId` — nao implementado (fora do MVP)

Swagger UI fica em `/docs` somente quando `NODE_ENV=development` e
`API_DOCS_ENABLED=true`; a validação recusa documentação habilitada em produção.

A configuração pública sem valores reais está em `.env.production.example`. Em produção a API
exige URL pública HTTPS, allowlist CORS explícita, segredo HMAC forte e PostgreSQL. O proxy é
confiado por quantidade explícita de saltos; limites, timeouts, TTL do bearer token, log level e
grace period de shutdown são configuráveis. Redis ainda não é consumido e não participa da
readiness. O plano e os bloqueios de publicação estão em
`docs/public-api-infrastructure-readiness.md`.

O contrato e as regras de origem do pool estão em
`docs/player-champion-pool.md`. `PATCH` está explicitamente liberado no CORS
para o desktop; a allowlist de origens permanece restrita.

O contrato da análise pessoal de loadouts está em
`docs/personal-loadout-evidence.md`. A rota devolve `403
PLAYER_HISTORY_FORBIDDEN` antes de ler observações quando o puuid do path não
é o da conta autenticada. A consulta é independente das recomendações e não
altera score, ranking ou snapshot.

As recomendações atuais também carregam `CHAMPION_DIFFICULTY`,
`PERSONAL_EXPERIENCE` e `EXECUTION_RISK` em `metricDetails`. Resposta
anterior sem esses campos é adaptada para `UNAVAILABLE`, sem neutros
artificiais. Ver `docs/champion-execution-risk.md`.

`GET /catalog/champions/:championId/capabilities` expõe o perfil técnico
rastreável da Etapa 14, com evidências por passiva/habilidade, dimensões
indisponíveis, versões e cobertura. Desde a Etapa 15, o mesmo manifesto
alimenta `TEAM_COMPOSITION` e `ENEMY_COMPOSITION_ANSWER` no ranking e no
pré-game pelo motor `analyzeDraftStrategy`. As recomendações carregam
`strategicAnalysis` por candidato; o pré-game devolve o mesmo contrato para o
campeão confirmado. Ver `docs/champion-capabilities.md` e
`docs/draft-strategic-analysis.md`.

O impacto teórico de patch é calculado fora do motor de recomendação e usa
somente Patch Intelligence + capacidades rastreáveis da mesma habilidade.
Ver `docs/theoretical-patch-impact.md`.

A comparação pós-game rastreável preserva o snapshot original, separa fatos
anteriores e posteriores e nunca produz causalidade ou contrafactual. Ver
`docs/draft-postgame-comparison.md`.

## Erros externos

Falhas externas seguem `docs/http-resilience.md`. 401/403 da Riot viram
`RIOT_CREDENTIAL_INVALID`, 429 vira `RIOT_RATE_LIMITED` e respeita `Retry-After`, 404 não é
retentado e 502/503/504 só são retentados em GET, dentro do limite central.

O corpo público é `{ code, message, integration, retryAfterMs? }` e nunca inclui URL, headers,
token, payload ou stack.

## Integrações Riot em uso (backend)

- **Account-V1** (`riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`) — resolve Riot ID pra puuid real em `POST /players/link-riot-account`. Cacheado 24h (`ApiCacheEntry`). Esse lookup não prova propriedade da conta; RSO e autorização uniforme são bloqueadores antes da exposição pública.
- **Match-V5** — `matches/by-puuid/{puuid}/ids`, `matches/{matchId}` e `matches/{matchId}/timeline`, usados pelo sync incremental (`apps/api/src/modules/sync/riot-sync-service.ts`). Sem cache adicional: a própria tabela `Match` (unicidade por `matchId`) já é o cache permanente.
- **Data Dragon** — catálogo de campeões (`pnpm --filter @sparta/api catalog:sync`, cacheado 7 dias) e assets usados pelo desktop.
- **LCU local read-only** — ver `docs/riot-compliance.md`.

Rate limit da Riot tratado em `packages/riot/src/rate-limit/riot-request.ts`: só retenta 429/502/503/504, respeita o header `Retry-After` quando presente, propaga qualquer outro erro (401/403/404) na hora. O sync inteiro para (não só a partida atual) se um 429 esgota as tentativas.
