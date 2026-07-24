# Sparta - Contexto para Continuidade

Este arquivo é um handoff para outro agente de desenvolvimento continuar o projeto Sparta sem precisar redescobrir a base inteira.

## Pendências desta sessão (ler primeiro)

Uma sessão anterior fez uma auditoria completa do repositório (real vs mock vs so-tipo), aprovou um plano de evolução em 5 épicos (Riot Sync, Player Intelligence, Draft Intelligence, Post-Game Coach, Growth Journey) e implementou todas as 5 fases, além de um refinamento visual do desktop e correções de infra/segurança. Uma sessão seguinte **conectou o desktop às rotas reais da API** (Dashboard/Perfil/Champion Select/Pós-game/nova tela Evolução, removendo `mock-data.ts`) e implementou as **Sub-fases 6a e 6b** (tela de Configurações + tema com campeão/skin real + configuração "quantas partidas analisar"). Uma sessão seguinte implementou a **Sub-fase 6c (ordem de pick automática via LCU)**, encerrando a Fase 6. Uma sessão seguinte implementou a **Fase 7 (auditoria e documentação dos algoritmos de scoring)**. Uma sessão seguinte implementou a **Fase 8 inteira** (Sub-fase 8a: motor de build de campeão + seletor de time inimigo; Sub-fase 8b: polimento visual do desktop) e validou tudo contra a conta real Zekerus#117. Essa validação real encontrou um bug real (corrigido, ver abaixo) e motivou o pedido desta sessão: **Fase 9 (linguagem visual real - badges/barras nas telas de análise)**, implementada em duas sub-fases (9a: componentes compartilhados + Dashboard + Champion Select; 9b: Perfil + Pós-game + Evolução), encerrando a Fase 9. A validação real da 9b encontrou mais um bug real (corrigido, ver abaixo). **Depois do merge da 9b, o usuário pediu explicitamente validação contra o app Electron real empacotado (não só o dev server aberto numa aba de navegador comum)** — essa validação descobriu e corrigiu um bug real grave e pré-existente (ver "Bug real corrigido: preload nunca carregava de verdade" abaixo), presente desde o início do projeto. Depois de abrir o app real pro usuário avaliar, ele deu **feedback de UX ao vivo** (capturas do próprio Sparta + referências de apps reais de LoL) que motivou a **Fase 10 (polimento de UX + robustez de ícones de campeão)**, com liberdade explícita do usuário pra usar outras fontes/APIs como fallback e não se limitar ao escopo inicial ("não é mais protótipo, é programa real"). Uma sessão seguinte configurou o **`gh` CLI autenticado** (instalado via winget, device flow) - PRs/merges/CI agora são feitos pelo terminal, não mais pelo navegador. Uma nova rodada de feedback do usuário (as mudanças visuais ainda pareciam pequenas, botões sem estilo, download de skin quebrado, Champion Select acessível livremente sem sessão real, falta de detecção de posição/lane, telas resumidas demais) motivou a **Fase 11 (detecção real de posição/lane via LCU + gating do Champion Select + correções de polimento)**. Depois do merge da 11, o usuário reportou que **o módulo de temas continuava instável, sem baixar nem aplicar o tema** - a investigação achou dois bugs reais e independentes (ver "Bug real corrigido: módulo de temas" logo abaixo), ambos corrigidos na **Fase 12**. Tudo isso **já está mergeado em `main`**.

### Bug real corrigido: módulo de temas (splash nunca carregava nem aplicava)

Depois da Fase 11 o usuário reportou que o módulo de temas continuava quebrado. A investigação (testando as URLs reais contra a CDN e o fluxo real pelo bridge IPC do Electron) achou **dois bugs independentes**, os dois presentes desde a Sub-fase 6a:

1. **Extensão errada da splash art**: `championSplashUrl` (`apps/desktop/src/renderer/src/features/datadragon.ts`) montava a URL com `.png`, mas a Data Dragon serve splash art como **`.jpg`** - e a CDN responde **403** (não 404) pra `.png`. Isso quebrava *tudo*: as prévias das skins no seletor (todas caíam no fallback pro ícone do campeão) **e** o download (`Falha ao baixar a imagem (403)`). Confirmado medindo as duas extensões: `Ahri_0.png` → 403 / `Ahri_0.jpg` → 200 (158KB). **A "validação" do download na Fase 11 passou por engano** - testou o handler IPC com uma URL `.jpg` montada à mão, não o caminho que o app realmente usa (que montava `.png`); o User-Agent adicionado lá não era a causa raiz (mas foi mantido, é correto ter).
2. **`file://` nunca carregava no renderer**: mesmo com o download gravando o arquivo em disco, o `localSplashPath` era `file://<caminho>` e o Chromium bloqueia `file://` a partir da origem da página (`http://localhost` em dev, bundle em prod) - o tema "baixado" nunca aparecia. Confirmado no Electron real: arquivo de 187KB no disco, `img.onerror` disparando. Tentei um esquema próprio (`protocol.registerSchemesAsPrivileged` + `protocol.handle`, com `standard`/`secure`/`corsEnabled`), mas **o handler nunca era chamado** a partir de uma origem `http://` - o Chromium bloqueia antes. Solução final: o handler IPC devolve um **data URL** (`data:image/jpeg;base64,...`), que carrega em qualquer origem; o arquivo em disco continua sendo a cópia offline.

Além disso, atendendo ao pedido explícito do usuário de usar outra API como fallback: novo `communityDragonSplashUrl(championId, skinNum)` (`datadragon.ts`) resolve a splash pela **Community Dragon** (JSON do campeão por ID numérico → `splashPath` mapeado pra URL da CDN), usado (a) automaticamente no `<img>` via o novo componente `SkinSplash.tsx` (Data Dragon → Community Dragon → ícone do campeão) e (b) no download, quando a Data Dragon falha pra aquela skin. `featured-champion-context.tsx` descarta `localSplashPath` legado que não seja `data:` (os `file://` gravados antes nunca funcionariam).

