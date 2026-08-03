# Persistência e operação segura de releases (Etapa 27b)

A Etapa 27a entregou o domínio puro: configuração efetiva, baseline explícita, artefato imutável,
validação laboratório × motor, hashes, compatibilidade e máquina de estados. Esta etapa constrói a
camada operacional em volta dele — **sem contaminar `packages/core`**, que continua sem nenhum
acesso a banco, cache, ambiente ou provider.

## Decisão arquitetural

A API resolve a configuração efetiva, valida a integridade, aplica cache ou fallback, e a **injeta
explicitamente** em `recommendFromPersonalPool`. O core só recebe uma configuração já resolvida.

A configuração é resolvida **uma vez por avaliação** e compartilhada por motor, snapshot,
`ReplayInputBundle` e observabilidade — ela nasce dentro de `buildEvaluationContext`
(`apps/api/src/modules/drafts/evaluation-context.ts`), junto de todas as outras fontes mutáveis,
e o objeto congelado é reaproveitado por todos eles. Nenhuma consulta acontece dentro de uma
função de score.

## Persistência

Migration `20260803150000_recommendation_engine_releases`. Três tabelas novas mais cinco colunas
nullable em `RecommendationSnapshot`.

### `RecommendationEngineRelease`

Congela o `RecommendationReleaseArtifact` completo (`artifactJson`) e acrescenta o que é
exclusivamente operacional: ciclo de vida, ativação, rollback, autoria e o resultado da validação.

| Campo                   | Papel                                                                      |
| ----------------------- | -------------------------------------------------------------------------- |
| `candidateId`           | `lineageId` da candidata — identidade estável entre revisões. **Sem FK**   |
| `candidateRevisionId`   | `CalibrationCandidateConfig.id` — a revisão **exata**. É o alvo do FK      |
| `artifactJson`          | Artefato inteiro, imutável desde `READY_FOR_ACTIVATION`                    |
| `artifactHash`          | Único por conta (`@@unique([riotAccountId, artifactHash])`)                |
| `status`                | Os 7 estados de `ReleaseLifecycleStatus` (Etapa 27a), sem estado novo      |
| `validationJson`        | Último `ReleaseValidationResult`; o histórico vive nos eventos             |
| `validatedArtifactHash` | Hash no instante da validação — detecta artefato alterado depois           |
| `previousReleaseId`     | Release ativa no instante da ativação: alvo exato do rollback              |

**`status = "ACTIVE"` não significa "é a ativa agora".** O grafo da 27a só permite `ACTIVE →
ROLLED_BACK` como saída, então uma release superada por outra mais nova continua com esse status
até ser explicitamente revertida. Quem é a ativa **agora** é o ponteiro — e `ReleaseRow` expõe os
dois fatos separados (`status` e `currentlyActive`).

### `RecommendationEngineActivePointer`

Uma linha por conta (`riotAccountId` é a PK), apontando a release ativa. **Ausência de linha =
nenhuma release ativa**, e a baseline explícita resolve nesse caso. Isso é o que garante
"somente uma release ativa por conta" estruturalmente, não por convenção.

### `RecommendationEngineReleaseEvent`

Append-only, nunca reescrito nem apagado: `CREATED`, `VALIDATION_STARTED`, `VALIDATION_COMPLETED`,
`VALIDATION_FAILED`, `ACTIVATED`, `ROLLED_BACK`. Guarda `fromStatus`/`toStatus`, autor, motivo
sanitizado e metadados (`previousReleaseId`, `restoredReleaseId`).

### Eco da configuração no snapshot

`RecommendationSnapshot` ganhou `configurationSource`, `configurationReleaseId`,
`configurationVersion`, `configHash` e `effectiveConfigurationJson` — **todas nullable**. Snapshot
anterior a esta etapa fica nulo e **nunca** é preenchido retroativamente. `effectiveConfigurationJson`
guarda a configuração inteira: os parâmetros efetivos sobrevivem mesmo se a release referenciada
mudar de estado depois.

O `configHash` também entra em `algorithmVersions` (como `recommendationConfiguration`), que já é
`Record<string,string>` livre. Consequência deliberada: **trocar de release força um snapshot
novo** mesmo com o draft idêntico, porque o hash do input canônico muda — a análise passou a ser
outra, e registrá-la como "o mesmo snapshot" seria falso.

## Baseline operacional

Ausência de release ativa resolve para `buildBaselineConfiguration` (Etapa 27a), que **depende do
cenário do draft**: blind pick, lane inimiga revelada e meio do draft usam tabelas de peso
diferentes. Por isso o provider **não** devolve uma configuração para a baseline — ele devolve só
`source: "BUILT_IN_BASELINE"`, e quem tem o `DraftState` (`buildEvaluationContext`) monta a
baseline explícita.

