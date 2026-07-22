# Sparta - Contexto para Continuidade

Este arquivo é um handoff para outro agente de desenvolvimento continuar o projeto Sparta sem precisar redescobrir a base inteira.

## Pendências desta sessão (ler primeiro)

Uma sessão anterior fez uma auditoria completa do repositório (real vs mock vs so-tipo), aprovou um plano de evolução em 5 épicos (Riot Sync, Player Intelligence, Draft Intelligence, Post-Game Coach, Growth Journey) e implementou todas as 5 fases, além de um refinamento visual do desktop e correções de infra/segurança. Uma sessão seguinte **conectou o desktop às rotas reais da API** (Dashboard/Perfil/Champion Select/Pós-game/nova tela Evolução, removendo `mock-data.ts`). Esta sessão implementou a **Sub-fase 6a (tela de Configurações + tema com campeão/skin real)**, a primeira de 3 sub-fases da "Fase 6" pedida pelo usuário (6b = configuração de partidas a analisar, 6c = ordem de pick automática via LCU — ambas ainda por implementar, ver "Próximos passos recomendados"). Tudo isso **já está mergeado em `main`**.

### Sub-fase 6a: tela de Configurações + tema com campeão/skin real (sessão atual)

O seletor de tema visual era uma lista fixa de 12 campeões curados manualmente (`FEATURED_CHAMPIONS`), 1 skin cada, sem nenhuma UI de escolha de skin, morando na sidebar. O usuário pediu: mover isso pra uma tela de Configurações dedicada, deixar escolher **qualquer** campeão e **qualquer** skin dele, e permitir "baixar" a skin (salvar no disco, funcionar offline).

**Achado importante**: não precisou de nenhuma rota nova no backend Sparta. A lista completa de campeões e a lista de skins por campeão vêm direto da CDN pública da Data Dragon (mesmo padrão que `championSquareUrl`/`championSplashUrl` já usavam) — `packages/riot/src/datadragon/client.ts` (uso do backend, Fase 1) ficou intocado.

1. **`apps/desktop/src/renderer/src/features/datadragon.ts`** ganhou `fetchAllChampions(version)` e `fetchChampionSkins(championKey, version)`. **Bug real encontrado e corrigido durante a validação manual**: a Data Dragon inverte os nomes dos campos no `champion.json` — `id` é a string usada nas URLs (ex. `"Ahri"`), `key` é o id numérico como string (ex. `"103"`); a primeira versão do código tinha isso trocado, o que quebrava todos os ícones do grid (renderizavam URLs tipo `.../champion/266.png` em vez de `.../champion/Aatrox.png`). Corrigido e validado no navegador contra os ~170 campeões reais.
2. **Novo `features/ChampionSkinPicker.tsx`** — fluxo de 2 passos: grid com busca de todos os campeões → grid de skins do campeão escolhido (nomes reais, ex. "Ezreal de Nottingham", "Ezreal Gélido") → clicar numa skin aplica como tema, botão "Baixar" separado.
3. **`featured-champion-context.tsx`** reescrito — sem lista estática, `FeaturedChampionOption` ganhou `skinName`/`localSplashPath?`, persistido em `localStorage` como JSON (antes só a `key`). Call sites de splash art em `App.tsx` (login e Dashboard) preferem `localSplashPath` quando existir.
4. **Download real pro disco** — primeiro uso de IPC request/response no app (`ipcRenderer.invoke`/`ipcMain.handle`, diferente do padrão push-only já usado por `sparta:gameflow-phase`). `apps/desktop/src/main/index.ts` ganhou `registerSkinDownloadHandler()` (`sparta:download-skin`, escreve em `app.getPath("userData")/skins`); `preload/index.ts`/`sparta-global.d.ts` ganharam `window.sparta.downloadSkin(url, fileName)`.
5. **Novo `features/SettingsScreen.tsx`** + novo item de nav "Configurações" (`Page` ganhou `"settings"`). `ChampionThemePicker.tsx` (antigo, sidebar) removido.

Validado manualmente contra a API real e a conta Zekerus#117 via `electron-vite dev` + Browser tool: grid de ~170 campeões reais carregando (depois do fix do bug id/key), busca funcionando, troca de campeão→skin→aplicar tema confirmada (Dashboard passou a usar a splash art do Ezreal escolhido), persistência em `localStorage` no formato novo confirmada. **Não validado nesta sessão**: o download real pro disco (`window.sparta.downloadSkin`) — o bridge `window.sparta` só existe dentro do processo Electron real (via preload), não numa aba de navegador comum apontando pro dev server do Vite; o código foi revisado mas precisa de um teste dentro do app Electron empacotado/rodando de verdade.

### Desktop conectado às rotas reais (sessão anterior)

Desde a Fase 1, só autenticação e `POST /players/link-riot-account` usavam a API real no desktop — as 5 telas principais rodavam 100% em cima de `apps/desktop/src/renderer/src/features/mock-data.ts` (2 campeões hardcoded) ou texto estático, mesmo com todo o backend real já entregue nas Fases 1-5.

1. **`apps/desktop/src/renderer/src/features/api-client.ts`** ganhou `fetchPlayerProfile`, `fetchChampionPerformance`, `fetchRecentMatches`, `fetchGrowthJourney` (públicas, só precisam do `puuid`), `fetchDraftRecommendations`, `analyzePostgame`, `fetchPostgameReport` (autenticadas, resolvem a conta Riot no servidor - nunca recebem `puuid` do cliente). Nova classe `ApiError` (com `status`) substitui o `Error` genérico anterior, necessária pro fluxo de "GET primeiro, POST só se 404" do Pós-game.
2. **Novo hook `features/use-async-data.ts`** (`useAsyncData<T>(fn, deps)` → `{data, status, error}`) — evita repetir boilerplate de loading/erro em cada tela.
3. **`Dashboard`/`Profile`/`ChampionSelect`** (inline em `App.tsx`) trocaram dado mockado por `fetchPlayerProfile`/`fetchDraftRecommendations` reais. `Profile` agora também mostra `strengths`/`weaknesses` (reais desde a Fase 2, nunca renderizados no desktop até agora). `ChampionSelect` mostra um aviso leve quando não há conta Riot vinculada (o backend já degrada pra perfil neutro sozinho, nunca erro).
4. **Nova tela `features/PostGameScreen.tsx`** — lista as últimas partidas (`fetchRecentMatches`), ao clicar tenta `fetchPostgameReport` (GET) primeiro e só cai pra `analyzePostgame` (POST) em 404; botão "Reanalisar" chama o POST direto. Lista de partidas mostra só `Campeão #<id>` (sem ícone/nome) porque `RecentChampionMatch` não traz `championName` e não há catálogo de campeões exposto ao desktop hoje - resolver isso é trabalho novo, não coberto aqui.
5. **Nova tela `features/GrowthJourneyScreen.tsx`** — novo item de navegação "Evolução" (`Page` ganhou `"growth"`), mostra `weaknessTrends`/`matchesAnalyzed` reais da Fase 5.
6. **`mock-data.ts` removido** — nada mais o importava.

