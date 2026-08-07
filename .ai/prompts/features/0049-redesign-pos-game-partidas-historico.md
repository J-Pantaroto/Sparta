---
status: IMPLEMENTADA
solicitado_em: 2026-08-07 01:00
implementado_em: 2026-08-07 05:55
---

# Etapa 31H — Redesign do pós-game, partidas e histórico pessoal

## Pedido original

> Modernizar exclusivamente: visão de pós-game, detalhe de partida, histórico pessoal de
> partidas, comparação factual com o snapshot pré-game/recomendação, e visualização de métricas
> observadas. Não alterar cálculos, inferências, vínculo Match-V5, snapshots ou motor de
> recomendação. Histórico com lista compacta e escaneável, filtros só do que o backend consegue
> responder (período/campeão/posição/fila/V-D), agrupamento temporal, detalhe de partida com
> cabeçalho + performance pessoal só com métricas genuinamente disponíveis, visão dos 10
> participantes quando o dado permitir, timeline factual sem narrativa causal, filosofia factual
> preservada (nunca "o que teria acontecido se..."), comparação pré-game × observado sem rotular
> recomendação como certa/errada pelo resultado, classificação de escolha só do snapshot
> persistido (PRIMARY/ALTERNATIVE/NOT_IN_SNAPSHOT), separação visual entre decisão e execução,
> resumo de performance evitando barras empilhadas repetitivas, comparação com histórico pessoal
> sem vazamento temporal, gráficos reaproveitando a fundação da Etapa 31E, insights só com regras
> factuais já existentes, estados de vínculo/disponibilidade honestos, direção visual reaproveitando
> 31E-31G, cores de resultado como estado semântico controlado, responsividade e acessibilidade
> completas, performance sem virtualização prematura, checklist extenso de teste, não regressão
> completa (Match-V5, snapshot, bundle, recomendação, scores, release ativa, hashes, replay
> EXACT_REPLAY), fluxo oficial completo de teste/publicação. Não redesenhar Histórico do motor
> nem Laboratório de calibração nesta etapa; não implementar modo carreira, coach ao vivo, dado
> global, RSO real, serviço de email real, site institucional, domínio ou VPS.

## Notas de implementação

Relatório completo em `docs/post-game-match-history-redesign.md`. Resumo:

**Backend (aditivo)**: `MatchParticipantSummary`/`MatchParticipantsOverview` (novo tipo, sem
campo de nível — não existe na Riot nem no schema), `compareMatchToRecentHistory` (nova função
pura, média só de partidas estritamente anteriores, nunca vaza a própria partida ou o futuro),
`MatchPerformanceMetrics.goldDiffAt15`/`objectiveEvents` (aditivo, já existiam internamente e só
não saíam no contrato). Duas rotas novas (`GET /matches/:matchId/participants`,
`GET /players/:puuid/match-history`), as duas `OWN_RESOURCE` na matriz de autorização. Mapper de
enriquecimento por partida extraído e compartilhado com `/me/player-profile` sem mudar o
comportamento dela.

**Frontend**: `MatchHistoryList` (filtros + agrupamento temporal + "carregar mais"),
`MatchParticipantsCard` (10 participantes, dois times), `MatchTimelineCard` (fatos com
timestamp, zero causalidade), `RecentHistoryComparisonCard` (cards de valor, não mais barras),
`DraftComparisonSection` reestruturada em "Antes da partida"/"Observado" sem mudar texto/dado.

**Bug real corrigido no caminho**: a validação real no Electron descobriu que
`fetchRecentMatches`/`fetchGrowthJourney`/`fetchChampionPerformance`/`fetchChampionRoleEvidence`
nunca mandavam o header `Authorization`, apesar de essas rotas terem virado `OWN_RESOURCE` na
Etapa 31C — 401 silencioso desde então, nunca revalidado no Electron real depois do
endurecimento. Corrigido nas quatro funções; `GrowthJourneyScreen` ganhou a prop `sessionToken`
que nunca tinha recebido.

**Validação real**: Docker reconstruído, Postgres real, conta Zekerus#117 (22 partidas). Rotas
novas testadas via curl com token real (10 participantes corretos, histórico paginado/filtrado
correto); reanálise de uma partida real expôs `goldDiffAt15`/`objectiveEvents` reais. Electron
real via CDP (`electron-vite dev`): login real, navegação, histórico com 20/22 partidas
agrupadas, detalhe completo (participantes/timeline/comparação recente/draft) com dado real,
zero erro de console em todo o fluxo, zero `NaN`/`undefined`/imagem quebrada, sem overflow
horizontal em 1000/1280/1600px.

**Não regressão**: mesma recomendação controlada de sempre → 5 candidatos idênticos;
`release-etapa27c-v1` `ACTIVE` com hashes iguais; replay `EXACT_REPLAY`, 0 divergências.

**1211 testes** no monorepo (core 635, riot 97, api 348, desktop 115, raiz 15, analyzer 1) — 28
novos cobrindo especificamente o comportamento desta etapa (ver relatório para a lista completa
por pacote). `typecheck`/`lint`/`build` completos nos quatro pacotes TypeScript.

Histórico do motor e Laboratório de calibração não foram tocados, conforme instrução explícita.
