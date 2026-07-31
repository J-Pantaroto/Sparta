---
status: IMPLEMENTADA
implementado_em: 2026-07-31 15:10
solicitado_em: 2026-07-31 12:30
---

# ReplayInputBundle prospectivo e imutável (Etapa 26)

## Pedido original (resumo fiel)

> Criar um `ReplayInputBundle` prospectivo, capturado junto de cada novo snapshot, contendo os
> inputs normalizados realmente utilizados pelo motor naquele instante, para permitir futuramente
> reproduzir a derivação das métricas, testar thresholds e flags de derivação, verificar
> integridade do ranking e executar experimentos sem consultar dados atuais.
>
> Snapshots antigos continuam sem replay completo — **sem backfill**, sem usar o estado atual para
> aproximar o passado. Cálculo e captura devem sair da **mesma instância de contexto**. Bundle e
> snapshot são atômicos; o Champion Select não. Não habilitar ainda calibração de thresholds ou
> flags de derivação.

## Auditoria do grafo de dependências (feita antes de definir o contrato)

### Leituras reais no caminho ao vivo

`POST /drafts/recommendations` (`apps/api/src/modules/drafts/routes.ts:55`) resolve, nesta ordem:

| # | Origem | Mutável? |
| - | ------ | -------- |
| 1 | `prisma.riotAccount.findFirst({ userId })` | estável |
| 2 | `findChampionStatsByPuuid(puuid)` → `PlayerChampionStats[]` | **sim** — recalculado a cada sync |
| 3 | `findAllChampionTags()` → `ChampionTag[]` (inclui `officialDifficulty` e proveniência) | **sim** — reescrito pelo seed |
| 4 | `findAllChampionCapabilityProfiles()` | **sim** — regenerado do manifesto |
| 5 | `findPersonalLaneMatchupHistory(puuid, role)` → `aggregateMatchupData` | **sim** — cresce a cada sync |
| 6 | `findPlayerPool(accountId, puuid, role)` | **sim** |
| 7 | `compositionRules` (`config/composition-rules.ts`) | não — código versionado |
| 8 | `patchMeta: null` | constante (Etapa 18) |
| 9 | `evaluatedAt: new Date().toISOString()` | **não determinístico** |

### Grafo por métrica

| Métrica | Inputs consultados | Intermediário | Versão |
| ------- | ------------------ | ------------- | ------ |
| `PERSONAL_PERFORMANCE` | `PlayerChampionStats` (championId+role) | `scoreChampionPerformance` → score, `eligible`, `confidence`, `components` | `recommendationEngine` |
| `RECENT_FORM` | idem | `personal.components.recent` | `recommendationEngine` |
| `PERSONAL_MATCHUP` | histórico de laners opostos + `draft.enemyLaneChampionId` | `aggregateMatchupData` (shrinkage `K`) | `recommendationEngine` |
| `BLIND_SAFETY` | `ChampionTag.blindSafety` do candidato | — | `championTagDerivation` |
| `ALLY_SYNERGY` | `ChampionTag` do candidato **e dos aliados**, `draft.allies` | `analyzeTeamComposition` → `calculateAllySynergy` | `championTagDerivation` + engine |
| `ENEMY_COMPOSITION_ANSWER` | `ChampionCapabilityProfile` e `ChampionTag` **de candidato, aliados e inimigos** | `analyzeDraftStrategy` → `enemyResponseScore` | `draftStrategy` + `threatResponseModel` |
| `TEAM_COMPOSITION` | idem | `analyzeDraftStrategy` → `teamCompositionScore` | `draftStrategy` |
| `META_STRENGTH` | — | sempre `null` | — |
| `PERSONAL_EXPERIENCE`, `CHAMPION_DIFFICULTY`, `EXECUTION_RISK` | `ChampionTag.officialDifficulty`, `PlayerChampionStats` (`games`, `recentMatches`), `evaluatedAt` | `assessExecutionRisk` | `executionRisk` |

### Quatro achados que mudam o desenho