Resolver a baseline dentro do provider exigiria passar o draft inteiro para um componente cujo
único trabalho é ler a release ativa; e transformá-la numa release comum exigiria uma linha por
cenário, com hash próprio, sem ganho nenhum. Ela tem versão (`RECOMMENDATION_ENGINE_VERSION`) e
`configHash`, é observável como `BUILT_IN_BASELINE`, e passa pela mesma validação estrutural — só
não é persistida como release.

`GET /recommendation-engine/active-release` sem release ativa devolve as **três tabelas reais**,
uma por cenário, em vez de fabricar "a" baseline única que não existe.

## Provider

`apps/api/src/modules/release/active-configuration-provider.ts`:

```ts
resolve(accountId) → ResolvedRecommendationConfiguration
invalidate(accountId) → void
```

O resultado carrega origem, configuração (só quando `RELEASE`), release ativa, estado do cache
(`HIT`/`MISS`), se houve fallback e o motivo sanitizado.

- **Cache por conta**, TTL de 30 s. Contas diferentes têm entradas independentes.
- **Invalidação explícita** depois de ativação e rollback — cache antigo nunca sobrevive às duas.
- **Validação de hash antes do uso**: `canonicalConfigurationContent` é recanonicalizado e
  comparado com `configuration.configHash` **e** com `release.configHash`. Divergência cai para a
  baseline com `fallbackReason: "CONFIG_HASH_MISMATCH"` e loga — configuração inválida **nunca**
  chega ao motor, e a release em si não é alterada por isso.
- **Falha de banco** usa a última configuração válida conhecida daquela conta
  (`DB_READ_FAILED_USING_LAST_KNOWN`); sem ela, baseline (`DB_READ_FAILED_NO_LAST_KNOWN`). Nunca
  lança, nunca devolve pesos vazios.

`lastKnownGood` **não** é limpo por `invalidate`: ele é rede de segurança contra banco fora do ar,
não espelho do estado atual.

## Validação de release

`validateRelease` transiciona para `VALIDATING`, carrega a revisão exata da candidata, o
experimento e os casos com bundle, e chama `validateReleaseArtifact` (Etapa 27a) — que recalcula
os dois hashes, confere estado da candidata e do experimento, rejeita parâmetro não suportado,
checa compatibilidade e roda a equivalência laboratório × motor com bundles históricos reais.

Os casos carregados são só os `EXACT_REPLAY` com `ReplayInputBundleRecord` presente e `candidate`
preenchido — sem bundle não há como reexecutar o motor com dado histórico, e o caso fica fora da
amostra em vez de contar como divergência.

Falha produz `VALIDATION_FAILED` com o relatório inteiro persistido, nunca prontidão parcial.

## Ativação

- Aceita **apenas** `releaseId` (na URL) e um motivo opcional. Peso enviado no corpo é ignorado
  por construção — o schema zod da rota só tem `reason`.
- Exige `READY_FOR_ACTIVATION` e revalida que `validatedArtifactHash === artifactHash` (artefato
  não pode ter mudado desde a validação).
- Roda numa transação **serializável**. A reivindicação é um `updateMany` condicional no status —
  mesmo padrão atômico que a Etapa 25b já usa para `PENDING → RUNNING`. Duas ativações
  concorrentes produzem uma vencedora e um `409 CONCURRENT_CONFLICT`.
- Grava `previousReleaseId` (a release apontada no instante da ativação), atualiza o ponteiro,
  registra o evento e invalida o cache **depois do commit**.

## Rollback

- Só aceita a release que **é** a apontada agora — não qualquer uma com `status = "ACTIVE"`
  histórico (`409 NOT_CURRENTLY_ACTIVE`).
- Restaura o ponteiro para `previousReleaseId` **sem reconstruir parâmetro nenhum**: o artefato
  anterior já está integralmente persistido e imutável. Sem release anterior, apaga o ponteiro e
  volta à baseline.
- Transacional, invalida cache, registra evento, e marca a release revertida sem apagar histórico.

## Rotas

Todas autenticadas e isoladas por conta.

```txt
POST /calibration/candidates/:candidateId/releases
GET  /calibration/releases
GET  /calibration/releases/:releaseId
POST /calibration/releases/:releaseId/validate
POST /calibration/releases/:releaseId/activate
POST /calibration/releases/:releaseId/rollback
GET  /recommendation-engine/active-release
```

Nenhuma ativação por hash arbitrário: só `releaseId` de uma release da própria conta.

## Interface

O **Laboratório do motor** ganhou dois blocos, sem redesenhar a tela:

1. **Configuração operacional atual** (topo) — a release ativa com os pesos reais, ou "Fallback
   para baseline em uso" com as três tabelas por cenário. Só leitura.
