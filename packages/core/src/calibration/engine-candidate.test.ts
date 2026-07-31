import { describe, expect, it } from "vitest";
import {
  CALIBRATION_LAB_VERSION,
  CANDIDATE_WEIGHT_KEYS,
  MAX_PROMOTION_STATUS,
  OPERATIONAL_POST_AGGREGATION,
  REPLAY_CAPABILITY_REGISTRY,
  canonicalCandidateString,
  findReplayCapability,
  isReplayableCapability,
  validateEngineCandidate,
  type RecommendationEngineCandidate
} from "./engine-candidate.js";

function baseCandidate(
  overrides: Partial<RecommendationEngineCandidate> = {}
): RecommendationEngineCandidate {
  return {
    name: "candidata-teste",
    labVersion: CALIBRATION_LAB_VERSION,
    supportedAggregationVersion: "1.0.0",
    weights: {
      personalPerformance: 0.3,
      recentForm: 0.2,
      matchup: 0.1,
      blindSafety: 0.1,
      allySynergy: 0.1,
      enemyDraftAnswer: 0.1,
      compositionFit: 0.1,
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
      meta: false
    },
    postAggregation: { ...OPERATIONAL_POST_AGGREGATION },
    ...overrides
  };
}

describe("validateEngineCandidate", () => {
  it("aceita uma configuração que só mexe em pesos e regras pós-agregação", () => {
    const result = validateEngineCandidate(baseCandidate());

    expect(result.valid).toBe(true);
    expect(result.rejections).toEqual([]);
    expect(result.accepted.some((entry) => entry.parameter === "weights.personalPerformance")).toBe(
      true
    );
  });

  it("rejeita parâmetro que depende de input histórico ausente, nomeando a dependência", () => {
    const result = validateEngineCandidate(
      baseCandidate({ extraParameters: { minGamesForRanking: 3 } })
    );

    expect(result.valid).toBe(false);
    const rejection = result.rejections.find((entry) => entry.parameter === "minGamesForRanking");
    expect(rejection?.code).toBe("REQUIRES_HISTORICAL_DERIVATION_INPUT");
    expect(rejection?.missingHistoricalInputs).toEqual([
      "PlayerChampionStats.games no instante do draft"
    ]);
  });

  it("rejeita parâmetro não suportado sem inventar dependência histórica", () => {
    const result = validateEngineCandidate(
      baseCandidate({ extraParameters: { useMatchResultAsLabel: true } })
    );

    const rejection = result.rejections.find(
      (entry) => entry.parameter === "useMatchResultAsLabel"
    );
    expect(rejection?.code).toBe("UNSUPPORTED_PARAMETER");
    expect(rejection?.missingHistoricalInputs).toBeUndefined();
  });

  it("rejeita parâmetro fora do registro de capacidade", () => {
    const result = validateEngineCandidate(
      baseCandidate({ extraParameters: { parametroInventado: 1 } })
    );

    expect(result.rejections[0]?.code).toBe("UNKNOWN_PARAMETER");
  });

  it("rejeita peso negativo e peso não finito", () => {
    const negative = validateEngineCandidate(
      baseCandidate({ weights: { ...baseCandidate().weights, matchup: -0.1 } })
    );
    const infinite = validateEngineCandidate(
      baseCandidate({ weights: { ...baseCandidate().weights, matchup: Number.POSITIVE_INFINITY } })
    );

    expect(negative.rejections[0]?.code).toBe("INVALID_WEIGHT");
    expect(infinite.rejections[0]?.code).toBe("INVALID_WEIGHT");
  });

  it("rejeita configuração sem nenhum sinal habilitado com peso positivo", () => {
    const weights = Object.fromEntries(
      CANDIDATE_WEIGHT_KEYS.map((key) => [key, 0])
    ) as RecommendationEngineCandidate["weights"];
    const result = validateEngineCandidate(baseCandidate({ weights }));

    expect(result.rejections.some((entry) => entry.code === "NO_ENABLED_METRIC")).toBe(true);
  });

  it("rejeita versão de agregação que o laboratório não sabe reconstruir", () => {
    const result = validateEngineCandidate(baseCandidate({ supportedAggregationVersion: "9.9.9" }));

    expect(
      result.rejections.some((entry) => entry.code === "UNSUPPORTED_AGGREGATION_VERSION")
    ).toBe(true);
  });

  it("rejeita regra pós-agregação fora da faixa", () => {
    const result = validateEngineCandidate(
      baseCandidate({
        postAggregation: { ...OPERATIONAL_POST_AGGREGATION, minimumDataCoverageToRecommend: 1.5 }
      })
    );

    expect(
      result.rejections.some(
        (entry) => entry.parameter === "postAggregation.minimumDataCoverageToRecommend"
      )
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
  });

  it("classifica todo peso como reponderação exata", () => {
    for (const key of CANDIDATE_WEIGHT_KEYS) {
      expect(findReplayCapability(`weights.${key}`)?.capability).toBe("EXACT_REWEIGHT");
    }
  });

  it("nomeia a dependência histórica de todo parâmetro que exige uma", () => {
    const requiring = REPLAY_CAPABILITY_REGISTRY.filter(
      (entry) => entry.capability === "REQUIRES_HISTORICAL_DERIVATION_INPUT"
    );

    expect(requiring.length).toBeGreaterThan(0);
    for (const entry of requiring) {
      expect(entry.missingHistoricalInputs?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("considera reproduzível somente reponderação e pós-agregação", () => {
    expect(isReplayableCapability("EXACT_REWEIGHT")).toBe(true);
    expect(isReplayableCapability("EXACT_POST_AGGREGATION")).toBe(true);
    expect(isReplayableCapability("REQUIRES_HISTORICAL_DERIVATION_INPUT")).toBe(false);
    expect(isReplayableCapability("UNSUPPORTED")).toBe(false);
  });
});

describe("canonicalCandidateString", () => {
  it("produz a mesma string independentemente da ordem dos parâmetros extras", () => {
    const first = canonicalCandidateString(
      baseCandidate({ extraParameters: { primaryCount: 5, alternativeCount: 3 } })
    );
    const second = canonicalCandidateString(
      baseCandidate({ extraParameters: { alternativeCount: 3, primaryCount: 5 } })
    );

    expect(first).toBe(second);
  });

  it("muda quando um peso muda", () => {
    const before = canonicalCandidateString(baseCandidate());
    const after = canonicalCandidateString(
      baseCandidate({ weights: { ...baseCandidate().weights, matchup: 0.2 } })
    );

    expect(before).not.toBe(after);
  });

  it("ignora o nome da configuração, que não altera o resultado do experimento", () => {
    expect(canonicalCandidateString(baseCandidate({ name: "a" }))).toBe(
      canonicalCandidateString(baseCandidate({ name: "b" }))
    );
  });
});

describe("promoção", () => {
  it("não expressa nenhum estado acima de aprovado para versão futura", () => {
    expect(MAX_PROMOTION_STATUS).toBe("APPROVED_FOR_FUTURE_RELEASE");
  });
});
