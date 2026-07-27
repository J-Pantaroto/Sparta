# Changelog

Histórico de features do Sparta, mais recente primeiro. Cada entrada representa uma feature
implementada (mergeada em `main`), com a **data/hora real da execução** (não a data do pedido).

## Convenção

Ao concluir uma feature: adicionar uma entrada nova **no topo** deste arquivo, no formato:

```markdown
## AAAA-MM-DD HH:MM — Título curto da feature
**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/NNNN-slug.md` (quando existir um)

Descrição de 1-3 linhas: o que mudou e por quê.
```

Ver `.ai/prompts/features/README.md` pro rastreamento do pedido em si (status, front matter).
Entradas anteriores a 2026-07-25 não têm arquivo de prompt correspondente — a convenção de
`.ai/prompts/features/` só passou a existir a partir daquela data; foram reconstruídas a partir
de `git log --merges` e do histórico narrativo em `.ai/CLAUDE.md`.

---

## 2026-07-26 17:30 — Posição desconhecida não vira mais MID
**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0006-posicao-desconhecida-sem-fallback-mid.md`

`DraftState.playerRole` virou opcional e ausência deixou de ser convertida em `MID` em nove
pontos do fluxo (estado inicial do desktop, aliados/inimigos do LCU, inimigo manual, mapper do
Match-V5, seletor da interface, schema da API). O motor devolve vazio sem posição, a rota
responde `422 PLAYER_ROLE_UNAVAILABLE` sem consultar estatísticas, e o cliente barra antes de
enviar. Nova `playerRoleSource` (`LCU`/`USER`) e `USER_PROVIDED` na proveniência distinguem
detecção de escolha manual. Trocar de posição descarta os cards anteriores antes de mostrar os
novos. 29 testes novos (326 no total).

## 2026-07-26 14:40 — Participação em objetivos a partir de dados reais
**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0005-participacao-objetivos-real.md`

`objectiveParticipation` passa a ser calculado do Match-V5 já persistido: dragões e barões que
o jogador acompanhou sobre os que o próprio time conquistou. O Arauto ficou **de fora** por
evidência — `riftHeraldTakedowns` e `objectives.riftHerald.kills` não usam a mesma
contabilidade (existe partida em que ninguém matou Arauto e um jogador tem takedown). Time sem
objetivo neutro fica indisponível, não `0%`. Novo backfill local idempotente que reprocessa o
`rawJson` sem nenhuma chamada à Riot. Efeito real: Viego JUNGLE 61,4 → 67,2 com cobertura
0,85 → 1,0. 37 testes novos (301 no total).

## 2026-07-26 11:55 — Ausência versus zero nas estatísticas
**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0004-ausencia-versus-zero-estatisticas.md`

Auditoria e correção do fluxo de estatísticas pra que `0` signifique zero medido e ausência
permaneça ausente. O maior falso zero era `objectiveParticipation`, nunca extraído de fonte
nenhuma (0 de 220 participantes no banco real) mas gravado como `0` e valendo 15% do peso do
score em JUNGLE/SUPPORT: Viego 52 → 61,4 e Vel'Koz 46 → 53,7 na conta real. Também corrigidos
`csAt10/15` de partida curta, `teamId` fantasma, filtro `> 0` que descartava participação zero
legítima, e agregação de coleção vazia. Nova `StatCoverage` com amostra total e disponível.
35 testes novos (264 no total); migration sem alterar dado existente.

## 2026-07-25 14:15 — Meta e matchup indisponíveis sem dados reais
**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0003-meta-matchup-indisponiveis.md`

Separa matchup pessoal de global, elimina os fallbacks falsos de `50` para matchup/meta e
normaliza o score somente com sinais disponíveis. A Champion Select mostra a cobertura de dados
por candidato; compatibilidade com respostas antigas continua sem inventar evidência.

## 2026-07-25 15:52 — Contrato de origem, disponibilidade e confiança dos dados
**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0002-contrato-origem-disponibilidade.md`

Cria o contrato central (`DataProvenance`, `AvailabilityStatus`, `RecommendationMetric` com
`value: number | null`) que permite distinguir um 50 calculado de verdade de um 50 que na
verdade é ausência de dado. `PickRecommendation` ganha `metricDetails`, e a interface passa a
exibir métrica indisponível **sem barra**. Nenhum cálculo mudou nesta etapa. Corrige de quebra
um defeito achado na validação real: o desktop quebrava contra uma API anterior ao contrato.
24 testes novos, incluindo a primeira suíte de componente do renderer (jsdom).

## 2026-07-25 12:05 — Estrutura de prompts/features, changelog e specs em `.ai/`
**Status:** IMPLEMENTADA · Prompt: `.ai/prompts/features/0001-estrutura-prompts-changelog-specs.md`