2. **Releases** — preparar, validar, ativar e reverter, com o estado de cada uma. "Release pronta
   para ativação", "Release ativa" e "Release revertida" aparecem literalmente. Ativação e
   rollback exigem **confirmação em dois passos**.

O bloco "Preparar release" só aparece para candidata `APPROVED_FOR_FUTURE_RELEASE`, e o texto da
decisão continua dizendo que aprovação não é ativação. **Não existe campo de peso em nenhuma tela
de release.**

## Observabilidade

Sanitizada, sem dado pessoal: `recommendation_configuration_resolved` (origem, release, cache
hit/miss, fallback e motivo, `configHash`, duração), `active_configuration_hash_mismatch`,
`active_configuration_resolve_failed`, `release_created`, `release_validated`, `release_activated`,
`release_rolled_back` (os dois últimos com `cacheInvalidated`).

## Bug real encontrado na validação contra o Postgres real

`decideCandidate` (Etapa 25b) grava a decisão na **coluna** `status` de
`CalibrationCandidateConfig`, mas o `configJson` congelado guarda o `status` do instante da
**criação** — que a 25b só permite ser `DRAFT` ou `READY`. A primeira versão de `validateRelease`
lia o status de dentro do JSON e reprovava **toda** candidata aprovada com
`INVALID_CANDIDATE_STATE` ("precisa estar em APPROVED_FOR_FUTURE_RELEASE; está em READY").

Nenhum teste sintético pegaria isso: o fixture do teste monta o `CalibrationCandidate` com o
status já correto. Só apareceu ao validar contra a candidata real. Corrigido sobrepondo a coluna
(autoritativa) sobre o JSON antes de chamar `validateReleaseArtifact`.

## Validação real executada

Docker reconstruído, Postgres real, conta Zekerus#117.

| O quê                                    | Resultado                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Migration                                | Aplicada; 3 tabelas criadas; **15 snapshots antigos com 0 dado retroativo**                        |
| Baseline continua em uso                 | `GET /recommendation-engine/active-release` → `BUILT_IN_BASELINE` com as 3 tabelas reais           |
| Resultado anterior preservado            | 3 snapshots pré-27b replayados pelo motor novo → **`EXACT_REPLAY`, zero divergências** nos três    |
| Snapshot e bundle novos                  | `BUILT_IN_BASELINE`, versão `1.0.0`, `configHash b5df76e4…`; bundle com o mesmo hash               |
| Release da candidata real                | Criada, artefato congelado com a revisão exata                                                     |
| Validação até `READY_FOR_ACTIVATION`     | `VALID`; equivalência laboratório×motor **`MATCH` em 2 casos reais, 0 divergências**               |
| Zero casos exatos impede prontidão       | Primeiro experimento (sem bundle) → `NO_EXACT_REPLAY_CASES`, corretamente bloqueado                |
| Transições inválidas                     | Rollback de release nunca ativa → 409; ativar `VALIDATION_FAILED` → 409; inexistente → 404; sem auth → 401 |
| Ativação e rollback (**conta isolada**)  | baseline → v1 → v2 → rollback restaura v1 → rollback volta à baseline; trilha de eventos completa  |
| Ativações concorrentes                   | 4 simultâneas → **1× HTTP 200, 3× 409**, 1 ponteiro, 1 release `ACTIVE`, 1 evento                  |
| Unicidade do ponteiro                    | Sempre ≤ 1 linha; ausência = baseline                                                              |
| Isolamento por conta                     | 404 nos dois sentidos (ler e ativar release de outra conta)                                        |
| Hash adulterado                          | `active_configuration_hash_mismatch` → fallback `CONFIG_HASH_MISMATCH`; **nunca chega ao motor**   |
| Cache                                    | `MISS` e depois `HIT`; invalidação após ativação/rollback refletida imediatamente (TTL 30 s)       |
| Electron (dev)                           | 0 erros de console, 0 `NaN`/`Infinity`/`undefined`, 0 imagens quebradas, **0 campos de peso**      |
| Confirmação em dois passos               | Clicar "Ativar" mostra "Confirmar ativação"/"Cancelar" e **não ativa** (confirmado no banco)       |

A conta isolada de teste foi removida por completo ao final (0 linhas remanescentes).

**A candidata real permanece `APPROVED_FOR_FUTURE_RELEASE` e a release dela em
`READY_FOR_ACTIVATION`, nunca ativada** — a configuração operacional da conta real continua sendo
a baseline.

## Fora de escopo

Calibração de thresholds de derivação, meta global, aprendizado automático, e as duas ocorrências
pendentes do `POST` sem corpo em `generateDraftComparison`/`revealDraftReviewResult` (sinalizadas
desde a Etapa 26b) continuam intocadas.
