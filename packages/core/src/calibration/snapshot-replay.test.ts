import { describe, expect, it } from "vitest";
import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";
import type { RecommendationMetric } from "../types/recommendation-metric.js";
import {
  CALIBRATION_LAB_VERSION,
  OPERATIONAL_POST_AGGREGATION,
  WEIGHT_KEY_TO_METRIC,
  type CandidateWeightKey,
  type RecommendationEngineCandidate
} from "./engine-candidate.js";
import {
  REPLAY_SCORE_TOLERANCE,
  applyCandidateToFrozen,
  candidateChangesPenaltyCurve,
  executionRiskPenalty,
  extractFrozenCandidate,
  reconstructBaseline
} from "./snapshot-replay.js";

type ValueMap = Partial<Record<CandidateWeightKey, number | null>>;

function metric(key: RecommendationMetric["key"], value: number | null): RecommendationMetric {
  return value === null
    ? { key, value: null, status: "UNAVAILABLE", confidence: null, unavailableReason: "sem dado" }
    : { key, value, status: "AVAILABLE", confidence: null };
}

function persisted(input: {
  values: ValueMap;
  weights: Partial<Record<CandidateWeightKey, number>>;
  totalScore: number;
  executionRisk?: number | null;
  championId?: number;
  rank?: number;
  category?: string;
}): PersistedRecommendation {
  const metricDetails: RecommendationMetric[] = (
    Object.keys(WEIGHT_KEY_TO_METRIC) as CandidateWeightKey[]
  ).map((key) => metric(WEIGHT_KEY_TO_METRIC[key], input.values[key] ?? null));
  if (input.executionRisk !== null && input.executionRisk !== undefined) {
    metricDetails.push(metric("EXECUTION_RISK", input.executionRisk));
  }

  return {
    championId: input.championId ?? 1,
    championName: `Campeão ${input.championId ?? 1}`,
    rank: input.rank ?? 1,
    group: "PRIMARY",
    totalScore: input.totalScore,
    dataCoverage: 0.9,
    poolSource: "PERSONAL_OBSERVED",
    personalGames: 12,
    metricDetails,
    effectiveWeights: { ...input.weights },
    category: input.category ?? "comfort_pick",
    reasons: [],
    warnings: [],
    limitations: []
  };
}

/**
 * Caso conferido à mão:
 * 60*0.3 + 50*0.2 + 40*0.1 + 70*0.2 + 80*0.2 = 18 + 10 + 4 + 14 + 16 = 62
 */
const HAND_CHECKED_VALUES: ValueMap = {
  personalPerformance: 60,
  recentForm: 50,
  blindSafety: 40,
  allySynergy: 70,
  compositionFit: 80
};
const HAND_CHECKED_WEIGHTS = {
  personalPerformance: 0.3,
  recentForm: 0.2,
  blindSafety: 0.1,
  allySynergy: 0.2,
  compositionFit: 0.2
};

function candidate(
  overrides: Partial<RecommendationEngineCandidate> = {}
): RecommendationEngineCandidate {
  return {
    name: "c",
    labVersion: CALIBRATION_LAB_VERSION,
    supportedAggregationVersion: "1.0.0",
    weights: {
      personalPerformance: 1,
      recentForm: 0,
      matchup: 0,
      blindSafety: 0,
      allySynergy: 0,
      enemyDraftAnswer: 0,
      compositionFit: 0,
      meta: 0
    },
    metricEnabled: {
      personalPerformance: true,
      recentForm: true,
      matchup: true,
      blindSafety: true,
      allySynergy: true,
      enemyDraftAnswer: true,
      compositionFit: true,
      meta: true
    },
    postAggregation: { ...OPERATIONAL_POST_AGGREGATION },
    ...overrides
  };
}

describe("extractFrozenCandidate", () => {
  it("trata métrica indisponível como ausência de valor, nunca como zero", () => {
    const frozen = extractFrozenCandidate(
      persisted({ values: HAND_CHECKED_VALUES, weights: HAND_CHECKED_WEIGHTS, totalScore: 62 })
    );

    expect(frozen.metricValues.personalPerformance).toBe(60);
    expect(frozen.metricValues.matchup).toBeNull();
    expect(frozen.availability.matchup).toBe(false);
    expect(frozen.availability.personalPerformance).toBe(true);
  });

  it("preserva o risco de execução congelado quando existe", () => {
    const frozen = extractFrozenCandidate(
      persisted({
        values: HAND_CHECKED_VALUES,
        weights: HAND_CHECKED_WEIGHTS,
        totalScore: 58,
        executionRisk: 62.5
      })
    );

    expect(frozen.executionRisk).toBe(62.5);
  });
});

describe("executionRiskPenalty", () => {
  it("não penaliza risco no início da curva ou abaixo dele", () => {
    expect(executionRiskPenalty(25, OPERATIONAL_POST_AGGREGATION)).toBe(0);
    expect(executionRiskPenalty(10, OPERATIONAL_POST_AGGREGATION)).toBe(0);
  });

  it("penaliza proporcionalmente até o teto", () => {
    expect(executionRiskPenalty(62.5, OPERATIONAL_POST_AGGREGATION)).toBe(4);
    expect(executionRiskPenalty(100, OPERATIONAL_POST_AGGREGATION)).toBe(8);
  });
});

