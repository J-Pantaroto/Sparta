import { describe, expect, it } from "vitest";
import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";
import type { RecommendationMetric } from "../types/recommendation-metric.js";
import {
  CALIBRATION_LAB_VERSION,
  OPERATIONAL_POST_AGGREGATION,
  type RecommendationEngineCandidate
} from "./engine-candidate.js";
import {
  canonicalExperimentInputString,
  coverageBand,
  replaySnapshotCase,
  summarizeCalibrationExperiment,
  type ReplayCaseInput,
  type ReplayCaseResult
} from "./ranking-comparison.js";

function persisted(input: {
  championId: number;
  rank: number;
  category: string;
  personalPerformance: number;
  compositionFit: number;
  totalScore: number;
  executionRisk?: number | null;
}): PersistedRecommendation {
  const metricDetails: RecommendationMetric[] = [
    {
      key: "PERSONAL_PERFORMANCE",
      value: input.personalPerformance,
      status: "AVAILABLE",
      confidence: null
    },
    { key: "TEAM_COMPOSITION", value: input.compositionFit, status: "AVAILABLE", confidence: null }
  ];
  if (input.executionRisk !== null && input.executionRisk !== undefined) {
    metricDetails.push({
      key: "EXECUTION_RISK",
      value: input.executionRisk,
      status: "AVAILABLE",
      confidence: null
    });
  }

  return {
    championId: input.championId,
    championName: `Campeão ${input.championId}`,
    rank: input.rank,
    group: "PRIMARY",
    totalScore: input.totalScore,
    dataCoverage: 0.95,
    poolSource: "PERSONAL_OBSERVED",
    personalGames: 10,
    metricDetails,
    effectiveWeights: { personalPerformance: 0.5, compositionFit: 0.5 },
    category: input.category,
    reasons: [],
    warnings: [],
    limitations: []
  };
}

/** A vence no baseline (60 × 55) e perde quando só a composição pesa (40 × 70). */
const CONFORTAVEL = persisted({
  championId: 1,
  rank: 1,
  category: "comfort_pick",
  personalPerformance: 80,
  compositionFit: 40,
  totalScore: 60,
  executionRisk: 25
});
const ESTRATEGICO = persisted({
  championId: 2,
  rank: 2,
  category: "strategic_option",
  personalPerformance: 40,
  compositionFit: 70,
  totalScore: 55,
  executionRisk: 25
});

function caseInput(overrides: Partial<ReplayCaseInput> = {}): ReplayCaseInput {
  return {
    draftSessionId: "sessao-1",
    snapshotId: "snapshot-1",
    role: "JUNGLE",
    patch: "26.14",
    aggregationVersion: "1.0.0",
    recommendations: [CONFORTAVEL, ESTRATEGICO],
    ...overrides
  };
}