Validado no app Electron real via CDP: as **71 prévias de skin do Zed carregam, 0 quebradas** (antes: todas 403); clicar "Baixar" pela UI real grava o arquivo e persiste um data URL de 244KB; o Dashboard renderiza a splash baixada (`1215x717`). `pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos.

### Fase 11: detecção de posição/lane + gating do Champion Select + polimento

Feedback do usuário depois de reabrir o app com a Fase 10: (1) botão "← Voltar pra lista de campeões" sem estilo nenhum (`<button>` HTML puro); (2) download de skin não funcionava; (3) Champion Select podia ser aberto/usado livremente, sem o jogador estar numa sessão real; (4) faltava detecção automática da posição/papel (Top/Jungle/etc.) e de troca de lane; (5) Dashboard e telas resumidas demais.

**Achado-chave da detecção de papel**: `LcuChampSelectTeamMember.assignedPosition` (`packages/riot/src/lcu/read-only-client.ts`) já era lido e tipado desde a Fase 6c, só nunca consumido. O LCU atualiza esse campo ao vivo quando dois jogadores trocam de posição pela ferramenta do próprio cliente - como o Sparta já faz poll da sessão a cada 2.5s (mesmo loop que deriva `pickOrder`), reler o campo a cada tick detecta a troca de lane de graça, sem lógica de detecção de troca nenhuma. **Achado-bug real**: `draft.playerRole` estava hardcoded em `"MID"` (`App.tsx`) e nunca era alterado por código nenhum - todo jogador que não joga MID recebia recomendações calculadas pro papel errado, e não havia *nenhum* controle (manual ou automático) pra definir isso.

1. **`packages/riot/src/lcu/player-role.ts`** (novo, padrão de `pick-order.ts`) — `derivePlayerRole(snapshot): Role | undefined`. Mapeia `assignedPosition` do LCU (`top/jungle/middle/bottom/utility`) pro `Role` do Sparta (`bottom→ADC`, `utility→SUPPORT`). Retorna `undefined` (nunca chuta) sem sessão, jogador não encontrado, ou posição vazia/desconhecida (blind pick/ARAM). 8 testes (`player-role.test.ts`), incluindo o cenário de troca de lane (chamar 2x com snapshots diferentes confirma que não precisa de estado extra).
2. **IPC `sparta:player-role`** — `startGameflowWatcher` (`apps/desktop/src/main/index.ts`) deriva o papel no mesmo tick que já deriva a ordem de pick, transmite só quando muda; `preload/index.ts` + `sparta-global.d.ts` ganharam `onPlayerRole` (mesmo padrão de `onPickOrder`). `App.tsx` ganhou `autoPlayerRole` que sincroniza em `draft.playerRole`.
3. **Champion Select com gating** (`App.tsx`, `ChampionSelect`) — novo estado `champSelectActive` (dirigido pela fase `ChampSelect` do gameflow, já assinada). Sem sessão real de champion select, a aba mostra uma tela de espera ("Aguardando sua seleção de campeões") com um botão "Simular manualmente" (decisão confirmada com o usuário via `AskUserQuestion`) que revela os controles - preserva a possibilidade de testar sem o League aberto. Novo **seletor manual de posição** (`<select>` com os 5 papéis) exibido quando `autoPlayerRole === null`, ao lado do input de pick order manual - a peça que faltava pro papel (o pick order manual já existia pra ordem).
4. **`.btn-secondary`** (`global.css`) — classe reaproveitável (mesmos valores que `.recommendation button` já usava inline) aplicada nos botões que estavam sem estilo nenhum: "← Voltar pra lista de campeões" (`ChampionSkinPicker.tsx`), "Reanalisar" (`PostGameScreen.tsx`) e o novo "Simular manualmente".
5. **Download de skin: tentativa de correção** (`registerSkinDownloadHandler`, `main/index.ts`) — adicionado um header `User-Agent` no `fetch` do processo main (o Electron não manda um por padrão). **Isso NÃO era a causa raiz** e o download continuou quebrado - a validação daquela sessão passou por engano porque testou o handler IPC com uma URL `.jpg` montada à mão, e não o caminho real do app (que montava `.png` e levava 403). Causa raiz de verdade achada e corrigida na Fase 12 (ver "Bug real corrigido: módulo de temas" no topo). O UA foi mantido - é correto ter, só não era o problema.
6. **Dashboard mais denso** (`App.tsx`, `Dashboard`) — 3 scores de forma recente (`last10/20/50Score`, os dois últimos nunca exibidos antes) como badges lado a lado; mini-leaderboard dos top 3 campeões (`rankChampionPool(...).slice(0,3)`, cada um com `ChampionIcon` + role + partidas + `ScoreBadge`); lista completa de pontos fortes/fracos como `SignalChip` (antes só `[0]` de cada aparecia). **Evolução** (`GrowthJourneyScreen.tsx`) — cada linha mostra o `confidence` do trend (já em `WeaknessTrend.confidence`, nunca exibido).

Validado via `electron-vite dev` no app Electron real (CDP, conta Zekerus#117): Dashboard denso (3 scores, leaderboard Viego JUNGLE 52 / Vel'Koz SUPPORT 46 com ícones, todos os chips); Champion Select mostrando a tela de espera por padrão + "Simular manualmente" revelando os controles com o novo seletor de Posição; Evolução com "confiança média" por linha; botões estilizados. `window.sparta.onPlayerRole` confirmado existente no bridge. **Não testável neste ambiente**: a detecção real de papel/troca de lane dentro de uma sessão de champion select de verdade (precisa do cliente do League aberto) - mesmo limite de sempre pro `pickOrder` automático. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos.

O que ficou deliberadamente fora de escopo: sparkline/timeline por partida individual na Evolução (exigiria mudar o contrato de `computeWeaknessTrends` pra reter presença por partida, não só a taxa agregada); auto-importar `myTeam`/`theirTeam` (aliados/inimigos reais) pro `DraftState` via LCU (item técnico separado, já documentado como próximo passo); integração rank/LP (League-V4, Sparta não tem).

### Fase 10: polimento de UX a partir do feedback ao vivo do usuário

Validação do app real (sessão anterior) terminou com o usuário abrindo o Sparta de verdade e avaliando visualmente, comparando com apps reais de LoL (Blitz, Porofessor.gg, LoLTheory, OP.GG, capturas anexadas). Feedback: (1) Dashboard usava a palavra **"Estável"** sem contexto e um card **"Escopo"** que não servia pro usuário (mesma categoria do "Princípio do produto" já removido na Fase 9a); "Melhor campeão" só mostrava o nome, sem ícone; `severity`/`confidence` apareciam crus em inglês (`"high"`); (2) inputs numéricos (pick order manual, "Personalizado" em Configurações) ainda tinham as setinhas nativas do navegador; (3) Evolução repetia "Estável" em quase toda linha; (4) alguns campeões apareciam sem ícone (imagem quebrada/"?").

**Achado real por trás do item 3** (não só copy): `computeWeaknessTrends` (`packages/core/src/aggregation/growth-journey.ts`) força `trend = "stable"` sempre que ainda não existe um segundo bloco de partidas antigas suficiente pra comparar (`insufficientData`) - com Zekerus#117 só tendo ~8 partidas pós-game analisadas (um bloco só), **toda** linha caía nesse caso. "Estável" ali não significava "sem mudança", significava "ainda não dá pra saber" - e a barra "Anterior: 0%" reforçava a confusão mostrando 0% como se fosse dado real.

**Achado real por trás do item 4**: `champion-row` do Perfil e os cards do Champion Select montavam a URL do ícone com `champion.championName`/`recommendation.championName` — string **crua** vinda direto do Match-V5 da Riot (`packages/riot/src/mappers/match-mapper.ts`, `participant.championName`, sem normalização nenhuma), que nem sempre bate com o slug que a Data Dragon espera na URL da imagem. O resto do app (Pós-game, Pré-game, seletor de inimigo) já usava o slug real vindo do catálogo (`fetchAllChampions`) e por isso nunca quebrava.

1. **`WeaknessTrend.hasComparison: boolean`** (novo campo, `packages/core/src/types/domain.ts` + `growth-journey.ts`) - `!insufficientData`, exposto pela primeira vez (a variável já existia internamente). `GrowthJourneyScreen.tsx`: quando `false`, não usa mais `TrendCell` (sempre diria "Estável") - mostra "Ainda sem histórico pra comparar" (ícone neutro) e só a barra "Recente" (esconde a barra "Anterior", que seria 0% falso). Sem migração/rota nova - o campo novo flui pela resposta JSON já existente de `GET /players/:puuid/growth-journey` sem revalidação zod.
2. **Novo componente `apps/desktop/src/renderer/src/features/ChampionIcon.tsx`** - substitui todo `<img src={championSquareUrl(...)}>` de campeão (não item) no app, com 3 estágios de fallback que nunca mostram o ícone nativo de imagem quebrada: (1) Data Dragon pelo **slug real** (passado direto quando quem chama já tem o catálogo - Pós-game/Pré-game/seletor de inimigo -, ou resolvido pelo `championId` numérico via um `Map` construído de `fetchAllChampions`, com cache module-level, quando só há `championId`/`championName` cru - Perfil/Champion Select/Dashboard); (2) **Community Dragon** (`raw.communitydragon.org`, espelho público dos assets da Riot indexado só por ID numérico, usado com a liberdade que o usuário deu de usar outras fontes) via `onError`; (3) placeholder estilizado (círculo + ícone `HelpCircle`) se as duas fontes falharem. `ChampionSkinPicker.tsx` (splash art, asset diferente) ganhou só um `onError` simples caindo pro ícone confiável do campeão, sem Community Dragon (não faz sentido pra esse tipo de asset).
3. **Dashboard** (`App.tsx`) - card "Escopo" virou **"Ponto forte"** (espelha "Risco atual", usa `profile.data.strengths[0]`, nunca mostrado ali antes); `severity`/`confidence` traduzidos (`severityLabels`/`confidenceLabels`, baixa/média/alta); `trendLabels.stable` reescrito de "estável" pra "sem variação recente"; "Melhor campeão" ganhou `ChampionIcon`. `Metric` ganhou prop `icon?: ReactNode` (mesmo padrão de `badge`, já existente).
4. **CSS global** - `input[type="number"]` perde as setinhas nativas (`appearance: textfield` + `::-webkit-*-spin-button { appearance: none }`), cobre os 2 inputs numéricos do app (pick order manual, "Personalizado" em Configurações) sem tocar nenhum componente.

Validado via `electron-vite dev` (HMR aplicou as mudanças na mesma janela Electron real que já estava aberta pro usuário avaliar) + Browser tool contra a conta real Zekerus#117: ícones de campeão renderizando (Thresh/Poppy/etc. via `ChampionIcon`, sem mais depender do nome cru), "Ponto forte"/"Risco atual" com texto traduzido, "sem variação recente" no lugar de "estável", inputs sem seta em Champion Select e Configurações, Evolução mostrando "Ainda sem histórico pra comparar" (situação real de Zekerus#117 hoje) em vez do falso "Estável"/"Anterior: 0%". Nenhum erro de console. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo.

**Fora de escopo** (confirmado pelo que o usuário pediu em texto, mesmo aparecendo nas capturas de referência): gráfico de LP/rank estilo op.gg/Porofessor (Sparta não tem integração League-V4, seria fase nova); erro 403 ao baixar a skin Zed visto numa captura anterior (bug separado de CDN, não relacionado); radar chart/matchup detalhado estilo Porofessor (mesma decisão de não introduzir lib de gráfico da Fase 8b/9).

### Bug real corrigido: preload nunca carregava de verdade (window.sparta sempre indefinido)

O usuário pediu pra validar a Fase 9b "no Electron empacotando de verdade, não só no browser" — todas as validações anteriores deste projeto (Fases 6a/6c e as anteriores) usaram a Browser tool apontando pra mesma URL do dev server (`http://localhost:5173`) que o Electron carrega, mas isso é uma aba de Chrome comum, **sem** o preload script injetado (`window.sparta` sempre fica `undefined` ali, mesmo que o app real funcione). Nunca uma sessão anterior tinha de fato inspecionado o processo Electron real.

