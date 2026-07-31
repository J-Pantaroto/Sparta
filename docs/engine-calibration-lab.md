# Laboratório offline de calibração do motor

Versão do contrato: `calibration-lab/1.0.0`
(`packages/core/src/calibration/`)

O laboratório compara configurações candidatas do motor de recomendação contra a linha de base
histórica, usando **exclusivamente** o que os snapshots da Etapa 16 preservam. Ele não altera o
motor operacional, não recalcula snapshots, não publica pesos e não promove nada.

Esta página descreve a **Etapa 25a**: o domínio puro. Persistência, API, tela, execução
operacional e fluxo de aprovação são da Etapa 25b.

## Por que nem todo parâmetro pode ser calibrado aqui

`PersistedRecommendation` guarda as **métricas já calculadas** de cada candidato, os pesos
efetivos, a cobertura e o score. Não existe, em lugar nenhum, o estado de `PlayerChampionStats`,
`ChampionTag`, `ChampionCapabilityProfile` ou dos agregados de matchup **como estavam no instante
do draft** — essas tabelas são recalculadas a cada sync e sobrescritas.

Reexecutar uma derivação com os dados de hoje leria um histórico maior do que o jogador tinha
naquele draft. Isso é vazamento temporal, e produz uma comparação que parece válida e não é. Por
isso a capacidade de reprodução é uma **propriedade declarada de cada parâmetro**, verificada na
validação da configuração, e não uma observação feita durante a execução.

## Classificação de capacidade

| Capacidade                             | Significado                                                         |
| -------------------------------------- | ------------------------------------------------------------------- |
| `EXACT_REWEIGHT`                       | Altera apenas pesos sobre métricas já congeladas                    |
| `EXACT_POST_AGGREGATION`               | Altera regras aplicadas depois das métricas, sem mudar a derivação  |
| `REQUIRES_HISTORICAL_DERIVATION_INPUT` | Depende de input histórico que o snapshot não preserva              |
| `UNSUPPORTED`                          | Não é avaliável por esta versão do laboratório                      |

Thresholds e feature flags **não** são tratados como uma categoria só. Uma flag que apenas inclui
ou exclui uma métrica já congelada é reponderação; uma flag que muda como a métrica é produzida
não é reproduzível.

### Registro (`REPLAY_CAPABILITY_REGISTRY`)

**Exatamente reproduzíveis**

| Parâmetro                                   | Capacidade               |
| ------------------------------------------- | ------------------------ |
| `metricWeights.*` (os oito sinais do score) | `EXACT_REWEIGHT`         |
| `disabledMetrics.*` (os mesmos oito)        | `EXACT_REWEIGHT`         |
| `primaryCount`, `alternativeCount`          | `EXACT_POST_AGGREGATION` |
| `minimumScoreToRecommend`                   | `EXACT_POST_AGGREGATION` |
| `minimumDataCoverageToRecommend`            | `EXACT_POST_AGGREGATION` |
| `executionRiskPenaltyStart`                 | `EXACT_POST_AGGREGATION` |
| `executionRiskMaxPenalty`                   | `EXACT_POST_AGGREGATION` |

**Rejeitados por dependerem de input histórico ausente**

| Parâmetro                    | Dependência ausente                                        |
| ---------------------------- | ---------------------------------------------------------- |
| `minGamesForRanking`         | `PlayerChampionStats.games` no instante do draft            |
| `poolFormation`              | `PlayerChampionPoolEntry` vigente no instante do draft      |
| `snapshotCandidateCount`     | Pool e estatísticas do instante do draft                    |
| `metricAvailabilityOverride` | Fontes que determinaram a disponibilidade naquele instante  |
| `personalPerformanceFormula` | `PlayerChampionStats` no instante do draft                  |
| `recentFormDecayFactor`      | Histórico de partidas no instante do draft                  |
| `maxFamiliarityRiskRelief`   | `games` e `recentMatches` no instante do draft              |
| `executionRiskDerivation`    | Dificuldade oficial e estatísticas do instante do draft     |
| `matchupShrinkageK`          | `MatchParticipant` do confronto no instante do draft        |
| `championTagDerivation`      | `ChampionTag` vigente no instante do draft                  |
| `capabilityExtraction`       | `ChampionCapabilityProfile` vigente no instante do draft    |
| `strategyDimensionWeights`   | Capacidades e tags vigentes no instante do draft            |
| `provenancePolicy`           | Catálogos e fontes vigentes no instante do draft            |

