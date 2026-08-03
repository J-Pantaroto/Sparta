import {
  METRIC_TO_WEIGHT_KEY,
  OPERATIONAL_POST_AGGREGATION_THRESHOLDS,
  WEIGHTABLE_METRIC_KEYS as ENGINE_WEIGHTABLE_METRIC_KEYS,
  resolvePostAggregationThresholds,
  type CalibrationCandidate,
  type EngineWeightKey
} from "../calibration/engine-candidate.js";

/**
 * `EffectiveRecommendationConfiguration` — o que o motor precisa pra agregar
 * um ranking, já resolvido (Etapa 27a).
 *
 * ## Por que "já resolvida"
 *
 * Escolher qual tabela de peso vale para um draft (blind, lane revelada,
 * meio do draft) é uma decisão de **contexto do draft**, não de
 * configuração — por isso ela continua dentro do motor
 * (`buildBaselineConfiguration`, em `draft/recommendation-engine.ts`, é quem
 * resolve isso pra baseline). Uma release **já calibrada**, ao contrário,
 * declara um único conjunto de pesos que vale por igual em qualquer cenário
 * de draft — o mesmo comportamento que o laboratório (Etapa 25) já assume ao
 * reponderar um snapshot congelado com uma candidata. Esta estrutura nunca
 * lê banco, cache nem variável de ambiente: quem monta os dois lados
 * (`source: BUILT_IN_BASELINE` ou `RELEASE`) é responsabilidade da Etapa 27b.
 *
 * ## Escopo permitido
 *
 * Só três coisas: pesos sobre métricas já congeladas, métricas desligadas
 * (equivalente a peso zero) e regras estritamente pós-agregação
 * (`SupportedPostAggregationRules`) — as mesmas quatro categorias que
 * `engine-candidate.ts` já classifica como `EXACT_REWEIGHT`/
 * `EXACT_POST_AGGREGATION` desde a Etapa 25a. Nada de derivação de métrica,
 * elegibilidade de pool, risco de execução (a *derivação* do risco, não a
 * curva de penalização sobre o risco já congelado), matchup, ChampionTag,
 * capacidades, dificuldade ou fonte de dado.
 */

export const RELEASE_CONFIGURATION_SCHEMA_VERSION = "release-effective-configuration/1.0.0";

/**
 * Subconjunto de `RecommendationMetricKey` que o motor efetivamente pondera —
 * os mesmos oito valores de `WEIGHT_KEY_TO_METRIC`
 * (`calibration/engine-candidate.ts`), repetidos aqui como união literal.
 * Não derivado de `RELEASE_WEIGHTABLE_METRIC_KEYS`/`WEIGHT_KEY_TO_METRIC` porque os
 * dois são declarados lá com o tipo largo `RecommendationMetricKey`/
 * `Record<EngineWeightKey, RecommendationMetricKey>` de propósito (pra
 * adicionar uma métrica nova não forçar mudança de tipo em todo consumidor);
 * derivar o tipo estreito a partir deles resultaria no próprio tipo largo.
 */
export type WeightableMetricKey =
  | "PERSONAL_PERFORMANCE"
  | "RECENT_FORM"
  | "PERSONAL_MATCHUP"
  | "BLIND_SAFETY"
  | "ALLY_SYNERGY"
  | "ENEMY_COMPOSITION_ANSWER"
  | "TEAM_COMPOSITION"
  | "META_STRENGTH";

/**
 * Mesmos valores de `ENGINE_WEIGHTABLE_METRIC_KEYS` (importado de
 * `calibration/engine-candidate.ts`), só que com o tipo estreito acima —
 * é o que permite iterar `Record<WeightableMetricKey, number>` sem indexar
 * com uma chave mais larga do que o record aceita.
 */
export const RELEASE_WEIGHTABLE_METRIC_KEYS: readonly WeightableMetricKey[] = ENGINE_WEIGHTABLE_METRIC_KEYS.map(
  (metric) => metric as WeightableMetricKey
);

/**
 * Regras estritamente pós-agregação: atuam sobre um resultado (score,
 * cobertura, risco) já formado, sem alterar como nenhuma métrica é
 * produzida. Mesmos seis parâmetros que `POST_AGGREGATION_THRESHOLDS`
 * (`calibration/engine-candidate.ts`) já reconhece como `EXACT_POST_AGGREGATION`.
 */
