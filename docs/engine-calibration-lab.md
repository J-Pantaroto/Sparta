# Laboratório offline de calibração do motor

Versão do contrato: `calibration-lab/1.0.0`
(`packages/core/src/calibration/`)

O laboratório compara configurações candidatas do motor de recomendação contra a linha de base
histórica, usando **exclusivamente** o que os snapshots da Etapa 16 preservam. Ele não altera o
motor operacional, não recalcula snapshots, não publica pesos e não promove nada.

Esta página descreve a **Etapa 25a**: o domínio puro. Persistência, API, tela, validação real e
fluxo de aprovação são da Etapa 25b.

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

### Registro atual (`REPLAY_CAPABILITY_REGISTRY`)

**Exatamente reproduzíveis**

| Parâmetro                                  | Capacidade                 |
| ------------------------------------------ | -------------------------- |
| `weights.*` (os oito sinais)                | `EXACT_REWEIGHT`           |
| `metricEnabled.*` (os oito sinais)          | `EXACT_REWEIGHT`           |
| `primaryCount`, `alternativeCount`          | `EXACT_POST_AGGREGATION`   |
| `minimumScoreToRecommend`                   | `EXACT_POST_AGGREGATION`   |
| `minimumDataCoverageToRecommend`            | `EXACT_POST_AGGREGATION`   |
| `executionRiskPenaltyStart`                 | `EXACT_POST_AGGREGATION`   |
| `executionRiskMaxPenalty`                   | `EXACT_POST_AGGREGATION`   |

**Rejeitados por dependerem de input histórico ausente**

| Parâmetro                     | Dependência ausente                                     |
| ----------------------------- | ------------------------------------------------------- |
| `minGamesForRanking`          | `PlayerChampionStats.games` no instante do draft         |
| `maxFamiliarityRiskRelief`    | `PlayerChampionStats.games` e `.recentMatches` do draft  |
| `recentFormDecayFactor`       | Histórico de partidas no instante do draft               |
| `matchupShrinkageK`           | `MatchParticipant` do confronto no instante do draft     |
| `championTagDimensionWeights` | `ChampionTag` vigente no instante do draft               |
| `strategyDimensionWeights`    | `ChampionCapabilityProfile` e `ChampionTag` do draft     |
| `poolSourcePriority`          | `PlayerChampionPoolEntry` vigente no instante do draft   |

**Não suportados**

| Parâmetro               | Motivo                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `globalMetaWeightSource`| Fonte global de meta permanece indisponível (ADR 0002)        |
| `useMatchResultAsLabel` | Vitória e derrota não são rótulo de recomendação correta      |

A distinção mais fina do registro está no risco de execução: a **curva de penalização** é aplicada
a um valor de risco que já está congelado no snapshot, então é pós-agregação; já
`maxFamiliarityRiskRelief` muda como esse risco é produzido, e por isso exige o histórico ausente.
Tratar os três como "thresholds de risco" apagaria essa diferença.

A rejeição acontece na **validação da configuração**, antes de qualquer execução: rodar um
experimento inteiro para depois marcar todos os casos como impossíveis gastaria trabalho e
produziria um relatório que parece um resultado.

## Fórmula reconstruída

Medida no motor (`recommendFromPersonalPool`):

```txt
baseScore  = round( Σ_k valorCongelado[k] * pesoEfetivo[k] )       round = 1 casa decimal
penalty    = 0                                     se risco <= executionRiskPenaltyStart
           = round( clamp((risco - start) / (100 - start), 0, 1) * maxPenalty )   caso contrário
totalScore = round( clamp( baseScore - penalty, 0, 100 ) )
```

O mapeamento entre chave de peso e métrica congelada é 1:1:

| Chave de peso          | Métrica congelada          |
| ---------------------- | -------------------------- |
| `personalPerformance`  | `PERSONAL_PERFORMANCE`     |
| `recentForm`           | `RECENT_FORM`              |
| `matchup`              | `PERSONAL_MATCHUP`         |
| `blindSafety`          | `BLIND_SAFETY`             |
| `allySynergy`          | `ALLY_SYNERGY`             |
| `enemyDraftAnswer`     | `ENEMY_COMPOSITION_ANSWER` |
| `compositionFit`       | `TEAM_COMPOSITION`         |
| `meta`                 | `META_STRENGTH`            |

## Verificação de integridade

Antes de testar qualquer configuração candidata, o baseline é reconstruído a partir do congelado
e comparado com o `totalScore` persistido.

A verificação é real, não circular: a penalização é recalculada **de forma independente** a partir
da métrica `EXECUTION_RISK` congelada, e não obtida como resíduo entre o score reconstruído e o
persistido.

**Tolerância documentada**: `REPLAY_SCORE_TOLERANCE = 0.05` ponto de score (o motor arredonda em
uma casa decimal, então a reprodução exata cabe folgadamente dentro disso).
`REPLAY_WEIGHT_SUM_TOLERANCE = 1e-6` para a soma dos pesos normalizados.

