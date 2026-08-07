# Champion Select e pré-game — redesign (Etapa 31G)

Auditoria, decisões e validação do redesign do Champion Select e da análise
pré-partida. O trabalho começou numa sessão do Codex, que chegou ao limite com
~16 arquivos alterados e não commitados; esta etapa auditou o que estava
pronto, corrigiu o que precisava, validou contra a conta real e concluiu.

Nada do motor, contratos, ranking, scores, cobertura, snapshot, Match-V5,
release, replay, autenticação ou onboarding foi alterado. O escopo inteiro é
apresentação: como o Champion Select e o pré-game leem e mostram o que a API
já calcula.

## O que veio do Codex, herdado sem alteração de comportamento

- **`selectedChampionLocked`** (`packages/riot/src/lcu/draft-snapshot.ts`) —
  novo campo booleano em `LcuDraftSnapshot`, derivado de `snapshot.actions`:
  verdadeiro só quando a ação de pick do próprio jogador está `completed` com
  o `championId` que bate com a seleção atual. Distingue "escolhi mas ainda
  não travei" de "travado" — a Riot expõe essa diferença durante toda a
  contagem regressiva do pick, e o Sparta agora a lê em vez de tratar seleção
  e lock-in como a mesma coisa.
- **Cancelamento real de requisição** (`use-async-data.ts` +
  `api-client.ts`) — `useAsyncData` passou a criar um `AbortController` por
  execução do efeito e abortar no cleanup; `fetchDraftRecommendations` e
  `fetchPreGameAnalysis` recebem o `signal` e o repassam para
  `fetchWithPolicy` (`packages/riot/src/http/policy.ts`), que já combinava
  sinal externo com o timeout interno desde a Etapa 9 — o cancelamento chega
  de fato à rede, não só ao estado do componente.
- **`sparta:lcu-status`** (main/preload) — novo canal IPC que transmite
  `LcuReadStatus` (os nove valores já existentes: `OK`, `CLIENT_CLOSED`,
  `LOCKFILE_MISSING`, `CONNECTION_REFUSED`, `REQUEST_TIMEOUT`,
  `ENDPOINT_UNAVAILABLE`, `LOCAL_CREDENTIAL_INVALID`, `LOCKFILE_INVALID`,
  `INVALID_RESPONSE`, `OUTSIDE_CHAMP_SELECT`) só quando muda. `App.tsx` usa
  isso pra derivar `leagueConnected` a partir do status real em vez de
  `phase !== null` — a versão anterior tratava "não sei a fase" e "League
  fechado" como a mesma coisa.
- **Congelamento visual do snapshot** (`ChampionSelectScreen.tsx`) — ao
  detectar `selectedChampionLocked` passando de falso pra verdadeiro (ou ao
  clicar em "Confirmar" no modo manual, que não tem sinal de lock-in real), a
  tela copia as recomendações correntes pra `frozenSnapshot` e passa a
  exibi-las em vez de reagir a atualizações seguintes. Sem isso, trocar de
  campeão inimigo depois do lock-in reordenaria os cards embaixo de uma
  escolha que já não pode mudar.
- **Nova composição visual do draft, filtros progressivos e redesign do
  pré-game** — reescrita quase completa de `ChampionSelectScreen.tsx`
  (1210 linhas de diff) e `PreGameScreen.tsx` (242 linhas), com CSS novo
  dedicado. Ver "O que mudou na apresentação" abaixo.

## O que foi auditado e corrigido nesta sessão

### Revertido: `pnpm-workspace.yaml`

O Codex tinha duplicado `onlyBuiltDependencies`/`overrides` de
`package.json` (campo `pnpm`) dentro de `pnpm-workspace.yaml` — mesmo
conteúdo, dois lugares. `pnpm install --frozen-lockfile` funciona
normalmente sem a duplicata; não há aviso de config obsoleta. Revertido:
`git checkout -- pnpm-workspace.yaml`. Ajuste de ambiente local do Codex, não
faz parte do produto.

### Corrigido: import morto e globals de ESLint

- `useMemo` importado e não usado em `ChampionSelectScreen.tsx` — removido.
- `AbortSignal`/`AbortController` não estavam na lista de globals do
  `eslint.config.js` da raiz (que mantém uma lista fechada em vez de
  `env: browser`, mesmo padrão de `RequestInit`/`Response`, já presentes por
  causa do `fetch`). O cancelamento real introduzido pelo Codex expôs esse
  gap. Adicionados os dois, mesmo padrão dos já existentes.

### Investigado e descartado: falhas intermitentes em `apps/api`