export interface SupportedPostAggregationRules {
  primaryCount: number;
  alternativeCount: number;
  minimumScoreToRecommend: number;
  minimumDataCoverageToRecommend: number;
  /** Início da curva de penalização sobre o risco de execução já congelado. */
  executionRiskPenaltyStart: number;
  /** Teto da penalização subtraída do score, sobre o risco já congelado. */
  executionRiskMaxPenalty: number;
}

export type EffectiveConfigurationSource =
  | { type: "BUILT_IN_BASELINE" }
  | { type: "RELEASE"; releaseId: string };

export interface EffectiveRecommendationConfiguration {
  schemaVersion: string;
  version: string;
  configHash: string;

  metricWeights: Record<WeightableMetricKey, number>;
  disabledMetrics: WeightableMetricKey[];
  postAggregationRules: SupportedPostAggregationRules;

  source: EffectiveConfigurationSource;

  /** Versões de algoritmo que esta configuração declara compatíveis. */
  algorithmCompatibility: Record<string, string>;
}

/**
 * Valores pós-agregação que reproduzem o comportamento operacional atual —
 * mesmos números de `OPERATIONAL_POST_AGGREGATION_THRESHOLDS`
 * (`primaryCount`/`alternativeCount`/os dois pisos) mais o início e o teto da
 * curva de risco (`EXECUTION_RISK_PENALTY_START`/`EXECUTION_RISK_MAX_PENALTY`
 * de `draft/execution-risk.ts`, repetidos aqui como literais porque
 * `release/` não importa `draft/` — é o `draft/recommendation-engine.ts`
 * que importa `release/`, nunca o contrário).
 */
export const BASELINE_POST_AGGREGATION_RULES: SupportedPostAggregationRules = {
  primaryCount: OPERATIONAL_POST_AGGREGATION_THRESHOLDS.primaryCount,
  alternativeCount: OPERATIONAL_POST_AGGREGATION_THRESHOLDS.alternativeCount,
  minimumScoreToRecommend: OPERATIONAL_POST_AGGREGATION_THRESHOLDS.minimumScoreToRecommend,
  minimumDataCoverageToRecommend:
    OPERATIONAL_POST_AGGREGATION_THRESHOLDS.minimumDataCoverageToRecommend,
  executionRiskPenaltyStart: OPERATIONAL_POST_AGGREGATION_THRESHOLDS.executionRiskPenaltyStart,
  executionRiskMaxPenalty: OPERATIONAL_POST_AGGREGATION_THRESHOLDS.executionRiskMaxPenalty
};

function sortedWeightEntries(
  weights: Record<WeightableMetricKey, number>
): [WeightableMetricKey, number][] {
  return RELEASE_WEIGHTABLE_METRIC_KEYS.map((metric) => [metric, weights[metric] ?? 0]);
}

/**
 * Serialização canônica do conteúdo funcional — usada tanto para o
 * `configHash` quanto, embutida, para o `artifactHash` da release
 * (`release-artifact.ts`). `version` e `configHash` ficam de fora: o
 * primeiro é rótulo, o segundo é o próprio hash sendo calculado.
 */
export function canonicalConfigurationContent(
  configuration: Omit<EffectiveRecommendationConfiguration, "configHash" | "version">
): string {
  return JSON.stringify({
    schemaVersion: configuration.schemaVersion,
    metricWeights: sortedWeightEntries(configuration.metricWeights),
    disabledMetrics: [...new Set(configuration.disabledMetrics)].sort((left, right) =>
      left.localeCompare(right, "en")
    ),
    postAggregationRules: [
      ["primaryCount", configuration.postAggregationRules.primaryCount],
      ["alternativeCount", configuration.postAggregationRules.alternativeCount],
      ["minimumScoreToRecommend", configuration.postAggregationRules.minimumScoreToRecommend],
      [
        "minimumDataCoverageToRecommend",
        configuration.postAggregationRules.minimumDataCoverageToRecommend
      ],
      ["executionRiskPenaltyStart", configuration.postAggregationRules.executionRiskPenaltyStart],
      ["executionRiskMaxPenalty", configuration.postAggregationRules.executionRiskMaxPenalty]
    ],
    source: configuration.source,
    algorithmCompatibility: Object.entries(configuration.algorithmCompatibility).sort(
      ([left], [right]) => left.localeCompare(right, "en")
    )
  });
}

/**
 * Monta a configuração completa a partir dos pesos/regras já resolvidos e
 * calcula o `configHash`. `computeHash` é injetado pelo mesmo motivo de
 * sempre neste repositório: `packages/core` também roda no renderer e não
 * pode depender de `node:crypto`.
 */