Validado manualmente contra a API real (Docker) e a conta Zekerus#117 via `electron-vite dev` + Browser tool: Dashboard/Perfil/Evolução com dado real, Champion Select gerando recomendações reais (lista vazia nesse teste específico - pool de `ChampionTag` ainda só tem 2 campeões curados, comportamento honesto esperado, não bug), Pós-game lendo relatório já persistido e reanalisando com sucesso.

O que ficou deliberadamente fora de escopo:

- **Catálogo de campeões pro desktop** (resolver `championId` → nome/ícone fora de `PlayerChampionStats`/`PickRecommendation`, que já trazem `championName`) — afeta só a lista de partidas do Pós-game hoje.
- **Fase de temas com skins** (pedida pelo usuário nesta sessão, pra depois) — ver desenho de alto nível abaixo.

### Fase 6 (Configurações do app) — 6a pronta, 6b/6c pendentes

Pedido do usuário, dividido em 3 sub-fases sequenciais (mesmo padrão de PR pequeno das Fases 1-5) porque tocam áreas quase disjuntas do código:

- **6a (pronta, ver acima)**: tela de Configurações + tema com campeão/skin real + download pro disco.
- **6b (não implementada)**: nova configuração pessoal "quantas partidas o Sparta deve analisar" (ex. últimas 20/50/100, teto 200). Desenho: migração `PlayerProfile.matchAnalysisLimit Int @default(50)`; `findParticipationHistory`/`findPostgameReportsByPuuid` ganham `limit?` opcional (`take` do Prisma); nova `findMatchAnalysisLimitByPuuid` em `player-stats-repository.ts`; `recomputeChampionStats`/`computeAndPersistPlayerInsights` passam a receber o limite (efeito só no próximo sync, mesma lógica de hoje); rotas novas `GET`/`PUT /players/settings` (autenticadas, valida `[1,200]`, dispara `syncPlayerMatches` na hora); seção nova no `SettingsScreen.tsx`.
- **6c (não implementada)**: ordem de pick automática via LCU, substituindo o input manual 1-5 do Champion Select. Desenho: tipar de verdade `LcuChampionSelectSnapshot.actions`/`myTeam`/`theirTeam` (hoje `unknown[]`) em `packages/riot/src/lcu/read-only-client.ts`; nova `derivePickOrder(snapshot)` pura (conta picks `completed` de companheiros de time antes do próprio, +1 — `DraftState.pickOrder<=1` já significa "blind pick" no `recommendation-engine.ts`); segundo poll no `apps/desktop/src/main/index.ts` (mesmo intervalo de 2500ms do `gameflow-phase`) + novo canal IPC `sparta:pick-order`; `ChampionSelect` mostra o valor automático quando disponível, mantém o input manual como fallback (sem cliente do League aberto).
- Plano completo com a crítica de design em `C:\Users\jhona\.claude\plans\bright-drifting-melody.md` (se ainda existir na máquina).

### O que a Fase 5 entregou (Growth Journey)

"Growth Journey" era só um nome no roadmap — nenhuma especificação existia em lugar nenhum do repositório antes desta sessão (nem em `SPARTA_CODEX_INSTRUCTIONS.md`, nem em `docs/`, nem em `domain.ts`). O usuário definiu o escopo explicitamente nesta sessão: rastrear se os pontos fracos identificados pelo Post-Game Coach (Fase 4) estão melhorando ou piorando ao longo das partidas analisadas.

**Achado-chave**: não precisou de nenhuma tabela nova nem migração — primeira fase do projeto sem uma. Cada `PostgameReport.reportJson` (Fase 4) já é um `PostGameAnalysis` completo com `weaknesses: PlayerWeakness[]` de `code`/`label` estáveis; Growth Journey é 100% derivável do que já está persistido, comparando dois blocos de relatórios (mais recente vs anterior) exatamente como `computeRecentForm` já faz (Fase 2).

1. **Novo módulo puro `packages/core/src/aggregation/growth-journey.ts`** — `computeWeaknessTrends(reports)` calcula, por código de fraqueza, a taxa de presença no bloco de até 10 relatórios mais recentes (`recentRate`) vs no bloco de até 10 anteriores (`previousRate`), com `trend: "improving"|"worsening"|"stable"|"new"|"resolved"` (`"resolved"`/`"new"` quando o código sai/entra completamente de um bloco pro outro; `"improving"`/`"worsening"`/`"stable"` por diferença de taxa acima/abaixo de `RATE_TREND_THRESHOLD_POINTS=20`). Piso de `MIN_BLOCK_REPORTS=3` aplicado aos dois blocos (não só ao anterior, diferente de `computeRecentForm`) — com poucos relatórios, um bloco pequeno faz 1 partida oscilar a taxa em 50-100 pontos; sem os dois blocos atingindo o piso, todo código vira `"stable"`/`confidence:"low"`, nunca inventa direção. `computeGrowthJourney(reports)` é um wrapper fino que soma `matchesAnalyzed`. **Limitação documentada em comentário**: `weaknesses` de cada relatório já é um corte top-3 (Fase 4), então presença é "estava entre os 3 piores sinais daquela partida", não uma medida contínua — um código na fronteira do corte pode entrar/sair mesmo com a métrica quase parada.
2. **Novos tipos `WeaknessTrend`/`GrowthJourney`** em `packages/core/src/types/domain.ts`.
3. **Nova consulta `findPostgameReportsByPuuid(puuid)`** (`apps/api/src/modules/postgame/postgame-repository.ts`) — lê todos os `PostgameReport` do jogador via `Match.startedAt` decrescente, excluindo matches sem `startedAt` (nullable no schema; incluí-los deixaria o Postgres jogar nulls pra frente na ordenação desc, corrompendo a divisão dos blocos — guarda de anomalia de dado, não caso esperado).
4. **Nova rota `GET /players/:puuid/growth-journey`** (`apps/api/src/modules/players/routes.ts`) — sem autenticação, mesmo padrão de `/recent-matches`/`/champion-performance` (já públicas por puuid).

Validado ponta a ponta contra a conta real Zekerus#117: 8 partidas reais de Vel'Koz SUPPORT analisadas via `POST /postgame/analyze`, `GET /players/:puuid/growth-journey` retornou taxas conferidas manualmente contra os 8 relatórios (`kda_abaixo` 62.5%, `morre_demais` 50%, `visao_abaixo` 25%, `baixa_participacao_abates` 25%), `trend: "stable"`/`confidence: "medium"` honestamente refletindo que ainda não existe um segundo bloco de partidas mais antigas pra comparar, ordenação por magnitude de mudança correta.

O que ficou deliberadamente fora de escopo (confirmado com o usuário antes de implementar):

