# Auditoria de autorização das rotas — Etapa 31C

Data da auditoria: 2026-08-05. Fonte executável: `ROUTE_AUTHORIZATION_POLICIES` em
`apps/api/src/modules/auth/authorization-policy.ts`. O boot falha se uma rota registrada não
tiver política. `PUBLIC` não usa identidade; `AUTHENTICATED` usa o `sub` do token Sparta;
`OWN_RESOURCE` deriva a única `RiotAccount.userId` do `sub`; `ADMINISTRATIVE` e
`INTERNAL_ONLY` exigem autenticação/conta no modo controlado e respondem 404 em produção.

Nas rotas com `:puuid`, `:playerId` ou Riot ID, o identificador continua na URL somente por
compatibilidade e precisa coincidir com a conta derivada do token. Divergência responde 404,
sem revelar se o recurso existe. IDs de sessão, snapshot, partida, revisão, candidata,
experimento e release são sempre combinados com `riotAccountId` nos repositórios. Correção:
nenhum cliente escolhe o proprietário; novos endpoints devem ser adicionados à matriz antes do
boot.

| Método e rota                                                               | Classe         | Identidade/recurso e origem do ID   | Dados e resposta a acesso cruzado              | Correção 31C                                        |
| --------------------------------------------------------------------------- | -------------- | ----------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `GET /health`                                                               | PUBLIC         | nenhuma                             | liveness, sem dado pessoal                     | mantida pública                                     |
| `GET /ready`                                                                | PUBLIC         | nenhuma                             | readiness sanitizado                           | mantida pública                                     |
| `POST /auth/register`                                                       | PUBLIC         | credencial criada no servidor       | token Sparta do próprio cadastro; rate limit   | mantida pública                                     |
| `POST /auth/login`                                                          | PUBLIC         | email/senha                         | token Sparta após validação; erro uniforme     | mantida pública                                     |
| `GET /auth/me`                                                              | AUTHENTICATED  | `sub` do bearer                     | perfil e próprio vínculo Riot                  | estado do vínculo exposto só ao dono                |
| `POST /auth/riot/rso/start`                                                 | AUTHENTICATED  | `sub`; transação criada no servidor | URL oficial e `state` efêmero                  | vínculo ao usuário iniciador                        |
| `GET /auth/riot/rso/callback`                                               | PUBLIC         | hash de `state` one-time            | resposta genérica, sem token/PUUID             | callback não aceita userId do cliente               |
| `POST /auth/riot/revoke`                                                    | AUTHENTICATED  | `sub` → vínculo próprio             | somente estado do próprio vínculo              | revogação bloqueia dados pessoais                   |
| `POST /players/link-riot-account`                                           | AUTHENTICATED  | `sub`; Riot ID informado            | vínculo legado, sem prova de propriedade       | bloqueado em produção; nunca reassocia conta alheia |
| `GET /catalog/champions/:championId/capabilities`                           | PUBLIC         | catálogo local                      | capacidades não pessoais                       | mantida pública                                     |
| `GET /patches`                                                              | PUBLIC         | catálogo oficial persistido         | patches, sem dado pessoal                      | mantida pública                                     |
| `GET /patches/current`                                                      | PUBLIC         | catálogo oficial persistido         | patch atual                                    | mantida pública                                     |
| `GET /patches/:patch/champions/:championId`                                 | PUBLIC         | patch/campeão públicos              | notas oficiais por campeão                     | mantida pública                                     |
| `GET /patches/:patch/impacts`                                               | PUBLIC         | patch público                       | impacto teórico, sem histórico pessoal         | mantida pública                                     |
| `GET /patches/:patch`                                                       | PUBLIC         | patch público                       | notas oficiais                                 | mantida pública                                     |
| `GET /draft-reviews/form`                                                   | PUBLIC         | nenhuma                             | schema estático do formulário                  | mantida pública                                     |
| `GET /players/:riotName/:tagLine/profile`                                   | OWN_RESOURCE   | `sub` → conta; Riot ID só confere   | perfil/estatísticas pessoais; divergência 404  | deixou de aceitar Riot ID arbitrário                |
| `GET /players/:puuid/champions/:championId/role-evidence`                   | OWN_RESOURCE   | `sub` → PUUID próprio               | evidência pessoal; divergência 404             | deixou de aceitar PUUID arbitrário                  |
| `GET /players/:playerId/champions/:championId/roles/:role/loadout-evidence` | OWN_RESOURCE   | `sub` → PUUID próprio               | itens/runas/feitiços pessoais; divergência 404 | 403 legado uniformizado em 404                      |
| `GET /players/pool`                                                         | OWN_RESOURCE   | `sub` → conta própria               | pool pessoal                                   | gate de estado do vínculo central                   |
| `POST /players/pool`                                                        | OWN_RESOURCE   | `sub` → conta própria               | inclusão manual no próprio pool                | gate central                                        |
| `PATCH /players/pool/:championId`                                           | OWN_RESOURCE   | `sub` → conta própria               | desativação no próprio pool                    | gate central                                        |
| `POST /players/sync`                                                        | OWN_RESOURCE   | `sub` → conta própria               | sincroniza somente PUUID derivado              | gate RSO em produção                                |
| `GET /players/:puuid/recent-matches`                                        | OWN_RESOURCE   | `sub` → PUUID próprio               | histórico pessoal; divergência 404             | deixou de aceitar PUUID arbitrário                  |
| `GET /players/:puuid/champion-performance`                                  | OWN_RESOURCE   | `sub` → PUUID próprio               | desempenho pessoal                             | deixou de aceitar PUUID arbitrário                  |
| `GET /players/:puuid/growth-journey`                                        | OWN_RESOURCE   | `sub` → PUUID próprio               | evolução pós-game pessoal                      | deixou de aceitar PUUID arbitrário                  |
| `GET /players/settings`                                                     | OWN_RESOURCE   | `sub` → conta própria               | configuração pessoal                           | gate central                                        |
| `PUT /players/settings`                                                     | OWN_RESOURCE   | `sub` → conta própria               | altera configuração própria                    | gate central                                        |
| `POST /drafts/recommendations`                                              | OWN_RESOURCE   | `sub` → conta própria               | recomendações pessoais                         | gate central; cliente não escolhe conta             |
| `POST /drafts/pre-game-analysis`                                            | OWN_RESOURCE   | `sub` → conta própria               | análise pessoal                                | gate central                                        |
| `GET /drafts/sessions/active`                                               | OWN_RESOURCE   | `sub` → `riotAccountId`             | sessão ativa própria                           | 404 para recurso alheio                             |
| `GET /drafts/sessions`                                                      | OWN_RESOURCE   | `sub` → `riotAccountId`             | histórico próprio                              | 404 para recurso alheio                             |
| `GET /drafts/sessions/:sessionId`                                           | OWN_RESOURCE   | sessão + `riotAccountId`            | sessão própria                                 | filtro composto preservado                          |
| `GET /drafts/sessions/:sessionId/snapshots`                                 | OWN_RESOURCE   | sessão + `riotAccountId`            | snapshots próprios                             | filtro composto preservado                          |
| `POST /drafts/sessions/:sessionId/lock-in`                                  | OWN_RESOURCE   | sessão + `riotAccountId`            | escolha própria                                | filtro composto preservado                          |
| `POST /drafts/sessions/:sessionId/status`                                   | OWN_RESOURCE   | sessão + `riotAccountId`            | estado da sessão própria                       | filtro composto preservado                          |
| `POST /drafts/sessions/:sessionId/observed-game`                            | OWN_RESOURCE   | sessão + `riotAccountId`            | evidência local própria                        | filtro composto preservado                          |
| `POST /drafts/sessions/reconcile`                                           | OWN_RESOURCE   | `sub` → conta própria               | reconcilia somente sessões próprias            | não cria associação aproximada nova                 |
| `GET /draft-sessions/:sessionId/replay-capability`                          | OWN_RESOURCE   | sessão + `riotAccountId`            | capacidade de replay própria                   | 404 cruzado                                         |
| `GET /recommendation-snapshots/:snapshotId/replay-bundle-summary`           | OWN_RESOURCE   | snapshot → sessão + conta           | resumo sanitizado próprio                      | 404 cruzado                                         |
| `POST /recommendation-snapshots/:snapshotId/verify-replay`                  | OWN_RESOURCE   | snapshot → sessão + conta           | verificação própria                            | 404 cruzado; sem credenciais no bundle              |
| `GET /draft-sessions/:sessionId/post-game-comparison`                       | OWN_RESOURCE   | sessão + conta                      | comparação própria                             | 404 cruzado                                         |
| `GET /matches/:matchId/draft-comparison`                                    | OWN_RESOURCE   | partida participante + conta        | comparação própria                             | 404 cruzado                                         |
| `POST /draft-sessions/:sessionId/post-game-comparison/generate`             | OWN_RESOURCE   | sessão + conta                      | gera revisão própria                           | fontes resolvidas no servidor                       |
| `POST /postgame/analyze`                                                    | OWN_RESOURCE   | `sub` → PUUID próprio               | relatório próprio                              | cliente não envia proprietário                      |
| `GET /postgame/:matchId`                                                    | OWN_RESOURCE   | partida + PUUID próprio             | relatório próprio                              | 404 cruzado                                         |
| `GET /matches/:matchId/observation`                                         | OWN_RESOURCE   | partida + PUUID próprio             | loadout/posição próprios                       | 404 cruzado                                         |
| `GET /players/:playerId/recommendation-observability`                       | OWN_RESOURCE   | `sub` → PUUID próprio               | observabilidade pessoal                        | divergência 404                                     |
| `GET /players/:playerId/recommendation-observability/versions`              | OWN_RESOURCE   | `sub` → PUUID próprio               | versões pessoais                               | divergência 404                                     |
| `GET /players/:playerId/recommendation-observability/roles/:role`           | OWN_RESOURCE   | `sub` → PUUID próprio               | observabilidade por posição                    | divergência 404                                     |
| `POST /draft-sessions/:sessionId/reviews`                                   | OWN_RESOURCE   | sessão + conta                      | revisão própria                                | 404 cruzado                                         |
| `GET /draft-sessions/:sessionId/reviews`                                    | OWN_RESOURCE   | sessão + conta                      | revisões próprias                              | 404 cruzado                                         |
| `POST /draft-reviews/:reviewId/pre-match`                                   | OWN_RESOURCE   | revisão + conta                     | avaliação cega própria                         | 404 cruzado                                         |
| `POST /draft-reviews/:reviewId/reveal-result`                               | OWN_RESOURCE   | revisão + conta                     | revela resultado próprio                       | 404 cruzado                                         |
| `POST /draft-reviews/:reviewId/post-match`                                  | OWN_RESOURCE   | revisão + conta                     | avaliação própria                              | 404 cruzado                                         |
| `GET /players/draft-review-summary`                                         | OWN_RESOURCE   | `sub` → conta própria               | resumo pessoal                                 | gate central                                        |
| `GET /calibration/parameters`                                               | INTERNAL_ONLY  | operador local controlado           | parâmetros do laboratório                      | invisível em produção                               |
| `POST /calibration/candidates/validate`                                     | INTERNAL_ONLY  | operador local controlado           | valida configuração offline                    | invisível em produção                               |
| `POST /calibration/candidates`                                              | INTERNAL_ONLY  | operador + conta local              | candidata própria                              | invisível em produção                               |
| `GET /calibration/candidates`                                               | INTERNAL_ONLY  | operador + conta local              | candidatas próprias                            | invisível em produção                               |
| `GET /calibration/candidates/:id`                                           | INTERNAL_ONLY  | candidata + conta local             | candidata própria                              | invisível em produção                               |
| `GET /calibration/candidates/:id/revisions`                                 | INTERNAL_ONLY  | lineage + conta local               | revisões próprias                              | invisível em produção                               |
| `POST /calibration/candidates/:id/revisions`                                | INTERNAL_ONLY  | lineage + conta local               | nova revisão própria                           | rota detectada automaticamente e fechada            |
| `POST /calibration/experiments`                                             | INTERNAL_ONLY  | conta local                         | experimento offline próprio                    | invisível em produção                               |
| `GET /calibration/experiments`                                              | INTERNAL_ONLY  | conta local                         | experimentos próprios                          | invisível em produção                               |
| `GET /calibration/experiments/:id`                                          | INTERNAL_ONLY  | experimento + conta                 | experimento próprio                            | invisível em produção                               |
| `GET /calibration/experiments/:id/cases`                                    | INTERNAL_ONLY  | experimento + conta                 | casos próprios                                 | invisível em produção                               |
| `POST /calibration/candidates/:id/reject`                                   | INTERNAL_ONLY  | candidata + conta                   | decisão local                                  | invisível em produção                               |
| `POST /calibration/candidates/:id/approve-for-future-release`               | INTERNAL_ONLY  | candidata + conta                   | decisão local                                  | invisível em produção                               |
| `POST /calibration/candidates/:candidateId/releases`                        | ADMINISTRATIVE | operador autenticado local + conta  | cria release operacional própria               | invisível em produção pública                       |
| `GET /calibration/releases`                                                 | ADMINISTRATIVE | operador autenticado local + conta  | releases próprias                              | invisível em produção pública                       |
| `GET /calibration/releases/:releaseId`                                      | ADMINISTRATIVE | release + conta                     | release/eventos próprios                       | invisível em produção pública                       |
| `POST /calibration/releases/:releaseId/validate`                            | ADMINISTRATIVE | release + conta                     | valida release própria                         | invisível em produção pública                       |
| `POST /calibration/releases/:releaseId/activate`                            | ADMINISTRATIVE | release + conta                     | ativa release própria                          | invisível em produção pública                       |
| `POST /calibration/releases/:releaseId/rollback`                            | ADMINISTRATIVE | release + conta                     | rollback próprio                               | invisível em produção pública                       |
| `GET /recommendation-engine/active-release`                                 | ADMINISTRATIVE | conta local                         | configuração operacional                       | invisível em produção pública                       |
| `POST /replays/import`                                                      | INTERNAL_ONLY  | operador local                      | stub experimental, sem usuário                 | invisível em produção                               |
| `GET /replays/:jobId`                                                       | INTERNAL_ONLY  | operador local                      | stub experimental                              | invisível em produção                               |

## Limites conhecidos

- O token Sparta atual continua sendo HMAC com prazo configurável; RSO comprova a identidade
  Riot, não substitui a sessão Sparta.
- O modo `TEST` permite testar handlers isolados sem o hook central; os testes de segurança o
  habilitam explicitamente. Desenvolvimento e produção não têm esse bypass.
- Rotas administrativas não foram transformadas em painel público nem ganharam papel inventado.
  Em produção elas ficam fechadas até uma decisão futura de operação interna autenticada.