**Não suportados**

| Parâmetro               | Motivo                                                   |
| ----------------------- | -------------------------------------------------------- |
| `globalMetaSource`      | Fonte global de meta permanece indisponível (ADR 0002)    |
| `useMatchResultAsLabel` | Vitória e derrota não são rótulo de recomendação correta  |

A distinção mais fina do registro está no risco de execução: a **curva de penalização** é aplicada
a um valor de risco que já está congelado no snapshot, então é pós-agregação; já
`maxFamiliarityRiskRelief` e `executionRiskDerivation` mudam como esse risco é produzido, e por
isso exigem o histórico ausente.

A rejeição acontece na **validação da configuração**, antes de qualquer execução: rodar um
experimento inteiro para depois marcar todos os casos como impossíveis gastaria trabalho e
produziria um relatório que parece um resultado.

## Configuração candidata

```ts
type CalibrationCandidate = {
  id: string;
  name: string;
  description?: string;
  baselineAggregationVersion: string;
  candidateVersion: string;
  metricWeights: Partial<Record<RecommendationMetricKey, number>>;
  disabledMetrics?: RecommendationMetricKey[];
  postAggregationThresholds?: Record<string, number>;
  status: "DRAFT" | "READY" | "EVALUATED" | "REJECTED" | "APPROVED_FOR_FUTURE_RELEASE";
};
```

`validateCalibrationCandidate` rejeita, com código estruturado:

| Código                            | Situação                                                     |
| --------------------------------- | ------------------------------------------------------------ |
| `UNKNOWN_METRIC`                  | Métrica que não participa do score congelado                  |
| `NEGATIVE_WEIGHT`                 | Peso negativo                                                 |
| `NON_FINITE_VALUE`                | Peso ou threshold não finito                                  |
| `NO_AVAILABLE_COMPONENT`          | Nenhuma métrica habilitada com peso positivo                  |
| `UNSUPPORTED_THRESHOLD`           | Threshold fora do registro                                    |
| `THRESHOLD_OUT_OF_RANGE`          | Threshold reproduzível, mas fora da faixa declarada           |
| `DERIVATION_PARAMETER`            | Parâmetro que altera a derivação, com dependência nomeada     |
| `UNSUPPORTED_PARAMETER`           | Parâmetro sem caminho de avaliação                            |
| `UNCLASSIFIED_PARAMETER`          | Parâmetro sem classificação de replay                         |
| `UNSUPPORTED_AGGREGATION_VERSION` | Versão da agregação que o laboratório não reconstrói          |

**Configuração inválida não é normalizada em silêncio**: peso negativo ou threshold fora de faixa
vira rejeição, nunca um valor corrigido por conta própria.

## Fórmula reconstruída

Medida no motor (`recommendFromPersonalPool`):

```txt
baseScore  = round( Σ_k valorCongelado[k] * pesoEfetivo[k] )       round = 1 casa decimal
penalty    = 0                                     se risco <= executionRiskPenaltyStart
           = round( clamp((risco - start) / (100 - start), 0, 1) * maxPenalty )   caso contrário
totalScore = round( clamp( baseScore - penalty, 0, 100 ) )
```

Mapeamento 1:1 entre chave de peso do motor e métrica congelada:

| Chave do motor        | Métrica congelada          |
| --------------------- | -------------------------- |
| `personalPerformance` | `PERSONAL_PERFORMANCE`     |
| `recentForm`          | `RECENT_FORM`              |
| `matchup`             | `PERSONAL_MATCHUP`         |
| `blindSafety`         | `BLIND_SAFETY`             |
| `allySynergy`         | `ALLY_SYNERGY`             |
| `enemyDraftAnswer`    | `ENEMY_COMPOSITION_ANSWER` |
| `compositionFit`      | `TEAM_COMPOSITION`         |
| `meta`                | `META_STRENGTH`            |