- Conectar o desktop — adiado de novo, mesmo padrão das Fases 1-4.
- Tendência de `strengths` (pontos fortes) — só `weaknesses`, conforme escopo escolhido pelo usuário.
- Progressão de `severity` — só presença/ausência por taxa, não a severidade da fraqueza quando presente.
- Metas/objetivos definidos pelo jogador (goal-setting) — outra opção apresentada ao usuário, não escolhida.

### O que a Fase 4 entregou (Post-Game Coach)

`POST /postgame/analyze` e `GET /postgame/:matchId` eram 100% mock: o POST aceitava dado inventado pelo próprio cliente (`championName`/`won`/`deathsBefore10`/`csAt10`) e devolvia texto fixo que nem batia com o tipo real `PostGameAnalysis`; o GET sempre retornava `"not_found"`.

**Achado que definiu o desenho**: `DraftSession`/`PickRecommendation` nunca são gravados em lugar nenhum (`recommendPicks` é uma função pura chamada ao vivo no champion select, o resultado é sempre descartado) — não existe, hoje, nenhum jeito de saber "o que o draft recomendou" pra uma partida real já jogada. Por isso `expectedPlan` é honestamente redefinido como derivado do **histórico próprio do jogador** nesse campeão+role (ou da baseline geral do role, se for a primeira vez), nunca como lembrança de uma recomendação armazenada que nunca existiu — o texto gerado deixa isso explícito.

1. **Módulo compartilhado `packages/core/src/scoring/dimension-signals.ts`** — extraído de `player-insights.ts` (Fase 2) sem mudar comportamento (`RATIO_DIMENSIONS`/`SCORE_DIMENSIONS`, `buildRatioSignal`/`buildScoreSignal`, thresholds, `ratioMagnitude`/`scoreMagnitude`, `round`). Generico sobre "um valor de razão/score já calculado" — não sabe se veio de uma média entre partidas (Fase 2) ou do valor bruto de uma única partida (Fase 4).
2. **Novo módulo puro `packages/core/src/postgame/post-game-analysis.ts`** — `generatePostGameAnalysis` calcula 7 dimensões por razão (kda/cs/damage/gold/vision/kp/objective, valor da partida ÷ baseline do role) + mortes como dimensão de score, reaproveitando o módulo compartilhado; `confidence` fixo em `"low"` em todo item (uma partida é sempre baixa confiança como sinal *geral*, mesmo sendo 100% precisa sobre o que aconteceu nela); guarda partidas curtas/remake (`durationSeconds < 300`) pra não gerar sinal a partir de zeros default da timeline; `pickAssessment`/`executionSummary`/`expectedPlan` são compostos por fragmentos de texto independentes (resultado + sinal mais forte + histórico), não uma árvore de decisão sobre o produto cartesiano completo — evita explosão combinatória de templates.
3. **Nova consulta `findMatchDetail(matchId, puuid)`** (`apps/api/src/modules/matches/match-repository.ts`) — busca Match+MatchTimeline+os 10 MatchParticipant de uma partida específica (diferente de `findParticipationHistory`, que agrega o histórico inteiro sem timeline nem outros participantes), localiza a linha do próprio jogador e o laner oposto (mesmo role, `teamId` diferente).
4. **`POST /postgame/analyze` e `GET /postgame/:matchId` religados com dado real** (`apps/api/src/modules/postgame/routes.ts`) — ambos autenticados; o POST encolhe o body pra só `{ matchId }` (servidor resolve tudo a partir de dado real, sem mais confiar em performance vinda do cliente) e persiste o resultado em `PostgameReport` via upsert (reanalisar depois de mais histórico acumulado atualiza o texto, não devolve relatório velho); o GET lê o relatório persistido, 404 honesto se ainda não analisado. Migration `20260722020000_postgame_report_unique` adiciona `@@unique([matchId, puuid])` e `updatedAt` (tabela estava vazia, sem necessidade de backfill).

Validado ponta a ponta contra a conta real Zekerus#117: análise real gerada pra uma partida sincronizada (Vel'Koz SUPPORT vs Lulu, derrota com mortes cedo — pontos fracos/dicas coerentes com a timeline real), persistência confirmada no Postgres, GET lendo o relatório salvo, reanalisar a mesma partida confirmado como upsert (não duplica linha).

O que ficou deliberadamente fora de escopo (confirmado com o usuário antes de implementar):

- Conectar o desktop (tela "Pós-game" em `App.tsx`, hoje um parágrafo estático) — adiado de novo, mesmo padrão das Fases 1-3.
- Dicas específicas de objetivos (`objectiveEvents`) — o formato atual não preserva atribuição de time, precisaria de plumbing extra.
- Variar `confidence` conforme o histórico do campeão concorda ou não com a partida específica — fica `"low"` fixo nesta versão.
- Persistir `DraftSession`/`PickRecommendation` no fluxo de champion select — não ajudaria retroativamente as partidas já jogadas e dobraria o escopo desta fase.

### O que a Fase 3 entregou (Draft Intelligence)

O bloqueio principal: `persistMatch` só gravava o participante rastreado (o jogador Sparta), descartando os outros 9 — sem isso não dá pra saber quem foi o adversário de rota. Corrigido, e a rota religada com dado real:

1. **Persistência dos 10 participantes por partida** (`apps/api/src/modules/matches/match-repository.ts`) — `persistMatch` agora recebe a lista completa de participantes (o mapper `mapMatchToSummaries` do `packages/riot` já retornava os 10, só não eram todos gravados) e grava todos numa `createMany` dentro da mesma transação, com `riotAccountId` resolvido por puuid (não só o de quem sincronizou — cobre o caso de dois usuários Sparta na mesma partida) e `championId` desconhecido do catálogo pulado (não aborta a partida inteira). Migration `20260721220000_matchparticipant_team_and_unique` adiciona `MatchParticipant.teamId` (nullable) e `@@unique([matchId, puuid])`.
2. **Backfill retroativo** (`apps/api/src/modules/matches/backfill-participants.ts`, CLI `pnpm --filter @sparta/api backfill:match-participants`) — reconstrói os participantes faltantes das partidas já sincronizadas antes da Fase 3 a partir do `Match.rawJson` já salvo desde a Fase 1, sem nenhuma chamada nova à Riot API. Também corrige o `teamId` de linhas que já existiam antes da Fase 3 (o `createMany` com `skipDuplicates` pula a linha do jogador rastreado por já existir, então sem esse reparo explícito o `teamId` dela ficaria nulo pra sempre — `findMatchesMissingParticipants` reprocessa qualquer partida com participante sem `teamId`, não só as com menos de 10 linhas).
3. **Novo módulo puro `packages/core/src/aggregation/matchup-stats.ts`** — `aggregateMatchupData` pareia os dois laners opostos (mesmo role, times diferentes) por partida e agrega globalmente (todas as partidas persistidas, não só de um jogador — matchup é sinal de meta, não pessoal) em `MatchupData[]`, com shrinkage rumo ao neutro 50 proporcional à amostra (constante `K=10`, ajustável) pra não deixar 1 partida decidir um "faceroll". `MatchupData` ganhou `confidence: Confidence`. Não emite entrada pra pares sem nenhuma partida (o fallback `?? 50` do motor já cobre a ausência).
4. **`POST /drafts/recommendations` religada com dado real** (`apps/api/src/modules/drafts/routes.ts`) — agora autenticada; resolve `player`/`championStats` da conta Riot do usuário (reaproveitando `findChampionStatsByPuuid`/`findPlayerInsightsByPuuid`/`derivePreferredRoles` da Fase 1/2), `championTags` da tabela real (`findAllChampionTags`, novo em `catalog/champion-repository.ts`) e `matchups` calculados na hora via `findLaneMatchupHistory(draft.playerRole)` (novo `matches/matchup-repository.ts`) + `aggregateMatchupData`. Usuário autenticado sem conta Riot vinculada recebe um perfil neutro/vazio (poucas ou nenhuma recomendação honesta), nunca o mock antigo. `compositionRules` saiu de `mock-data.ts` pra `apps/api/src/config/composition-rules.ts` (nunca foi mock de verdade, é config de produto).
5. **Corrigido bug real de seed do `ChampionTag`** — `apps/api/prisma/seed.ts` hardcodava só a Orianna em TypeScript; `data/seeds/champion-tags.json` (que já tinha Orianna + Ahri) só era citado num comentário obsoleto, nunca lido de fato. Reescrito pra ler e fazer upsert de cada entrada do JSON — agora `pnpm --filter @sparta/api prisma:seed` cobre os dois campeões, e adicionar mais é só editar o JSON (`Dockerfile.api` também precisou copiar `data/` pra imagem, que antes só existia no host).