Cria `.ai/prompts/features/` (rastreamento de pedidos de feature com cabeçalho de status),
este `CHANGELOG.md` (histórico com data/hora real de execução) e `.ai/specs/` (espelho de
`docs/*.md` pra consulta rápida por agentes de IA). Adiciona também a regra 11 em "Regras de
implementação" do `.ai/CLAUDE.md`: testes automatizados por feature/bug-fix sempre que
necessário/possível. Sem teste automatizado próprio — é convenção de processo, sem código
executável.

## 2026-07-25 11:44 — Unificação de `.ai` via links simbólicos
**Status:** IMPLEMENTADA

`.claude`, `.codex` e `.agents` viram links simbólicos apontando pra `.ai`, que passa a ser a
única pasta versionada com config compartilhada entre os agentes de IA (Claude/Codex/Agents).
`CLAUDE.md`, `README.md`, `SPARTA_CODEX_INSTRUCTIONS.md` e `launch.json` movidos pra dentro.

## 2026-07-25 03:36 — Fase 16: draft real via League Client
**Status:** IMPLEMENTADA · PR #31 (`feat/lcu-draft-import-16`)

`deriveDraftSnapshot` deriva aliados, inimigos, banimentos e o campeão do jogador a partir da
sessão real de champion select do LCU, substituindo a marcação manual do time inimigo. Corrige
limitação real: o watcher só transmitia eventos quando o valor mudava, deixando a tela vazia ao
abrir o app já em champion select.

## 2026-07-25 00:58 — Fase 15: `ChampionTag` derivado pra todo o roster
**Status:** IMPLEMENTADA · PR #30 (`feat/champion-tags-derived-15`)

`deriveChampionTag` deriva as 9 dimensões do `ChampionTag` a partir de `tags`/`info` da Data
Dragon, cobrindo 173 campeões (antes só 2 curados manualmente). Corrige bug real no upsert do
seed (nunca atualizava um campeão já gravado) e um bug de sinergia de aliados exposto pela
expansão do roster.

## 2026-07-24 23:07 — Subfase 14F: polimento, acessibilidade e validação final (encerra a Fase 14)
**Status:** IMPLEMENTADA · PR #29 (`feat/ui-polish-a11y-14f`)

Migra as telas de autenticação pro design system novo, remove `styles/global.css` e os aliases
legados de token. Validação final medida no Electron real em 4 resoluções, foco por teclado,
`prefers-reduced-motion` e offline com tema baixado.

## 2026-07-24 22:54 — Subfase 14E: Configurações e galeria de temas
**Status:** IMPLEMENTADA · PR #28 (`feat/ui-settings-theme-14e`)

Novo `ThemeGallery` com prévia grande da splash art e amostras da cor extraída, substituindo o
grid técnico anterior. Configurações ganha abas (`Tabs`) pras duas seções.

## 2026-07-24 22:45 — Subfase 14D: Pós-game e Evolução
**Status:** IMPLEMENTADA · PR #27 (`feat/ui-postgame-growth-14d`)

Pós-game ganha rail de cards selecionáveis e hierarquia real de relatório (veredito, prioridade
de melhoria, razão + valor absoluto). Evolução agrupa por direção (piorando/melhorando/sem
comparação) em vez de repetir "Estável".

## 2026-07-24 22:38 — Subfase 14C: Champion Select e Pré-game
**Status:** IMPLEMENTADA · PR #26 (`feat/ui-draft-workspace-14c`)

Champion Select vira workspace de decisão (barra de sessão, rail de recomendações compactas,
painel de detalhe com as 8 métricas). Corrige bug real de estado obsoleto em cliques rápidos no
grid de inimigos (closure antigo sobrescrevendo seleções).

## 2026-07-24 22:29 — Subfase 14B: Dashboard e Perfil
**Status:** IMPLEMENTADA · PR #25 (`feat/ui-dashboard-profile-14b`)

Dashboard ganha herói com números agregados reais e faixa das últimas 10 partidas. Perfil ganha
filtro por posição, busca, ordenação e painel de detalhe fixo com as 8 médias + 10 componentes
de score. Corrige breakpoint de 2 colunas que nunca disparava no viewport padrão do Electron.

## 2026-07-24 22:20 — Subfase 14A: fundação do design system
**Status:** IMPLEMENTADA · PR #24 (`feat/ui-foundation-14a`)

Novo design system em `apps/desktop/src/renderer/src/ui/` (tokens, base, 16 componentes),
`packages/ui` removido (código morto). Reorganização de pastas do renderer (`services/`,
`hooks/`, `theme/`, `app/`, `features/`). Remove as regras de CSS descendente genéricas que
causavam bugs de cor em cascata.

## 2026-07-24 17:40 — Fase 13: o tema veste o app
**Status:** IMPLEMENTADA · PR #23 (`feat/theme-identity-13`)

