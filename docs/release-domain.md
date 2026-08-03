# Domínio de releases operacionais (Etapa 27a)

Módulo `packages/core/src/release/`. Puro: nenhum arquivo aqui importa `node:fs`, `node:http`,
Prisma ou qualquer coisa que toque banco, rede ou variável de ambiente. Transforma uma
`CalibrationCandidate` já aprovada no laboratório (Etapa 25) num artefato de release imutável,
validável e comparável ao motor operacional real — sem ativar nada.

A Etapa 27b (não implementada aqui) é quem: resolve qual configuração está ativa, valida ou
aplica fallback, injeta no motor, persiste, expõe rota/tela e executa ativação/rollback de
verdade.

## `EffectiveRecommendationConfiguration`

```ts
type WeightableMetricKey =
  | "PERSONAL_PERFORMANCE" | "RECENT_FORM" | "PERSONAL_MATCHUP" | "BLIND_SAFETY"
  | "ALLY_SYNERGY" | "ENEMY_COMPOSITION_ANSWER" | "TEAM_COMPOSITION" | "META_STRENGTH";

type SupportedPostAggregationRules = {
  primaryCount: number;
  alternativeCount: number;
  minimumScoreToRecommend: number;
  minimumDataCoverageToRecommend: number;
  executionRiskPenaltyStart: number;
  executionRiskMaxPenalty: number;
};

type EffectiveRecommendationConfiguration = {
  schemaVersion: string;
  version: string;
  configHash: string;
  metricWeights: Record<WeightableMetricKey, number>;
  disabledMetrics: WeightableMetricKey[];
  postAggregationRules: SupportedPostAggregationRules;
  source: { type: "BUILT_IN_BASELINE" } | { type: "RELEASE"; releaseId: string };
  algorithmCompatibility: Record<string, string>;
};
```

`WeightableMetricKey` é uma união literal própria, não derivada de `WEIGHTABLE_METRIC_KEYS`/
`WEIGHT_KEY_TO_METRIC` (`calibration/engine-candidate.ts`): aqueles exports são deliberadamente
tipados como `RecommendationMetricKey` (largo), para adicionar uma métrica nova não forçar
mudança de tipo em todo consumidor. Derivar o tipo estreito a partir deles resultaria no próprio
tipo largo — por isso os oito valores são repetidos aqui como literal, com o motivo documentado
no código.

`configHash` cobre todo o conteúdo funcional (pesos, métricas desligadas, regras
pós-agregação, fonte, compatibilidade); `version` (rótulo) fica de fora — renomear não muda o
hash. Hash é injetado (`computeHash`), mesmo padrão de toda etapa anterior que precisa de
`node:crypto`: `packages/core` também roda no renderer do Electron.

## Compatibilidade com o motor

`draft/recommendation-engine.ts` ganhou dois pontos de extensão, os dois **aditivos**:

```ts
function buildBaselineConfiguration(
  draft: DraftState,
  options: { computeHash: (canonical: string) => string; version?: string }
): EffectiveRecommendationConfiguration;

function recommendFromPersonalPool(input: {
  // ...os mesmos campos de sempre
  configuration?: EffectiveRecommendationConfiguration;
}): DraftRecommendationResponse;
```

Sem `configuration`, o comportamento é **idêntico ao de sempre**: `selectWeights(draft)` e os
thresholds hoje hardcoded (`primaryCount=5`, `alternativeCount=3`, sem piso de score/cobertura,
curva de risco 25/8). Com ela, os pesos vêm de `engineWeightsFromConfiguration` e os thresholds
da própria configuração.

`buildBaselineConfiguration` **depende do draft**, de propósito: qual das três tabelas de
`selectWeights` vale (blind pick, lane revelada, meio do draft) é decisão de contexto do draft,
não de configuração. Só uma release já calibrada declara um único conjunto de pesos válido pra
qualquer cenário — a mesma premissa que o laboratório de calibração já assume desde a Etapa 25 ao
reponderar um snapshot congelado com uma candidata.

### Bug real encontrado e corrigido: não associatividade de ponto flutuante

A primeira versão quebrava "passar a baseline explicitamente reproduz exatamente o resultado
atual" de forma silenciosa, só na última casa decimal
(`dataCoverage: 0.7999999999999999` em vez de `0.8`, `effectiveWeights` com `0.25000000000000006`
em vez de `0.25`). Causa: `normalizeAvailableWeights` soma pesos com
`Object.keys(weights).reduce(...)`, e a ordem de inserção de chaves das três tabelas de
`selectWeights` é diferente entre si e diferente da ordem canônica que a primeira versão de
`engineWeightsFromConfiguration` usava para reconstruir. Somar as mesmas parcelas em ordem
diferente muda o resultado em ponto flutuante (soma não é associativa em IEEE754).

