import type { RecommendationMetric, RecommendationMetricKey } from "../types/recommendation-metric.js";
import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";
import {
  ENGINE_WEIGHT_KEYS,
  OPERATIONAL_POST_AGGREGATION_THRESHOLDS,
  SUPPORTED_AGGREGATION_VERSIONS,
  WEIGHT_KEY_TO_METRIC,
  resolvePostAggregationThresholds,
  type CalibrationCandidate,
  type EngineWeightKey
} from "./engine-candidate.js";

/**
 * Replay historicamente honesto de um snapshot de recomendação.
 *
 * ## O que entra
 *
 * Exclusivamente o que está congelado no snapshot: valores de métrica,
 * disponibilidade histórica, pesos efetivos, cobertura e o risco de execução
 * daquele instante. Nada mais é lido — este módulo não recebe resultado da
 * partida, KDA, timeline, build utilizada, observação importada depois do
 * draft, partida jogada depois do snapshot nem revisão pós-resultado. Não
 * existe parâmetro por onde esses dados pudessem entrar, e nenhuma função aqui
 * consulta repositório de jogador, catálogo ou estado atual.
 *
 * ## Por que o baseline é reconstruído antes de testar qualquer candidata
 *
 * Comparar uma configuração candidata contra o `totalScore` persistido sem
 * antes provar que o mesmo `totalScore` é reproduzível a partir do congelado
 * atribuiria à candidata qualquer diferença causada por informação que faltou.
 * A reconstrução é a prova de que o caso é comparável; sem ela, o caso sai da
 * amostra em vez de virar evidência frágil. O resultado reconstruído **nunca**
 * é ajustado para coincidir com o persistido.
 *
 * A penalização de risco torna essa prova real em vez de circular: ela é
 * recalculada de forma independente a partir da métrica `EXECUTION_RISK`
 * congelada, e não obtida como resíduo entre o score reconstruído e o
 * persistido.
 */

/**
 * Tolerância numérica da reconstrução, em pontos de score.
 *
 * O motor arredonda em uma casa decimal (`Math.round(v * 10) / 10`), então uma
 * reprodução exata cabe folgadamente aqui; o valor existe para absorver
 * diferença de ponto flutuante na soma ponderada, não para tolerar divergência
 * de conteúdo.
 */
export const REPLAY_SCORE_TOLERANCE = 0.05;

/** Tolerância da soma dos pesos efetivos normalizados. */
export const REPLAY_WEIGHT_SUM_TOLERANCE = 1e-6;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

/** Mesma curva do motor, parametrizada pelos thresholds pós-agregação. */
export function executionRiskPenalty(
  risk: number,
  thresholds: Record<string, number> = OPERATIONAL_POST_AGGREGATION_THRESHOLDS
): number {
  const start = thresholds.executionRiskPenaltyStart ?? 25;
  const max = thresholds.executionRiskMaxPenalty ?? 8;
  if (risk <= start) return 0;
  const span = 100 - start;
  if (span <= 0) return round(max);
  return round(clamp((risk - start) / span, 0, 1) * max);
}

export type ReplayStatus =
  | "EXACT_REPLAY"
  | "REPLAY_INTEGRITY_FAILED"
  | "REPLAY_UNSUPPORTED_VERSION"
  | "REPLAY_MISSING_HISTORICAL_INPUT";

export type ReplayExclusionCode =
  | "NO_FROZEN_METRICS"
  | "NO_EFFECTIVE_WEIGHTS"
  | "MISSING_WEIGHTED_METRIC"
  | "MISSING_EXECUTION_RISK"
  | "PENALTY_NOT_REPRODUCIBLE"
  | "NORMALIZATION_MISMATCH"
  | "SCORE_MISMATCH"
  | "UNSUPPORTED_AGGREGATION_VERSION";

export interface ReplayExclusionReason {
  code: ReplayExclusionCode;
  reason: string;
  championId?: number;
  /** Dependência histórica ausente, quando é isso que impede a reprodução. */
  missingHistoricalInput?: string;
}

