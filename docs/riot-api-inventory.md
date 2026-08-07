# Inventário de APIs Riot, tráfego estimado e rate limiting (Etapa 31L)

## 29. APIs necessárias — auditadas no código

Fonte: `packages/riot/src/clients/riot-api-client.ts` (implementação), `apps/api/src/modules/
riot-integration/` e `apps/api/src/modules/sync/riot-sync-service.ts` (chamadores). Confirmado por
`docs/identity-authorization-riot-readiness.md`/`docs/riot-compliance.md` e por leitura direta do
código nesta etapa — nenhum endpoint além dos listados abaixo é chamado em nenhum lugar do
repositório.

| API | Endpoint | Propósito | Quando é chamado | Server-side/client-side | Necessário para MVP |
| --- | --- | --- | --- | --- | --- |
| Account-V1 | `GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}` | Resolver PUUID a partir do Riot ID (vínculo legado, fora de produção) | `POST /players/link-riot-account` | Server-side (`apps/api`) | `REQUIRED` (até RSO estar disponível) |
| Account-V1 | `GET /riot/account/v1/accounts/me` | Resolver identidade a partir do token RSO (produção real) | Callback `GET /auth/riot/rso/callback`, quando RSO estiver ativo | Server-side | `REQUIRED` (para produção) |
| Match-V5 | `GET /lol/match/v5/matches/by-puuid/{puuid}/ids` | Listar partidas recentes, descobrir o que é novo | `POST /players/sync` | Server-side | `REQUIRED` |
| Match-V5 | `GET /lol/match/v5/matches/{matchId}` | Detalhe completo de uma partida nova | `POST /players/sync`, sequencial por partida nova | Server-side | `REQUIRED` |
| Match-V5 | `GET /lol/match/v5/matches/{matchId}/timeline` | Timeline de eventos de uma partida nova | `POST /players/sync`, junto do detalhe | Server-side | `REQUIRED` |
| Data Dragon | `GET https://ddragon.leagueoflegends.com/...` | Catálogo estático de campeões/itens/runas/feitiços e ícones/splash art | Sob demanda, cliente Desktop (renderer) e backend (catálogo) | Client-side (assets públicos, sem key) e server-side (sincronização de catálogo) | `REQUIRED` |
| Community Dragon | `GET https://raw.communitydragon.org/...` | Fallback de ícone/splash quando a Data Dragon falha para um asset específico | Sob demanda, só em `onError` do componente de imagem | Client-side | `OPTIONAL` (fallback, não crítico) |
| League Client API (LCU) | `GET /lol-gameflow/v1/gameflow-phase` | Detectar a fase atual do cliente (ex.: `ChampSelect`) para trocar a aba da UI | Poll local a cada 2.5s, só quando o League está aberto | Client-side (processo principal do Electron, local) | `REQUIRED` (para a experiência de Champion Select automática; o modo manual de simulação não depende disso) |
| League Client API (LCU) | `GET /lol-gameflow/v1/session` | Ler `gameData.gameId` para vincular a sessão à partida real depois | Mesmo poll, durante champion select/início de partida | Client-side, local | `REQUIRED` (para vínculo automático com a partida; sem ele o vínculo fica `PENDING`) |
| League Client API (LCU) | `GET /lol-champ-select/v1/session` | Ler posição, aliados/inimigos revelados, bans concluídos | Mesmo poll, durante champion select | Client-side, local | `REQUIRED` (é o núcleo da experiência de Champion Select) |
| Riot Sign-On (RSO) | `https://auth.riotgames.com/authorize` (OAuth2) | Autorização do jogador, identidade verificada | `POST /auth/riot/rso/start` (redireciona o navegador) | Server-side inicia, navegador do jogador completa | `FUTURE` — depende de Production Key aprovada; arquitetura pronta, adapter real não existe |

**Diferenciação explícita**: nenhuma API além destas é solicitada. Em particular, o Sparta **não**
solicita League-V4 (rank/LP), Spectator-V5, Tournament-V5/V4, Clash-V1 ou Champion-Mastery-V4 —
nenhuma dessas é chamada em código algum do repositório, e nenhuma delas é necessária para o
escopo submetido (rank/LP aparece hoje só como "Elo indisponível" na interface, por design, não
por falta de implementação).

## 30. Estimativa de tráfego

**Premissas explícitas, não usuários reais.** O Sparta GG hoje tem uma única conta de teste
(`Zekerus#117`) usada durante o desenvolvimento — os números abaixo são uma projeção modelada a
partir do comportamento real do código de sincronização (`apps/api/src/modules/sync/riot-sync-
service.ts`), não uma contagem de usuários existentes.

**Modelo por sincronização de um jogador:**