export function buildEffectiveConfiguration(input: {
  version: string;
  metricWeights: Record<WeightableMetricKey, number>;
  disabledMetrics: WeightableMetricKey[];
  postAggregationRules: SupportedPostAggregationRules;
  source: EffectiveConfigurationSource;
  algorithmCompatibility: Record<string, string>;
  computeHash: (canonical: string) => string;
}): EffectiveRecommendationConfiguration {
  const withoutHash: Omit<EffectiveRecommendationConfiguration, "configHash"> = {
    schemaVersion: RELEASE_CONFIGURATION_SCHEMA_VERSION,
    version: input.version,
    metricWeights: input.metricWeights,
    disabledMetrics: input.disabledMetrics,
    postAggregationRules: input.postAggregationRules,
    source: input.source,
    algorithmCompatibility: input.algorithmCompatibility
  };
  return { ...withoutHash, configHash: input.computeHash(canonicalConfigurationContent(withoutHash)) };
}

/**
 * Deriva `EffectiveRecommendationConfiguration` de uma `CalibrationCandidate`
 * já validada (`validateCalibrationCandidate` — Etapa 25a). Preenche pesos
 * ausentes com zero (métrica sem peso declarado não participa do score,
 * mesma convenção de `CalibrationCandidate.metricWeights` sendo `Partial`) e
 * resolve os thresholds pós-agregação com `resolvePostAggregationThresholds`
 * (operacionais + o que a candidata sobrescreveu).
 *
 * Não valida a candidata aqui — quem chama já deve ter feito isso antes
 * (a validação da release, em `release-validation.ts`, confere de novo como
 * parte de `UNSUPPORTED_PARAMETER`).
 */
export function buildEffectiveConfigurationFromCandidate(input: {
  candidate: CalibrationCandidate;
  version: string;
  source: EffectiveConfigurationSource;
  algorithmCompatibility: Record<string, string>;
  computeHash: (canonical: string) => string;
}): EffectiveRecommendationConfiguration {
  const { candidate } = input;
  const metricWeights = RELEASE_WEIGHTABLE_METRIC_KEYS.reduce(
    (result, metric) => {
      result[metric] = candidate.metricWeights?.[metric] ?? 0;
      return result;
    },
    {} as Record<WeightableMetricKey, number>
  );
  const weightableSet = new Set<string>(RELEASE_WEIGHTABLE_METRIC_KEYS);
  const disabledMetrics = (candidate.disabledMetrics ?? []).filter(
    (metric): metric is WeightableMetricKey => weightableSet.has(metric)
  );
  const thresholds = resolvePostAggregationThresholds(candidate);

  return buildEffectiveConfiguration({
    version: input.version,
    metricWeights,
    disabledMetrics,
    postAggregationRules: {
      primaryCount: thresholds.primaryCount,
      alternativeCount: thresholds.alternativeCount,
      minimumScoreToRecommend: thresholds.minimumScoreToRecommend,
      minimumDataCoverageToRecommend: thresholds.minimumDataCoverageToRecommend,
      executionRiskPenaltyStart: thresholds.executionRiskPenaltyStart,
      executionRiskMaxPenalty: thresholds.executionRiskMaxPenalty
    },
    source: input.source,
    algorithmCompatibility: input.algorithmCompatibility,
    computeHash: input.computeHash
  });
}

/**
 * Converte os pesos da configuração para as chaves internas do motor
 * (`EngineWeightKey`, minúsculas — `personalPerformance`, `matchup`…),
 * zerando as métricas desligadas. `disabledMetrics` **zera** em vez de
 * remover: equivale a peso zero, mesma regra de
 * `validateCalibrationCandidate` desde a Etapa 25a.
 *
 * Itera na ordem de inserção de `configuration.metricWeights` (não numa
 * ordem canônica fixa), com qualquer chave ausente completada ao final: é o
 * que permite `buildBaselineConfiguration` reproduzir bit a bit o resultado
 * do motor sem configuração — `normalizeAvailableWeights` soma pesos em
 * ponto flutuante, que não é associativo, então reordenar as mesmas
 * parcelas mudaria o último dígito de `dataCoverage`/`effectiveWeights`
 * (comprovado por teste em `recommendation-engine.test.ts`).
 */