Filtra chromas do seletor de skins usando a Community Dragon (o campo `chromas` da Data Dragon
não serve pra isso). Extrai a cor de destaque da splash art (`extractAccentPalette`) e aplica
em runtime nos tokens `--color-accent*`, com splash de fundo nas 5 telas principais. Corrige CSP
que bloqueava silenciosamente todo fallback de Community Dragon desde a Fase 10.

## 2026-07-24 16:07 — Fix: módulo de temas (splash nunca carregava nem aplicava)
**Status:** IMPLEMENTADA · PR #22 (`fix/theme-module-12`)

Dois bugs reais independentes desde a Sub-fase 6a: `championSplashUrl` montava `.png` (a CDN só
serve `.jpg`, 403 em tudo) e `file://` era bloqueado pelo Chromium a partir da origem `http://`
do renderer. Handler IPC passa a devolver data URL; novo fallback via Community Dragon.

## 2026-07-23 19:04 — Fase 11: detecção de posição/lane + gating do Champion Select
**Status:** IMPLEMENTADA · PR #21 (`feat/lane-detection-11`)

`derivePlayerRole` lê `assignedPosition` do LCU (já tipado desde a Fase 6c, nunca consumido).
Corrige bug real: `draft.playerRole` estava hardcoded em `"MID"` pra todo mundo. Champion Select
ganha gating por sessão real (com opção de simular manualmente) e seletor manual de posição.

## 2026-07-23 18:16 — Fase 10: polimento de UX a partir do feedback ao vivo do usuário
**Status:** IMPLEMENTADA · PR #20 (`feat/ux-polish-10`)

Novo `WeaknessTrend.hasComparison` distingue "estável de verdade" de "ainda sem 2º bloco pra
comparar". Novo `ChampionIcon.tsx` com 3 estágios de fallback (Data Dragon → Community Dragon →
placeholder), corrigindo ícones quebrados que dependiam do `championName` cru da Riot.

## 2026-07-23 14:44 — Fix: preload nunca carregava de verdade (`window.sparta` sempre indefinido)
**Status:** IMPLEMENTADA · PR #19 (`fix/preload-cjs-loading`)

Bug real presente desde o início do projeto, achado validando contra o Electron real via CDP: o
preload buildava como `.mjs` (ESM) mas o loader sandboxed não entende `import`. Corrigido
forçando build do preload pra CommonJS real (`.cjs`). Todo recurso dependente de `window.sparta`
nunca tinha funcionado em nenhuma sessão anterior.

## 2026-07-23 13:54 — Subfase 9b: Perfil, Pós-game e Evolução (encerra a Fase 9)
**Status:** IMPLEMENTADA · PR #18 (`feat/visual-scoring-9b`)

`ScoreBadge`/`StatBar`/`SignalChip` aplicados às 3 telas restantes. Novo prop `invert` em
`StatBar` pra métricas onde valor alto é ruim (Evolução). Corrige cor errada do número dentro do
`ScoreBadge` (regra CSS genérica de `span` vencendo por ordem de arquivo).

## 2026-07-23 13:37 — Subfase 9a: `ScoreBadge`/`StatBar`/`SignalChip` + Dashboard + Champion Select
**Status:** IMPLEMENTADA · PR #17 (`feat/visual-scoring-9a`)

Primeira linguagem visual real de score (anel `conic-gradient`, barra horizontal, chips de
sinal), sem lib de gráfico. Remove o card "Princípio do produto" do Dashboard.

## 2026-07-23 09:39 — Fix: card de skin com nome/botão sobrepostos
**Status:** IMPLEMENTADA · PR #16 (`fix/skin-picker-overlap`)

Card do passo 2 do seletor de skin reusava uma classe com `line-height: 0` feita pra outro grid,
colapsando o texto. Nova classe própria `.skin-picker-card`.

## 2026-07-23 08:59 — Subfase 8b: polimento visual do desktop
**Status:** IMPLEMENTADA · PR #15 (`feat/visual-polish-8b`)

Componentes `Loading`/`GridSkeleton` substituem texto solto de carregamento. Pré-game ganha
ícone/splash do campeão confirmado + inimigos conhecidos + resumo de inclinação de dano.

## 2026-07-23 08:43 — Subfase 8a: motor de build de campeão + seletor de time inimigo
**Status:** IMPLEMENTADA · PR #14 (`feat/build-recommendation-8a`)

Novo motor puro `recommendBuild` usa `tags`/`info` da Data Dragon (cobre ~170 campeões) em vez
da tabela curada `ChampionTag` (só 2 na época). Seletor real de até 5 inimigos e painel de build
inline no Champion Select.

## 2026-07-22 21:25 — Fase 7: auditoria e documentação dos algoritmos de scoring
**Status:** IMPLEMENTADA · PR #13 (`feat/scoring-audit-phase7`)