- 1 chamada para listar IDs de partidas novas (`by-puuid/{puuid}/ids`).
- Até `DEFAULT_MAX_NEW_MATCHES = 20` partidas novas por chamada de sync no caso comum (teto
  configurável até `MAX_NEW_MATCHES_CEILING = 50`).
- Cada partida nova gera exatamente 2 chamadas adicionais (detalhe + timeline), sequenciais, nunca
  em paralelo (decisão deliberada do projeto, para respeitar rate limit de chave de desenvolvimento
  — `docs/http-resilience.md`).

Chamadas por sincronização = `1 + (partidas_novas × 2)`.

| Cenário | Jogadores | Sincronizações/dia estimadas por jogador | Partidas novas médias por sync | Chamadas Riot/dia (Match-V5 + Account-V1) |
| --- | --- | --- | --- | --- |
| Piloto inicial | 1–10 | 3 (uso ativo, não automático) | 3 | `10 × 3 × (1 + 3×2) = 210` |
| 100 usuários | 100 | 2 (uso moderado) | 2 | `100 × 2 × (1 + 2×2) = 1.000` |
| 1.000 usuários | 1.000 | 1,5 (uso típico, não todo mundo sincroniza todo dia) | 2 | `1.000 × 1,5 × (1 + 2×2) = 7.500` |

Somado a isso, Account-V1 é chamado só no momento do vínculo/RSO (evento raro, não recorrente por
dia) — não entra no cálculo diário acima de forma relevante. Data Dragon não consome rate limit da
Riot API (CDN pública separada, sem `X-Riot-Token`).

**Isso não é uma alegação de usuários existentes** — é o modelo usado para dimensionar qual nível
de rate limit (development/personal/production) o produto precisará, e para justificar à Riot que
o padrão de chamada é sincronização incremental sob demanda do próprio jogador, não polling
constante ou coleta em massa.

## 31. Rate limits — como o Sparta lida com eles hoje

Implementação real, não prometida: `packages/riot/src/rate-limit/riot-request.ts` +
`packages/riot/src/http/` (política compartilhada usada por todas as integrações HTTP do
projeto, Etapa 9, `docs/http-resilience.md`).

- **429 (rate limited)**: só 429/502/503/504 são retentados; qualquer outro erro (401/403/404
  etc.) propaga imediatamente, sem retry.
- **`Retry-After`**: quando o header está presente na resposta 429, o Sparta espera exatamente o
  tempo indicado antes de tentar de novo, em vez de um backoff genérico.
- **Backoff**: na ausência de `Retry-After`, cai em backoff exponencial com jitter (mesma política
  compartilhada de todas as integrações HTTP do projeto).
- **Interrupção da rodada**: se um 429 esgota as tentativas de retry durante uma sincronização, o
  `riot-sync-service.ts` **interrompe a rodada inteira** em vez de continuar tentando as próximas
  partidas — decisão deliberada para não piorar um rate limit já estourado insistindo.
- **Chamadas sequenciais, nunca paralelas**: detalhe e timeline de cada partida nova são buscados
  um de cada vez, não em paralelo, mesmo que isso deixe a sincronização mais lenta — trade-off
  deliberado para uma chave de rate limit menor (desenvolvimento) não estourar.
- **Cache**: `ApiCacheEntry` (Postgres) cacheia respostas de Account-V1 por 24h e de Data Dragon
  por 7 dias — reduz chamadas repetidas para dados que não mudam com frequência
  (`docs/http-resilience.md`).
- **Deduplicação**: `Match.matchId` é único no schema — uma partida já sincronizada nunca é
  buscada de novo; o sync sempre pede primeiro a lista de IDs e só busca detalhe/timeline dos que
  ainda não existem no banco.
- **Retries**: cobertos acima (só em 429/502/503/504, com `Retry-After` ou backoff).
- **Dado obsoleto (stale)**: distinguido explicitamente por estado (`MISS`/`FRESH`/`STALE`/
  `EXPIRED`) no cache; dado de conta Riot, LCU e draft atual **nunca** usa stale — só catálogo
  estático (Data Dragon) pode servir uma cópia stale por um período limitado antes de expirar de
  vez.
- **Indisponibilidade**: erro externo da Riot é sanitizado antes de chegar ao cliente (nunca vaza
  detalhe interno de infraestrutura), e a API continua respondendo `/health` mesmo com a Riot
  fora do ar — só as funcionalidades que dependem daquela chamada específica ficam indisponíveis,
  o resto do produto continua funcionando com o que já foi sincronizado antes.

Nenhum mecanismo acima é prometido sem existir — todos têm teste automatizado ou já foram
exercitados contra a Riot API real durante o desenvolvimento (documentado em `docs/http-
resilience.md`, Etapa 9, e revalidado em etapas subsequentes sempre que o código de sync foi
tocado).
