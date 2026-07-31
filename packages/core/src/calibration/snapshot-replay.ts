import type { RecommendationMetric } from "../types/recommendation-metric.js";
import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";
import {
  CANDIDATE_WEIGHT_KEYS,
  OPERATIONAL_POST_AGGREGATION,
  SUPPORTED_AGGREGATION_VERSIONS,
  WEIGHT_KEY_TO_METRIC,
  type CandidateWeightKey,
  type PostAggregationRules,
  type RecommendationEngineCandidate
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
 * existe parâmetro por onde esses dados pudessem entrar.
 *
 * ## Por que o baseline é reconstruído antes de testar qualquer candidata
 *
 * Comparar uma configuração candidata contra o `totalScore` persistido sem
 * antes provar que o mesmo `totalScore` é reproduzível a partir do congelado
 * atribuiria à candidata qualquer diferença causada por informação que faltou.
 * A reconstrução é a prova de que o caso é comparável; sem ela, o caso sai da
 * amostra em vez de virar evidência frágil.
 *
 * A penalização de risco torna essa prova real em vez de circular: ela é
 * recalculada de forma independente a partir da métrica `EXECUTION_RISK`
 * congelada, e não obtida como resíduo entre o score reconstruído e o
 * persistido.
 */

/** Tolerância numérica da reconstrução, em pontos de score. */
export const REPLAY_SCORE_TOLERANCE = 0.05;

/** Tolerância da soma dos pesos efetivos normalizados. */
export const REPLAY_WEIGHT_SUM_TOLERANCE = 1e-6;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

/** Mesma curva do motor, parametrizada pelas regras pós-agregação. */
export function executionRiskPenalty(risk: number, rules: PostAggregationRules): number {
  if (risk <= rules.executionRiskPenaltyStart) return 0;
  const span = 100 - rules.executionRiskPenaltyStart;
  if (span <= 0) return round(rules.executionRiskMaxPenalty);
  const proportion = (risk - rules.executionRiskPenaltyStart) / span;
  return round(clamp(proportion, 0, 1) * rules.executionRiskMaxPenalty);
}

export type ReplayCaseStatus =
  | "EXACT_REPLAY"
  | "REPLAY_INTEGRITY_FAILED"
  | "REPLAY_IMPOSSIBLE"
  | "UNSUPPORTED_AGGREGATION_VERSION";

export type ReplayExclusionCode =
  | "NO_FROZEN_METRICS"
  | "NO_EFFECTIVE_WEIGHTS"
  | "MISSING_WEIGHTED_METRIC"
  | "NORMALIZATION_MISMATCH"
  | "SCORE_MISMATCH"
  | "MISSING_EXECUTION_RISK"
  | "UNSUPPORTED_AGGREGATION_VERSION"
  | "PENALTY_NOT_REPRODUCIBLE";

export interface ReplayExclusion {
  code: ReplayExclusionCode;
  reason: string;
  /** Dependência histórica ausente, quando é isso que impede a reprodução. */
  missingHistoricalInput?: string;
}

/** Como a penalização de risco pôde ser reconstruída neste caso. */
export type PenaltyReconstruction = "FROM_FROZEN_RISK" | "ABSENT_AND_ZERO";

/** Estado congelado de um candidato, já extraído do snapshot. */
export interface FrozenCandidate {
  championId: number;
  championName: string;
  rank: number;
  group: "PRIMARY" | "ALTERNATIVE";
  category: string;
  persistedTotalScore: number;
  persistedDataCoverage: number;
  /** Valor por chave de peso; `null` quando o sinal estava indisponível. */
  metricValues: Record<CandidateWeightKey, number | null>;
  availability: Record<CandidateWeightKey, boolean>;
  effectiveWeights: Record<CandidateWeightKey, number>;
  /** Risco de execução congelado, ou `null` se a métrica não existe no snapshot. */
  executionRisk: number | null;
}

function readMetric(
  metrics: readonly RecommendationMetric[],
  key: CandidateWeightKey
): RecommendationMetric | undefined {
  return metrics.find((metric) => metric.key === WEIGHT_KEY_TO_METRIC[key]);
}

/**
 * Extrai o estado congelado. Métrica ausente e métrica indisponível são a mesma
 * coisa aqui — nos dois casos não há número, e o contrato de
 * `RecommendationMetric` garante que indisponível nunca carrega valor.
 */
export function extractFrozenCandidate(persisted: PersistedRecommendation): FrozenCandidate {
  const metricValues = {} as Record<CandidateWeightKey, number | null>;
  const availability = {} as Record<CandidateWeightKey, boolean>;
  const effectiveWeights = {} as Record<CandidateWeightKey, number>;
  const metrics = persisted.metricDetails ?? [];

  for (const key of CANDIDATE_WEIGHT_KEYS) {
    const metric = readMetric(metrics, key);
    const usable =
      metric !== undefined && metric.value !== null && metric.status !== "UNAVAILABLE";
    metricValues[key] = usable ? (metric.value as number) : null;
    availability[key] = usable;
    const weight = persisted.effectiveWeights?.[key];
    effectiveWeights[key] = typeof weight === "number" && Number.isFinite(weight) ? weight : 0;
  }

  const riskMetric = metrics.find((metric) => metric.key === "EXECUTION_RISK");
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
    metricValues,
    availability,
    effectiveWeights,
    executionRisk
  };
}

