import { describe, expect, it } from "vitest";
import {
  CALIBRATION_LAB_VERSION,
  MAX_PROMOTION_STATUS,
  OPERATIONAL_POST_AGGREGATION_THRESHOLDS,
  REPLAY_CAPABILITY_REGISTRY,
  WEIGHTABLE_METRIC_KEYS,
  canonicalCandidateString,
  findReplayCapability,
  isReplayableCapability,
  resolvePostAggregationThresholds,
  validateCalibrationCandidate,
  type CalibrationCandidate
} from "./engine-candidate.js";

function candidate(overrides: Partial<CalibrationCandidate> = {}): CalibrationCandidate {
  return {
    id: "cand-1",
    name: "candidata-teste",
    baselineAggregationVersion: "1.0.0",
    candidateVersion: "1.0.0",
    metricWeights: {
      PERSONAL_PERFORMANCE: 0.3,
      RECENT_FORM: 0.2,
      PERSONAL_MATCHUP: 0.1,
      BLIND_SAFETY: 0.1,
      ALLY_SYNERGY: 0.1,
      ENEMY_COMPOSITION_ANSWER: 0.1,
      TEAM_COMPOSITION: 0.1
    },
    status: "DRAFT",
    ...overrides
  };
}

describe("validateCalibrationCandidate", () => {
  it("aceita configuração que só mexe em pesos de métricas congeladas", () => {
    const result = validateCalibrationCandidate(candidate());

    expect(result.valid).toBe(true);
    expect(result.rejections).toEqual([]);
    expect(
      result.accepted.every((entry) => isReplayableCapability(entry.capability))
    ).toBe(true);
  });

  it("aceita threshold estritamente pós-agregação", () => {
    const result = validateCalibrationCandidate(
      candidate({ postAggregationThresholds: { primaryCount: 3 } })
    );

    expect(result.valid).toBe(true);
    expect(result.accepted).toContainEqual({
      parameter: "primaryCount",
      capability: "EXACT_POST_AGGREGATION"
    });
  });

  it("trata exclusão de métrica congelada como reponderação", () => {
    const result = validateCalibrationCandidate(
      candidate({ disabledMetrics: ["PERSONAL_MATCHUP"] })
    );

    expect(result.valid).toBe(true);
    expect(result.accepted).toContainEqual({
      parameter: "disabledMetrics.PERSONAL_MATCHUP",
      capability: "EXACT_REWEIGHT"
    });
  });

  it("rejeita métrica desconhecida do score congelado", () => {
    const result = validateCalibrationCandidate(
      candidate({ metricWeights: { ...candidate().metricWeights, CHAMPION_DIFFICULTY: 0.2 } })
    );

    expect(result.valid).toBe(false);
    expect(result.rejections[0]?.code).toBe("UNKNOWN_METRIC");
  });

  it("rejeita peso negativo sem normalizar em silêncio", () => {
    const result = validateCalibrationCandidate(
      candidate({ metricWeights: { ...candidate().metricWeights, PERSONAL_MATCHUP: -0.1 } })
    );

    expect(result.valid).toBe(false);
    expect(result.rejections[0]?.code).toBe("NEGATIVE_WEIGHT");
  });

  it("rejeita valor não finito", () => {
    const infinite = validateCalibrationCandidate(
      candidate({
        metricWeights: { ...candidate().metricWeights, RECENT_FORM: Number.POSITIVE_INFINITY }
      })
    );
    const notANumber = validateCalibrationCandidate(
      candidate({ postAggregationThresholds: { primaryCount: Number.NaN } })
    );

    expect(infinite.rejections[0]?.code).toBe("NON_FINITE_VALUE");
    expect(notANumber.rejections[0]?.code).toBe("NON_FINITE_VALUE");
  });

  it("rejeita configuração sem nenhum componente disponível", () => {
    const zeroed = validateCalibrationCandidate(candidate({ metricWeights: { META_STRENGTH: 0 } }));
    const allDisabled = validateCalibrationCandidate(
      candidate({ disabledMetrics: [...WEIGHTABLE_METRIC_KEYS] })
    );

    expect(zeroed.rejections.some((entry) => entry.code === "NO_AVAILABLE_COMPONENT")).toBe(true);
    expect(allDisabled.rejections.some((entry) => entry.code === "NO_AVAILABLE_COMPONENT")).toBe(
      true
    );
  });

  it("rejeita threshold não suportado", () => {
    const result = validateCalibrationCandidate(
      candidate({ postAggregationThresholds: { limiarInventado: 3 } })
    );

    expect(result.rejections[0]?.code).toBe("UNSUPPORTED_THRESHOLD");
  });

  it("rejeita threshold fora da faixa declarada", () => {
    const result = validateCalibrationCandidate(
      candidate({ postAggregationThresholds: { minimumDataCoverageToRecommend: 1.5 } })
    );

    expect(result.rejections[0]?.code).toBe("THRESHOLD_OUT_OF_RANGE");
  });

  it("rejeita parâmetro que altera a derivação, nomeando a dependência ausente", () => {
    const result = validateCalibrationCandidate(
      candidate({ postAggregationThresholds: { minGamesForRanking: 3 } })
    );

    const rejection = result.rejections.find((entry) => entry.parameter === "minGamesForRanking");
    expect(rejection?.code).toBe("DERIVATION_PARAMETER");
    expect(rejection?.capability).toBe("REQUIRES_HISTORICAL_DERIVATION_INPUT");
    expect(rejection?.missingHistoricalInputs).toEqual([
      "PlayerChampionStats.games no instante do draft"
    ]);
  });

  it("rejeita todo parâmetro da lista proibida pelo escopo", () => {
    const forbidden = [
      "poolFormation",
      "snapshotCandidateCount",
      "metricAvailabilityOverride",
      "personalPerformanceFormula",
      "maxFamiliarityRiskRelief",
      "executionRiskDerivation",
      "matchupShrinkageK",
      "championTagDerivation",
      "capabilityExtraction",
      "strategyDimensionWeights",
      "provenancePolicy"
    ];

    for (const parameter of forbidden) {
      const result = validateCalibrationCandidate(
        candidate({ postAggregationThresholds: { [parameter]: 1 } })
      );
      expect(result.valid, parameter).toBe(false);
      expect(result.rejections[0]?.code, parameter).toBe("DERIVATION_PARAMETER");
    }
  });

  it("rejeita parâmetro explicitamente não suportado sem inventar dependência", () => {
    const result = validateCalibrationCandidate(
      candidate({ postAggregationThresholds: { useMatchResultAsLabel: 1 } })
    );

    expect(result.rejections[0]?.code).toBe("UNSUPPORTED_PARAMETER");
    expect(result.rejections[0]?.missingHistoricalInputs).toBeUndefined();
  });

  it("rejeita versão de agregação que o laboratório não sabe reconstruir", () => {
    const result = validateCalibrationCandidate(
      candidate({ baselineAggregationVersion: "9.9.9" })
    );

    expect(
      result.rejections.some((entry) => entry.code === "UNSUPPORTED_AGGREGATION_VERSION")
    ).toBe(true);
  });
});