describe("reconstructBaseline", () => {
  it("reproduz o score persistido a partir somente do congelado", () => {
    const frozen = extractFrozenCandidate(
      persisted({
        values: HAND_CHECKED_VALUES,
        weights: HAND_CHECKED_WEIGHTS,
        totalScore: 62,
        executionRisk: 25
      })
    );
    const result = reconstructBaseline({ frozen, aggregationVersion: "1.0.0" });

    expect(result.status).toBe("EXACT_REPLAY");
    expect(result.reconstructedBaseScore).toBe(62);
    expect(result.reconstructedPenalty).toBe(0);
    expect(result.reconstructedScore).toBe(62);
    expect(result.penaltyReconstruction).toBe("FROM_FROZEN_RISK");
    expect(result.scoreDelta).toBeLessThanOrEqual(REPLAY_SCORE_TOLERANCE);
  });

  it("reconstrói a penalização de forma independente, não como resíduo", () => {
    const frozen = extractFrozenCandidate(
      persisted({
        values: HAND_CHECKED_VALUES,
        weights: HAND_CHECKED_WEIGHTS,
        totalScore: 58,
        executionRisk: 62.5
      })
    );
    const result = reconstructBaseline({ frozen, aggregationVersion: "1.0.0" });

    expect(result.status).toBe("EXACT_REPLAY");
    expect(result.reconstructedPenalty).toBe(4);
    expect(result.reconstructedScore).toBe(58);
  });

  it("falha a integridade quando o score persistido não é reproduzível", () => {
    const frozen = extractFrozenCandidate(
      persisted({
        values: HAND_CHECKED_VALUES,
        weights: HAND_CHECKED_WEIGHTS,
        totalScore: 71.4,
        executionRisk: 25
      })
    );
    const result = reconstructBaseline({ frozen, aggregationVersion: "1.0.0" });

    expect(result.status).toBe("REPLAY_INTEGRITY_FAILED");
    expect(result.exclusions[0]?.code).toBe("SCORE_MISMATCH");
    expect(result.reconstructedScore).toBeUndefined();
  });

  it("falha quando um sinal com peso não tem valor congelado, nomeando a métrica", () => {
    const frozen = extractFrozenCandidate(
      persisted({
        values: { ...HAND_CHECKED_VALUES, allySynergy: null },
        weights: HAND_CHECKED_WEIGHTS,
        totalScore: 62,
        executionRisk: 25
      })
    );
    const result = reconstructBaseline({ frozen, aggregationVersion: "1.0.0" });

    expect(result.status).toBe("REPLAY_INTEGRITY_FAILED");
    expect(result.exclusions[0]?.code).toBe("MISSING_WEIGHTED_METRIC");
    expect(result.exclusions[0]?.missingHistoricalInput).toBe("RecommendationMetric ALLY_SYNERGY");
  });

  it("falha quando os pesos efetivos não somam a normalização histórica", () => {
    const frozen = extractFrozenCandidate(
      persisted({
        values: HAND_CHECKED_VALUES,
        weights: { ...HAND_CHECKED_WEIGHTS, compositionFit: 0.4 },
        totalScore: 62,
        executionRisk: 25
      })
    );
    const result = reconstructBaseline({ frozen, aggregationVersion: "1.0.0" });

    expect(result.status).toBe("REPLAY_INTEGRITY_FAILED");
    expect(result.exclusions.some((entry) => entry.code === "NORMALIZATION_MISMATCH")).toBe(true);
  });

  it("marca como impossível quando o snapshot não preserva métricas", () => {
    const frozen = extractFrozenCandidate(
      persisted({ values: {}, weights: HAND_CHECKED_WEIGHTS, totalScore: 0 })
    );
    const result = reconstructBaseline({ frozen, aggregationVersion: "1.0.0" });

    expect(result.status).toBe("REPLAY_IMPOSSIBLE");
    expect(result.exclusions[0]?.missingHistoricalInput).toBe(
      "PersistedRecommendation.metricDetails"
    );
  });

  it("marca como impossível quando o snapshot não preserva os pesos efetivos", () => {
    const frozen = extractFrozenCandidate(
      persisted({ values: HAND_CHECKED_VALUES, weights: {}, totalScore: 62 })
    );
    const result = reconstructBaseline({ frozen, aggregationVersion: "1.0.0" });

    expect(result.status).toBe("REPLAY_IMPOSSIBLE");
    expect(result.exclusions[0]?.code).toBe("NO_EFFECTIVE_WEIGHTS");
  });

  it("recusa versão de agregação que não sabe reconstruir, em vez de tentar", () => {
    const frozen = extractFrozenCandidate(
      persisted({ values: HAND_CHECKED_VALUES, weights: HAND_CHECKED_WEIGHTS, totalScore: 62 })
    );
    const result = reconstructBaseline({ frozen, aggregationVersion: "2.0.0" });

    expect(result.status).toBe("UNSUPPORTED_AGGREGATION_VERSION");
  });

  it("aceita risco ausente somente quando o próprio score prova penalização zero", () => {
    const zero = reconstructBaseline({
      frozen: extractFrozenCandidate(
        persisted({
          values: HAND_CHECKED_VALUES,
          weights: HAND_CHECKED_WEIGHTS,
          totalScore: 62,
          executionRisk: null
        })
      ),
      aggregationVersion: "1.0.0"
    });
    const unknown = reconstructBaseline({
      frozen: extractFrozenCandidate(
        persisted({
          values: HAND_CHECKED_VALUES,
          weights: HAND_CHECKED_WEIGHTS,
          totalScore: 58,
          executionRisk: null
        })
      ),
      aggregationVersion: "1.0.0"
    });

    expect(zero.status).toBe("EXACT_REPLAY");
    expect(zero.penaltyReconstruction).toBe("ABSENT_AND_ZERO");
    expect(unknown.status).toBe("REPLAY_INTEGRITY_FAILED");
    expect(unknown.exclusions[0]?.code).toBe("MISSING_EXECUTION_RISK");
  });
});

