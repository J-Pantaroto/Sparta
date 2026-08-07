# Redesign do pós-game, partidas e histórico pessoal (Etapa 31H)

Escopo exclusivo: revisão de pós-game, detalhe de partida, histórico pessoal, comparação
factual com o snapshot pré-game e visualização de métricas observadas. **Nenhum cálculo,
inferência, vínculo Match-V5 ou motor de recomendação foi alterado** — só leitura e apresentação
de dados que já existiam ou já eram extraíveis das tabelas normalizadas.

## Backend (aditivo)

- **`packages/core/src/types/match-participants.ts`** (novo) — `MatchParticipantSummary` (um
  jogador de uma partida específica, dos dois times) e `MatchParticipantsOverview` (os 10). Sem
  campo de nível: a Riot não persiste isso em nenhuma tabela do Sparta, e inventar violaria o
  princípio de dado real do projeto. `teamId` é opcional — linhas legadas anteriores à Etapa 3
  (antes do backfill de participantes) podem não ter time conhecido, e ficam fora de qualquer
  agrupamento visual em vez de caírem arbitrariamente num dos dois lados.
- **`packages/core/src/aggregation/match-vs-recent-history.ts`** (novo) —
  `compareMatchToRecentHistory(points, matchId)`, pura. Compara uma partida com a média das
  partidas **estritamente anteriores** a ela (por `observedAt`), nunca a própria partida nem
  partidas futuras — evita vazamento temporal por construção, não por convenção. Piso de amostra
  (`MIN_RECENT_HISTORY_SAMPLE = 3`, mesmo raciocínio do `MIN_BLOCK_REPORTS` da Growth Journey);
  abaixo dele a métrica fica `UNAVAILABLE` com o motivo, nunca uma média de 1-2 pontos. Zero
  medido e ausência são campos distintos (`matchValue: number | null` vs `status`).
- **`MatchPerformanceMetrics`** ganhou `goldDiffAt15?`/`objectiveEvents?` (já existiam em
  `MatchTimelineSummary` e eram computados internamente por `generatePostGameAnalysis`, só não
  saíam no contrato de saída). Mudança aditiva only-optional; nenhum campo existente mudou.
- **`GET /matches/:matchId/participants`** (nova rota, `apps/api/src/modules/matches/`) — os 10
  participantes de uma partida, só pra quem de fato jogou nela. Posse implícita: sem uma linha
  `MatchParticipant` do próprio usuário naquela partida, 404 sem revelar se ela existe (mesmo
  padrão de `/matches/:matchId/observation`). Reusa `findMatchLoadoutObservation` por
  participante (chamadas em paralelo), sem parsear `rawJson`.
- **`GET /players/:puuid/match-history`** (nova rota) — histórico filtrável (posição, resultado,
  fila, campeão, período 7/14/30 dias) e paginado (`limit`/`offset`). Reusa o mesmo
  enriquecimento por partida de `/me/player-profile` via um mapper compartilhado extraído
  (`match-history-mapper.ts`) — o comportamento daquela rota **não muda**. Só lista partidas com
  posição conhecida (mesma regra da Etapa 6: ausência de posição nunca vira um valor chutado).
- **Autorização**: as duas rotas novas entraram na matriz executável
  (`authorization-policy.ts`) como `OWN_RESOURCE`, mesmo padrão de todas as rotas pessoais desde
  a Etapa 31C — sem isso o boot da API falha (`hasAuthorizationPolicy`).

## Frontend

- **`MatchHistoryList.tsx`** (novo) — histórico filtrável (posição/resultado/período/fila/
  campeão), paginado por "Carregar mais" e agrupado por período (Hoje/Ontem/Esta semana/Mais
  antigas/Sem data registrada — nunca mistura partida sem data com "Hoje").
  `match-history-grouping.ts` isola o agrupamento como função pura testável.
- **Pós-game reestruturado** (`PostGameScreen.tsx`) — a antiga lista fixa de 10 partidas numa
  barra lateral de 300px virou o `MatchHistoryList` em largura total no topo, com o relatório
  completo abaixo quando uma partida é selecionada (a lista antiga não cabia largura nenhuma que
  desse pra usar `RecentMatchRow`, que precisa de ~700px de grade).
- **`MatchParticipantsCard`** (novo, exportado) — os dois times lado a lado, jogador do Sparta
  discretamente destacado (`ring` no avatar), sem julgamento sobre os outros 9 jogadores.
- **`MatchTimelineCard`** (novo, exportado) — só os fatos preservados (mortes antes de 10/15min,
  diferença de ouro aos 15min, eventos de objetivo com timestamp). Nunca narra causa e efeito —
  cada linha é um fato isolado com marca de tempo, não uma frase de "X causou Y".
- **`RecentHistoryComparisonCard`** (novo, exportado) — "nesta partida" vs "sua média recente",
  em cards de valor em vez de mais uma fileira de barras empilhadas (pedido explícito de reduzir
  a dependência de barra de progresso). Usa `compareMatchToRecentHistory` do core.