Corrigido **sem tocar** `normalizeAvailableWeights` (função já testada, fora de escopo alterar
fórmula/arredondamento): `buildBaselineConfiguration` grava `metricWeights` na ordem de
`Object.keys(weights)` — a ordem literal da tabela do cenário — e `engineWeightsFromConfiguration`
reconstrói respeitando `Object.keys(configuration.metricWeights)` (com qualquer chave ausente
completada ao final, valendo zero). O round-trip fica bit a bit idêntico — comprovado por teste
com `toEqual` sobre a resposta inteira do motor, não só sobre `totalScore` arredondado.

A penalização de risco de execução é recomputada a partir do `EXECUTION_RISK` já calculado por
`assessExecutionRisk` (nunca sua derivação — isso continua fixo, fora do escopo configurável),
usando a mesma curva (`computeExecutionRiskPenalty`, reimplementada aqui de propósito em vez de
importada de `calibration/snapshot-replay.ts`: aquele módulo reconstrói risco a partir de métrica
**congelada** de snapshot histórico; este aplica a curva ao risco **recém-calculado** no motor ao
vivo — dois contextos que hoje coincidem na fórmula mas não descrevem uma relação real entre si).

## `RecommendationReleaseArtifact`

```ts
type ReleaseExperimentEvidence = {
  experimentId: string;
  experimentInputHash: string;
  laboratoryVersion: string;
  filters: CalibrationExperimentFilters;
  sampleSize: number;
  exactReplayCases: number;
  excludedCases: number;
  summary: CalibrationExperimentReport; // reaproveitado inteiro da Etapa 25b
  knownLimitations: string[];
};

type ReleaseCompatibilityManifest = {
  releaseArtifactSchemaVersion: string;
  requiredAlgorithmVersions: Record<string, string>;
  supportedAggregationVersions: readonly string[];
};

type RecommendationReleaseArtifact = {
  artifactSchemaVersion: string;
  releaseVersion: string;
  candidateId: string;
  candidateRevisionId: string;
  experimentId: string;
  baselineVersion: string;
  candidateVersion: string;
  configuration: EffectiveRecommendationConfiguration;
  configHash: string; // espelho de configuration.configHash
  artifactHash: string;
  experimentEvidence: ReleaseExperimentEvidence;
  compatibility: ReleaseCompatibilityManifest;
  createdAt: string; // fora do artifactHash
};
```

`artifactHash` cobre configuração (pelo próprio `configHash`, não recanonicalizado — uma única
fonte de canonicalização por dado), revisão exata da candidata, experimento (id, hash, filtros
canonicalizados, amostra, contagens), e compatibilidade. **Exclui** `createdAt` e qualquer campo
de apresentação (o contrato não tem nenhum). Alterar só `releaseVersion`/nome não muda o
`configHash` nem o resultado funcional, mas **muda** o `artifactHash` — `releaseVersion` é
identidade da release, não rótulo decorativo (diferente de `version` dentro da configuração).

## Validação pré-ativação

```ts
function validateReleaseArtifact(input: {
  artifact: RecommendationReleaseArtifact;
  candidate: CalibrationCandidate; // revisão exata referenciada pelo artefato
  experimentStatus: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  laboratoryCases: readonly LaboratoryEquivalenceCase[];
  computeHash: (canonical: string) => string;
}): ReleaseValidationResult;
```

Nove estados, checados em ordem (a checagem mais cara — rodar o motor pra cada caso — só depois
de todas as estruturais passarem):

| Estado | Quando |
| ------ | ------ |
| `INVALID_CANDIDATE_STATE` | Candidata não está em `APPROVED_FOR_FUTURE_RELEASE` |
| `EXPERIMENT_NOT_COMPLETED` | `experimentStatus !== "COMPLETED"` |
| `CONFIG_HASH_MISMATCH` | Hash recalculado da configuração não bate com o declarado |
| `UNSUPPORTED_PARAMETER` | `validateCalibrationCandidate` (Etapa 25a) ou a validação estrutural da configuração reprovam |
| `INCOMPATIBLE_ENGINE_VERSION` | Versão de agregação fora do que o domínio reconhece **ou** fora do manifesto congelado no artefato |
| `ARTIFACT_HASH_MISMATCH` | Hash recalculado do artefato não bate com o declarado |
| `NO_EXACT_REPLAY_CASES` | Nenhum caso do experimento tem bundle histórico comparável |
| `LABORATORY_RESULT_MISMATCH` | Motor real (via bundle) diverge do que o laboratório persistiu |
| `VALID` | Todas as checagens acima passaram |