Pra validar de verdade, esta sessão conectou ao processo Electron real via Chrome DevTools Protocol (`app.commandLine.appendSwitch("remote-debugging-port", "9222")`, temporário, revertido antes do commit) e confirmou, por inspeção direta do `window` da janela real: **`window.sparta` sempre foi `undefined`, em toda sessão anterior deste projeto** - o bridge de IPC nunca funcionou de verdade, apesar de "validado" em texto nas Fases 6a/6c.

Causa raiz (duas camadas, achadas em sequência via console do processo real):
1. `apps/desktop/src/main/index.ts` apontava o preload pra `../preload/index.js`, mas `apps/desktop/package.json` tem `"type": "module"` - o electron-vite builda o preload como ESM e sempre gerou `index.mjs` (nunca `.js`), então o preload nunca era encontrado (`ENOENT`, erro real visto no console do processo real, nunca nos nossos testes porque browser comum não reporta erro de preload nenhum).
2. Corrigido o caminho pra `.mjs`, um segundo erro real apareceu: `SyntaxError: Cannot use import statement outside a module` - processos renderer sandboxed (`--enable-sandbox`, padrão do Electron desde varias versões) carregam o preload por um loader que **não entende `import`/ESM**, mesmo com a extensão certa.

Correção final (`apps/desktop/electron.vite.config.ts` + `apps/desktop/src/main/index.ts`): forçar o build do preload pra CommonJS de verdade via `rollupOptions.output.format: "cjs"` + `entryFileNames: "[name].cjs"` (extensão `.cjs` ignora o `"type":"module"` do `package.json`, ao contrário de `.js`), e apontar `webPreferences.preload` pra `../preload/index.cjs`. Sem essa extensão o Node ainda tentaria interpretar o arquivo como ESM independente do conteúdo.

**Impacto real**: todo recurso que depende de `window.sparta` nunca funcionou em nenhuma sessão anterior - detecção automática de champion select (`onGameflowPhase`, Fase 6c parcial), ordem de pick automática via LCU (`onPickOrder`, Fase 6c), e download de skin pro disco (`downloadSkin`, Sub-fase 6a). Os itens "não validado nesta sessão" registrados nas Fases 6a/6c sobre esses recursos eram, na verdade, "nem *podia* ter sido validado do jeito que a validação foi feita" - o bug estava presente o tempo todo.

Validado via CDP contra o processo Electron real (não a Browser tool): `window.sparta` agora existe com todos os métodos esperados (`onGameflowPhase`/`downloadSkin`/`onPickOrder`); screenshots reais (`Page.captureScreenshot` via CDP) confirmando Dashboard/Perfil/Pós-game/Evolução (Fase 9) renderizando corretamente dentro da janela Electron de verdade, com a conta real Zekerus#117 (mesmo token de sessão assinado de sempre). `pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo.

**Não coberto por esta correção** (fora de escopo, registrado como trabalho futuro): validar de fato a detecção automática de champion select / ordem de pick / download de skin *funcionando* agora que o bridge existe - precisa do cliente do League aberto (gameflow/pick order) ou de clicar o botão de baixar skin de verdade (download), nenhum dos dois testado nesta sessão. O bridge existir é a pré-condição pra esses recursos funcionarem; ainda não foi confirmado que o comportamento *downstream* de cada um está correto agora que ele deixou de ser sempre `undefined`.

### Bug real corrigido: card de skin com nome/botão sobrepostos

Durante a validação contra a conta real Zekerus#117 (sessão anterior), o passo 2 do seletor de skin (`ChampionSkinPicker.tsx`) mostrou o nome da skin e o botão "Baixar" sobrepostos um em cima do outro. Causa: o card reusava a classe `.theme-picker-option` (criada só pro grid de ícones do passo 1/seletor de time inimigo, com `line-height: 0`) — isso colapsava as linhas de texto. Corrigido com uma classe própria `.skin-picker-card` (flex column, espaçamento normal), sem afetar os outros usos de `.theme-picker-option`.

### Sub-fase 9a: componentes visuais compartilhados + Dashboard + Champion Select (sessão atual)

A mesma validação real expôs um segundo problema, de UX: as telas de recomendação/análise eram só texto corrido, sem gráfico nem hierarquia visual (comparado a apps reais de LoL como op.gg/Mobalytics/Blitz, referências trazidas pelo usuário). Também pediu pra remover o card "Princípio do produto" do Dashboard (soava como disclaimer de produto).

**Achado-chave**: todo o dado numérico necessário pra virar gráfico/barra já existia e era real - não precisou de nenhuma rota nova nem cálculo novo no backend. `PickRecommendation.metrics` (já 0-100, calculado por `recommendPicks`), `scoreChampionPerformance(stats).components` (idem, já exportada), e os limiares de cor (`SCORE_STRENGTH_THRESHOLD=65`/`SCORE_WEAKNESS_THRESHOLD=35`/`RATIO_STRENGTH_THRESHOLD=1.1`/`RATIO_WEAKNESS_THRESHOLD=0.85`, já exportados de `dimension-signals.ts`) só nunca tinham sido visualizados além de um número solto.

**Decisão de design**: os badges mostram um número colorido (verde/âmbar/vermelho), não uma letra de tier (S/A/B/C como no op.gg) - o op.gg calibra essas letras contra percentil real de milhões de partidas, e o Sparta não tem essa base estatística (mesma ressalva de `docs/scoring-model.md`, Fase 7). Um número colorido comunica "bom/neutro/ruim" sem fingir uma precisão que o dado não sustenta.

1. **Novos componentes `apps/desktop/src/renderer/src/features/`**: `ScoreBadge.tsx` (anel via CSS `conic-gradient` puro, sem lib de gráfico, mostrando um score 0-100 colorido pelos limiares de `SCORE_STRENGTH_THRESHOLD`/`SCORE_WEAKNESS_THRESHOLD`); `StatBar.tsx` (barra horizontal, variantes `score` 0-100 e `ratio` centrada em 1.0, cores pelos mesmos limiares ou pelos de `RATIO_STRENGTH_THRESHOLD`/`RATIO_WEAKNESS_THRESHOLD`); `SignalChip.tsx` (pill com ícone lucide-react, `positive`/`negative`, substitui os parágrafos com prefixo emoji ✓/⚠ usados até a Fase 8). Novo token `--color-yellow` em `global.css` pra faixa neutra.
2. **Dashboard** (`App.tsx`, função `Dashboard`) — removido o card "Princípio do produto"; cards "Forma 10 jogos"/"Melhor campeão" ganharam `ScoreBadge`.
3. **Champion Select** (`App.tsx`, cards de `recommendation-list`) — `ScoreBadge` no lugar do `totalScore` solto; `StatBar` pros 4 componentes de `metrics` com maior valor (ordenados, não os 8 sempre); `reasons`/`warnings` viram uma lista de `SignalChip` (mostra todos agora, não só o primeiro).

Validado manualmente via `electron-vite dev` + Browser tool contra a conta real Zekerus#117 (mesmo método de token de sessão assinado das sessões anteriores): badges com cor/valor reais no Dashboard (64 e 52, ambos amarelo/neutro); card de recomendação real do Viego (JUNGLE, testado com o papel trocado temporariamente já que Zekerus não tem amostra de MID - revertido antes do commit) mostrando `ScoreBadge` 53, 4 `StatBar` reais (Forma recente 64.4%, Desempenho pessoal 52.3%, Matchup 50%, Segurança em blind 50%) e 3 `SignalChip` (1 positivo, 2 negativos), todos verificados via inspeção do DOM real. Nenhum erro de console.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo. Sem migração, sem rota nova no backend - mudança inteira em `apps/desktop` (renderer).

### Sub-fase 9b: Perfil + Pós-game + Evolução (sessão atual, encerra a Fase 9)