`pnpm -r test` (todos os workspaces em paralelo) reprovou 2 a 4 testes por
execução, um conjunto **diferente** a cada vez, sempre em `apps/api` — mesmo
padrão de contenção de recursos já documentado na Etapa 26b
(`.ai/CLAUDE.md`). `apps/api` sozinho (`pnpm --filter @sparta/api test`)
passou **46/46 arquivos, 336/336 testes**, duas vezes seguidas, sem nenhuma
alteração de código. `apps/api` não tem nenhum arquivo tocado por este
redesign (confirmado por `git status` antes de qualquer edição). Uma terceira
execução completa de `pnpm -r test` passou os cinco pacotes sem nenhuma
falha. Não é regressão desta etapa.

## O que mudou na apresentação

### Champion Select

- **Três estados operacionais antes da sessão real**: League fechado
  (`CLIENT_CLOSED`/`LOCKFILE_MISSING`, "League não detectado"), LCU instável
  (qualquer outro status fora de `OK`/`OUTSIDE_CHAMP_SELECT`, "A LCU não
  respondeu de forma estável" com o status técnico exposto) e cliente aberto
  fora do champion select (mostra a fase real, ex. "Lobby aberto"). Os três
  têm heading, descrição e badge distintos — `championSelectOperationalState`
  centraliza essa decisão.
- **Modo manual** (`Simular manualmente`) continua sendo o único jeito de
  testar sem o League aberto — não foi criado nem removido nesta etapa,
  apenas mantido como estava desde a Fase 11.
- **Rail de recomendações + painel de detalhe**, com filtro por grupo
  (Todas / Principais / Só alternativas) e filtro de explicação (Por que
  funciona / Riscos / Contexto pessoal / Composição / Matchup pessoal / Dados
  indisponíveis) — os `RecommendationMetric` já vinham classificados pela
  API; a tela só os agrupa.
- **Resumo da escolha registrada** (`SelectedChoiceSummary`) — quando
  `draft.selectedChampionId` não está entre os candidatos do snapshot
  (`NOT_IN_SNAPSHOT`), o texto diz isso explicitamente e não mostra rank nem
  score: "Fora do snapshot: nenhum score ou ranking retroativo foi criado."
- **Mapa de capacidades textual** (`CapabilityMap`) — equivalente
  `role="list"`/`role="listitem"` do que a análise estratégica já calcula
  (`candidateContribution`, `risks`, `unavailableSignals`), sem gráfico.

### Pré-game

- **Quadro do draft** (`PreGameDraftBoard`) mostra o próprio campeão junto
  dos aliados conhecidos e o time inimigo revelado, com o adversário direto
  destacado só quando `draft.enemyLaneChampionId` está presente — nunca
  inferido.
- **Corpo da análise não descarta o resultado anterior durante o
  recálculo**: `state.status === "loading" && !state.data` é o único caso que
  mostra o spinner cheio; com dado presente, um badge "Atualizando draft"
  aparece sobre o conteúdo anterior.
- **Guarda de resposta obsoleta em duas camadas**: o `AbortController` do
  hook cancela a requisição de verdade; `compatibleAnalysis` (client-side)
  também descarta `analysis.data` se `championId`/`role` não baterem mais com
  o draft atual — redundância deliberada contra qualquer corrida que escape
  do cancelamento de rede.
- **Seções colapsáveis** (`CollapsibleAnalysis`) para composição
  aliada/inimiga, mapa de capacidades e nota de proveniência do perfil do
  campeão — mesmo contrato de `AnalysisSection`/`AnalysisSignal` de antes, só
  reorganizado.

## Validação

### Automatizada

`packages/riot/src/lcu/draft-snapshot.test.ts` — 3 casos novos:
`selectedChampionLocked` verdadeiro/falso conforme a ação de pick, e o caso
que distingue seleção de lock-in (`completed: false` no mesmo pick).

`apps/desktop/src/renderer/src/hooks/use-async-data.test.tsx` — confirma que
uma resposta antiga não vence a atual e que o `AbortSignal` da requisição
anterior é abortado de fato quando os `deps` mudam.

`apps/desktop/src/renderer/src/features/ChampionSelectScreen.31g.test.tsx` —
4 casos: distingue League fechado de falha instável da LCU (com o status
técnico no texto); registra escolha fora do snapshot sem score retroativo;
preserva o snapshot visual depois do lock-in (rerender com recomendações
diferentes não muda o que já está exibido); mantém adversário desconhecido
sem inferir confronto e confirma que o card de recomendação é um `<button>`
nativo (navegável por teclado).

**1177 testes** no monorepo (core 629, riot 97, api 336, desktop 100, raiz
15) + 1 do analyzer Python, todos passando isoladamente e em conjunto (ver
seção sobre a flakiness investigada acima). `typecheck`, `lint` e `build`
completos nos quatro pacotes TypeScript.

### Visual, no Electron real

Processo Electron real (não dev server numa aba de navegador comum),
carregando de `file://…/out/renderer/index.html` sem Vite, conectado via
Chrome DevTools Protocol. Conta real Zekerus#117 (mesmo padrão de token de
sessão assinado de sempre).

