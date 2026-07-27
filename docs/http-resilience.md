# Resiliência HTTP e cache

## Inventário auditado

| Integração | Cliente ativo | Timeout | Retry | Cache/fallback |
|---|---|---:|---|---|
| Riot Account-V1 e Match-V5 | `@sparta/riot` no backend | 10 s | GET: até 4 tentativas; somente timeout, 429 e 502/503/504 | Conta: somente `FRESH`, 24 h. Partidas persistidas, sem stale HTTP |
| Data Dragon no backend | sincronização do catálogo | 8 s | sem retry | 7 dias fresh + 30 dias stale por recurso |
| Data Dragon no renderer | catálogo, perfis, itens e skins | 8 s | sem retry | `localStorage`: 7 dias fresh + 30 dias stale por recurso |
| Community Dragon | metadados/asset fallback do renderer | 10 s | sem retry | memória da sessão; falha isolada mantém o próximo fallback |
| Assets remotos | imagens no Chromium e download no main | 10 s | sem retry | imagens falham isoladamente; download só aceita hosts conhecidos |
| API local Sparta | renderer → Fastify | 10 s | sem retry automático, inclusive POST/PUT | não se aplica |
| LCU local read-only | processo main → `127.0.0.1` | 1,5 s | sem retry dentro da leitura; o poll seguinte é uma nova observação | proibido usar stale |

Não há outra chamada HTTP ativa em jobs, scripts ou no serviço Python. O inventário deve ser
atualizado quando uma integração for adicionada.

## Política compartilhada

`packages/riot/src/http/` concentra:

- timeouts e cancelamento com `AbortController`, sempre limpando timer e listener;
- limite de tentativas e duração total, backoff exponencial e jitter injetável;
- respeito a `Retry-After` em segundos ou data HTTP;
- bloqueio de retry para operação não idempotente;
- validação do JSON antes de chegar ao domínio;
- códigos estáveis: `REQUEST_TIMEOUT`, `NETWORK_UNAVAILABLE`, `UPSTREAM_UNAVAILABLE`,
  `UPSTREAM_INVALID_RESPONSE`, `UPSTREAM_NOT_FOUND`, `RIOT_CREDENTIAL_INVALID`,
  `RIOT_RATE_LIMITED`, `REQUEST_CANCELLED` e `INTEGRATION_NOT_CONFIGURED`.

401/403 da Riot são credencial inválida, 429 é rate limit, 404 não é retentado e payload inválido
não é retentado. A API converte esses erros em corpo `{ code, message, integration, retryAfterMs? }`
e status HTTP estável. Causa pública/logada contém no máximo nome e código técnico: nunca URL,
headers, token, corpo, Riot ID, PUUID ou stack.

## Estados de cache

Toda leitura persistida distingue `MISS`, `FRESH`, `STALE` e `EXPIRED`. Os metadados podem trazer
`collectedAt`, `freshUntil`, `staleUntil`, `ageMs`, `servedAsFallback` e `fallbackReason`.
Registros históricos têm `collectedAt = null`; nenhuma data é reconstruída a partir de
`createdAt`.

Stale só é servido quando a atualização do mesmo recurso falha e `staleUntil` ainda não passou.
A proveniência original é preservada: um `champion.json` stale continua `OFFICIAL`, com
`status: STALE` e `cache.state: STALE`. Cache expirado, credenciais, autenticação, estado do LCU
e draft atual nunca usam stale.

## LCU

Cada leitura declara `OK`, `CLIENT_CLOSED`, `LOCKFILE_MISSING`, `LOCKFILE_INVALID`,
`LOCAL_CREDENTIAL_INVALID`, `CONNECTION_REFUSED`, `REQUEST_TIMEOUT`, `ENDPOINT_UNAVAILABLE`,
`OUTSIDE_CHAMP_SELECT` ou `INVALID_RESPONSE`.
Qualquer perda de observação limpa imediatamente fase, posição, ordem e draft; o Sparta nunca
mantém a última seleção como se ainda fosse atual.