export function engineWeightsFromConfiguration(
  configuration: EffectiveRecommendationConfiguration
): Record<EngineWeightKey, number> {
  const disabled = new Set(configuration.disabledMetrics);
  const declaredOrder = Object.keys(configuration.metricWeights) as WeightableMetricKey[];
  const missing = RELEASE_WEIGHTABLE_METRIC_KEYS.filter(
    (metric) => !Object.prototype.hasOwnProperty.call(configuration.metricWeights, metric)
  );
  const result = {} as Record<EngineWeightKey, number>;
  for (const metric of [...declaredOrder, ...missing]) {
    const engineKey = METRIC_TO_WEIGHT_KEY[metric];
    if (!engineKey) continue;
    result[engineKey] = disabled.has(metric) ? 0 : (configuration.metricWeights[metric] ?? 0);
  }
  return result;
}

/**
 * Mesma curva de penalização de `calibration/snapshot-replay.ts`
 * (`executionRiskPenalty`), reimplementada aqui de propósito em vez de
 * importada: aquele módulo reconstrói risco a partir de métrica **congelada**
 * de um snapshot histórico, enquanto este aplica a curva ao risco **recém
 * calculado** por `assessExecutionRisk` dentro do motor ao vivo. São dois
 * contextos diferentes que hoje coincidem na fórmula; acoplar os dois
 * módulos por causa disso criaria uma dependência que não descreve uma
 * relação real entre as duas etapas.
 */
export function computeExecutionRiskPenalty(
  risk: number,
  rules: Pick<SupportedPostAggregationRules, "executionRiskPenaltyStart" | "executionRiskMaxPenalty">
): number {
  const { executionRiskPenaltyStart: start, executionRiskMaxPenalty: max } = rules;
  if (risk <= start) return 0;
  const span = 100 - start;
  const proportion = span <= 0 ? 1 : Math.max(0, Math.min(1, (risk - start) / span));
  return Math.round(proportion * max * 10) / 10;
}

export type ConfigurationStructuralProblem =
  | { code: "NEGATIVE_WEIGHT"; metric: WeightableMetricKey }
  | { code: "NON_FINITE_WEIGHT"; metric: WeightableMetricKey }
  | { code: "NO_POSITIVE_WEIGHT" }
  | { code: "NON_FINITE_RULE"; rule: keyof SupportedPostAggregationRules }
  | { code: "RULE_OUT_OF_RANGE"; rule: keyof SupportedPostAggregationRules };

/**
 * Sanidade estrutural de uma configuração já resolvida — não repete a
 * classificação de capacidade de replay (`validateCalibrationCandidate` já
 * fez isso antes de a configuração existir); só confirma que os números em
 * si são utilizáveis pelo motor.
 */
export function validateEffectiveConfigurationStructure(
  configuration: EffectiveRecommendationConfiguration
): { valid: boolean; problems: ConfigurationStructuralProblem[] } {
  const problems: ConfigurationStructuralProblem[] = [];
  const disabled = new Set(configuration.disabledMetrics);
  let positiveWeights = 0;

  for (const metric of RELEASE_WEIGHTABLE_METRIC_KEYS) {
    const value = configuration.metricWeights[metric];
    if (!Number.isFinite(value)) {
      problems.push({ code: "NON_FINITE_WEIGHT", metric });
      continue;
    }
    if (value < 0) {
      problems.push({ code: "NEGATIVE_WEIGHT", metric });
      continue;
    }
    if (value > 0 && !disabled.has(metric)) positiveWeights += 1;
  }
  if (positiveWeights === 0) problems.push({ code: "NO_POSITIVE_WEIGHT" });

  const rules = configuration.postAggregationRules;
  const ranges: Record<keyof SupportedPostAggregationRules, { min: number; max: number }> = {
    primaryCount: { min: 1, max: 20 },
    alternativeCount: { min: 0, max: 20 },
    minimumScoreToRecommend: { min: 0, max: 100 },
    minimumDataCoverageToRecommend: { min: 0, max: 1 },
    executionRiskPenaltyStart: { min: 0, max: 100 },
    executionRiskMaxPenalty: { min: 0, max: 100 }
  };
  for (const rule of Object.keys(ranges) as (keyof SupportedPostAggregationRules)[]) {
    const value = rules[rule];
    if (!Number.isFinite(value)) {
      problems.push({ code: "NON_FINITE_RULE", rule });
      continue;
    }
    const range = ranges[rule];
    if (value < range.min || value > range.max) {
      problems.push({ code: "RULE_OUT_OF_RANGE", rule });
    }
  }

  return { valid: problems.length === 0, problems };
}