Continuação direta da 9a — mesmos componentes (`ScoreBadge`/`StatBar`/`SignalChip`), aplicados às 3 telas restantes.

1. **Perfil** (`App.tsx`, função `Profile`) — cada linha de campeão (`champion-row`) ganhou `ScoreBadge` (só quando `scoreChampionPerformance(champion).eligible`, ou seja `games >= MIN_GAMES_FOR_RANKING` - campeões com poucas partidas não mostram badge, mesma regra de elegibilidade já usada por `rankChampionPool`) e `StatBar` pra KDA/CS/min/Dano-min (`performance.components`, já 0-100, mesma função por trás do Dashboard). "Pontos fortes e fracos" virou uma lista de `SignalChip` (antes parágrafos com prefixo ✓/⚠).
2. **Pós-game** (`features/PostGameScreen.tsx`) — `expectedPlan`/`executionSummary` ganharam `StatBar` variante `ratio` pra KDA/CS/dano/visão/ouro, calculadas no cliente a partir de `report.metrics` (já em `PostGameAnalysis`) ÷ `roleBaselines[role]` (`role` vem do `RecentChampionMatch` já carregado na lista de partidas, casado por `matchId`) — mesmo padrão client-side já usado pelo motor de build/Pré-game (Fase 8), sem rota nova. `strengths`/`weaknesses` viraram `SignalChip` (`tips` continuam parágrafo com 💡, são só sugestões de texto livre, não sinais de força/fraqueza).
3. **Evolução** (`features/GrowthJourneyScreen.tsx`) — cada linha de tendência ganhou duas `StatBar` (recentRate/previousRate) ao lado do `TrendCell` já existente (Fase 8b).
4. **Novo prop `invert` em `StatBar.tsx`** (variante `score` apenas) — necessário pra Evolução: `recentRate`/`previousRate` são "taxa de presença de um ponto fraco", onde número **alto é ruim** (o oposto de `PickRecommendation.metrics`/`scoreChampionPerformance.components`, onde alto é bom). `invert` mantém a largura da barra = valor real (não inverte o número exibido), só troca o lado da cor (verde quando `<=SCORE_WEAKNESS_THRESHOLD`, vermelho quando `>=SCORE_STRENGTH_THRESHOLD`) - evita inventar uma terceira variante só pra isso.

**Bug real encontrado e corrigido durante a validação desta sessão**: o número dentro de `ScoreBadge` (`<span>{score}</span>`) renderizava nas cores erradas (vermelho no Dashboard/Champion Select, cinza-secundário no Perfil) em vez de branco (`--color-text-primary`, definido em `.score-badge`) - existia desde a 9a, só não tinha sido percebido porque nas capturas anteriores o número era pequeno demais pra notar a cor errada num badge colorido. Causa: regras genéricas antigas e mais específicas na ordem do arquivo (`.page-header span, .recommendation span, .metric span { color: var(--color-red); }` e `.champion-row span { color: var(--color-text-secondary); }`) casam com **qualquer** `span` descendente, inclusive o de dentro do `ScoreBadge` nested profundamente - como `.score-badge span` (que só definia `position: relative`, sem `color`) tinha a mesma especificidade e vinha depois no arquivo mas não competia na propriedade `color`, a regra genérica vencia. Corrigido adicionando `color: var(--color-text-primary)` explicitamente em `.score-badge span` (`global.css`) - mesma especificidade, mas agora com a propriedade declarada, vence por ordem.

Validado manualmente via `electron-vite dev` + Browser tool contra a conta real Zekerus#117 (mesmo método de token de sessão assinado das sessões anteriores): Perfil com badges reais (Viego 52, Vel'Koz 46, ambos amarelo/neutro) e barras KDA/CS/Dano por campeão, chips de força/fraqueza reais (3 positivos, 3 negativos); Pós-game com barras ratio reais pra uma derrota de Vel'Koz SUPPORT (CS/Dano/Ouro acima da referência em verde, Visão abaixo em vermelho, KDA neutro em amarelo) e chips de força/fraqueza; Evolução com barras recente/anterior reais (KDA 62.5% recente em amarelo, Controle de visão 25% em verde, Anterior 0% em todas - ainda sem um segundo bloco de partidas mais antigas, comportamento honesto já documentado na Fase 5). Bug do `ScoreBadge` confirmado via inspeção de `getComputedStyle` antes/depois do fix (cor mudou de `rgb(220,38,38)`/`rgb(161,161,170)` pra `rgb(245,245,246)`).

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo. Sem migração, sem rota nova no backend - mudança inteira em `apps/desktop` (renderer), encerrando a Fase 9.

### Sub-fase 8b: polimento visual do desktop

Continuação direta da 8a — mesmo pedido original do usuário (validar telas estáticas/sem animação e polir onde fizesse falta), sem mudança de arquitetura, só CSS/ícones/pequenos componentes novos.

1. **Componente `features/Loading.tsx`** (`<Loading label="..." />`, spinner CSS puro via `@keyframes spin`) substituindo todo `<p>Carregando...</p>` solto que existia em `App.tsx`, `PostGameScreen.tsx`, `GrowthJourneyScreen.tsx`, `SettingsScreen.tsx` — antes cada tela reimplementava o próprio texto de loading, sem nenhum indicador visual de progresso.
2. **Novo `features/GridSkeleton.tsx`** (shimmer via `@keyframes shimmer`) substituindo o texto "Carregando campeões/skins..." nos grids de `ChampionGridPicker.tsx`/`ChampionSkinPicker.tsx` — grid deixa de ficar vazio enquanto carrega.
3. **Pré-game enriquecido** (`App.tsx`, função `PreGame`) — passou a receber `draft`/`ddragonVersion` como props (antes não recebia nenhum). Mostra o ícone do campeão confirmado (`draft.selectedChampionId`) com fundo de splash art (`hero-splash`, mesmo padrão já usado no Dashboard), os ícones dos inimigos conhecidos (`draft.enemies`) e um resumo textual da inclinação de dano do time inimigo, reaproveitando `summarizeEnemyDamageLean` (exportada de `@sparta/core` desde a 8a) — a mesma função usada pelo motor de build, evitando duplicar a lógica. **Sem tocar a rota `/drafts/pre-game-analysis`** (continua estática no backend, trabalho futuro separado já documentado) — só a apresentação do lado do desktop ficou real, usando dado já disponível no cliente.
4. **Ícones de campeão na lista do Pós-game** (`PostGameScreen.tsx`) — ganhou prop `ddragonVersion`, resolve `championId → nome/ícone` reaproveitando `fetchAllChampions` (já buscado pra outras telas), fechando o gap documentado no CLAUDE.md ("Catálogo de campeões pro desktop", já que `RecentChampionMatch` nunca trouxe `championName`).
5. **Ícones e cor de tendência em Evolução** (`GrowthJourneyScreen.tsx`) — novo `TrendCell`, ícone `TrendingUp`/`TrendingDown`/`Minus` (lucide-react, já instalado) + nova cor semântica `--color-green` (só pra tendência — a cor de destaque do tema continua fixa em vermelho, decisão inalterada). `improving`/`resolved` tratados como boa notícia (verde), `worsening`/`new` como má notícia (vermelho).
6. **Ajustes de CSS pequenos** encontrados na auditoria: `.draft-controls button.active` não tinha nenhum estilo distinto do hover (usado em Configurações/Análise) — corrigido.

Validado manualmente via `electron-vite dev` + Browser tool (sem conta Riot vinculada, mesma limitação de sempre neste ambiente): Pré-game testado com `draft.selectedChampionId`/`draft.enemies` seedados temporariamente (revertido antes do commit) — ícone/splash de Ahri + ícones de Darius/Garen/Jax + resumo "Time inimigo com foco físico (méd. 7.7/10 vs 3/10 mágico)" renderizando corretamente; grid de ~170 campeões com skeleton; nenhuma tela quebrou sem conta vinculada (fallbacks continuam funcionando). Pós-game/Evolução com dado real de conta não puderam ser validados nesta sessão (sem conta Riot linkada no ambiente), mas typecheck/lint/build passaram e a lógica é direta reutilização de padrões já testados.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo. Sem migração, sem rota nova no backend — mudança inteira em `apps/desktop` (renderer).

### Sub-fase 8a: motor de recomendação de build + seletor de time inimigo

O usuário pediu duas coisas: validar se o desktop tinha telas estáticas/sem animação (ver Sub-fase 8b, ainda pendente) e implementar uma "sessão de build" (itens) acionada depois que o usuário confirma seu campeão no Champion Select, baseada no time inimigo e no campeão escolhido.