- **`DraftComparisonSection`** reestruturada em dois blocos rotulados — "Antes da partida"
  (escolha registrada + o que era conhecido no draft) e "Observado na partida" — sem mudar
  nenhum texto/dado já exibido, só separando visualmente decisão de resultado. O aviso "a
  correspondência não significa causalidade" permanece.
- **Cor de resultado (verde/vermelho)** continua em uso controlado (borda lateral do card de
  partida, badges) — nunca superfície inteira saturada.

## Bug real corrigido no caminho

A validação real no Electron (CDP, conta Zekerus#117) encontrou 401 silencioso no histórico
novo. Investigação: `/players/:puuid/recent-matches`, `/players/:puuid/growth-journey`,
`/players/:puuid/champion-performance` e `/players/:puuid/champions/:championId/role-evidence`
viraram `OWN_RESOURCE` na Etapa 31C (autorização deriva do bearer, não do puuid da URL), mas os
clientes do desktop (`api-client.ts`) nunca foram atualizados pra mandar o header
`Authorization` nessas quatro funções — elas foram escritas quando essas rotas ainda eram
públicas por puuid (Fase 1/2). Isso quer dizer que, desde a Etapa 31C, toda chamada real dessas
quatro funções vinha falhando em silêncio (nenhuma etapa entre a 31C e a 31G tinha revalidado
Pós-game/Evolução no Electron real depois do endurecimento). Corrigido: as quatro funções
passaram a exigir `token` como primeiro parâmetro e mandar `Authorization: Bearer`;
`GrowthJourneyScreen` ganhou a prop `sessionToken` que faltava (nunca tinha recebido nenhuma) e
`App.tsx` passou a fornecê-la. `fetchMatchHistory` (nova, desta etapa) recebeu o mesmo tratamento
desde o início, então não repetiu o defeito.

## Validação real

Docker reconstruído (API), Postgres real, conta Zekerus#117 (22 partidas sincronizadas):

- `GET /players/:puuid/match-history` e `GET /matches/:matchId/participants` responderam 200
  com dado real (10 participantes, times 100/200 corretos, jogador rastreado identificado).
- Reanálise de uma partida real expôs `goldDiffAt15: -2181` e 24 eventos de objetivo com
  timestamp reais (antes, ambos `undefined` — confirma que o campo aditivo funciona ponta a
  ponta, não só no tipo).
- Electron real via CDP (`electron-vite dev`, não uma aba de navegador comum): login real,
  navegação até "Partidas e pós-game", histórico carregando 20 de 22 partidas reais agrupadas
  em "Mais antigas", abertura de uma partida real (Vel'Koz SUPPORT, derrota) com os 10
  participantes, linha do tempo real (mortes/ouro/objetivos com timestamp), comparação com a
  média recente real (21 partidas anteriores) e nenhum erro de console durante todo o fluxo
  (login → navegação → seleção de partida).
- Responsividade confirmada em 1000/1280/1600px: `scrollWidth === clientWidth` nas três larguras,
  sem scroll horizontal.
- Zero `NaN`/`Infinity`/`undefined` no texto renderizado, zero imagem quebrada.

## Não regressão

Mesma recomendação controlada de sempre (JUNGLE, pick 3, Ahri aliada, Lee Sin inimigo, bans
55/91) → 5 candidatos idênticos à linha de base (Viego 58.7/0.9, Udyr 58.5/0.5, Vi 55.3/0.5,
Nocturne 53.3/0.5, Graves 50.1/0.5). `release-etapa27c-v1` `ACTIVE`, `artifactHash`
(`8878a657…`) e `configHash` (`fa9dbde1…`) iguais antes e depois. Replay do snapshot novo:
**`EXACT_REPLAY`, 0 divergências**.

## Testes

**1211 testes** no monorepo: `packages/core` 635 (+10: 5 `match-vs-recent-history.test.ts`, 1
`goldDiffAt15`/`objectiveEvents` em `post-game-analysis.test.ts`, e os tipos novos sem função não
precisam de teste próprio, mesmo padrão de `match-observation.ts`), `packages/riot` 97 (sem
mudança), `apps/api` 348 (+7: 2 `match-participants-repository.test.ts`, 4
`match-history-repository.test.ts`, 3 novos em `routes.test.ts` de `matches`/`players`), `apps/desktop`
115 (+11: 4 `match-history-grouping.test.ts`, 4 `MatchHistoryList.test.tsx`, 7 novos em
`PostGameScreen.test.tsx` para os três cards novos), raiz 15 (sem mudança), analyzer Python 1
(sem mudança). `apps/api` isolado e via `pnpm -r test` completo passaram sem flakiness nesta
sessão (a contenção documentada desde a Etapa 26b não se manifestou desta vez, executado uma
única vez).

## Fora desta etapa

Histórico do motor e Laboratório de calibração não foram tocados (redesign fica pra uma etapa
futura). Modo carreira, coach ao vivo, dado global, RSO real, serviço de email real, site
institucional, domínio e VPS seguem fora de escopo, como em todas as etapas anteriores.