`UNSUPPORTED_PARAMETER` e `INCOMPATIBLE_ENGINE_VERSION` são estados **distintos** mesmo quando a
causa parece parecida: uma candidata com versão de agregação que o domínio nem reconhece já é
barrada por `validateCalibrationCandidate` (`UNSUPPORTED_PARAMETER`); uma candidata válida cujo
artefato tem um manifesto de compatibilidade desatualizado (não declara a versão que o domínio
atual suporta) é `INCOMPATIBLE_ENGINE_VERSION` — o problema está no artefato congelado, não na
candidata.

Nenhuma divergência é ajustada para coincidir — o resultado reconstruído nunca é corrigido pra
bater com o esperado, em nenhum dos dois módulos (`validateReleaseArtifact` nem
`evaluateLaboratoryEquivalence`).

## Equivalência laboratório × motor

O laboratório de calibração (Etapa 25) reponderou a candidata a partir de **métricas já
congeladas** no snapshot — nunca reexecutou o motor com `championStats`/`ChampionTag`/capacidades
reais. `release/laboratory-equivalence.ts` fecha essa lacuna: roda o motor operacional puro
(`replayRecommendationEngineV1`, Etapa 26, que ganhou um parâmetro `configuration` opcional e
aditivo) alimentado pelo `ReplayInputBundle` real de cada caso, com a configuração da release, e
compara score, cobertura, rank e grupo com o que o laboratório persistiu pra aquela candidata.
Tolerância: `RELEASE_SCORE_TOLERANCE = 0.05` (pontos de score), `RELEASE_COVERAGE_TOLERANCE =
1e-6` (escala 0-1) — mesma ordem de grandeza das tolerâncias já usadas nas Etapas 25a/26a.

Candidatos `NOT_RECOMMENDED` do ranking do laboratório são ignorados na comparação: o motor
operacional (e o snapshot persistido) nunca devolvem esse grupo — comparar contra ele produziria
divergência de presença falsa. Caso sem bundle correspondente não conta como divergência: fica
de fora da amostra (`NOT_REPLAYABLE`), e um lote sem nenhum caso comparável vira
`NO_EXACT_REPLAY_CASES` no validador.

## Máquina de estados

```txt
DRAFT ─────────► VALIDATING ─────┬──► VALIDATION_FAILED ─────┬──► VALIDATING
                                  │                            └──► REJECTED
                                  └──► READY_FOR_ACTIVATION ──┬──► ACTIVE ──► ROLLED_BACK
                                                               └──► REJECTED
```

`READY_FOR_ACTIVATION` só é alcançável com `validation.status === "VALID"` explicitamente
informado na transição — o grafo permitir o passo não basta. `ACTIVE` só a partir de
`READY_FOR_ACTIVATION` (sem atalho de `DRAFT`/`VALIDATING`); `ROLLED_BACK` só a partir de
`ACTIVE` (não se desfaz release que nunca esteve no ar). `REJECTED` e `ROLLED_BACK` são
terminais. `transitionReleaseLifecycle` também recusa (`ARTIFACT_CHANGED`) quando o
`artifactHash` do artefato informado não bate com o hash que foi validado — imutabilidade
verificada na própria transição, não só por convenção.

Nenhuma transição persiste nem executa ativação real — são regras puras, testadas
isoladamente.

## O que fica fora desta subetapa

Migration, tabela de release, provider operacional, cache/fallback, rotas, tela, ativação real,
rollback real, invalidação de cache, alteração da configuração efetivamente usada pela API hoje,
e registro retroativo de release nos snapshots já persistidos. Tudo isso é Etapa 27b.

Também não foram tocadas as duas ocorrências pendentes do bug de `POST` sem corpo
(`generateDraftComparison`/`revealDraftReviewResult` em `services/api-client.ts`, sinalizadas na
Etapa 26b) — fora de escopo desta etapa.

## Testes

68 testes novos em `packages/core/src/release/*.test.ts` + `draft/recommendation-engine.test.ts`
(596 no pacote no total): canonicalização/hash da configuração e do artefato, mapeamento pra
chaves internas do motor, curva de penalização configurável, validação estrutural, baseline
explícita bit a bit idêntica ao resultado sem configuração (nos três cenários de draft),
configuração candidata muda o ranking, `disabledMetrics` zera mesmo com peso positivo declarado,
ausência de peso nunca produz `NaN`/pesos vazios, equivalência laboratório×motor (MATCH,
MISMATCH com divergência relatada e não corrigida, presença ausente, `NOT_RECOMMENDED` ignorado,
zero casos comparáveis, um caso ruim não escondido por outros bons), os nove estados de
validação, e as regras da máquina de estados (só válida chega a pronta, pronta não vira ativa
sozinha, rejeitada não ativa, rollback só de quem já esteve ativo, artefato mudado é recusado).