const MISSING_INPUT_CODES: ReadonlySet<ReplayExclusionCode> = new Set([
  "NO_FROZEN_METRICS",
  "NO_EFFECTIVE_WEIGHTS",
  "MISSING_WEIGHTED_METRIC",
  "MISSING_EXECUTION_RISK",
  "PENALTY_NOT_REPRODUCIBLE"
]);

export function statusForExclusions(exclusions: readonly ReplayExclusionReason[]): ReplayStatus {
  if (exclusions.length === 0) return "EXACT_REPLAY";
  if (exclusions.some((entry) => entry.code === "UNSUPPORTED_AGGREGATION_VERSION")) {
    return "REPLAY_UNSUPPORTED_VERSION";
  }
  if (exclusions.every((entry) => MISSING_INPUT_CODES.has(entry.code))) {
    return "REPLAY_MISSING_HISTORICAL_INPUT";
  }
  return "REPLAY_INTEGRITY_FAILED";
}

/** Como a penalização de risco pôde ser reconstruída neste candidato. */
export type PenaltyReconstruction = "FROM_FROZEN_RISK" | "ABSENT_AND_PROVEN_ZERO";

/** Estado congelado de um candidato, já extraído do snapshot. */
export interface FrozenCandidate {
  championId: number;
  championName: string;
  rank: number;
  group: "PRIMARY" | "ALTERNATIVE";
  category: string;
  persistedTotalScore: number;
  /** Cobertura histórica; não é recalculada nem substituída pela candidata. */
  persistedDataCoverage: number;
  personalGames: number;
  /** Valor por chave de peso; `null` quando o sinal estava indisponível. */
  metricValues: Record<EngineWeightKey, number | null>;
  availability: Record<EngineWeightKey, boolean>;
  effectiveWeights: Record<EngineWeightKey, number>;
  /** Risco de execução congelado, ou `null` se a métrica não existe no snapshot. */
  executionRisk: number | null;
}

function readMetric(
  metrics: readonly RecommendationMetric[],
  key: RecommendationMetricKey
): RecommendationMetric | undefined {
  return metrics.find((metric) => metric.key === key);
}

/**
 * Extrai o estado congelado. Métrica ausente e métrica indisponível são a mesma
 * coisa aqui — nos dois casos não há número, e o contrato de
 * `RecommendationMetric` garante que indisponível nunca carrega valor.
 */
export function extractFrozenCandidate(persisted: PersistedRecommendation): FrozenCandidate {
  const metricValues = {} as Record<EngineWeightKey, number | null>;
  const availability = {} as Record<EngineWeightKey, boolean>;
  const effectiveWeights = {} as Record<EngineWeightKey, number>;
  const metrics = persisted.metricDetails ?? [];

  for (const key of ENGINE_WEIGHT_KEYS) {
    const metric = readMetric(metrics, WEIGHT_KEY_TO_METRIC[key]);
    const usable = metric !== undefined && metric.value !== null && metric.status !== "UNAVAILABLE";
    metricValues[key] = usable ? (metric.value as number) : null;
    availability[key] = usable;
    const weight = persisted.effectiveWeights?.[key];
    effectiveWeights[key] = typeof weight === "number" && Number.isFinite(weight) ? weight : 0;
  }

  const riskMetric = readMetric(metrics, "EXECUTION_RISK");
  const executionRisk =
    riskMetric && riskMetric.value !== null && riskMetric.status !== "UNAVAILABLE"
      ? riskMetric.value
      : null;

  return {
    championId: persisted.championId,
    championName: persisted.championName,
    rank: persisted.rank,
    group: persisted.group,
    category: persisted.category,
    persistedTotalScore: persisted.totalScore,
    persistedDataCoverage: persisted.dataCoverage,
    personalGames: persisted.personalGames,
    metricValues,
    availability,
    effectiveWeights,
    executionRisk
  };
}

export interface BaselineReconstruction {
  status: ReplayStatus;
  exclusions: ReplayExclusionReason[];
  /** Só existe quando `status === "EXACT_REPLAY"`. */
  reconstructedScore?: number;
  reconstructedBaseScore?: number;
  reconstructedPenalty?: number;
  penaltyReconstruction?: PenaltyReconstruction;
  /** Diferença absoluta entre reconstruído e persistido, em pontos. */
  scoreDelta?: number;
}