function candidate(
  overrides: Partial<RecommendationEngineCandidate> = {}
): RecommendationEngineCandidate {
  return {
    name: "só-composição",
    labVersion: CALIBRATION_LAB_VERSION,
    supportedAggregationVersion: "1.0.0",
    weights: {
      personalPerformance: 0,
      recentForm: 0,
      matchup: 0,
      blindSafety: 0,
      allySynergy: 0,
      enemyDraftAnswer: 0,
      compositionFit: 1,
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

describe("replaySnapshotCase", () => {
  it("compara o ranking reponderado contra a linha de base histórica", () => {
    const result = replaySnapshotCase({ caseInput: caseInput(), candidate: candidate() });

    expect(result.status).toBe("EXACT_REPLAY");
    expect(result.comparison?.top1Preserved).toBe(false);
    expect(result.comparison?.meanRankDisplacement).toBe(1);
    expect(result.comparison?.maxRankDisplacement).toBe(1);
    expect(result.comparison?.promoted.map((entry) => entry.championId)).toEqual([2]);
    expect(result.comparison?.demoted.map((entry) => entry.championId)).toEqual([1]);
  });

  it("conta inversão entre pick de conforto e opção estratégica", () => {
    const result = replaySnapshotCase({ caseInput: caseInput(), candidate: candidate() });

    expect(result.comparison?.comfortStrategicInversions).toBe(1);
  });

  it("não conta inversão quando a ordem relativa é preservada", () => {
    const result = replaySnapshotCase({
      caseInput: caseInput(),
      candidate: candidate({
        weights: { ...candidate().weights, compositionFit: 0, personalPerformance: 1 }
      })
    });

    expect(result.comparison?.top1Preserved).toBe(true);
    expect(result.comparison?.comfortStrategicInversions).toBe(0);
    expect(result.comparison?.meanRankDisplacement).toBe(0);
  });

  it("registra quando a escolha real entra no grupo recomendado", () => {
    const result = replaySnapshotCase({
      caseInput: caseInput({ selectedChampionId: 2 }),
      candidate: candidate({
        postAggregation: { ...OPERATIONAL_POST_AGGREGATION, primaryCount: 1 }
      })
    });

    expect(result.comparison?.realChoice).toEqual({
      championId: 2,
      baselineRank: 2,
      candidateRank: 1,
      enteredRecommendations: true,
      leftRecommendations: false
    });
  });

  it("registra quando a escolha real sai do grupo recomendado", () => {
    const result = replaySnapshotCase({
      caseInput: caseInput({ selectedChampionId: 1 }),
      candidate: candidate({
        postAggregation: { ...OPERATIONAL_POST_AGGREGATION, primaryCount: 1 }
      })
    });

    expect(result.comparison?.realChoice?.leftRecommendations).toBe(true);
    expect(result.comparison?.realChoice?.enteredRecommendations).toBe(false);
  });

  it("exclui o caso inteiro quando um único candidato falha a integridade", () => {
    const quebrado = { ...ESTRATEGICO, totalScore: 91.2 };
    const result = replaySnapshotCase({
      caseInput: caseInput({ recommendations: [CONFORTAVEL, quebrado] }),
      candidate: candidate()
    });

    expect(result.status).toBe("REPLAY_INTEGRITY_FAILED");
    expect(result.comparison).toBeUndefined();
    expect(result.exclusions[0]?.code).toBe("SCORE_MISMATCH");
  });

  it("exclui o caso quando a configuração muda a curva de risco e o risco não está congelado", () => {
    const semRisco = persisted({
      championId: 3,
      rank: 3,
      category: "safe_pick",
      personalPerformance: 50,
      compositionFit: 50,
      totalScore: 50,
      executionRisk: null
    });
    const result = replaySnapshotCase({
      caseInput: caseInput({ recommendations: [CONFORTAVEL, semRisco] }),
      candidate: candidate({
        postAggregation: { ...OPERATIONAL_POST_AGGREGATION, executionRiskPenaltyStart: 40 }
      })
    });

    expect(result.status).toBe("REPLAY_INTEGRITY_FAILED");
    expect(result.exclusions[0]?.code).toBe("PENALTY_NOT_REPRODUCIBLE");
    expect(result.exclusions[0]?.missingHistoricalInput).toBe(
      "RecommendationMetric EXECUTION_RISK"
    );
  });

  it("marca como impossível o snapshot sem candidatos", () => {
    const result = replaySnapshotCase({
      caseInput: caseInput({ recommendations: [] }),
      candidate: candidate()
    });

    expect(result.status).toBe("REPLAY_IMPOSSIBLE");
  });

  it("preserva a referência da avaliação humana pré-partida sem exigir resultado", () => {
    const result = replaySnapshotCase({
      caseInput: caseInput({
        preMatchReview: { reviewId: "r1", overallRating: "ADEQUATE", issueTags: ["COBERTURA"] }
      }),
      candidate: candidate()
    });

    expect(result.preMatchReview?.reviewId).toBe("r1");
  });
});

describe("summarizeCalibrationExperiment", () => {
  function results(): ReplayCaseResult[] {
    const jungle = replaySnapshotCase({ caseInput: caseInput(), candidate: candidate() });
    const mid = replaySnapshotCase({
      caseInput: caseInput({
        draftSessionId: "sessao-2",
        snapshotId: "snapshot-2",
        role: "MID",
        patch: "26.15"
      }),
      candidate: candidate()
    });
    const excluido = replaySnapshotCase({
      caseInput: caseInput({
        draftSessionId: "sessao-3",
        snapshotId: "snapshot-3",
        recommendations: [{ ...CONFORTAVEL, totalScore: 12.3 }]
      }),
      candidate: candidate()
    });
    return [jungle, mid, excluido];
  }

  it("separa casos reproduzidos de excluídos e não mistura os dois nas médias", () => {
    const summary = summarizeCalibrationExperiment({ candidate: candidate(), results: results() });

    expect(summary.totalCases).toBe(3);
    expect(summary.replayedCases).toBe(2);
    expect(summary.excludedCases).toBe(1);
    expect(summary.top1PreservedRate).toBe(0);
    expect(summary.meanRankDisplacement).toBe(1);
  });

  it("agrega os motivos de exclusão com a dependência histórica nomeada", () => {
    const summary = summarizeCalibrationExperiment({ candidate: candidate(), results: results() });

    expect(summary.exclusions[0]?.code).toBe("SCORE_MISMATCH");
    expect(summary.exclusions[0]?.cases).toBe(1);
  });

  it("segmenta por posição, patch e faixa de cobertura", () => {
    const summary = summarizeCalibrationExperiment({ candidate: candidate(), results: results() });
    const roles = summary.segments.filter((segment) => segment.segment === "role");
    const patches = summary.segments.filter((segment) => segment.segment === "patch");
    const coverage = summary.segments.filter((segment) => segment.segment === "dataCoverage");

    expect(roles.map((segment) => segment.value).sort()).toEqual(["JUNGLE", "MID"]);
    expect(patches.map((segment) => segment.value).sort()).toEqual(["26.14", "26.15"]);
    expect(coverage[0]?.value).toBe("0.9-1.0");
  });

  it("nunca promove sozinha: o status entra por parâmetro e o padrão é apenas avaliada", () => {
    const padrao = summarizeCalibrationExperiment({ candidate: candidate(), results: results() });
    const aprovada = summarizeCalibrationExperiment({
      candidate: candidate(),
      results: results(),
      promotionStatus: "APPROVED_FOR_FUTURE_RELEASE"
    });

    expect(padrao.promotionStatus).toBe("EVALUATED");
    expect(aprovada.promotionStatus).toBe("APPROVED_FOR_FUTURE_RELEASE");
  });

  it("conta casos com avaliação humana pré-partida", () => {
    const comRevisao = replaySnapshotCase({
      caseInput: caseInput({
        preMatchReview: { reviewId: "r1", overallRating: "WEAK", issueTags: [] }
      }),
      candidate: candidate()
    });
    const summary = summarizeCalibrationExperiment({
      candidate: candidate(),
      results: [comRevisao, ...results()]
    });

    expect(summary.casesWithPreMatchReview).toBe(1);
  });
});

describe("coverageBand", () => {
  it("agrupa a cobertura em faixas em vez de fingir precisão", () => {
    expect(coverageBand(1)).toBe("0.9-1.0");
    expect(coverageBand(0.75)).toBe("0.7-0.9");
    expect(coverageBand(0.6)).toBe("0.5-0.7");
    expect(coverageBand(0.2)).toBe("<0.5");
  });
});

describe("canonicalExperimentInputString", () => {
  it("independe da ordem dos snapshots", () => {
    const first = canonicalExperimentInputString({
      candidateHashInput: "abc",
      snapshotIds: ["s2", "s1"],
      filters: { role: "JUNGLE" }
    });
    const second = canonicalExperimentInputString({
      candidateHashInput: "abc",
      snapshotIds: ["s1", "s2"],
      filters: { role: "JUNGLE" }
    });

    expect(first).toBe(second);
  });

  it("muda quando um filtro muda", () => {
    const before = canonicalExperimentInputString({
      candidateHashInput: "abc",
      snapshotIds: ["s1"],
      filters: { role: "JUNGLE" }
    });
    const after = canonicalExperimentInputString({
      candidateHashInput: "abc",
      snapshotIds: ["s1"],
      filters: { role: "MID" }
    });

    expect(before).not.toBe(after);
  });
});