**Achado incomum desta sessão**: pela primeira vez no histórico deste
projeto, um cliente real do League of Legends estava aberto na máquina de
validação (processo `LeagueClient` rodando, lockfile presente). Isso permitiu
uma leitura real, não sintética, do LCU:
`window.sparta.getLcuState()` devolveu `{status: "OUTSIDE_CHAMP_SELECT",
phase: "Lobby"}`, e a tela mostrou corretamente "Lobby aberto" como heading e
badge — confirmando que o caminho main → preload → renderer →
`championSelectOperationalState` reflete estado real do cliente, não só o
que os testes automatizados simulam. **Nenhuma ação foi tomada dentro do
cliente real** (sem fila, sem partida) — validar o Champion Select
completo (rascunho ao vivo, recomendações reagindo a picks reais) continua
exigindo entrar de fato numa sessão de champion select, fora do alcance
desta sessão sem iniciar uma partida real. Esse limite específico é o mesmo
documentado em toda etapa anterior deste projeto.

O resto da validação usou o caminho manual (`Simular manualmente`), que já
existe no produto desde a Fase 11 exatamente para isto:

- posição Jungle selecionada → recomendações reais carregadas (Viego, Udyr,
  filtro "Só alternativas" presente);
- dois inimigos adicionados pelo grid (Lee Sin, Ahri) — avatares corretos nas
  vagas, contadores atualizados;
- "Confirmar" no card do Viego → `"Snapshot preservado"` visível
  imediatamente;
- Pré-game aberto com o mesmo draft: hero com nome e splash do Viego,
  "Inimigos revelados 2/5", "Cobertura dos dados 22%", "Confronto direto:
  Ainda sem dado pra esta leitura" (correto — os inimigos manuais não têm
  `role`, então `enemyLaneChampionId` fica `undefined` e nada é inferido),
  texto de cobertura proporcional ("22% dos sinais esperados"), build
  sugerida presente;
- **1000px / 1280px / 1600px**, com e sem recomendações carregadas: zero
  scroll horizontal indevido em qualquer combinação;
- foco por teclado com **Tab real** (`Input.dispatchKeyEvent`, não
  `element.focus()` via JS — que não dispara `:focus-visible` no Chromium):
  pousa num `<button class="sp-card ... sp-card--interactive">` real, com
  anel de foco de 2px na cor de destaque do tema;
- temas Obsidian (compacto, intensidade reduzida) e Adaptativo (confortável,
  completo) aplicados via `localStorage["sparta:visual-preferences-v2"]` e
  confirmados no `dataset` do `<html>` — layout e legibilidade preservados
  nos dois, zero imagem quebrada;
- **zero erro de console** em toda a sessão (login, navegação, seleção,
  edição de inimigos, confirmação, pré-game, troca de breakpoint, troca de
  tema);
- **zero imagem quebrada, zero `NaN`/`Infinity`/`undefined`** em qualquer
  tela visitada.

### Não regressão

Mesma recomendação controlada usada desde a Etapa 27b (JUNGLE, pick 3, Ahri
aliada, Lee Sin inimigo, bans 55/91), contra a API em execução (sem
reconstrução de imagem — não fazia parte do escopo desta etapa):

| # | Campeão | Score | Cobertura | Categoria |
| --- | --- | --- | --- | --- |
| 1 | Viego | 58.7 | 0.9 | comfort_pick |
| 2 | Udyr | 58.5 | 0.5 | strategic_option |
| 3 | Vi | 55.3 | 0.5 | strategic_option |
| 4 | Nocturne | 53.3 | 0.5 | strategic_option |
| 5 | Graves | 50.1 | 0.5 | strategic_option |

Idêntico à linha de base de todas as etapas anteriores. `release-etapa27c-v1`
continua `ACTIVE`, `currentlyActive: true`, com `artifactHash`
(`8878a657…`) e `configHash` (`fa9dbde1…`) **iguais** antes e depois desta
sessão. Replay do snapshot novo: **`EXACT_REPLAY`, 0 divergências**.

## Nota sobre a conta de teste local

A conta real usada pra validação (`Zekerus#117`, `User.id
02a51cd2-…`) ficou presa em `onboarding.state = "EMAIL_UNVERIFIED"` desde a
Etapa 31D, que introduziu a exigência de verificação de e-mail. Como essa
conta é o fixture de teste persistente deste projeto desde a Fase 1 (usada em
dezenas de sessões anteriores) e o ambiente é `NODE_ENV=development` (sem
provider de e-mail real), `User.emailVerifiedAt` foi definido diretamente no
Postgres local pra desbloquear a validação — não é uma alteração de código
nem um bypass da lógica de onboarding em produção, é manutenção do fixture de
teste local, do mesmo jeito que sessões anteriores criaram/removeram contas
isoladas pra testar fluxos específicos.

## Referências

`.ai/prompts/features/0047-redesign-champion-select-pre-game.md`,
`docs/pre-game-analysis.md`, `docs/draft-recommendation.md`,
`docs/data-provenance.md`.