/**
 * Reconstrói o score persistido a partir do congelado.
 *
 * `EXACT_REPLAY` só é atribuído quando todos os componentes necessários estão
 * congelados, a versão da agregação é suportada, o baseline é reproduzido
 * dentro da tolerância e nenhum dado posterior ao draft foi consultado — a
 * última condição é garantida pela forma da função, que não recebe nada além
 * do candidato congelado e da versão declarada.
 */
export function reconstructBaseline(input: {
  frozen: FrozenCandidate;
  aggregationVersion: string;
}): BaselineReconstruction {
  const { frozen } = input;
  const exclusions: ReplayExclusionReason[] = [];

  if (!SUPPORTED_AGGREGATION_VERSIONS.includes(input.aggregationVersion)) {
    const only: ReplayExclusionReason[] = [
      {
        code: "UNSUPPORTED_AGGREGATION_VERSION",
        reason: `A agregação ${input.aggregationVersion} não é reconstruível por esta versão do laboratório.`,
        championId: frozen.championId,
        missingHistoricalInput: `Implementação da agregação ${input.aggregationVersion}`
      }
    ];
    return { status: statusForExclusions(only), exclusions: only };
  }

  const hasAnyMetric = ENGINE_WEIGHT_KEYS.some((key) => frozen.metricValues[key] !== null);
  if (!hasAnyMetric) {
    const only: ReplayExclusionReason[] = [
      {
        code: "NO_FROZEN_METRICS",
        reason: "O snapshot não preserva nenhuma métrica com valor para este candidato.",
        championId: frozen.championId,
        missingHistoricalInput: "PersistedRecommendation.metricDetails"
      }
    ];
    return { status: statusForExclusions(only), exclusions: only };
  }

  const weightSum = ENGINE_WEIGHT_KEYS.reduce((sum, key) => sum + frozen.effectiveWeights[key], 0);
  if (weightSum <= 0) {
    const only: ReplayExclusionReason[] = [
      {
        code: "NO_EFFECTIVE_WEIGHTS",
        reason: "O snapshot não preserva os pesos efetivos que formaram o score.",
        championId: frozen.championId,
        missingHistoricalInput: "PersistedRecommendation.effectiveWeights"
      }
    ];
    return { status: statusForExclusions(only), exclusions: only };
  }

  for (const key of ENGINE_WEIGHT_KEYS) {
    if (frozen.effectiveWeights[key] > 0 && frozen.metricValues[key] === null) {
      exclusions.push({
        code: "MISSING_WEIGHTED_METRIC",
        reason: `O sinal ${WEIGHT_KEY_TO_METRIC[key]} tem peso ${frozen.effectiveWeights[key]} no snapshot mas nenhum valor congelado.`,
        championId: frozen.championId,
        missingHistoricalInput: `RecommendationMetric ${WEIGHT_KEY_TO_METRIC[key]}`
      });
    }
  }

  if (Math.abs(weightSum - 1) > REPLAY_WEIGHT_SUM_TOLERANCE) {
    exclusions.push({
      code: "NORMALIZATION_MISMATCH",
      reason: `Os pesos efetivos somam ${weightSum}, e a normalização histórica exige 1.`,
      championId: frozen.championId
    });
  }

  if (exclusions.length > 0) {
    return { status: statusForExclusions(exclusions), exclusions };
  }

  const baseScore = round(
    ENGINE_WEIGHT_KEYS.reduce(
      (score, key) => score + (frozen.metricValues[key] ?? 0) * frozen.effectiveWeights[key],
      0
    )
  );

  let penalty: number;
  let penaltyReconstruction: PenaltyReconstruction;
  if (frozen.executionRisk !== null) {
    penalty = executionRiskPenalty(frozen.executionRisk);
    penaltyReconstruction = "FROM_FROZEN_RISK";
  } else if (Math.abs(baseScore - frozen.persistedTotalScore) <= REPLAY_SCORE_TOLERANCE) {
    // Sem a métrica congelada não dá pra distinguir "não houve penalização" de
    // "a penalização é desconhecida" — a não ser quando o próprio score prova
    // que ela foi zero. Só nesse caso o baseline é aceito, e o candidato fica
    // inelegível para configurações que mexem na curva de risco.
    penalty = 0;
    penaltyReconstruction = "ABSENT_AND_PROVEN_ZERO";
  } else {
    const only: ReplayExclusionReason[] = [
      {
        code: "MISSING_EXECUTION_RISK",
        reason: `O score persistido difere do agregado em ${round(baseScore - frozen.persistedTotalScore)} ponto(s) e o snapshot não preserva o risco de execução que explicaria a diferença.`,
        championId: frozen.championId,
        missingHistoricalInput: "RecommendationMetric EXECUTION_RISK"
      }
    ];
    return { status: statusForExclusions(only), exclusions: only };
  }

  const reconstructedScore = round(clamp(baseScore - penalty));
  const scoreDelta = Math.abs(reconstructedScore - frozen.persistedTotalScore);
  if (scoreDelta > REPLAY_SCORE_TOLERANCE) {
    const only: ReplayExclusionReason[] = [
      {
        code: "SCORE_MISMATCH",
        reason: `Reconstruído ${reconstructedScore} contra ${frozen.persistedTotalScore} persistido (diferença de ${round(scoreDelta)}, tolerância ${REPLAY_SCORE_TOLERANCE}).`,
        championId: frozen.championId
      }
    ];
    return { status: statusForExclusions(only), exclusions: only };
  }

  return {
    status: "EXACT_REPLAY",
    exclusions: [],
    reconstructedScore,
    reconstructedBaseScore: baseScore,
    reconstructedPenalty: penalty,
    penaltyReconstruction,
    scoreDelta
  };
}