export interface BaselineReconstruction {
  status: ReplayCaseStatus;
  exclusions: ReplayExclusion[];
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
 * do candidato congelado.
 */
export function reconstructBaseline(input: {
  frozen: FrozenCandidate;
  aggregationVersion: string;
  rules?: PostAggregationRules;
}): BaselineReconstruction {
  const { frozen } = input;
  const rules = input.rules ?? OPERATIONAL_POST_AGGREGATION;
  const exclusions: ReplayExclusion[] = [];

  if (!SUPPORTED_AGGREGATION_VERSIONS.includes(input.aggregationVersion)) {
    return {
      status: "UNSUPPORTED_AGGREGATION_VERSION",
      exclusions: [
        {
          code: "UNSUPPORTED_AGGREGATION_VERSION",
          reason: `A agregação ${input.aggregationVersion} não é reconstruível por esta versão do laboratório.`,
          missingHistoricalInput: `Implementação da agregação ${input.aggregationVersion}`
        }
      ]
    };
  }

  const hasAnyMetric = CANDIDATE_WEIGHT_KEYS.some((key) => frozen.metricValues[key] !== null);
  if (!hasAnyMetric) {
    return {
      status: "REPLAY_IMPOSSIBLE",
      exclusions: [
        {
          code: "NO_FROZEN_METRICS",
          reason: "O snapshot não preserva nenhuma métrica com valor para este candidato.",
          missingHistoricalInput: "PersistedRecommendation.metricDetails"
        }
      ]
    };
  }

  const weightSum = CANDIDATE_WEIGHT_KEYS.reduce((sum, key) => sum + frozen.effectiveWeights[key], 0);
  if (weightSum <= 0) {
    return {
      status: "REPLAY_IMPOSSIBLE",
      exclusions: [
        {
          code: "NO_EFFECTIVE_WEIGHTS",
          reason: "O snapshot não preserva os pesos efetivos que formaram o score.",
          missingHistoricalInput: "PersistedRecommendation.effectiveWeights"
        }
      ]
    };
  }

  for (const key of CANDIDATE_WEIGHT_KEYS) {
    if (frozen.effectiveWeights[key] > 0 && frozen.metricValues[key] === null) {
      exclusions.push({
        code: "MISSING_WEIGHTED_METRIC",
        reason: `O sinal ${WEIGHT_KEY_TO_METRIC[key]} tem peso ${frozen.effectiveWeights[key]} no snapshot mas nenhum valor congelado.`,
        missingHistoricalInput: `RecommendationMetric ${WEIGHT_KEY_TO_METRIC[key]}`
      });
    }
  }

  if (Math.abs(weightSum - 1) > REPLAY_WEIGHT_SUM_TOLERANCE) {
    exclusions.push({
      code: "NORMALIZATION_MISMATCH",
      reason: `Os pesos efetivos somam ${weightSum}, e a normalização histórica exige 1.`
    });
  }

  if (exclusions.length > 0) {
    return { status: "REPLAY_INTEGRITY_FAILED", exclusions };
  }

  const baseScore = round(
    CANDIDATE_WEIGHT_KEYS.reduce(
      (score, key) => score + (frozen.metricValues[key] ?? 0) * frozen.effectiveWeights[key],
      0
    )
  );

  let penalty: number;
  let penaltyReconstruction: PenaltyReconstruction;
  if (frozen.executionRisk !== null) {
    penalty = executionRiskPenalty(frozen.executionRisk, rules);
    penaltyReconstruction = "FROM_FROZEN_RISK";
  } else if (Math.abs(baseScore - frozen.persistedTotalScore) <= REPLAY_SCORE_TOLERANCE) {
    // Sem a métrica congelada não dá pra distinguir "não houve penalização" de
    // "a penalização é desconhecida" — a não ser quando o próprio score prova
    // que ela foi zero. Só nesse caso o baseline é aceito, e o caso fica
    // marcado como inelegível para candidatas que mexem na curva de risco.
    penalty = 0;
    penaltyReconstruction = "ABSENT_AND_ZERO";
  } else {
    return {
      status: "REPLAY_INTEGRITY_FAILED",
      exclusions: [
        {
          code: "MISSING_EXECUTION_RISK",
          reason: `O score persistido difere do agregado em ${round(baseScore - frozen.persistedTotalScore)} ponto(s) e o snapshot não preserva o risco de execução que explicaria a diferença.`,
          missingHistoricalInput: "RecommendationMetric EXECUTION_RISK"
        }
      ]
    };
  }

  const reconstructedScore = round(clamp(baseScore - penalty));
  const scoreDelta = Math.abs(reconstructedScore - frozen.persistedTotalScore);
  if (scoreDelta > REPLAY_SCORE_TOLERANCE) {
    return {
      status: "REPLAY_INTEGRITY_FAILED",
      exclusions: [
        {
          code: "SCORE_MISMATCH",
          reason: `Reconstruído ${reconstructedScore} contra ${frozen.persistedTotalScore} persistido (diferença de ${round(scoreDelta)}, tolerância ${REPLAY_SCORE_TOLERANCE}).`
        }
      ]
    };
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

export interface ReweightedCandidate {
  championId: number;
  championName: string;
  category: string;
  baselineRank: number;
  baselineScore: number;
  candidateScore: number;
  candidateBaseScore: number;
  candidatePenalty: number;
  candidateDataCoverage: number;
  /** Pesos normalizados que produziram `candidateScore`. */
  candidateWeights: Record<CandidateWeightKey, number>;
}

/**
 * Aplica a configuração candidata a um candidato congelado.
 *
 * A disponibilidade continua sendo a **histórica**: desligar um sinal na
 * configuração pode removê-lo do score, mas ligá-lo não cria valor onde o
 * snapshot não tem nenhum. É por isso que `metricEnabled` é equivalente a
 * reponderação e não a uma fonte de dado nova.
 */
export function applyCandidateToFrozen(input: {
  frozen: FrozenCandidate;
  candidate: RecommendationEngineCandidate;
}): ReweightedCandidate {
  const { frozen, candidate } = input;

  const usable = (key: CandidateWeightKey) =>
    frozen.availability[key] && candidate.metricEnabled[key] === true;

  const coverage = CANDIDATE_WEIGHT_KEYS.reduce(
    (sum, key) => sum + (candidate.weights[key] > 0 && usable(key) ? candidate.weights[key] : 0),
    0
  );

  const candidateWeights = CANDIDATE_WEIGHT_KEYS.reduce(
    (result, key) => {
      result[key] =
        candidate.weights[key] > 0 && usable(key) && coverage > 0
          ? candidate.weights[key] / coverage
          : 0;
      return result;
    },
    {} as Record<CandidateWeightKey, number>
  );

  const candidateBaseScore = round(
    CANDIDATE_WEIGHT_KEYS.reduce(
      (score, key) => score + (frozen.metricValues[key] ?? 0) * candidateWeights[key],
      0
    )
  );
  const candidatePenalty =
    frozen.executionRisk === null
      ? 0
      : executionRiskPenalty(frozen.executionRisk, candidate.postAggregation);

  return {
    championId: frozen.championId,
    championName: frozen.championName,
    category: frozen.category,
    baselineRank: frozen.rank,
    baselineScore: frozen.persistedTotalScore,
    candidateScore: round(clamp(candidateBaseScore - candidatePenalty)),
    candidateBaseScore,
    candidatePenalty,
    candidateDataCoverage: coverage,
    candidateWeights
  };
}

/**
 * `true` quando a configuração mexe na curva de penalização. Casos cujo risco
 * não está congelado não podem avaliar essa mudança e precisam sair da amostra
 * em vez de responder como se a penalização fosse zero.
 */
export function candidateChangesPenaltyCurve(candidate: RecommendationEngineCandidate): boolean {
  return (
    candidate.postAggregation.executionRiskPenaltyStart !==
      OPERATIONAL_POST_AGGREGATION.executionRiskPenaltyStart ||
    candidate.postAggregation.executionRiskMaxPenalty !==
      OPERATIONAL_POST_AGGREGATION.executionRiskMaxPenalty
  );
}