## Verificação de integridade

Antes de aplicar qualquer configuração candidata, o baseline é reconstruído a partir do congelado
— métricas, disponibilidade, pesos efetivos, normalização histórica, penalização e o ranking e
grupo registrados — e comparado com o `totalScore` persistido.

A verificação é real, não circular: a penalização é recalculada **de forma independente** a partir
da métrica `EXECUTION_RISK` congelada, e não obtida como resíduo. O resultado reconstruído
**nunca** é ajustado para coincidir com o persistido.

**Tolerâncias documentadas**: `REPLAY_SCORE_TOLERANCE = 0.05` ponto de score (o motor arredonda em
uma casa decimal, então a reprodução exata cabe folgadamente dentro disso; a tolerância existe para
absorver ponto flutuante, não divergência de conteúdo) e `REPLAY_WEIGHT_SUM_TOLERANCE = 1e-6` para
a soma dos pesos normalizados.

### Status de replay

| Status                           | Quando                                                        |
| -------------------------------- | ------------------------------------------------------------- |
| `EXACT_REPLAY`                   | Baseline reproduzido dentro da tolerância                     |
| `REPLAY_INTEGRITY_FAILED`        | Score ou normalização divergentes do persistido               |
| `REPLAY_UNSUPPORTED_VERSION`     | Versão da agregação histórica não suportada                   |
| `REPLAY_MISSING_HISTORICAL_INPUT`| Falta componente congelado necessário para reproduzir         |

`EXACT_REPLAY` só é atribuído quando todos os componentes necessários estão congelados, a versão da
agregação é suportada, o baseline é reproduzido e nenhum dado posterior ao draft foi consultado —
a última condição é garantida pela forma das funções, que não recebem resultado, KDA, timeline,
build, observação posterior nem revisão pós-resultado, e não consultam repositório nenhum.

### Motivos de exclusão

| Código                            | Situação                                                              |
| --------------------------------- | --------------------------------------------------------------------- |
| `NO_FROZEN_METRICS`               | O snapshot não preserva nenhuma métrica com valor                     |
| `NO_EFFECTIVE_WEIGHTS`            | O snapshot não preserva os pesos efetivos                             |
| `MISSING_WEIGHTED_METRIC`         | Um sinal tem peso mas nenhum valor congelado                          |
| `MISSING_EXECUTION_RISK`          | Há diferença de score e o risco congelado que a explicaria não existe |
| `PENALTY_NOT_REPRODUCIBLE`        | A configuração muda a curva e o risco não está congelado              |
| `NORMALIZATION_MISMATCH`          | Os pesos efetivos não somam 1                                         |
| `SCORE_MISMATCH`                  | O score persistido não é reproduzível dentro da tolerância            |
| `UNSUPPORTED_AGGREGATION_VERSION` | O laboratório não sabe reconstruir aquela versão                      |

Um único candidato reprovado exclui o **caso inteiro**: comparar um ranking em que parte das
posições não é reproduzível produziria deslocamentos que não são da configuração candidata.

Quando o risco de execução não está congelado, o baseline só é aceito se o próprio score provar
que a penalização foi zero (`penaltyReconstruction: "ABSENT_AND_PROVEN_ZERO"`). Esses candidatos
ficam inelegíveis para configurações que mexem na curva de risco.

## Reponderação

A disponibilidade continua sendo a **histórica**. Desligar um sinal remove-o do score; nenhum peso
consegue trazer de volta um sinal que o snapshot não tem. Métrica ausente **não recebe peso efetivo
nem valor substituto** — não existe 0 nem 50 de preenchimento. O peso restante é normalizado
proporcionalmente e a escala final é preservada.

**Cobertura histórica e cobertura candidata são campos separados.** `baselineDataCoverage` vem do
snapshot e não é recalculada; `candidateDataCoverage` é a soma dos pesos candidatos que tinham dado
congelado. Fundi-las esconderia que a candidata usa menos sinais.