/** Motivo estruturado de uma diferença entre baseline e candidato. */
export interface CandidateDifferenceReason {
  code: "WEIGHT_CHANGED" | "METRIC_DISABLED" | "METRIC_UNAVAILABLE_HISTORICALLY" | "PENALTY_CURVE_CHANGED";
  metric?: RecommendationMetricKey;
  detail: string;
}

export interface ReweightedCandidate {
  championId: number;
  championName: string;
  category: string;
  /** Preservados do snapshot, sem recálculo. */
  baselineRank: number;
  baselineGroup: "PRIMARY" | "ALTERNATIVE";
  baselineScore: number;
  reconstructedScore: number;
  /** Cobertura histórica original, intocada. */
  baselineDataCoverage: number;
  candidateScore: number;
  candidateBaseScore: number;
  candidatePenalty: number;
  /**
   * Cobertura da configuração candidata: soma dos pesos candidatos que tinham
   * dado congelado. Não substitui `baselineDataCoverage` — são duas leituras
   * diferentes, e fundi-las esconderia que a candidata usa menos sinais.
   */
  candidateDataCoverage: number;
  /** Pesos normalizados que produziram `candidateScore`. */
  candidateWeights: Partial<Record<RecommendationMetricKey, number>>;
  /** Valores congelados efetivamente usados. */
  usedMetricValues: Partial<Record<RecommendationMetricKey, number>>;
  differenceReasons: CandidateDifferenceReason[];
}

/**
 * Aplica a configuração candidata a um candidato congelado.
 *
 * A disponibilidade continua sendo a **histórica**: desligar um sinal na
 * configuração remove-o do score, mas nenhum peso consegue trazer de volta um
 * sinal que o snapshot não tem. Métrica ausente nunca recebe peso efetivo nem
 * valor substituto — não existe 0 nem 50 de preenchimento.
 */