describe("registro de capacidade de replay", () => {
  it("separa a curva de penalização (pós-agregação) da derivação do risco", () => {
    expect(findReplayCapability("executionRiskPenaltyStart")?.capability).toBe(
      "EXACT_POST_AGGREGATION"
    );
    expect(findReplayCapability("executionRiskMaxPenalty")?.capability).toBe(
      "EXACT_POST_AGGREGATION"
    );
    expect(findReplayCapability("maxFamiliarityRiskRelief")?.capability).toBe(
      "REQUIRES_HISTORICAL_DERIVATION_INPUT"
    );
    expect(findReplayCapability("executionRiskDerivation")?.capability).toBe(
      "REQUIRES_HISTORICAL_DERIVATION_INPUT"
    );
  });

  it("classifica todo peso de métrica congelada como reponderação exata", () => {
    for (const metric of WEIGHTABLE_METRIC_KEYS) {
      expect(findReplayCapability(`metricWeights.${metric}`)?.capability).toBe("EXACT_REWEIGHT");
    }
  });

  it("nomeia a dependência histórica de todo parâmetro que exige uma", () => {
    const requiring = REPLAY_CAPABILITY_REGISTRY.filter(
      (entry) => entry.capability === "REQUIRES_HISTORICAL_DERIVATION_INPUT"
    );

    expect(requiring.length).toBeGreaterThan(0);
    for (const entry of requiring) {
      expect(entry.missingHistoricalInputs?.length ?? 0, entry.parameter).toBeGreaterThan(0);
    }
  });

  it("considera reproduzível somente reponderação e pós-agregação", () => {
    expect(isReplayableCapability("EXACT_REWEIGHT")).toBe(true);
    expect(isReplayableCapability("EXACT_POST_AGGREGATION")).toBe(true);
    expect(isReplayableCapability("REQUIRES_HISTORICAL_DERIVATION_INPUT")).toBe(false);
    expect(isReplayableCapability("UNSUPPORTED")).toBe(false);
  });
});

