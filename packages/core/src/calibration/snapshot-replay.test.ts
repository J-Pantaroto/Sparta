import { describe, expect, it } from "vitest";
import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";
import type { RecommendationMetric, RecommendationMetricKey } from "../types/recommendation-metric.js";
import {
  ENGINE_WEIGHT_KEYS,
  OPERATIONAL_POST_AGGREGATION_THRESHOLDS,
  WEIGHT_KEY_TO_METRIC,
  type CalibrationCandidate,
  type EngineWeightKey
} from "./engine-candidate.js";
import {
  REPLAY_SCORE_TOLERANCE,
  applyCandidateToFrozen,
  candidateChangesPenaltyCurve,
  executionRiskPenalty,
  extractFrozenCandidate,
  reconstructBaseline
} from "./snapshot-replay.js";

type ValueMap = Partial<Record<EngineWeightKey, number | null>>;

function metric(key: RecommendationMetricKey, value: number | null): RecommendationMetric {
  return value === null
    ? { key, value: null, status: "UNAVAILABLE", confidence: null, unavailableReason: "sem dado" }
    : { key, value, status: "AVAILABLE", confidence: null };
}

function persisted(input: {
  values: ValueMap;
  weights: Partial<Record<EngineWeightKey, number>>;
  totalScore: number;
  executionRisk?: number | null;
  championId?: number;
  rank?: number;
  category?: string;
}): PersistedRecommendation {
  const metricDetails: RecommendationMetric[] = ENGINE_WEIGHT_KEYS.map((key) =>
    metric(WEIGHT_KEY_TO_METRIC[key], input.values[key] ?? null)
  );
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
const VALUES: ValueMap = {
  personalPerformance: 60,
  recentForm: 50,
  blindSafety: 40,
  allySynergy: 70,
  compositionFit: 80
};
const WEIGHTS = {
  personalPerformance: 0.3,
  recentForm: 0.2,
  blindSafety: 0.1,
  allySynergy: 0.2,
  compositionFit: 0.2
};

function candidate(overrides: Partial<CalibrationCandidate> = {}): CalibrationCandidate {
  return {
    id: "c",
    name: "c",
    baselineAggregationVersion: "1.0.0",
    candidateVersion: "1.0.0",
    metricWeights: { PERSONAL_PERFORMANCE: 1 },
    status: "READY",
    ...overrides
  };
}

function frozenOf(input: Parameters<typeof persisted>[0]) {
  return extractFrozenCandidate(persisted(input));
}

describe("extractFrozenCandidate", () => {
  it("trata métrica indisponível como ausência de valor, nunca como zero", () => {
    const frozen = frozenOf({ values: VALUES, weights: WEIGHTS, totalScore: 62 });

    expect(frozen.metricValues.personalPerformance).toBe(60);
    expect(frozen.metricValues.matchup).toBeNull();
    expect(frozen.availability.matchup).toBe(false);
    expect(frozen.availability.personalPerformance).toBe(true);
  });

  it("preserva o risco de execução congelado quando existe", () => {
    const frozen = frozenOf({
      values: VALUES,
      weights: WEIGHTS,
      totalScore: 58,
      executionRisk: 62.5
    });

    expect(frozen.executionRisk).toBe(62.5);
  });

  it("não altera o snapshot histórico recebido", () => {
    const snapshot = persisted({ values: VALUES, weights: WEIGHTS, totalScore: 62 });
    const copy = JSON.parse(JSON.stringify(snapshot));

    extractFrozenCandidate(snapshot);

    expect(snapshot).toEqual(copy);
  });
});

describe("executionRiskPenalty", () => {
  it("não penaliza risco no início da curva ou abaixo dele", () => {
    expect(executionRiskPenalty(25)).toBe(0);
    expect(executionRiskPenalty(10)).toBe(0);
  });

  it("penaliza proporcionalmente até o teto", () => {
    expect(executionRiskPenalty(62.5)).toBe(4);
    expect(executionRiskPenalty(100)).toBe(8);
  });
});

describe("reconstructBaseline", () => {
  it("reproduz o score persistido a partir somente do congelado", () => {
    const result = reconstructBaseline({
      frozen: frozenOf({ values: VALUES, weights: WEIGHTS, totalScore: 62, executionRisk: 25 }),
      aggregationVersion: "1.0.0"
    });

    expect(result.status).toBe("EXACT_REPLAY");
    expect(result.reconstructedBaseScore).toBe(62);
    expect(result.reconstructedPenalty).toBe(0);
    expect(result.reconstructedScore).toBe(62);
    expect(result.penaltyReconstruction).toBe("FROM_FROZEN_RISK");
    expect(result.scoreDelta).toBeLessThanOrEqual(REPLAY_SCORE_TOLERANCE);
  });

  it("reconstrói a penalização de forma independente, não como resíduo", () => {
    const result = reconstructBaseline({
      frozen: frozenOf({ values: VALUES, weights: WEIGHTS, totalScore: 58, executionRisk: 62.5 }),
      aggregationVersion: "1.0.0"
    });

    expect(result.status).toBe("EXACT_REPLAY");
    expect(result.reconstructedPenalty).toBe(4);
    expect(result.reconstructedScore).toBe(58);
  });

  it("falha a integridade quando o score persistido não é reproduzível", () => {
    const result = reconstructBaseline({
      frozen: frozenOf({ values: VALUES, weights: WEIGHTS, totalScore: 71.4, executionRisk: 25 }),
      aggregationVersion: "1.0.0"
    });

    expect(result.status).toBe("REPLAY_INTEGRITY_FAILED");
    expect(result.exclusions[0]?.code).toBe("SCORE_MISMATCH");
    expect(result.reconstructedScore).toBeUndefined();
  });

  it("falha por normalização histórica divergente", () => {
    const result = reconstructBaseline({
      frozen: frozenOf({
        values: VALUES,
        weights: { ...WEIGHTS, compositionFit: 0.4 },
        totalScore: 62,
        executionRisk: 25
      }),
      aggregationVersion: "1.0.0"
    });

    expect(result.status).toBe("REPLAY_INTEGRITY_FAILED");
    expect(result.exclusions.some((entry) => entry.code === "NORMALIZATION_MISMATCH")).toBe(true);
  });

  it("classifica ausência de métrica ponderada como input histórico faltante", () => {
    const result = reconstructBaseline({
      frozen: frozenOf({
        values: { ...VALUES, allySynergy: null },
        weights: WEIGHTS,
        totalScore: 62,
        executionRisk: 25
      }),
      aggregationVersion: "1.0.0"
    });

    expect(result.status).toBe("REPLAY_MISSING_HISTORICAL_INPUT");
    expect(result.exclusions[0]?.code).toBe("MISSING_WEIGHTED_METRIC");
    expect(result.exclusions[0]?.missingHistoricalInput).toBe("RecommendationMetric ALLY_SYNERGY");
  });

  it("classifica snapshot sem métricas e sem pesos como input histórico faltante", () => {
    const semMetricas = reconstructBaseline({
      frozen: frozenOf({ values: {}, weights: WEIGHTS, totalScore: 0 }),
      aggregationVersion: "1.0.0"
    });
    const semPesos = reconstructBaseline({
      frozen: frozenOf({ values: VALUES, weights: {}, totalScore: 62 }),
      aggregationVersion: "1.0.0"
    });

    expect(semMetricas.status).toBe("REPLAY_MISSING_HISTORICAL_INPUT");
    expect(semMetricas.exclusions[0]?.missingHistoricalInput).toBe(
      "PersistedRecommendation.metricDetails"
    );
    expect(semPesos.status).toBe("REPLAY_MISSING_HISTORICAL_INPUT");
    expect(semPesos.exclusions[0]?.code).toBe("NO_EFFECTIVE_WEIGHTS");
  });

  it("recusa versão de agregação que não sabe reconstruir, em vez de tentar", () => {
    const result = reconstructBaseline({
      frozen: frozenOf({ values: VALUES, weights: WEIGHTS, totalScore: 62 }),
      aggregationVersion: "2.0.0"
    });

    expect(result.status).toBe("REPLAY_UNSUPPORTED_VERSION");
  });

  it("aceita risco ausente somente quando o próprio score prova penalização zero", () => {
    const zero = reconstructBaseline({
      frozen: frozenOf({
        values: VALUES,
        weights: WEIGHTS,
        totalScore: 62,
        executionRisk: null
      }),
      aggregationVersion: "1.0.0"
    });
    const desconhecida = reconstructBaseline({
      frozen: frozenOf({
        values: VALUES,
        weights: WEIGHTS,
        totalScore: 58,
        executionRisk: null
      }),
      aggregationVersion: "1.0.0"
    });

    expect(zero.status).toBe("EXACT_REPLAY");
    expect(zero.penaltyReconstruction).toBe("ABSENT_AND_PROVEN_ZERO");
    expect(desconhecida.status).toBe("REPLAY_MISSING_HISTORICAL_INPUT");
    expect(desconhecida.exclusions[0]?.code).toBe("MISSING_EXECUTION_RISK");
  });
});

describe("applyCandidateToFrozen", () => {
  const frozen = () =>
    frozenOf({ values: VALUES, weights: WEIGHTS, totalScore: 62, executionRisk: 25 });

  it("reponderar usa somente as métricas congeladas", () => {
    const result = applyCandidateToFrozen({
      frozen: frozen(),
      candidate: candidate(),
      reconstructedScore: 62
    });

    expect(result.candidateScore).toBe(60);
    expect(result.candidateWeights.PERSONAL_PERFORMANCE).toBe(1);
    expect(result.baselineScore).toBe(62);
    expect(result.reconstructedScore).toBe(62);
  });

  it("preserva cobertura original e candidata separadas", () => {
    const result = applyCandidateToFrozen({
      frozen: frozen(),
      candidate: candidate({
        metricWeights: { PERSONAL_PERFORMANCE: 0.5, RECENT_FORM: 0.5 }
      }),
      reconstructedScore: 62
    });

    expect(result.baselineDataCoverage).toBe(0.9);
    expect(result.candidateDataCoverage).toBe(1);
  });

  it("desligar um sinal redistribui o peso e registra o motivo", () => {
    const configured = candidate({
      metricWeights: { PERSONAL_PERFORMANCE: 0.5, RECENT_FORM: 0.5 }
    });
    const comAmbos = applyCandidateToFrozen({
      frozen: frozen(),
      candidate: configured,
      reconstructedScore: 62
    });
    const semForma = applyCandidateToFrozen({
      frozen: frozen(),
      candidate: { ...configured, disabledMetrics: ["RECENT_FORM"] },
      reconstructedScore: 62
    });

    // (60 + 50) / 2 = 55; sem a forma recente, o desempenho leva o peso todo.
    expect(comAmbos.candidateScore).toBe(55);
    expect(semForma.candidateScore).toBe(60);
    expect(semForma.candidateDataCoverage).toBe(0.5);
    expect(semForma.differenceReasons.some((entry) => entry.code === "METRIC_DISABLED")).toBe(true);
  });

  it("métrica indisponível no histórico não recebe peso efetivo nem valor substituto", () => {
    const result = applyCandidateToFrozen({
      frozen: frozen(),
      candidate: candidate({
        metricWeights: { PERSONAL_PERFORMANCE: 0.5, PERSONAL_MATCHUP: 0.5 }
      }),
      reconstructedScore: 62
    });

    expect(result.candidateWeights.PERSONAL_MATCHUP).toBeUndefined();
    expect(result.usedMetricValues.PERSONAL_MATCHUP).toBeUndefined();
    expect(result.candidateScore).toBe(60);
    expect(result.candidateDataCoverage).toBe(0.5);
    expect(
      result.differenceReasons.some((entry) => entry.code === "METRIC_UNAVAILABLE_HISTORICALLY")
    ).toBe(true);
  });

  it("aplica a curva de penalização da própria configuração e registra a diferença", () => {
    const result = applyCandidateToFrozen({
      frozen: frozenOf({
        values: VALUES,
        weights: WEIGHTS,
        totalScore: 58,
        executionRisk: 62.5
      }),
      candidate: candidate({ postAggregationThresholds: { executionRiskMaxPenalty: 16 } }),
      reconstructedScore: 58
    });

    expect(result.candidatePenalty).toBe(8);
    expect(result.candidateScore).toBe(52);
    expect(
      result.differenceReasons.some((entry) => entry.code === "PENALTY_CURVE_CHANGED")
    ).toBe(true);
  });

  it("não consulta estado atual: o mesmo congelado produz sempre o mesmo resultado", () => {
    const first = applyCandidateToFrozen({
      frozen: frozen(),
      candidate: candidate(),
      reconstructedScore: 62
    });
    const second = applyCandidateToFrozen({
      frozen: frozen(),
      candidate: candidate(),
      reconstructedScore: 62
    });

    expect(first).toEqual(second);
  });
});

describe("candidateChangesPenaltyCurve", () => {
  it("distingue configuração que mexe na curva da que não mexe", () => {
    expect(candidateChangesPenaltyCurve(candidate())).toBe(false);
    expect(
      candidateChangesPenaltyCurve(
        candidate({ postAggregationThresholds: { executionRiskPenaltyStart: 40 } })
      )
    ).toBe(true);
    expect(
      candidateChangesPenaltyCurve(
        candidate({
          postAggregationThresholds: {
            executionRiskPenaltyStart:
              OPERATIONAL_POST_AGGREGATION_THRESHOLDS.executionRiskPenaltyStart
          }
        })
      )
    ).toBe(false);
  });
});