Cada candidato preserva `baselineRank`, `baselineGroup`, `baselineScore`, `reconstructedScore`,
`candidateScore`, as duas coberturas, os pesos e valores efetivamente usados, e
`differenceReasons` (`WEIGHT_CHANGED`, `METRIC_DISABLED`, `METRIC_UNAVAILABLE_HISTORICALLY`,
`PENALTY_CURVE_CHANGED`).

## Comparação e estabilidade

Por caso (`CalibrationCaseComparison`): `topOnePreserved`, `topFiveOverlap`,
`averageRankDisplacement`, `medianRankDisplacement`, `maxRankDisplacement`,
`recommendedSetStability` (Jaccard entre os conjuntos principais), `promotedChampionIds`,
`demotedChampionIds`, `enteredPrimaryChampionIds`, `leftPrimaryChampionIds`,
`primaryToAlternativeChampionIds`, `alternativeToPrimaryChampionIds`,
`comfortStrategicInversions` e, quando o snapshot registrou a escolha, `chosenChampion`.

Casos não reproduzidos saem com `candidate: null` e todas as métricas em `null` — nunca com zero,
que se confundiria com "não mudou".

Inversão conforto × estratégico usa a categoria que o próprio motor já atribuiu:
`comfort_pick`/`safe_pick` de um lado, `best_blind`/`best_matchup`/`best_teamfit`/
`strategic_option` do outro. `best_matchup` fica do lado estratégico porque só existe quando o
adversário de rota foi revelado.

**Estabilidade não é qualidade e mudança não é melhoria.** O laboratório mede quanto a ordenação se
move, para onde e em que segmentos; a leitura sobre se isso é desejável é humana e acontece fora do
módulo.

## Revisões humanas

Somente avaliação **pré-resultado** da Etapa 24. `PreMatchReviewReference` não tem campo de
desfecho, e o domínio não acessa revisão pós-resultado.

`HumanReviewSummary` produz contagens — `strongCasesPreserved`, `strongCasesAltered`,
`weakCasesPreserved`, `weakCasesAltered`, `issueTagsAffected`, `casesWithoutReview` — e **nunca**
converte a escala qualitativa em score numérico.

## Segmentação

`role`, `patch`, `queue`, `period` (mês do snapshot), `poolSize` (faixa), `baselineDataCoverage`
(faixa `0.9-1.0` / `0.7-0.9` / `0.5-0.7` / `<0.5`), `chosenChampionGroup`, `engineVersion`,
`preMatchRating` e `issueTag`.

Ausência de um fato não vira valor inventado: o caso simplesmente não entra naquela dimensão.
Casos excluídos nunca entram nas médias, e os motivos de exclusão saem agregados por código com a
dependência histórica nomeada.

## Determinismo e hash

`canonicalCandidateString` e `canonicalExperimentInputString` produzem serializações estáveis.
Ficam de fora: ordem acidental de arrays e filtros, `id`, `name`, `description`, `status` e
qualquer instante de geração. O mesmo input funcional produz a mesma string e o mesmo relatório.

O hash em si fica na Etapa 25b, que roda na API e tem `node:crypto` — `packages/core` também roda
no renderer.

## Promoção

```txt
DRAFT → READY → EVALUATED → REJECTED | APPROVED_FOR_FUTURE_RELEASE
```

`APPROVED_FOR_FUTURE_RELEASE` é o **maior** valor que o tipo expressa. Não existe estado que
signifique "em produção", de propósito. O status vem da própria configuração e nunca é derivado dos
números — não há caminho, neste domínio, que promova uma configuração a partir de um resultado.

## Etapa futura registrada

Criar um `ReplayInputBundle` imutável gravado junto de **novos** snapshots, preservando os inputs
de derivação: estatísticas pessoais utilizadas, `ChampionTag`, capacidades, catálogos, contexto de
matchup, inputs do risco e a versão de cada derivação.

A captura é **prospectiva**: não torna snapshots antigos reproduzíveis e não reconstrói dado
histórico a partir do estado atual. Não faz parte da 25a nem da 25b.