Validado ponta a ponta contra a conta real Zekerus#117: backfill rodado (20 partidas, 10 participantes cada), matchup real de Vel'Koz (SUPPORT) confirmado (`score: 54.5` batendo com a fórmula de shrinkage pra 1 vitória em 1 partida), sync novo confirmado gravando os 10 participantes com `teamId` desde a primeira vez.

O que ficou deliberadamente fora de escopo (confirmado com o usuário antes de implementar):

- Conectar o desktop (`ChampionSelect` em `App.tsx`) à rota real — continua usando `features/mock-data.ts` local, próximo passo separado.
- Tornar `/drafts/pre-game-analysis` real — problema de design à parte (motor de geração de texto explicativo), não só fiação; continua 100% estático.
- Expandir `ChampionTag` além dos 2 campeões do seed — sem bloqueio técnico agora, é curadoria manual contínua (editar `data/seeds/champion-tags.json`).
- Cache/pré-computação de matchups — computado na hora a cada chamada da rota, deliberadamente (dado é global, não amarrado a um evento de sync de um jogador). Revisitar se a latência incomodar conforme o histórico crescer.

### O que a Fase 2 entregou (Player Intelligence)

1. **Novo módulo puro `packages/core/src/aggregation/player-insights.ts`** — `computeRecentForm(history)` (forma recente do jogador entre todos os campeões/roles, não por campeão; compara o bloco das últimas 10 partidas com o bloco imediatamente anterior pra decidir `trend`) e `derivePlayerStrengthsWeaknesses(championStats)` (deriva até 3 pontos fortes e até 3 pontos fracos a partir de 9 dimensões — kda, cs, dano, ouro, visão, kp, objetivos, winrate, mortes — agregadas por média ponderada por jogos entre os campeões elegíveis, com `kp`/`objective` excluindo campeões cujo valor é exatamente 0, já que isso significa "sem dado" (`challenges` ausente da Riot em patches antigos) e não "0% real"). Cada item de `strengths`/`weaknesses`/`recentForm` agora carrega `confidence: Confidence`, calculado com `confidenceFromGames` (movido de privada pra exportada em `champion-performance.ts`, junto com `roleBaselines`/`normalizeInverse`/`clamp`, reaproveitados pelo novo módulo em vez de duplicar a matemática).
2. **Wiring na API** (`apps/api/src/modules/players/player-stats-repository.ts`): `computeAndPersistPlayerInsights(riotAccountId, puuid)` roda logo após `recomputeChampionStats` no fluxo de sync (`apps/api/src/modules/sync/riot-sync-service.ts`), só quando a rodada trouxe partida nova (`touchedPairs.length > 0` — evita reler o histórico inteiro em todo sync repetido sem partida nova), envolvida em try/catch (uma falha aqui não derruba um sync de partidas que já funcionou). `findPlayerInsightsByPuuid(puuid)` lê o resultado persistido (`PlayerProfile.strengthsJson`/`weaknessesJson`/`recentFormJson`, colunas que já existiam no schema mas nunca eram escritas/lidas) e cai num default neutro honesto se o profile ainda não existir.
3. **`GET /players/:riotName/:tagLine/profile`** troca o bloco hardcoded (`strengths: []`, `weaknesses: []`, `recentForm` zerado) por dado real via `findPlayerInsightsByPuuid`.
4. Testes novos em `packages/core/src/aggregation/player-insights.test.ts` (histórico vazio, fronteiras de confiança, detecção de tendência, cortes de sinal/severidade, corte top-3, jogador mono-role, exclusão de kp/objective ausente).

O que ficou deliberadamente fora de escopo na Fase 2 (o item de persistir os 10 participantes/matchups foi resolvido na Fase 3, o de `PostGameAnalysis` na Fase 4, ver acima):

- Conectar o desktop a essas rotas reais de perfil — o renderer ainda usa `features/mock-data.ts` local (que já foi atualizado só o suficiente pra não quebrar o typecheck com o novo campo `confidence`).

### O que a Fase 1 entregou (já em `main`)

Todo mundo que antes retornava os mesmos 2 campeões mockados (Orianna/Ahri) agora usa dado real, sincronizado da Riot API e persistido no Postgres. Validado ponta a ponta contra a conta real Zekerus#117:

1. **Catálogo de campeões real** via Data Dragon (`apps/api/src/modules/catalog/`) — antes só havia 1 campeão no seed manual, agora `Champion` é sincronizado (~170 registros, `pnpm --filter @sparta/api catalog:sync`). `ChampionTag` continua manual (Data Dragon não fornece os atributos de gameplay do Sparta) — o motor de recomendação já tolera isso.
2. **`RiotApiClient` conectado de verdade** (`packages/riot/src/clients/riot-api-client.ts`) — existia mas nunca era chamado pela API. Ganhou rate-limit real (`packages/riot/src/rate-limit/riot-request.ts`: respeita `Retry-After`, só retenta 429/502/503/504) e `getMatchTimeline`. `POST /players/link-riot-account` agora chama Account-V1 de verdade em vez de gerar um puuid fake.
3. **Mapeadores puros Match-V5** (`packages/riot/src/mappers/`) — raw da Riot → `MatchSummary`/`MatchTimelineSummary`. `killParticipation`/`objectiveParticipation` ficam `undefined` quando a Riot não manda o objeto `challenges` (patches antigos) em vez de inventar 0 — por isso `MatchParticipant.killParticipation`/`objectiveParticipation` viraram nullable no schema (migration `20260716010000_nullable_participant_challenge_stats`).
4. **Sync incremental real** (`apps/api/src/modules/sync/riot-sync-service.ts`) — `POST /players/sync` agora é autenticado, resolve a conta Riot do próprio usuário (não aceita mais `riotId` solto no payload), busca só partidas novas (`Match.matchId` único garante idempotência), processa sequencialmente (não paralelo, por causa do rate limit de chave de dev), teto de 20/50 partidas por chamada.
5. **Agregação real de `PlayerChampionStats`** (`packages/core/src/aggregation/player-champion-stats.ts`) — `PlayerProfile` nunca era criado em lugar nenhum (bloqueador oculto corrigido: create-if-missing no `player-stats-repository.ts`). Média de `killParticipation`/`objectiveParticipation` só sobre partidas que têm o dado.
6. **As 3 rotas GET de jogador** (`/profile`, `/recent-matches`, `/champion-performance`) trocaram o mock pelas queries reais.

O que ficou deliberadamente fora de escopo na Fase 1 (o item de strengths/weaknesses/recentForm foi resolvido na Fase 2, o de matchups/participantes na Fase 3, ver acima):

- Fila real (BullMQ/Redis) para o sync — hoje é síncrono, limitado por chamada; documentado como troca deliberada, não definitiva.
- `PostGameAnalysis` continua sem nenhuma função geradora.

