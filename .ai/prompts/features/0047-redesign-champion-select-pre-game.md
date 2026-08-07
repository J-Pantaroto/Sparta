---
status: IMPLEMENTADA
solicitado_em: 2026-08-06 20:02
implementado_em: 2026-08-06 22:40
---

# Etapa 31G — Redesign do Champion Select e pré-game

## Pedido original

> Auditar e redesenhar somente os estados do Champion Select, a representação do draft,
> recomendações principais/alternativas, explicações progressivas, contexto pessoal e análise
> estratégica pré-partida. Preservar motor, contratos, ranking, scores, cobertura, snapshot,
> Match-V5, release, replay, autenticação e onboarding. Estabilizar atualizações concorrentes,
> garantir acessibilidade/responsividade e validar no Electron real ou empacotado, com cenário
> controlado e `EXACT_REPLAY`.

## Continuação (pedido desta sessão)

> O Codex iniciou o redesign e atingiu o limite com ~16 arquivos alterados não commitados. Auditar
> o que estava pronto (mudança funcional legítima vs. visual vs. ajuste acidental de ambiente vs.
> código incompleto), corrigir o que precisava, revisar/fortalecer testes, validar no Electron real
> com cenário controlado e `EXACT_REPLAY`, e concluir a etapa até commit + push + CI verde. Auditar
> com cuidado a alteração de `pnpm-workspace.yaml` (suspeita de ajuste local do Codex) e revertê-la
> se for só isso.

## Notas de implementação

Relatório completo em `docs/champion-select-pre-game-experience.md`. Resumo:

**Revertido**: `pnpm-workspace.yaml` — duplicata exata de `package.json.pnpm` (Etapa 28a/29), sem
efeito comprovado (`pnpm install --frozen-lockfile` funciona idêntico sem ela). Ajuste de ambiente
local do Codex, não faz parte do produto.

**Herdado do Codex, íntegro**: `selectedChampionLocked` no `LcuDraftSnapshot` (distingue seleção de
lock-in real via `snapshot.actions`); cancelamento real de requisição (`AbortController` no
`useAsyncData`, propagado até `fetchWithPolicy`); canal IPC `sparta:lcu-status`; congelamento visual
do snapshot no lock-in/confirmação manual; reescrita quase completa de `ChampionSelectScreen.tsx`
(1210 linhas de diff) e `PreGameScreen.tsx` (242 linhas) com CSS novo.

**Corrigido nesta sessão**: import morto (`useMemo`) em `ChampionSelectScreen.tsx`; dois globals
faltando no `eslint.config.js` da raiz (`AbortSignal`/`AbortController`, expostos pelo cancelamento
real que o Codex introduziu).

**Investigado e descartado**: falhas intermitentes de `apps/api` sob `pnpm -r test` (conjunto
diferente de testes falhando a cada execução) — mesmo padrão de contenção de recursos já documentado
na Etapa 26b. `apps/api` isolado passou 46/46 arquivos duas vezes seguidas sem alteração de código;
`apps/api` não tem nenhum arquivo tocado por este redesign. Uma terceira execução completa de
`pnpm -r test` passou os cinco pacotes sem falha nenhuma.

**Validação real**: Electron real via CDP (não dev server em aba de navegador), conta Zekerus#117.
Achado incomum: pela primeira vez neste projeto, um cliente real do League estava aberto na máquina
de validação — `getLcuState()` leu `{status: "OUTSIDE_CHAMP_SELECT", phase: "Lobby"}` de verdade, e
a tela mostrou "Lobby aberto" corretamente. Nenhuma ação foi tomada no cliente real (sem fila, sem
partida). O resto da validação usou o modo "Simular manualmente" já existente desde a Fase 11:
recomendações reais carregadas (Viego, Udyr, filtro de alternativas), dois inimigos adicionados pelo
grid, confirmação congelando o snapshot ("Snapshot preservado"), pré-game com cobertura proporcional
e "Confronto direto: ainda sem dado" (sem inferir posição de inimigo manual sem `role`). 1000/1280/
1600px sem scroll horizontal; foco por Tab real pousando num `<button>` com anel de 2px; temas
Obsidian (compacto/reduzido) e Adaptativo (confortável/completo) aplicados corretamente; zero erro
de console, zero imagem quebrada, zero `NaN`/`Infinity`/`undefined` em toda a sessão.

**Não regressão**: mesma recomendação controlada desde a Etapa 27b → 5 candidatos idênticos à linha
de base (Viego 58.7/0.9 … Graves 50.1/0.5); `release-etapa27c-v1` `ACTIVE` com `artifactHash`/
`configHash` iguais antes e depois; replay `EXACT_REPLAY`, 0 divergências.

**1177 testes** no monorepo (core 629, riot 97, api 336, desktop 100, raiz 15) + analyzer Python,
`typecheck`/`lint`/`build` completos. 3 testes novos em `draft-snapshot.test.ts`, 1 em
`use-async-data.test.tsx`, 4 em `ChampionSelectScreen.31g.test.tsx` (herdados do Codex, revisados e
confirmados sólidos — cobrem exatamente os requisitos funcionais pedidos, não superficiais).

Conta de teste local (`Zekerus#117`) teve `emailVerifiedAt` definido diretamente no Postgres para
sair de `EMAIL_UNVERIFIED` (Etapa 31D) — manutenção de fixture local em `NODE_ENV=development`, não
alteração de código nem bypass de produção.