Corrige duas inconsistências reais (`DEATHS_BAD_VALUE` divergente entre 4 call sites, literal
`8` duplicado independente de `MEDIUM_CONFIDENCE_GAMES`). Resto da fase é documentação do
raciocínio de design em `docs/scoring-model.md`/`docs/draft-recommendation.md`.

## 2026-07-22 20:39 — Sub-fase 6c: ordem de pick automática via LCU
**Status:** IMPLEMENTADA · PR #12 (`feat/lcu-pick-order-6c`)

`derivePickOrder` conta picks completos de aliados antes da própria ação, substituindo o input
manual 1-5 quando o League Client está aberto em champion select real.

## 2026-07-22 20:27 — Sub-fase 6b: "quantas partidas analisar" + fix de CORS
**Status:** IMPLEMENTADA · PR #11 (`feat/match-analysis-limit-6b`)

Nova config pessoal `matchAnalysisLimit` (20/50/100/personalizado). Corrige bug real de CORS:
`@fastify/cors` sem `methods` explícito bloqueava todo `PUT` no preflight silenciosamente.

## 2026-07-22 15:51 — Sub-fase 6a: tela de Configurações + tema com campeão/skin real
**Status:** IMPLEMENTADA · PR #10 (`feat/settings-theme-skins-6a`)

Substitui a lista fixa de 12 campeões curados por escolha livre de qualquer campeão/skin via
Data Dragon, com download real pro disco (primeiro uso de IPC request/response do app). Corrige
bug real de campos `id`/`key` invertidos no `champion.json`.

## 2026-07-22 15:06 — Desktop conectado às rotas reais da API
**Status:** IMPLEMENTADA · PR #9 (`feat/desktop-real-data-wiring`)

Dashboard/Perfil/Champion Select trocam `mock-data.ts` (2 campeões hardcoded) por dado real via
novo `api-client.ts` + `use-async-data.ts`. Novas telas Pós-game e Evolução. `mock-data.ts`
removido.

## 2026-07-22 14:29 — Fase 5: Growth Journey
**Status:** IMPLEMENTADA · PR #8 (`feat/growth-journey-phase5`)

`computeWeaknessTrends` compara blocos de `PostgameReport` já persistidos pra detectar tendência
de melhora/piora por ponto fraco — primeira fase do projeto sem nenhuma migração nova, 100%
derivada de dado já salvo pela Fase 4.

## 2026-07-22 01:58 — Fase 4: Post-Game Coach
**Status:** IMPLEMENTADA · PR #7 (`feat/postgame-coach-phase4`)

`generatePostGameAnalysis` religa `POST /postgame/analyze`/`GET /postgame/:matchId` com dado
real (antes 100% mock, aceitava performance inventada pelo próprio cliente). Persiste em
`PostgameReport` via upsert.

## 2026-07-21 23:16 — Fase 3: Draft Intelligence
**Status:** IMPLEMENTADA · PR #6 (`feat/draft-intelligence-phase3`)

Corrige bloqueio real: `persistMatch` só gravava o participante rastreado, descartando os outros
9 — sem isso não dava pra saber o adversário de rota. `POST /drafts/recommendations` religada
com matchups/tags reais. Backfill retroativo dos participantes faltantes.

## 2026-07-21 21:20 — Fase 2: Player Intelligence
**Status:** IMPLEMENTADA · PR #5 (`feat/player-intelligence-phase2`)

`computeRecentForm`/`derivePlayerStrengthsWeaknesses` calculam forma recente e pontos
fortes/fracos reais a partir do histórico agregado, persistidos a cada sync.

## 2026-07-21 18:46 — Refinamento visual do desktop
**Status:** IMPLEMENTADA · PR #4 (`feat/desktop-visual-refresh`)

Fonte unificada (Manrope), paleta migrada pra CSS custom properties, transições e animações de
entrada — antes o app não tinha nenhuma transição.

## 2026-07-21 17:54 — Fase 1: Riot Sync
**Status:** IMPLEMENTADA · PR #3 (`feat/riot-sync-phase1`)

Catálogo real de campeões via Data Dragon, `RiotApiClient` conectado de verdade (antes existia
mas nunca era chamado), mapeadores puros Match-V5, sync incremental real, agregação de
`PlayerChampionStats`. Primeira fase que tira o produto do mock em todo o backend.

## 2026-07-21 17:38 — Fix: imports ESM/NodeNext da API
**Status:** IMPLEMENTADA · PR #1 (`fix/api-esm-nodenext-imports`)

Correção de infraestrutura anterior à Fase 1.

## 2026-07-21 17:37 — Fix: hardening de segurança
**Status:** IMPLEMENTADA · PR #2 (`fix/security-hardening`)

Correção de infraestrutura anterior à Fase 1.