`EXACT_REPLAY` só é atribuído quando **todas** estas condições valem:

- todos os componentes necessários estão congelados;
- a versão da agregação histórica é suportada (`SUPPORTED_AGGREGATION_VERSIONS`);
- o baseline é reproduzido dentro da tolerância;
- nenhum dado posterior ao draft foi consultado — garantido pela forma das funções, que não
  recebem resultado, KDA, timeline, build, observação posterior nem revisão pós-resultado.

### Motivos de exclusão

| Código                            | Quando acontece                                                       |
| --------------------------------- | --------------------------------------------------------------------- |
| `NO_FROZEN_METRICS`               | O snapshot não preserva nenhuma métrica com valor                     |
| `NO_EFFECTIVE_WEIGHTS`            | O snapshot não preserva os pesos efetivos                             |
| `MISSING_WEIGHTED_METRIC`         | Um sinal tem peso mas nenhum valor congelado                          |
| `NORMALIZATION_MISMATCH`          | Os pesos efetivos não somam 1                                         |
| `SCORE_MISMATCH`                  | O score persistido não é reproduzível dentro da tolerância            |
| `MISSING_EXECUTION_RISK`          | Há diferença de score e o risco congelado que a explicaria não existe |
| `PENALTY_NOT_REPRODUCIBLE`        | A configuração muda a curva e o risco não está congelado              |
| `UNSUPPORTED_AGGREGATION_VERSION` | O laboratório não sabe reconstruir aquela versão da agregação         |

Um único candidato reprovado exclui o **caso inteiro**: comparar um ranking em que parte das
posições não é reproduzível produziria deslocamentos que não são da configuração candidata.

Quando o risco de execução não está congelado, o baseline só é aceito se o próprio score provar
que a penalização foi zero (`penaltyReconstruction: "ABSENT_AND_ZERO"`). Esses casos ficam
inelegíveis para configurações que mexem na curva de risco.

## Reponderação

A disponibilidade continua sendo a **histórica**. Desligar um sinal na configuração pode removê-lo
do score; ligar um sinal que estava indisponível no snapshot **não cria valor** — o peso é
redistribuído entre os sinais que de fato têm número, em vez de entrar como zero ou como neutro
inventado.

## Comparação e estabilidade

Por caso reproduzido: `top1Preserved`, `primaryOverlap` e `primaryOverlapRatio`,
`meanRankDisplacement`, `maxRankDisplacement`, `promoted`, `demoted`, `enteredPrimary`,
`leftPrimary`, `comfortStrategicInversions` e, quando o snapshot registrou a escolha,
`realChoice` (posição antes e depois, entrou ou saiu do grupo recomendado).

Inversão conforto × estratégico usa a categoria que o próprio motor já atribuiu:
`comfort_pick`/`safe_pick` de um lado, `best_blind`/`best_matchup`/`best_teamfit`/
`strategic_option` do outro. `best_matchup` fica do lado estratégico porque só existe quando o
adversário de rota foi revelado.

**Score maior não é melhoria.** Um candidato subir de posição é deslocamento, não acerto. O
laboratório mede quanto a ordenação se move, para onde e em que segmentos; a leitura sobre se isso
é desejável é humana e acontece fora do módulo.

## Segmentação

O resumo segmenta por posição, patch e faixa de cobertura (`0.9-1.0`, `0.7-0.9`, `0.5-0.7`,
`<0.5`). Casos excluídos **nunca** entram nas médias, e os motivos de exclusão saem agregados por
código com a dependência histórica nomeada.

O cruzamento com revisão humana usa somente a avaliação **pré-partida** da Etapa 24, que por
construção não conhece o resultado. `PreMatchReviewReference` não tem campo de desfecho.

## Promoção

```txt
DRAFT → EVALUATED → REJECTED | APPROVED_FOR_FUTURE_RELEASE
```

`APPROVED_FOR_FUTURE_RELEASE` é o **maior** valor que o tipo expressa. Não existe estado que
signifique "em produção", de propósito. O status entra como parâmetro em
`summarizeCalibrationExperiment` e nunca é derivado dos números — não há caminho, neste domínio,
que promova uma configuração a partir de um resultado.

## Canonicalização

`canonicalCandidateString` e `canonicalExperimentInputString` produzem serializações estáveis
(ordem de chaves e de snapshots normalizada; o nome da configuração não entra, porque não altera o
resultado). O hash em si fica na Etapa 25b, que roda na API e tem `node:crypto` —
`packages/core` também roda no renderer.

## Etapa futura registrada

Criar um `ReplayInputBundle` imutável gravado junto de **novos** snapshots, com os inputs
necessários para reproduzir derivações (`PlayerChampionStats` do momento, `ChampionTag`,
capacidades, agregados de matchup). A captura é **prospectiva**: não torna snapshots antigos
reproduzíveis e não reconstrói dado histórico a partir do estado atual. Não faz parte da 25a nem
da 25b.