describe("applyCandidateToFrozen", () => {
  it("reponderar usa somente as métricas congeladas", () => {
    const frozen = extractFrozenCandidate(
      persisted({
        values: HAND_CHECKED_VALUES,
        weights: HAND_CHECKED_WEIGHTS,
        totalScore: 62,
        executionRisk: 25
      })
    );
    const result = applyCandidateToFrozen({ frozen, candidate: candidate() });

    expect(result.candidateScore).toBe(60);
    expect(result.candidateWeights.personalPerformance).toBe(1);
    expect(result.baselineScore).toBe(62);
  });

  it("desligar um sinal redistribui o peso entre os restantes", () => {
    const frozen = extractFrozenCandidate(
      persisted({
        values: HAND_CHECKED_VALUES,
        weights: HAND_CHECKED_WEIGHTS,
        totalScore: 62,
        executionRisk: 25
      })
    );
    const configured = candidate({
      weights: {
        personalPerformance: 0.5,
        recentForm: 0.5,
        matchup: 0,
        blindSafety: 0,
        allySynergy: 0,
        enemyDraftAnswer: 0,
        compositionFit: 0,
        meta: 0
      }
    });
    const withBoth = applyCandidateToFrozen({ frozen, candidate: configured });
    const withoutRecentForm = applyCandidateToFrozen({
      frozen,
      candidate: {
        ...configured,
        metricEnabled: { ...configured.metricEnabled, recentForm: false }
      }
    });

    // (60 + 50) / 2 = 55; sem recentForm, personalPerformance leva o peso todo.
    expect(withBoth.candidateScore).toBe(55);
    expect(withoutRecentForm.candidateScore).toBe(60);
    expect(withoutRecentForm.candidateDataCoverage).toBe(0.5);
  });

  it("ligar um sinal indisponível no histórico não cria valor", () => {
    const frozen = extractFrozenCandidate(
      persisted({
        values: HAND_CHECKED_VALUES,
        weights: HAND_CHECKED_WEIGHTS,
        totalScore: 62,
        executionRisk: 25
      })
    );
    const result = applyCandidateToFrozen({
      frozen,
      candidate: candidate({
        weights: {
          personalPerformance: 0.5,
          recentForm: 0,
          matchup: 0.5,
          blindSafety: 0,
          allySynergy: 0,
          enemyDraftAnswer: 0,
          compositionFit: 0,
          meta: 0
        }
      })
    });

    // `matchup` está indisponível no snapshot: sai do score e o peso é
    // redistribuído, em vez de entrar como zero ou como neutro inventado.
    expect(result.candidateWeights.matchup).toBe(0);
    expect(result.candidateScore).toBe(60);
    expect(result.candidateDataCoverage).toBe(0.5);
  });

  it("aplica a curva de penalização da própria configuração", () => {
    const frozen = extractFrozenCandidate(
      persisted({
        values: HAND_CHECKED_VALUES,
        weights: HAND_CHECKED_WEIGHTS,
        totalScore: 58,
        executionRisk: 62.5
      })
    );
    const result = applyCandidateToFrozen({
      frozen,
      candidate: candidate({
        postAggregation: { ...OPERATIONAL_POST_AGGREGATION, executionRiskMaxPenalty: 16 }
      })
    });

    expect(result.candidatePenalty).toBe(8);
    expect(result.candidateScore).toBe(52);
  });
});

describe("candidateChangesPenaltyCurve", () => {
  it("distingue configuração que mexe na curva da que não mexe", () => {
    expect(candidateChangesPenaltyCurve(candidate())).toBe(false);
    expect(
      candidateChangesPenaltyCurve(
        candidate({
          postAggregation: { ...OPERATIONAL_POST_AGGREGATION, executionRiskPenaltyStart: 40 }
        })
      )
    ).toBe(true);
  });
});