**Achado-chave que definiu o desenho**: a tabela curada `ChampionTag` (usada pelo `recommendation-engine.ts`) só tem 2 campeões seedados (Orianna, Ahri) — insuficiente pra um motor de build que precisa reconhecer qualquer campeão do time inimigo. Em vez de esperar curadoria manual, o motor usa `tags`/`info` (attack/defense/magic/difficulty) que a própria Data Dragon já publica por campeão em `champion.json` — dado real da Riot, cobre os ~170 campeões, mesmo padrão client-side já usado por `fetchAllChampions` (Fase 6a).

1. **Novos tipos em `packages/core/src/types/domain.ts`**: `ChampionClassProfile` (championId/championName/tags/attack/defense/magic/difficulty — direto da Data Dragon), `ItemSummary` (itemId/name/tags/goldTotal/depth?/into? — direto do `item.json`), `RecommendedItem` (itemId/name/reason), `BuildRecommendation` (boots/coreItems/situationalItems/reasons/warnings, reusando `RecommendationReason`).
2. **Novo motor puro `packages/core/src/draft/build-recommendation.ts`** — `recommendBuild(ownChampion, enemyChampions, items)`. `deriveDamageStyle` classifica o estilo de dano do próprio campeão pelas tags de classe da Data Dragon (Mage→AP, Marksman/Fighter/Assassin→AD, desempate por `attack` vs `magic` pra tags híbridas ou só Tank/Support). `summarizeEnemyDamageLean` (exportada, pra reuso futuro no Pré-game da 8b) resume a inclinação do time inimigo pela média de `info.magic`/`info.attack` dos inimigos conhecidos, com threshold nomeado (`DEFENSE_LEAN_THRESHOLD=1.5`) — `undefined` sem nenhum inimigo ainda selecionado, nunca chuta. Seleção de botas/itens core/situacionais é 100% filtro sobre tags reais do `item.json` (nunca id memorizado) — descoberta real durante a implementação: a tag `"AbilityHaste"` não pode ser usada como sinal de "item de dano mágico" porque itens claramente defensivos (ex. Spirit Visage) também a carregam; o motor usa só `SpellDamage`/`MagicPenetration` pra itens AP. Funciona com time inimigo parcial (não exige os 5) e sem `ownChampion`/inimigos, sempre com warnings honestos em vez de inventar recomendação. 14 testes novos (`build-recommendation.test.ts`).
3. **`datadragon.ts` do desktop** ganhou `fetchChampionClassProfiles` (estende a leitura do `champion.json` já usada por `fetchAllChampions` pra também extrair `tags`/`info`), `fetchItemCatalog` (novo fetch de `item.json`, filtrado a itens compráveis de Summoner's Rift) e `itemIconUrl` — mesmo padrão client-side sem rota nova no backend Sparta da Fase 6a; `packages/riot/src/datadragon/client.ts` (uso do backend) ficou intocado, mesma decisão daquela fase.
4. **Novo `features/ChampionGridPicker.tsx`** — grid de busca+seleção de campeão extraído do passo 1 do `ChampionSkinPicker.tsx` (Fase 6a) pra ser reaproveitado; "selecionar" é genérico (o chamador decide o que o clique significa), então serve tanto pra navegar pro passo de skins quanto pra alternar um campeão num array de até 5.
5. **Seletor real de time inimigo no Champion Select** (`App.tsx`) — substitui o antigo botão-demo "Alternar inimigo revelado" (que hardcodava Yasuo) por uma seção "Time inimigo" usando `ChampionGridPicker` em modo multi-seleção (até 5, `MAX_ENEMIES`), escrevendo direto em `draft.enemies`.
6. **Botão "Confirmar campeão" + painel de build inline** — cada card de recomendação ganhou um botão que seta `draft.selectedChampionId` (campo já existia no domínio/schema/zod desde o início do projeto, nunca lido nem escrito por nenhum código até agora) e um estado local `confirmedChampion`. Confirmado com o usuário (`AskUserQuestion`): o painel de build aparece **inline, expandido dentro do próprio Champion Select** (não uma aba nova na sidebar) — `<BuildPanel>` busca catálogo de itens + perfis de classe via os novos helpers de `datadragon.ts` e chama `recommendBuild` direto no client (mesmo padrão de `rankChampionPool`, já importado assim em `App.tsx`), renderizando botas/itens core/situacionais com ícone real (`itemIconUrl`) + reasons/warnings.

Validado manualmente via `electron-vite dev` + Browser tool: grid de ~170 campeões reais funcionando no seletor de time inimigo, contador `(N/5)` correto, build sugerida mudando ao vivo conforme o time inimigo selecionado (testado Ahri contra time AD-heavy → botas de armadura + itens situacionais de armadura; contra time sem inimigos → aviso honesto "sem dado" + build core só pelo próprio campeão) — validação feita com `confirmedChampion` seedado temporariamente durante o teste (revertido antes do commit, já que não havia conta Riot real disponível neste ambiente pra gerar uma recomendação de verdade a confirmar).

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo. Sem migração de banco, sem rota nova no backend — mudança inteira em `packages/core` (lógica pura) e `apps/desktop` (renderer).

O que ficou deliberadamente fora de escopo (ver Sub-fase 8b, ainda pendente, e "Fora de escopo" no plano):

- Polimento visual do resto do app (Pré-game enriquecido, ícones no Pós-game/Evolução, loading compartilhado) — Sub-fase 8b, próxima.
- Recalibrar `ChampionTag` pra mais campeões — não é bloqueio, o motor de build usa dado universal da Data Dragon em vez disso.
- Persistir a build recomendada ou a confirmação de campeão no backend — painel local à sessão do Champion Select, sem nova tabela/rota.

### Fase 7: auditoria e documentação dos algoritmos de scoring

O usuário pediu uma "revisão dos algoritmos de avaliação de desempenho". Auditoria completa (`champion-performance.ts`, `dimension-signals.ts`, `player-insights.ts`, `growth-journey.ts`, `recommendation-engine.ts`, `docs/scoring-model.md`, `docs/draft-recommendation.md`) confirmou com o usuário que **não há dado real suficiente pra recalibrar estatisticamente** (só ~20-25 partidas da conta Zekerus#117) — escopo aprovado foi **auditar, documentar e corrigir inconsistências reais, sem recalibrar nenhum peso/baseline/threshold que já funciona**.

Duas inconsistências reais corrigidas (únicas mudanças de comportamento desta fase):

1. **`DEATHS_BAD_VALUE` (7 vs 8)**: o "valor ruim" de mortes usado em `normalizeInverse` era `7` em três lugares (`champion-performance.ts`, `player-insights.ts`, `post-game-analysis.ts`) mas `8` num quarto (`calculateRecentForm`, dentro do próprio `champion-performance.ts`), sem motivo pra divergir. Nova constante exportada `DEATHS_BAD_VALUE = 7` (`packages/core/src/scoring/champion-performance.ts`), reusada nos 4 call sites.
2. **Literal `8` duplicado em `recommendation-engine.ts`**: o threshold de "amostra pequena" em `buildWarnings` (`stats.games < 8`) era um número solto independente de `confidenceFromGames`, que já define esse mesmo `8` como piso de confiança média. Passou a reusar a constante exportada `MEDIUM_CONFIDENCE_GAMES`.

Fora essas duas correções, o resto da fase foi **só documentação** (comentários de raciocínio de design em `champion-performance.ts`, `dimension-signals.ts`, `player-insights.ts` e `recommendation-engine.ts` — thresholds, pesos por role/cenário, baselines, decaimento de forma recente, etc. — todos com o "porquê" agora explícito, não só o "o quê") e **reescrita de `docs/scoring-model.md`/`docs/draft-recommendation.md`** (antes prosa qualitativa sem nenhum número; agora documentam os valores reais e o raciocínio, com uma nota explícita de que são julgamento de design, não calibração estatística).

Testes novos de invariante estrutural (não recalibração): pesos de `weights` (`champion-performance.ts`) somam 1.0 por role; `recencyWeight(8) ≈ 1/e`; `DEATHS_BAD_VALUE` usado de forma consistente entre `scoreChampionPerformance` e `calculateRecentForm`; as 3 tabelas de `selectWeights` (`recommendation-engine.ts`) somam 1.0 cada. `weights` e `selectWeights` passaram a ser exportados (antes privados) pra permitir esses testes sem duplicar as tabelas.

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` completos no monorepo — sem mudança de comportamento observável do produto além das duas correções acima (nenhuma migração, nenhuma mudança de rota).

O que ficou deliberadamente fora de escopo (confirmado com o usuário antes de implementar):

- Recalibrar qualquer peso, baseline ou threshold com base em dado estatístico — não há partidas reais suficientes acumuladas ainda.
- Construir ferramenta de validação/relatório contra o histórico real — ideia registrada pro futuro, quando houver mais dado de uso.

### Sub-fase 6c: ordem de pick automática via LCU

Substitui o input manual 1-5 de "Pick order" no Champion Select por detecção automática via LCU (League Client Update), quando o cliente real do League está aberto e em champion select — o usuário pediu isso explicitamente ("não faria tanto sentido" ficar trocando manualmente).

1. **`packages/riot/src/lcu/read-only-client.ts`**: `LcuChampionSelectSnapshot.actions`/`myTeam`/`theirTeam` deixaram de ser `unknown[]` — novos tipos `LcuChampSelectAction { actorCellId, type, completed }` (`actions` vira `LcuChampSelectAction[][]`, uma lista de rodadas) e `LcuChampSelectTeamMember { cellId, championId, assignedPosition? }`.
2. **Novo `packages/riot/src/lcu/pick-order.ts`**: `derivePickOrder(snapshot)` pura — conta quantas ações `pick` já `completed` de companheiros de time (`myTeam`, por `cellId`) aconteceram antes da própria ação de pick do jogador, soma 1 (1-based; combina com `DraftState.pickOrder<=1` já significar "blind pick" no `recommendation-engine.ts`). Retorna `undefined` quando a sessão ainda não tem `localPlayerCellId`/`actions`/`myTeam` disponíveis ou a própria ação ainda não apareceu — o chamador cai pro manual nesses casos, nunca chuta um valor. Não validado contra filas fora do draft ranqueado normal (comentário no código). 7 testes cobrindo blind pick, contagem só de picks `completed` de companheiros, ignorar bans, e trocas de campeão não afetarem a contagem.
3. **`apps/desktop/src/main/index.ts`**: `startGameflowWatcher()` estendido — no mesmo poll de 2500ms, quando a fase é `"ChampSelect"`, busca `getChampionSelectSession()` + `derivePickOrder`, só propaga por IPC (`sparta:pick-order`) quando o valor muda; trata `derivePickOrder` retornando `undefined` (sessão piscando) como "mantém o último valor conhecido" em vez de resetar pro manual à toa; ao sair de `ChampSelect`, reseta para `null`.
4. **`preload/index.ts`/`sparta-global.d.ts`**: `window.sparta.onPickOrder(callback)`, mesmo padrão de `onGameflowPhase`.
5. **`App.tsx`**: novo estado `autoPickOrder` (assina `onPickOrder`, sincroniza em `draft.pickOrder` quando não-null). `ChampionSelect` mostra o valor automático como texto somente-leitura quando disponível ("Detectado via League Client"); sem sessão real (dev, sem League aberto, browser comum), mantém o input manual de sempre ("Modo manual") — fallback nunca removido.

**Não validado nesta sessão**: a detecção automática de verdade dentro de uma sessão real de champion select — precisa do cliente do League aberto e em champion select, indisponível neste ambiente. Validado o que dava pra validar: o fallback manual continua funcionando sem regressão (testado via `electron-vite dev` + Browser tool, `window.sparta` inexistente numa aba de navegador comum reproduz honestamente o caso "sem LCU", e o modo manual respondeu normalmente).

### Sub-fase 6b: configuração "quantas partidas analisar" + bug real de CORS corrigido

Nova configuração pessoal: quantas das últimas partidas do jogador o Sparta deve considerar nas análises (últimas 20/50/100, ou um valor personalizado até 200) — diferente do `limit` de `/players/:puuid/recent-matches` (que é só quantas partidas *listar* na UI, não quantas *analisar*).

1. **Migração `PlayerProfile.matchAnalysisLimit Int @default(50)`**.
2. **`findParticipationHistory`** (`matches/match-repository.ts`) e **`findPostgameReportsByPuuid`** (`postgame/postgame-repository.ts`) ganharam parâmetro opcional `limit?: number` (`take` do Prisma em cima do `orderBy: desc` já existente) — sem `limit`, comportamento inalterado.
3. **`player-stats-repository.ts`** ganhou `findMatchAnalysisLimitByPuuid`/`setMatchAnalysisLimit` (default 50, mesmo padrão honesto-neutro de `findPlayerInsightsByPuuid`). `recomputeChampionStats`/`computeAndPersistPlayerInsights` passaram a aceitar o limite e repassar pra `findParticipationHistory` — `riot-sync-service.ts` resolve o limite salvo do jogador e passa pros dois **só no momento do sync** (mesma lógica de sempre: essas tabelas só recalculam no sync, nunca ao vivo a cada GET).
4. **`GET /players/:puuid/growth-journey`** passou a resolver e repassar o limite pra `findPostgameReportsByPuuid` (computado ao vivo a cada chamada, já era assim).
5. **Novas rotas autenticadas `GET`/`PUT /players/settings`** — `PUT` valida `[1,200]` via zod e dispara `syncPlayerMatches` na hora (pra não deixar o usuário esperando o próximo sync espontâneo); a chamada de sync é `try/catch` — se falhar (rate limit, chave da Riot expirada), a configuração já salva não é desfeita e a rota ainda retorna sucesso (achado real durante a validação: a primeira versão deixava a falha do sync derrubar a resposta inteira mesmo com o valor já persistido).
6. **`SettingsScreen.tsx`** ganhou a seção "Análise" (atalhos 20/50/100 + campo personalizado clampado no cliente também).

**Bug real de CORS encontrado e corrigido durante a validação manual**: `@fastify/cors` (`apps/api/src/app.ts`) usa `methods: "GET,HEAD,POST"` como default quando a opção não é configurada explicitamente — `PUT` nunca esteve liberado no preflight, só ninguém tinha notado porque nenhuma rota usava `PUT` antes desta sub-fase. O preflight `OPTIONS` retornava 204 normalmente, mas o navegador bloqueava a requisição `PUT` de verdade antes de sair (erro genérico "Failed to fetch", sem mensagem clara), com o backend nunca chegando a receber a chamada. Corrigido adicionando `methods: ["GET", "HEAD", "POST", "PUT"]` explicitamente no registro do `cors`.

Validado manualmente contra a API real (Docker, imagem reconstruída) e a conta Zekerus#117 via `electron-vite dev` + Browser tool: `GET`/`PUT /players/settings` funcionando pela UI de verdade (não só via curl), persistência confirmada, `growth-journey` continuando a funcionar com o limite aplicado.

### Sub-fase 6a: tela de Configurações + tema com campeão/skin real

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

### Fase 6 (Configurações do app) — encerrada (6a, 6b e 6c prontas)

Pedido do usuário, dividido em 3 sub-fases sequenciais (mesmo padrão de PR pequeno das Fases 1-5) porque tocavam áreas quase disjuntas do código:

- **6a**: tela de Configurações + tema com campeão/skin real + download pro disco.
- **6b**: configuração pessoal "quantas partidas o Sparta deve analisar" (+ bug real de CORS bloqueando `PUT` corrigido).
- **6c (ver acima)**: ordem de pick automática via LCU.
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
- `ChampionClassProfile`
- `ItemSummary`
- `RecommendedItem`
- `BuildRecommendation`

`MatchSummary` ganhou `startedAt` (epoch ms do `gameStartTimestamp` real da Riot) — necessário pra ordenar por recência corretamente (a forma recente pondera por índice, então importa saber qual partida é a mais nova). `MatchPerformanceMetrics.killParticipation`/`objectiveParticipation` viraram opcionais (ausentes quando a Riot não manda `challenges`). `RecentForm`, `PlayerStrength` e `PlayerWeakness` ganharam `confidence: Confidence` (Fase 2). `MatchupData` também ganhou `confidence: Confidence` (Fase 3). `WeaknessTrend`/`GrowthJourney` são novos da Fase 5; `WeaknessTrend` ganhou `hasComparison: boolean` na Fase 10 (`!insufficientData` de `computeWeaknessTrends` - antes a UI não tinha como distinguir "tendência estável de verdade" de "ainda não existe segundo bloco pra comparar", os dois casos caíam em `trend: "stable"`). `ChampionClassProfile`/`ItemSummary`/`RecommendedItem`/`BuildRecommendation` são novos da Sub-fase 8a — `ChampionClassProfile` vem direto da Data Dragon (`tags`/`info` do `champion.json`), não da tabela curada `ChampionTag` (só 2 campeões seedados, insuficiente pra cobrir um time inimigo de campeões quaisquer).

Módulos de agregação: `packages/core/src/aggregation/player-champion-stats.ts` (`aggregatePlayerChampionStats`) — puro, agrega histórico de partidas em `PlayerChampionStats`. `packages/core/src/aggregation/player-insights.ts` (Fase 2) — `computeRecentForm`/`derivePlayerStrengthsWeaknesses`, também puro; reaproveita `confidenceFromGames`/`roleBaselines`/`normalizeInverse`/`clamp` exportados de `champion-performance.ts`. `packages/core/src/aggregation/matchup-stats.ts` (Fase 3) — `aggregateMatchupData`, também puro; pareia laners opostos e aplica shrinkage rumo ao neutro 50 conforme a amostra. `packages/core/src/scoring/dimension-signals.ts` (Fase 4) — `buildRatioSignal`/`buildScoreSignal` e as tabelas de rótulo/threshold, extraídos de `player-insights.ts` sem mudar comportamento; genéricos sobre "um valor de razão/score já calculado", reaproveitados tanto pra agregação entre partidas (Fase 2) quanto pra uma única partida (Fase 4). `packages/core/src/postgame/post-game-analysis.ts` (Fase 4) — `generatePostGameAnalysis`, puro; gera `PostGameAnalysis` de uma partida específica usando o módulo acima. `packages/core/src/aggregation/growth-journey.ts` (Fase 5) — `computeWeaknessTrends`/`computeGrowthJourney`, puro; compara blocos de `PostGameAnalysis` já persistidos ao longo do tempo, mesmo padrão de bloco de `computeRecentForm`. `packages/core/src/draft/build-recommendation.ts` (Sub-fase 8a) — `recommendBuild`/`deriveDamageStyle`/`summarizeEnemyDamageLean`, também puro; recomenda botas/itens core/situacionais por regras sobre tags reais do `item.json`, nunca estatística.

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
- `GET /players/settings` (autenticado)
- `PUT /players/settings` (autenticado)
- `POST /drafts/recommendations`
- `POST /drafts/pre-game-analysis`
- `POST /postgame/analyze`
- `GET /postgame/:matchId`
- `POST /replays/import`
- `GET /replays/:jobId`

Auth (`apps/api/src/modules/auth`): senha com `scrypt` (nativo do `node:crypto`) e token de sessao assinado com HMAC-SHA256 (`node:crypto`, sem `jsonwebtoken`/`bcrypt` como dependencia). Segredo em `AUTH_TOKEN_SECRET` (ver `src/config/env.ts`; `loadEnv()` recusa subir se `NODE_ENV=production` e o segredo ainda for o default de dev). Token vai no header `Authorization: Bearer <token>`.

CORS restrito a uma allowlist (`localhost:5173` em dev + origem `null` do app empacotado via `file://`) e rate limit de 5/min em `/auth/login` e `/auth/register` (`@fastify/rate-limit`) — ver `app.ts`. `methods` do `@fastify/cors` é configurado explicitamente como `["GET","HEAD","POST","PUT"]` (Fase 6b) — o default do plugin quando `methods` não é informado é `"GET,HEAD,POST"`, o que bloqueava silenciosamente qualquer `PUT` no preflight (erro genérico "Failed to fetch" no navegador, sem a requisição real chegar a sair) até essa correção.

`POST /players/link-riot-account` chama Account-V1 de verdade (`apps/api/src/modules/riot-integration/account-lookup.ts`, cache de 24h via `ApiCacheEntry`) e grava o puuid real. `POST /players/sync` é autenticado, resolve a conta Riot do proprio usuario e sincroniza partidas novas de verdade (`apps/api/src/modules/sync/riot-sync-service.ts`) — ver "Pendências desta sessão" pra mais detalhes de como isso funciona.

Módulos:

```txt
apps/api/src/modules/catalog/        # catalogo de campeoes via Data Dragon (Fase 1) + findAllChampionTags (Fase 3)
apps/api/src/modules/riot-integration/  # client-factory + account-lookup (Account-V1)
apps/api/src/modules/matches/         # persistencia/consulta de Match/MatchParticipant/MatchTimeline,
                                       # backfill de participantes (Fase 3), findMatchDetail (Fase 4)
apps/api/src/modules/sync/            # orquestracao do sync incremental
apps/api/src/modules/postgame/        # POST /postgame/analyze + GET /postgame/:matchId reais (Fase 4),
                                       # findPostgameReportsByPuuid (Fase 5), limit opcional (Fase 6b)
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
- `20260722180000_player_profile_match_analysis_limit` (Fase 6b) — `PlayerProfile.matchAnalysisLimit Int @default(50)`.

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
| `PlayerProfile`, `PlayerChampionStats` | Real — agregado apos cada sync; `strengthsJson`/`weaknessesJson`/`recentFormJson` tambem reais desde a Fase 2; `matchAnalysisLimit` desde a Fase 6b |
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
- Champion Select manual (inline em `App.tsx`), agora com seletor real de time inimigo (`features/ChampionGridPicker.tsx`, até 5 campeões) e confirmação de campeão + painel de build inline (`BuildPanel`, Sub-fase 8a);
- Pré-game (inline em `App.tsx`, enriquecido na Sub-fase 8b com ícones/splash reais — o texto da dica em si continua estático, ver abaixo);
- Pós-game (`features/PostGameScreen.tsx`, com ícone/nome de campeão real desde a 8b);
- Evolução (`features/GrowthJourneyScreen.tsx`, com ícone/cor de tendência desde a 8b);
- Configurações (`features/SettingsScreen.tsx`, novo na Sub-fase 6a).

Desde a sessão que conectou o desktop às rotas reais: Dashboard/Perfil/Champion Select/Pós-game/Evolução leem dado real via `features/api-client.ts` (`fetchPlayerProfile`/`fetchChampionPerformance`/`fetchRecentMatches`/`fetchGrowthJourney`/`fetchDraftRecommendations`/`analyzePostgame`/`fetchPostgameReport`), com loading/erro tratados pelo hook compartilhado `features/use-async-data.ts`. `mock-data.ts` foi removido. A rota `/drafts/pre-game-analysis` continua 100% mock no backend (ver "O que ficou fora de escopo" nas fases anteriores) — a Sub-fase 8b só enriqueceu a apresentação do lado do desktop com dado já disponível no cliente (ver abaixo).

Build de campeão (Sub-fase 8a): ao confirmar um campeão no Champion Select ("Confirmar campeão" em cada card de recomendação), um painel `<BuildPanel>` aparece inline na mesma tela — busca `ChampionClassProfile[]`/`ItemSummary[]` via `features/datadragon.ts` (`fetchChampionClassProfiles`/`fetchItemCatalog`, direto da Data Dragon, sem rota nova no backend) e chama `recommendBuild` (`@sparta/core`) com o campeão confirmado + `draft.enemies` (agora populado por um seletor real de até 5 campeões inimigos, `features/ChampionGridPicker.tsx`, extraído do `ChampionSkinPicker.tsx`). Renderiza botas/itens core/situacionais com ícone real (`itemIconUrl`) e as `reasons`/`warnings` do motor. Sem persistência — some ao sair da tela.

Polimento visual (Sub-fase 8b): componente compartilhado `features/Loading.tsx` (spinner) e `features/GridSkeleton.tsx` (shimmer) substituindo todo texto solto de "Carregando..." e grid vazio enquanto carrega. Pré-game (`PreGame` em `App.tsx`) passou a receber `draft`/`ddragonVersion` e mostra ícone/splash do campeão confirmado + ícones dos inimigos conhecidos + resumo da inclinação de dano do time inimigo via `summarizeEnemyDamageLean` (`@sparta/core`, mesma função do motor de build). Pós-game resolve `championId → nome/ícone` reaproveitando `fetchAllChampions`. Evolução ganhou ícone (`TrendingUp`/`TrendingDown`/`Minus`) e cor semântica de tendência (`--color-green` novo token, só para tendência — cor de destaque do tema continua fixa em vermelho).

Linguagem visual real (Fase 9, encerrada): `features/ScoreBadge.tsx` (anel colorido via `conic-gradient`, score 0-100), `features/StatBar.tsx` (barra horizontal, variantes `score`/`ratio`, prop `invert` desde a 9b pra métricas onde número alto é ruim) e `features/SignalChip.tsx` (pill com ícone lucide, `positive`/`negative`) — todos CSS puro, sem lib de gráfico, cores reaproveitadas dos limiares já exportados de `dimension-signals.ts` (`SCORE_STRENGTH_THRESHOLD`/`SCORE_WEAKNESS_THRESHOLD`/`RATIO_STRENGTH_THRESHOLD`/`RATIO_WEAKNESS_THRESHOLD`). Dashboard (9a) perdeu o card "Princípio do produto" e ganhou `ScoreBadge` nos cards de forma/melhor campeão. Champion Select (9a) trocou o `totalScore` solto por `ScoreBadge` + `StatBar` (top 4 métricas) + lista completa de `reasons`/`warnings` como `SignalChip`. Perfil (9b) ganhou `ScoreBadge`/`StatBar` por campeão (via `scoreChampionPerformance`) e `SignalChip` pros pontos fortes/fracos. Pós-game (9b) ganhou `StatBar` variante `ratio` (KDA/CS/dano/visão/ouro vs `roleBaselines[role]`) e `SignalChip`. Evolução (9b) ganhou `StatBar` dupla (recente vs anterior, com `invert`) ao lado do `TrendCell` já existente.

Ícones de campeão robustos (Fase 10): `features/ChampionIcon.tsx` substitui todo `<img src={championSquareUrl(...)}>` de campeão no app (Perfil, Champion Select, Dashboard, Pós-game, Pré-game, seletor de inimigo) — 3 estágios de fallback (Data Dragon pelo slug real, resolvido pelo `championId` quando só há `championName` cru; Community Dragon por ID numérico; placeholder estilizado), nunca mostra o ícone nativo de imagem quebrada do navegador. Dashboard (Fase 10) trocou o card "Escopo" por "Ponto forte" (espelha "Risco atual", usa `strengths[0]`) e traduziu `severity`/`confidence` crus (`severityLabels`/`confidenceLabels`). Evolução (Fase 10) usa o novo `WeaknessTrend.hasComparison` pra mostrar "Ainda sem histórico pra comparar" em vez de um "Estável" enganoso quando ainda não existe um segundo bloco de partidas pra comparar. Inputs numéricos (`input[type="number"]`) perderam as setinhas nativas via CSS global.

Fluxo de sessao (`App.tsx`): ao abrir, restaura token de `localStorage` (`sparta:token`) e chama `GET /auth/me`; sem token ou token invalido cai na tela de login; logado mas sem conta Riot vinculada cai na tela de vinculo; ambas as telas tem botao "continuar sem conta / vincular depois" para nao travar o dev local sem a API rodando. Requer `apps/api` no ar (`VITE_API_URL`, default `http://localhost:3333`); sem API a tela de login mostra erro de conexao mas o skip sempre funciona.

Deteccao automatica de champion select: `packages/riot/src/lcu/read-only-client.ts` agora le o lockfile local do League (`LcuReadOnlyClient`) e faz poll de `GET /lol-gameflow/v1/gameflow-phase` a cada 2.5s no processo main (`apps/desktop/src/main/index.ts`), repassando por IPC (`sparta:gameflow-phase`) para o renderer, que troca a aba para "Champion Select" quando a fase vira `ChampSelect`. Somente leitura, sem nenhuma acao de escrita no cliente (ver `docs/riot-compliance.md`). **O bridge `window.sparta` que entrega esse evento ao renderer só passou a carregar de verdade depois do bugfix de preload descrito acima** (sessão que validou contra o Electron real) - o comportamento downstream (trocar de aba de verdade com o League aberto) ainda não foi confirmado nesta sessão, só a existência do bridge.

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

Fase 1 (Riot Sync), o refinamento visual do desktop, Fase 2 (Player Intelligence), Fase 3 (Draft Intelligence), Fase 4 (Post-Game Coach), Fase 5 (Growth Journey), a conexão do desktop às rotas reais, a Fase 6 inteira (Configurações + tema com skins + "quantas partidas analisar" + ordem de pick automática via LCU), a Fase 7 (auditoria e documentação dos algoritmos de scoring), a Fase 8 inteira (Sub-fase 8a: motor de build + seletor de time inimigo; Sub-fase 8b: polimento visual do desktop, validada com a conta real Zekerus#117), a Fase 9 inteira (Sub-fase 9a: `ScoreBadge`/`StatBar`/`SignalChip`, Dashboard, Champion Select; Sub-fase 9b: Perfil, Pós-game, Evolução), a Fase 10 (polimento de UX + `ChampionIcon.tsx` com fallback Data Dragon → Community Dragon → placeholder) , a Fase 11 (detecção de posição/lane via LCU + gating do Champion Select + correções de polimento) e a Fase 12 (módulo de temas: splash art com extensão errada + `file://` bloqueado no renderer, mais fallback via Community Dragon) estão completas em `main` — mais sete bugs reais corrigidos ao longo do caminho: card de skin sobreposto, cor errada do número do `ScoreBadge`, o preload nunca carregando de verdade em nenhuma sessão anterior, ícones de campeão quebrados por depender do `championName` cru da Riot, `draft.playerRole` hardcoded em MID (recomendações pro papel errado), splash art pedida como `.png` quando a CDN só serve `.jpg` (403 em tudo: prévia e download), e `localSplashPath` gravado como `file://`, que o renderer nunca conseguiu carregar. Próximo:

1. **Validar a detecção automática de posição/ordem de pick dentro de uma sessão de champion select real** (precisa do cliente do League aberto e em champ select) — a Fase 11 implementou `derivePlayerRole` e o gating, e o download de skin já foi validado de verdade (não é mais pendência), mas a detecção de papel/pick order/troca de lane só pode ser confirmada de ponta a ponta com o League rodando, indisponível neste ambiente.
2. Expandir `ChampionTag` além dos 2 campeões do seed (`data/seeds/champion-tags.json`) — sem bloqueio técnico desde a Fase 3 (o seed já lê o JSON de verdade), é só curadoria manual contínua; o motor de recomendação de draft (`recommendation-engine.ts`, diferente do motor de build da 8a) já tolera ausência, mas mais cobertura melhora a qualidade das recomendações (confirmado na validação: o Champion Select real devolveu 0 recomendações pra Zekerus#117 no papel MID justamente por causa disso, comportamento honesto, não bug — funciona normalmente pro papel real do jogador, ex. JUNGLE/Viego).
3. Tornar `/drafts/pre-game-analysis` real (hoje 100% estático) — usar `analyzeTeamComposition` (já existe em `packages/core`) com `championTags`/`matchups` reais; motor de geração de texto explicativo ainda por desenhar (a composição por fragmentos da Fase 4, em `packages/core/src/postgame/post-game-analysis.ts`, é um precedente reaproveitável). A Fase 9 só enriquece a apresentação visual do lado do desktop, não essa rota.
4. Pré-computar/cachear matchups se a latência de `POST /drafts/recommendations` incomodar conforme o histórico crescer (hoje calculado na hora a cada chamada, ver "O que a Fase 3 entregou").
5. Dicas de objetivos no `PostGameAnalysis` — `objectiveEvents` (Fase 1) não preserva atribuição de time no formato atual (`"LABEL@M:SS"`), precisaria de um `MatchTimelineSummary` mais rico pra saber quais objetivos foram do próprio time.
6. Fila real (Redis/BullMQ) para o sync, se o padrão de uso mostrar que o teto de 20-50 partidas por chamada síncrona é pouco — o `docker-compose.yml` já provisiona Redis, só falta o worker.
7. LCU read-only: já implementado o poll de `gameflow-phase` (trocar de aba) e, desde a Fase 6c, de `champ-select-session` pra ordem de pick automática. Próximo passo natural: usar o resto da sessão (`myTeam`/`theirTeam`/`actions`, já tipados em `read-only-client.ts`) pra pré-carregar aliados/inimigos/banimentos reais no `DraftState` automaticamente — hoje (Sub-fase 8a) o time inimigo é escolhido manualmente no seletor novo, LCU real substituiria isso quando disponível.
8. Trocar o token HMAC caseiro por algo mais robusto (rotação de segredo, refresh token) se o produto for além do MVP local.
9. Empacotamento do desktop (electron-builder/NSIS/ASAR) — hoje não existe nenhuma configuração de build de instalador, só `electron-vite build`.
10. Mitigar a limitação conhecida da Fase 5 (`WeaknessTrend` derivado de um corte top-3 por partida, ver "O que a Fase 5 entregou") lendo razões brutas em vez de só `weaknesses[]`, se o ruído de entrada/saída na fronteira do corte incomodar na prática.
11. Recalibrar estatisticamente os pesos/baselines/thresholds de scoring (`docs/scoring-model.md`/`docs/draft-recommendation.md`) quando houver volume real de uso acumulado — a Fase 7 documentou o raciocínio de design atual mas deliberadamente não recalibrou nada por falta de dado suficiente.
12. Persistir a build recomendada / confirmação de campeão no backend, se fizer sentido revisitar depois de mais uso (hoje é 100% local à sessão do Champion Select, decisão deliberada da 8a).
13. Sparkline/timeline por partida individual na Evolução (hoje só 2 blocos agregados) — exigiria mudar o contrato de `computeWeaknessTrends` pra reter presença por partida, não só a taxa; adiado na Fase 11.

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