**1. O contrato esboçado no pedido é insuficiente.** `ReplayCandidateInput` carrega `championTag` e
`capabilityProfile` **do candidato**. Mas `analyzeTeamComposition` e `analyzeDraftStrategy` leem
tags e capacidades **de todos os campeões do draft** — aliados e inimigos incluídos. Sem esses,
`ALLY_SYNERGY`, `TEAM_COMPOSITION` e `ENEMY_COMPOSITION_ANSWER` não são reproduzíveis. O bundle
precisa de um `draftContext` com o perfil normalizado de cada campeão referenciado, não só dos
candidatos.

**2. `evaluatedAt` é derivação, não metadado.** `assessExecutionRisk` usa `evaluatedAt` para medir
recência de `stats.recentMatches`. Ele é não determinístico e **precisa entrar no bundle e no
`contentHash`** — senão o replay muda de resultado a cada dia. Isso o separa de `capturedAt`, que
o pedido manda **excluir** do hash. São dois campos com tratamento oposto; fundi-los quebraria uma
das duas garantias.

**3. Nenhum catálogo é endereçável por conteúdo hoje.** `ChampionTag` e
`ChampionCapabilityProfile` são linhas mutáveis do Postgres, semeadas de arquivos que são
regenerados. Não são imutáveis nem validáveis por hash. Pela regra do próprio pedido, isso obriga a
**embutir os campos normalizados** no bundle — referência não basta. `compositionRules` é a única
dependência que pode ser referenciada por versão, por ser código versionado.

**4. O contexto único ainda não existe.** A rota hoje resolve os inputs uma vez e os passa ao
motor, mas `persistDraftAnalysis` recebe um subconjunto **re-derivado** (`championTags`,
`capabilityProfiles`, `pool`) e recalcula `catalogVersionsOf`. `championStats`, `matchups` e
`evaluatedAt` **não chegam** à persistência. Capturar o bundle exige um objeto de contexto
imutável construído uma vez e compartilhado por motor, snapshot e bundle — é uma alteração real na
orquestração da rota ao vivo, que é justamente o caminho que não pode regredir.

## Divisão aprovada e 26a entregue

O usuário aprovou a divisão 26a/26b e confirmou os cinco pontos arquiteturais da auditoria.

### 26a — domínio puro (`packages/core/src/calibration/`)

- `replay-input-bundle.ts`: contrato `replay-input-bundle/1.0.0`, `canonicalBundleContent`,
  `stableStringify`, `validateReplayInputBundle` (dez códigos) e `buildDependencyManifest` com o
  grafo real das onze métricas.
- `replay-verifier.ts`: `replayEngines` (registro explícito), `replayRecommendationEngineV1`,
  `verifyReplayBundle` e `describeSnapshotReplayCapability`.

### Resultado

38 testes determinísticos, suite completa **905 testes**, `typecheck`/`lint`/`test`/`build`
completos. Nenhuma migration, rota, API, tela ou alteração do motor.

### Observação de flakiness

Numa das execuções da suíte completa, `apps/api > postgame routes > POST /postgame/analyze >
retorna 401 sem autenticacao` falhou uma vez. Não reproduziu em três execuções seguintes (duas do
monorepo inteiro, uma isolada do módulo). A 26a não toca postgame; fica registrado como
intermitente a investigar se voltar.

### Riscos restantes para a 26b

1. **Contexto único na rota ao vivo** é o ponto de maior risco: hoje `persistDraftAnalysis` recebe
   um subconjunto re-derivado, e `championStats`, `matchups` e `evaluatedAt` nem chegam lá.
2. **Atomicidade com o dedup existente**: `persistRecommendationSnapshot` devolve `UNCHANGED` sem
   escrever. Bundle novo só quando o snapshot é criado — `UNCHANGED` mantém o bundle existente.
3. **Tamanho**: o bundle embute stats, tags e capacidades de todo campeão referenciado. Precisa de
   medição real e falha explícita em limite técnico, nunca corte silencioso de candidatos.
4. **Falha isolada**: captura do bundle não pode derrubar a recomendação ao vivo, mas também não
   pode deixar snapshot novo sem bundle — as duas regras juntas exigem que a falha aborte a
   transação de persistência inteira e devolva `FAILED`, com a análise intacta.