Antes de rodar os testes manuais que dependem da Riot API real, o `.env` precisa de uma `RIOT_API_KEY` válida (as de desenvolvimento expiram em 24h e precisam ser regeradas no [Riot Developer Portal](https://developer.riotgames.com/)).

```bash
npx pnpm@10.34.4 install
docker compose up -d
npx pnpm@10.34.4 --filter @sparta/api prisma:generate
npx pnpm@10.34.4 --filter @sparta/api prisma migrate deploy --schema prisma/schema.prisma
npx pnpm@10.34.4 typecheck
npx pnpm@10.34.4 lint
npx pnpm@10.34.4 test
npx pnpm@10.34.4 build
```

## Leitura obrigatória

Antes de alterar código, leia estes arquivos:

1. `SPARTA_CODEX_INSTRUCTIONS.md` - instruções completas originais do projeto.
2. `README.md` - visão operacional do monorepo.
3. `docs/architecture.md` - arquitetura de alto nível.
4. `docs/riot-compliance.md` - limites de produto e compliance Riot.
5. `docs/scoring-model.md` e `docs/draft-recommendation.md` - regras dos motores iniciais.

## Produto

Sparta é um aplicativo desktop para jogadores de League of Legends focado em:

- análise de perfil do jogador;
- recomendação de campeões no champion select;
- análise pré-game baseada no draft;
- análise pós-game comparando expectativa do draft com execução real.

Escopo explicitamente proibido:

- overlay durante a partida;
- tracking de cooldowns ou summoner spells em tempo real;
- alertas in-game;
- automação de pick, ban, troca de campeão ou runas;
- qualquer assistência durante a partida;
- qualquer uso de Riot API key no frontend/desktop.

O MVP deve permanecer pré-game e pós-game.

## Estado atual

Branch principal: `main`.

Remote esperado:

```txt
origin https://github.com/J-Pantaroto/Sparta.git
```

O monorepo já foi scaffoldado e enviado ao GitHub. A base atual contém:

- `apps/desktop`: Electron + React + TypeScript + Vite.
- `apps/api`: Node.js + Fastify + TypeScript + Zod + Prisma.
- `packages/core`: domínio, tipos fortes, scoring e recommendation engine.
- `packages/riot`: adaptadores iniciais para Riot API, Data Dragon e LCU read-only.
- `packages/ui`: tokens e componentes compartilhados.
- `services/analyzer`: FastAPI opcional para análises futuras em Python.
- `docs`: documentação técnica real.
- `data/seeds`: seeds editáveis de campeões, matchups e composição.
- `.github/workflows/ci.yml`: pipeline inicial.
- `docker-compose.yml`: Postgres, Redis, API e analyzer.

## Stack e versões

Use Node 20 neste ambiente. O projeto está fixado em:

```txt
pnpm@10.34.4
```

Motivo: `pnpm@10.8.2` não existe publicado no npm e `pnpm@11.x` exige Node 22.13 ou superior.

Se `pnpm` não estiver global no PATH, use:

```bash
npx pnpm@10.34.4 <comando>
```

## Comandos principais

Instalar dependências:

```bash
npx pnpm@10.34.4 install
```

Rodar API:

```bash
npx pnpm@10.34.4 dev:api
```

Rodar desktop:

```bash
npx pnpm@10.34.4 dev:desktop
```

Rodar tudo que é TypeScript:

```bash
npx pnpm@10.34.4 typecheck
npx pnpm@10.34.4 lint
npx pnpm@10.34.4 test
npx pnpm@10.34.4 build
```

Rodar analyzer Python:

```bash
python -m pip install -e "services/analyzer[test]"
python -m pytest services/analyzer
```

Subir infraestrutura:

```bash
copy .env.example .env
docker compose up -d
```

Endpoints locais:

```txt
API health:      http://localhost:3333/health
API Swagger:     http://localhost:3333/docs
Analyzer health: http://localhost:8000/health
```

## Estrutura importante

```txt
apps/
  api/
    src/app.ts
    src/server.ts
    src/modules/
    prisma/schema.prisma
  desktop/
    src/main/
    src/preload/
    src/renderer/src/App.tsx
packages/
  core/
    src/types/domain.ts
    src/scoring/champion-performance.ts
    src/draft/recommendation-engine.ts
  riot/
    src/clients/riot-api-client.ts
    src/datadragon/client.ts
    src/lcu/read-only-client.ts
  ui/
    src/theme/tokens.ts
services/
  analyzer/
    app/main.py
docs/
data/seeds/
```

## Domínio já modelado

O arquivo `packages/core/src/types/domain.ts` define os principais contratos:

- `PlayerProfile`
- `RiotAccount`
- `Champion`
- `ChampionTag`
- `PlayerChampionStats`
- `RecentForm`
- `MatchSummary`
- `MatchTimelineSummary`
- `DraftState`
- `TeamComposition`
- `PickRecommendation`
- `RecommendationReason`
- `PostGameAnalysis`
- `PlayerWeakness`
- `PlayerStrength`
- `ReplayImportJob`
- `WeaknessTrend`
- `GrowthJourney`

`MatchSummary` ganhou `startedAt` (epoch ms do `gameStartTimestamp` real da Riot) — necessário pra ordenar por recência corretamente (a forma recente pondera por índice, então importa saber qual partida é a mais nova). `MatchPerformanceMetrics.killParticipation`/`objectiveParticipation` viraram opcionais (ausentes quando a Riot não manda `challenges`). `RecentForm`, `PlayerStrength` e `PlayerWeakness` ganharam `confidence: Confidence` (Fase 2). `MatchupData` também ganhou `confidence: Confidence` (Fase 3). `WeaknessTrend`/`GrowthJourney` são novos da Fase 5.

Módulos de agregação: `packages/core/src/aggregation/player-champion-stats.ts` (`aggregatePlayerChampionStats`) — puro, agrega histórico de partidas em `PlayerChampionStats`. `packages/core/src/aggregation/player-insights.ts` (Fase 2) — `computeRecentForm`/`derivePlayerStrengthsWeaknesses`, também puro; reaproveita `confidenceFromGames`/`roleBaselines`/`normalizeInverse`/`clamp` exportados de `champion-performance.ts`. `packages/core/src/aggregation/matchup-stats.ts` (Fase 3) — `aggregateMatchupData`, também puro; pareia laners opostos e aplica shrinkage rumo ao neutro 50 conforme a amostra. `packages/core/src/scoring/dimension-signals.ts` (Fase 4) — `buildRatioSignal`/`buildScoreSignal` e as tabelas de rótulo/threshold, extraídos de `player-insights.ts` sem mudar comportamento; genéricos sobre "um valor de razão/score já calculado", reaproveitados tanto pra agregação entre partidas (Fase 2) quanto pra uma única partida (Fase 4). `packages/core/src/postgame/post-game-analysis.ts` (Fase 4) — `generatePostGameAnalysis`, puro; gera `PostGameAnalysis` de uma partida específica usando o módulo acima. `packages/core/src/aggregation/growth-journey.ts` (Fase 5) — `computeWeaknessTrends`/`computeGrowthJourney`, puro; compara blocos de `PostGameAnalysis` já persistidos ao longo do tempo, mesmo padrão de bloco de `computeRecentForm`.

Priorize evoluir esses tipos antes de duplicar estruturas em API ou desktop.

## Scoring atual

Arquivo:

```txt
packages/core/src/scoring/champion-performance.ts
```

Regras implementadas:

- score de 0 a 100;
- mínimo de 5 partidas para ranking;
- volume de jogos não aumenta score diretamente;
- volume afeta apenas confiança estatística;
- KDA usa `(kills + assists) / max(1, deaths)`;
- forma recente usa `exp(-index / decayFactor)` com `decayFactor = 8`;
- pesos diferentes para laners, jungle e suporte.

Testes:

```txt
packages/core/src/scoring/champion-performance.test.ts
```

## Recommendation engine atual

Arquivo:

```txt
packages/core/src/draft/recommendation-engine.ts
```

Entradas:

- `DraftState`
- `PlayerProfile`
- `PlayerChampionStats[]`
- `ChampionTag[]`
- `MatchupData[]`
- `CompositionRules`
- `PatchMetaData | null`

Saída:

- 3 a 5 `PickRecommendation`, com score, confiança, categoria, reasons e warnings.

Cenários já considerados:

- first pick;
- lane inimiga revelada;
- quarto/quinto pick com draft mais completo.

Testes:

```txt
packages/core/src/draft/recommendation-engine.test.ts
```

## API atual

Arquivo principal:

```txt
apps/api/src/app.ts
```

Endpoints iniciais:

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /players/:riotName/:tagLine/profile`
- `POST /players/sync`
- `POST /players/link-riot-account` (autenticado)
- `GET /players/:puuid/recent-matches?limit=10`
- `GET /players/:puuid/champion-performance`
- `GET /players/:puuid/growth-journey`
- `POST /drafts/recommendations`
- `POST /drafts/pre-game-analysis`
- `POST /postgame/analyze`
- `GET /postgame/:matchId`
- `POST /replays/import`
- `GET /replays/:jobId`

Auth (`apps/api/src/modules/auth`): senha com `scrypt` (nativo do `node:crypto`) e token de sessao assinado com HMAC-SHA256 (`node:crypto`, sem `jsonwebtoken`/`bcrypt` como dependencia). Segredo em `AUTH_TOKEN_SECRET` (ver `src/config/env.ts`; `loadEnv()` recusa subir se `NODE_ENV=production` e o segredo ainda for o default de dev). Token vai no header `Authorization: Bearer <token>`.

CORS restrito a uma allowlist (`localhost:5173` em dev + origem `null` do app empacotado via `file://`) e rate limit de 5/min em `/auth/login` e `/auth/register` (`@fastify/rate-limit`) — ver `app.ts`.

`POST /players/link-riot-account` chama Account-V1 de verdade (`apps/api/src/modules/riot-integration/account-lookup.ts`, cache de 24h via `ApiCacheEntry`) e grava o puuid real. `POST /players/sync` é autenticado, resolve a conta Riot do proprio usuario e sincroniza partidas novas de verdade (`apps/api/src/modules/sync/riot-sync-service.ts`) — ver "Pendências desta sessão" pra mais detalhes de como isso funciona.

Módulos:

```txt
apps/api/src/modules/catalog/        # catalogo de campeoes via Data Dragon (Fase 1) + findAllChampionTags (Fase 3)
apps/api/src/modules/riot-integration/  # client-factory + account-lookup (Account-V1)
apps/api/src/modules/matches/         # persistencia/consulta de Match/MatchParticipant/MatchTimeline,
                                       # backfill de participantes (Fase 3), findMatchDetail (Fase 4)
apps/api/src/modules/sync/            # orquestracao do sync incremental
apps/api/src/modules/postgame/        # POST /postgame/analyze + GET /postgame/:matchId reais (Fase 4),
                                       # findPostgameReportsByPuuid (Fase 5)
apps/api/src/config/composition-rules.ts  # constantes reais de produto pro recommendation engine (Fase 3)
apps/api/src/db/api-cache.ts          # helper generico sobre ApiCacheEntry
```

`GET /players/:riotName/:tagLine/profile`, `/recent-matches` e `/champion-performance` leem dado real (Fase 1, Tarefa 6). Desde a Fase 2, `strengths`/`weaknesses`/`recentForm` do perfil também são reais (`findPlayerInsightsByPuuid`, calculados e persistidos a cada sync via `computeAndPersistPlayerInsights`). Desde a Fase 3, `POST /drafts/recommendations` também é real (autenticada, ver acima) — `apps/api/src/routes/mock-data.ts` foi removido, não sobrou nenhum uso dele. Desde a Fase 4, `POST /postgame/analyze`/`GET /postgame/:matchId` também são reais e autenticados. Desde a Fase 5, `GET /players/:puuid/growth-journey` também é real (sem autenticação, mesmo padrão de `/recent-matches`/`/champion-performance`).

Ainda 100% mock/estático: `/drafts/pre-game-analysis`, `/replays/*` (fora do escopo até agora).

## Banco atual

Schema:

```txt
apps/api/prisma/schema.prisma
```

Migrations aplicadas e validadas contra Postgres real:

- `20260715120000_init` — schema inicial (inclui `User.passwordHash`/`displayName` pra login).
- `20260716010000_nullable_participant_challenge_stats` — `MatchParticipant.killParticipation`/`objectiveParticipation` viraram nullable (a Riot nem sempre manda o objeto `challenges`, e persistir 0 seria inventar dado).
- `20260721220000_matchparticipant_team_and_unique` (Fase 3) — `MatchParticipant.teamId` (nullable) e `@@unique([matchId, puuid])`, necessários pra persistir os 10 participantes por partida e parear laners opostos.
- `20260722020000_postgame_report_unique` (Fase 4) — `PostgameReport.updatedAt` e `@@unique([matchId, puuid])`, necessários pro upsert idempotente de relatórios pós-game (tabela estava vazia, sem backfill necessário).
- Fase 5 (Growth Journey) não precisou de nenhuma migração — primeira fase do projeto sem uma, já que tudo é derivado do `PostgameReport.reportJson` já persistido pela Fase 4.

```bash
npx pnpm@10.34.4 --filter @sparta/api prisma:generate
npx pnpm@10.34.4 --filter @sparta/api prisma migrate deploy --schema prisma/schema.prisma
npx pnpm@10.34.4 --filter @sparta/api prisma:seed
npx pnpm@10.34.4 --filter @sparta/api backfill:match-participants
```

Tabelas com uso real vs ainda sem código:

| Tabela | Status |
|---|---|
| `User`, `RiotAccount` | Real desde antes da Fase 1 |
| `Champion` | Real — sincronizado via Data Dragon (`catalog:sync`) |
| `ChampionTag` | Real — seed corrigido na Fase 3 (`prisma:seed` lê `data/seeds/champion-tags.json` de verdade agora, cobre Orianna+Ahri); Data Dragon não fornece os atributos de gameplay do Sparta, então continua manual/curado |
| `Match`, `MatchParticipant`, `MatchTimeline` | Real — persistidos pelo sync incremental; desde a Fase 3, os 10 participantes por partida (não só o rastreado), com `teamId` |
| `PlayerProfile`, `PlayerChampionStats` | Real — agregado apos cada sync; `strengthsJson`/`weaknessesJson`/`recentFormJson` tambem reais desde a Fase 2 |
| `ApiCacheEntry` | Real — cache de Account-V1 (24h) e Data Dragon (7 dias) |
| `PostgameReport` | Real — upsert por (matchId, puuid) a cada `POST /postgame/analyze` (Fase 4); lido pela Fase 5 pra Growth Journey (sem tabela nova) |
| `DraftSession`, `PickRecommendation`, `ReplayImportJob` | Ainda sem nenhum codigo que leia/escreva |

Próximo passo natural: conectar o desktop às rotas de perfil/drafts reais (hoje só auth usa a API real).

## Desktop atual

Entrada:

```txt
apps/desktop/src/renderer/src/App.tsx
```

Telas existentes:

- Login / cadastro (`features/AuthScreen.tsx`);
- Vincular conta Riot (`features/LinkRiotAccountScreen.tsx`);
- Dashboard (inline em `App.tsx`);
- Perfil (inline em `App.tsx`);
- Champion Select manual (inline em `App.tsx`);
- Pré-game (inline em `App.tsx`, ainda estático);
- Pós-game (`features/PostGameScreen.tsx`);
- Evolução (`features/GrowthJourneyScreen.tsx`);
- Configurações (`features/SettingsScreen.tsx`, novo na Sub-fase 6a).

Desde a sessão que conectou o desktop às rotas reais: Dashboard/Perfil/Champion Select/Pós-game/Evolução leem dado real via `features/api-client.ts` (`fetchPlayerProfile`/`fetchChampionPerformance`/`fetchRecentMatches`/`fetchGrowthJourney`/`fetchDraftRecommendations`/`analyzePostgame`/`fetchPostgameReport`), com loading/erro tratados pelo hook compartilhado `features/use-async-data.ts`. `mock-data.ts` foi removido. Pré-game continua estático — a rota `/drafts/pre-game-analysis` ainda é 100% mock no backend (ver "O que ficou fora de escopo" nas fases anteriores).

Fluxo de sessao (`App.tsx`): ao abrir, restaura token de `localStorage` (`sparta:token`) e chama `GET /auth/me`; sem token ou token invalido cai na tela de login; logado mas sem conta Riot vinculada cai na tela de vinculo; ambas as telas tem botao "continuar sem conta / vincular depois" para nao travar o dev local sem a API rodando. Requer `apps/api` no ar (`VITE_API_URL`, default `http://localhost:3333`); sem API a tela de login mostra erro de conexao mas o skip sempre funciona.

Deteccao automatica de champion select: `packages/riot/src/lcu/read-only-client.ts` agora le o lockfile local do League (`LcuReadOnlyClient`) e faz poll de `GET /lol-gameflow/v1/gameflow-phase` a cada 2.5s no processo main (`apps/desktop/src/main/index.ts`), repassando por IPC (`sparta:gameflow-phase`) para o renderer, que troca a aba para "Champion Select" quando a fase vira `ChampSelect`. Somente leitura, sem nenhuma acao de escrita no cliente (ver `docs/riot-compliance.md`).

Estetica: fonte unificada em `Manrope` (corpo, titulos e o wordmark "Sparta" — substituiu o par Rajdhani/Cinzel de uma sessao anterior), carregada via Google Fonts no `index.html`. Paleta migrada pra CSS custom properties em `styles/global.css` (`--color-bg`, `--color-red`, etc.), espelhando os valores de `packages/ui/src/theme/tokens.ts` sem de fato importar o pacote (`@sparta/ui` continua sem uso real pelo desktop — `theme`/`MetricCard` de la sao codigo morto do ponto de vista do desktop). `text-transform: uppercase` foi removido dos rotulos (`.page-header span`, `.auth-field label` etc.) — texto normal, so cor/peso/tamanho fazem a hierarquia agora. Adicionadas transicoes (hover em nav/cards/botoes) e animacoes de entrada (`fadeIn`/`fadeInSoft`) ao trocar de aba e ao carregar splash art — antes disso o app nao tinha nenhuma transicao. Icones/artes de campeao vem do Data Dragon (`features/datadragon.ts` no renderer; `packages/riot/src/datadragon/client.ts` no backend) — ver `championSquareUrl`/`championSplashUrl`. Continua minimalista/premium, sem landing page nem foco em marketing.

Tema por campeao/skin (Sub-fase 6a): `features/featured-champion-context.tsx` (`FeaturedChampionProvider`/`useFeaturedChampion`) guarda em `localStorage` (`sparta:featured-champion`, JSON `{key,name,skinIndex,skinName,localSplashPath?}`) o campeao+skin escolhido na tela de Configuracoes (`features/ChampionSkinPicker.tsx`, fluxo de 2 passos - qualquer campeao, qualquer skin, lista vinda direto da CDN da Data Dragon). A splash art do login e do header do Dashboard preferem `localSplashPath` (arquivo baixado pro disco via `window.sparta.downloadSkin`, novo IPC request/response) quando existir, senao caem pra CDN. Antiga lista curada de 12 campeoes (`ChampionThemePicker.tsx`) removida. A cor de destaque (vermelho) continua fixa por decisao explicita — so a arte muda, nao a paleta.

Estilo:

- preto profundo;
- superfícies quase pretas;
- vermelho discreto (fixo, nao varia por tema);
- minimalista/premium;
- sem landing page;
- foco em leitura rápida.

## Analyzer Python atual

Arquivo:

```txt
services/analyzer/app/main.py
```

Endpoints:

- `GET /health`
- `POST /replay/import`

Replay parsing completo não faz parte do MVP. Mantenha como experimental até haver base técnica e revisão de compliance.

## Seeds atuais

Arquivos:

```txt
data/seeds/champion-tags.json
data/seeds/matchup-seed.json
data/seeds/composition-rules.json
```

Os dados são manuais e pequenos de propósito. Não bloqueie evolução do produto esperando dataset perfeito.

## Git e scripts

Remote é lido de:

```txt
git.txt
```

Scripts:

```txt
scripts/read-git-remote.ts
scripts/push-to-github.sh
scripts/setup.ps1
scripts/setup.sh
```

Comandos:

```bash
npx pnpm@10.34.4 github:setup
bash scripts/push-to-github.sh
```

Não usar force push sem pedido explícito.

## Regras de implementação

1. Preserve a separação entre desktop, API, core, riot, ui e analyzer.
2. Não coloque lógica de scoring dentro do React se ela pertence ao `packages/core`.
3. Não coloque Riot API key no desktop.
4. Use Zod para payloads HTTP.
5. Use tipos fortes do `@sparta/core`.
6. Mantenha recomendações explicáveis, com reasons e warnings.
7. Não implemente recursos in-game.
8. Não automatize ações no client.
9. Para integrações Riot/LCU, documente endpoints e finalidade.
10. Rode typecheck, lint e testes antes de concluir alterações relevantes.

## Próximos passos recomendados

Fase 1 (Riot Sync), o refinamento visual do desktop, Fase 2 (Player Intelligence), Fase 3 (Draft Intelligence), Fase 4 (Post-Game Coach), Fase 5 (Growth Journey), a conexão do desktop às rotas reais e a Sub-fase 6a (Configurações + tema com skins) estão completas em `main`. O roadmap original de 5 épicos está encerrado. Próximo:

1. **Sub-fase 6b** (configuração "quantas partidas analisar") e **Sub-fase 6c** (ordem de pick automática via LCU) — ambas desenhadas em detalhe em "Fase 6 (Configurações do app)" acima, ainda não implementadas.
2. Catálogo de campeões pro desktop — resolver `championId` → nome/ícone no Pós-game (hoje mostra só `Campeão #<id>` na lista de partidas porque `RecentChampionMatch` não traz `championName` e não há rota de catálogo exposta ao desktop).
3. Expandir `ChampionTag` além dos 2 campeões do seed (`data/seeds/champion-tags.json`) — sem bloqueio técnico desde a Fase 3 (o seed já lê o JSON de verdade), é só curadoria manual contínua; o motor de recomendação já tolera ausência, mas mais cobertura melhora a qualidade das recomendações (confirmado na validação desta sessão: o Champion Select real devolveu 0 recomendações pra Zekerus#117 justamente por causa disso, comportamento honesto, não bug).
4. Tornar `/drafts/pre-game-analysis` real (hoje 100% estático) — usar `analyzeTeamComposition` (já existe em `packages/core`) com `championTags`/`matchups` reais; motor de geração de texto explicativo ainda por desenhar (a composição por fragmentos da Fase 4, em `packages/core/src/postgame/post-game-analysis.ts`, é um precedente reaproveitável).
5. Pré-computar/cachear matchups se a latência de `POST /drafts/recommendations` incomodar conforme o histórico crescer (hoje calculado na hora a cada chamada, ver "O que a Fase 3 entregou").
6. Dicas de objetivos no `PostGameAnalysis` — `objectiveEvents` (Fase 1) não preserva atribuição de time no formato atual (`"LABEL@M:SS"`), precisaria de um `MatchTimelineSummary` mais rico pra saber quais objetivos foram do próprio time.
7. Fila real (Redis/BullMQ) para o sync, se o padrão de uso mostrar que o teto de 20-50 partidas por chamada síncrona é pouco — o `docker-compose.yml` já provisiona Redis, só falta o worker.
8. LCU read-only: já implementado o poll de `gameflow-phase` para trocar de aba (ver `docs/riot-compliance.md`); próximo passo é ler `/lol-champ-select/v1/session` (método já existe em `LcuReadOnlyClient.getChampionSelectSession`) para pré-carregar o draft real em vez do modo manual.
9. Trocar o token HMAC caseiro por algo mais robusto (rotação de segredo, refresh token) se o produto for além do MVP local.
10. Empacotamento do desktop (electron-builder/NSIS/ASAR) — hoje não existe nenhuma configuração de build de instalador, só `electron-vite build`.
11. Mitigar a limitação conhecida da Fase 5 (`WeaknessTrend` derivado de um corte top-3 por partida, ver "O que a Fase 5 entregou") lendo razões brutas em vez de só `weaknesses[]`, se o ruído de entrada/saída na fronteira do corte incomodar na prática.
12. **Documentado, não implementado** (pedido pelo usuário): revisão dos algoritmos de scoring de desempenho — `packages/core/src/scoring/champion-performance.ts` (pesos de `selectWeights` por role, `roleBaselines`, `normalizeRatio`) e `packages/core/src/scoring/dimension-signals.ts` (thresholds `RATIO_STRENGTH_THRESHOLD=1.1`, `RATIO_WEAKNESS_THRESHOLD=0.85`, etc.), agora que as Fases 1-5 + a Fase 6 acumularam uso real o suficiente pra avaliar se os pesos/thresholds fazem sentido na prática.

## Verificação conhecida

Última bateria executada com sucesso no scaffold:

```bash
npx pnpm@10.34.4 typecheck
npx pnpm@10.34.4 lint
npx pnpm@10.34.4 test
npx pnpm@10.34.4 build
python -m pytest services/analyzer
```

O teste Python pode exigir antes:

```bash
python -m pip install -e "services/analyzer[test]"
```

## Cuidado com arquivos gerados

Não commitar:

- `.env`;
- `node_modules`;
- `dist`;
- `build`;
- `out`;
- `coverage`;
- `.pytest_cache`;
- `*.egg-info`;
- logs;
- bancos SQLite locais.

O `.gitignore` já cobre esses casos.