describe("resolvePostAggregationThresholds", () => {
  it("não altera a configuração operacional ao resolver a candidata", () => {
    const before = { ...OPERATIONAL_POST_AGGREGATION_THRESHOLDS };
    const resolved = resolvePostAggregationThresholds(
      candidate({ postAggregationThresholds: { primaryCount: 2 } })
    );

    expect(resolved.primaryCount).toBe(2);
    expect(resolved.alternativeCount).toBe(before.alternativeCount);
    expect(OPERATIONAL_POST_AGGREGATION_THRESHOLDS).toEqual(before);
  });
});

describe("canonicalCandidateString", () => {
  it("ignora identidade, nome, descrição e status", () => {
    expect(
      canonicalCandidateString(candidate({ id: "a", name: "a", status: "DRAFT" }))
    ).toBe(
      canonicalCandidateString(
        candidate({ id: "b", name: "b", description: "outra", status: "EVALUATED" })
      )
    );
  });

  it("independe da ordem de declaração de pesos e métricas desligadas", () => {
    const first = canonicalCandidateString(
      candidate({
        metricWeights: { RECENT_FORM: 0.5, PERSONAL_PERFORMANCE: 0.5 },
        disabledMetrics: ["META_STRENGTH", "PERSONAL_MATCHUP"]
      })
    );
    const second = canonicalCandidateString(
      candidate({
        metricWeights: { PERSONAL_PERFORMANCE: 0.5, RECENT_FORM: 0.5 },
        disabledMetrics: ["PERSONAL_MATCHUP", "META_STRENGTH"]
      })
    );

    expect(first).toBe(second);
  });

  it("muda quando um peso ou threshold muda", () => {
    const base = canonicalCandidateString(candidate());
    expect(
      canonicalCandidateString(
        candidate({ metricWeights: { ...candidate().metricWeights, PERSONAL_MATCHUP: 0.2 } })
      )
    ).not.toBe(base);
    expect(
      canonicalCandidateString(candidate({ postAggregationThresholds: { primaryCount: 3 } }))
    ).not.toBe(base);
  });

  it("declara a versão do laboratório", () => {
    expect(canonicalCandidateString(candidate())).toContain(CALIBRATION_LAB_VERSION);
  });
});

describe("promoção", () => {
  it("não expressa nenhum estado acima de aprovado para versão futura", () => {
    expect(MAX_PROMOTION_STATUS).toBe("APPROVED_FOR_FUTURE_RELEASE");
  });
});