export function applyCandidateToFrozen(input: {
  frozen: FrozenCandidate;
  candidate: CalibrationCandidate;
  reconstructedScore: number;
}): ReweightedCandidate {
  const { frozen, candidate } = input;
  const thresholds = resolvePostAggregationThresholds(candidate);
  const disabled = new Set(candidate.disabledMetrics ?? []);
  const differenceReasons: CandidateDifferenceReason[] = [];

  const weightOf = (key: EngineWeightKey) => {
    const metric = WEIGHT_KEY_TO_METRIC[key];
    if (disabled.has(metric)) return 0;
    const weight = candidate.metricWeights?.[metric];
    return typeof weight === "number" && Number.isFinite(weight) && weight > 0 ? weight : 0;
  };

  const usable = (key: EngineWeightKey) => frozen.availability[key] && weightOf(key) > 0;

  const coverage = ENGINE_WEIGHT_KEYS.reduce(
    (sum, key) => sum + (usable(key) ? weightOf(key) : 0),
    0
  );

  const candidateWeights: Partial<Record<RecommendationMetricKey, number>> = {};
  const usedMetricValues: Partial<Record<RecommendationMetricKey, number>> = {};
  let candidateBaseScore = 0;

  for (const key of ENGINE_WEIGHT_KEYS) {
    const metric = WEIGHT_KEY_TO_METRIC[key];
    if (disabled.has(metric) && frozen.availability[key]) {
      differenceReasons.push({
        code: "METRIC_DISABLED",
        metric,
        detail: "Sinal congelado excluído pela configuração candidata; o peso foi redistribuído."
      });
    }
    if (!frozen.availability[key] && (candidate.metricWeights?.[metric] ?? 0) > 0) {
      differenceReasons.push({
        code: "METRIC_UNAVAILABLE_HISTORICALLY",
        metric,
        detail: "A configuração dá peso a um sinal que não existia no snapshot; o peso foi redistribuído."
      });
    }
    if (!usable(key) || coverage <= 0) continue;
    const normalized = weightOf(key) / coverage;
    candidateWeights[metric] = normalized;
    usedMetricValues[metric] = frozen.metricValues[key] as number;
    candidateBaseScore += (frozen.metricValues[key] as number) * normalized;
    if (Math.abs(normalized - frozen.effectiveWeights[key]) > REPLAY_WEIGHT_SUM_TOLERANCE) {
      differenceReasons.push({
        code: "WEIGHT_CHANGED",
        metric,
        detail: `Peso efetivo ${frozen.effectiveWeights[key]} → ${normalized}.`
      });
    }
  }

  candidateBaseScore = round(candidateBaseScore);
  const candidatePenalty =
    frozen.executionRisk === null ? 0 : executionRiskPenalty(frozen.executionRisk, thresholds);
  if (
    frozen.executionRisk !== null &&
    Math.abs(candidatePenalty - executionRiskPenalty(frozen.executionRisk)) > 0
  ) {
    differenceReasons.push({
      code: "PENALTY_CURVE_CHANGED",
      detail: `Penalização ${executionRiskPenalty(frozen.executionRisk)} → ${candidatePenalty} sobre o risco congelado ${frozen.executionRisk}.`
    });
  }

  return {
    championId: frozen.championId,
    championName: frozen.championName,
    category: frozen.category,
    baselineRank: frozen.rank,
    baselineGroup: frozen.group,
    baselineScore: frozen.persistedTotalScore,
    reconstructedScore: input.reconstructedScore,
    baselineDataCoverage: frozen.persistedDataCoverage,
    candidateScore: round(clamp(candidateBaseScore - candidatePenalty)),
    candidateBaseScore,
    candidatePenalty,
    candidateDataCoverage: coverage,
    candidateWeights,
    usedMetricValues,
    differenceReasons
  };
}

/**
 * `true` quando a configuração mexe na curva de penalização. Candidatos cujo
 * risco não está congelado não podem avaliar essa mudança e precisam sair da
 * amostra, em vez de responder como se a penalização fosse zero.
 */
export function candidateChangesPenaltyCurve(candidate: CalibrationCandidate): boolean {
  const thresholds = resolvePostAggregationThresholds(candidate);
  return (
    thresholds.executionRiskPenaltyStart !==
      OPERATIONAL_POST_AGGREGATION_THRESHOLDS.executionRiskPenaltyStart ||
    thresholds.executionRiskMaxPenalty !==
      OPERATIONAL_POST_AGGREGATION_THRESHOLDS.executionRiskMaxPenalty
  );
}
