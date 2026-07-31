import { describe, expect, it } from "vitest";
import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";
import type { RecommendationMetric } from "../types/recommendation-metric.js";
import type { CalibrationCandidate } from "./engine-candidate.js";
import {
  canonicalExperimentInputString,
  coverageBand,
  poolSizeBand,
  periodBand,
  replaySnapshotCase,
  summarizeCalibrationExperiment,
  type CalibrationCaseComparison,
  type ReplayCaseInput
} from "./ranking-comparison.js";

function persisted(input: {
  championId: number;
  rank: number;
  category: string;
  personalPerformance: number;
  compositionFit: number;
  totalScore: number;
  group?: "PRIMARY" | "ALTERNATIVE";
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
    group: input.group ?? "PRIMARY",
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
    queue: "RANKED_SOLO",
    capturedAt: "2026-07-30T12:00:00.000Z",
    poolSize: 11,
    aggregationVersion: "1.0.0",
    algorithmVersions: { recommendationEngine: "1.0.0" },
    recommendations: [CONFORTAVEL, ESTRATEGICO],
    ...overrides
  };
}

function candidate(overrides: Partial<CalibrationCandidate> = {}): CalibrationCandidate {
  return {
    id: "cand-composicao",
    name: "só-composição",
    baselineAggregationVersion: "1.0.0",
    candidateVersion: "1.0.0",
    metricWeights: { TEAM_COMPOSITION: 1 },
    status: "READY",
    ...overrides
  };
}

describe("replaySnapshotCase", () => {
  it("compara o ranking reponderado contra a linha de base histórica", () => {
    const result = replaySnapshotCase({ caseInput: caseInput(), candidate: candidate() });

    expect(result.replayStatus).toBe("EXACT_REPLAY");
    expect(result.topOnePreserved).toBe(false);
    expect(result.topFiveOverlap).toBe(2);
    expect(result.averageRankDisplacement).toBe(1);
    expect(result.medianRankDisplacement).toBe(1);
    expect(result.maxRankDisplacement).toBe(1);
    expect(result.promotedChampionIds).toEqual([2]);
    expect(result.demotedChampionIds).toEqual([1]);
  });

  it("preserva por candidato o original, o reconstruído e o candidato", () => {
    const result = replaySnapshotCase({ caseInput: caseInput(), candidate: candidate() });
    const conforto = result.candidates.find((entry) => entry.championId === 1);

    expect(conforto?.baselineRank).toBe(1);
    expect(conforto?.baselineGroup).toBe("PRIMARY");
    expect(conforto?.baselineScore).toBe(60);
    expect(conforto?.reconstructedScore).toBe(60);
    expect(conforto?.candidateScore).toBe(40);
    expect(conforto?.baselineDataCoverage).toBe(0.95);
    expect(conforto?.candidateDataCoverage).toBe(1);
    expect(conforto?.usedMetricValues.TEAM_COMPOSITION).toBe(40);
    expect(conforto?.differenceReasons.length).toBeGreaterThan(0);
  });

  it("conta inversão entre pick de conforto e opção estratégica", () => {
    const result = replaySnapshotCase({ caseInput: caseInput(), candidate: candidate() });

    expect(result.comfortStrategicInversions).toBe(1);
  });

  it("não conta inversão nem deslocamento quando a ordem é preservada", () => {
    const result = replaySnapshotCase({
      caseInput: caseInput(),
      candidate: candidate({ metricWeights: { PERSONAL_PERFORMANCE: 1 } })
    });

    expect(result.topOnePreserved).toBe(true);
    expect(result.comfortStrategicInversions).toBe(0);
    expect(result.averageRankDisplacement).toBe(0);
    expect(result.recommendedSetStability).toBe(1);
  });

  it("a ordem em que os candidatos chegam não altera scores nem ranking", () => {
    const direta = replaySnapshotCase({ caseInput: caseInput(), candidate: candidate() });
    const invertida = replaySnapshotCase({
      caseInput: caseInput({ recommendations: [ESTRATEGICO, CONFORTAVEL] }),
      candidate: candidate()
    });

    expect(invertida.candidate?.entries.map((entry) => entry.championId)).toEqual(
      direta.candidate?.entries.map((entry) => entry.championId)
    );
    expect(invertida.candidate?.entries.map((entry) => entry.score)).toEqual(
      direta.candidate?.entries.map((entry) => entry.score)
    );
  });

  it("não altera o snapshot histórico recebido", () => {
    const input = caseInput();
    const copy = JSON.parse(JSON.stringify(input.recommendations));

    replaySnapshotCase({ caseInput: input, candidate: candidate() });

    expect(input.recommendations).toEqual(copy);
  });

  it("registra a escolha real entrando no grupo principal", () => {
    const result = replaySnapshotCase({
      caseInput: caseInput({ selectedChampionId: 2 }),
      candidate: candidate({ postAggregationThresholds: { primaryCount: 1 } })
    });

    expect(result.chosenChampion).toEqual({
      championId: 2,
      baselineRank: 2,
      candidateRank: 1,
      baselineGroup: "PRIMARY",
      candidateGroup: "PRIMARY",
      enteredPrimary: false,
      leftPrimary: false
    });
  });

  it("registra a escolha real saindo do grupo principal", () => {
    const result = replaySnapshotCase({
      caseInput: caseInput({
        selectedChampionId: 1,
        recommendations: [
          CONFORTAVEL,
          { ...ESTRATEGICO, group: "ALTERNATIVE" as const }
        ]
      }),
      candidate: candidate({ postAggregationThresholds: { primaryCount: 1 } })
    });

    expect(result.leftPrimaryChampionIds).toEqual([1]);
    expect(result.alternativeToPrimaryChampionIds).toEqual([2]);
    expect(result.chosenChampion?.leftPrimary).toBe(true);
    expect(result.chosenChampion?.enteredPrimary).toBe(false);
  });

  it("exclui o caso inteiro quando um único candidato falha a integridade", () => {
    const result = replaySnapshotCase({
      caseInput: caseInput({ recommendations: [CONFORTAVEL, { ...ESTRATEGICO, totalScore: 91.2 }] }),
      candidate: candidate()
    });

    expect(result.replayStatus).toBe("REPLAY_INTEGRITY_FAILED");
    expect(result.candidate).toBeNull();
    expect(result.topOnePreserved).toBeNull();
    expect(result.averageRankDisplacement).toBeNull();
    expect(result.exclusionReasons[0]?.code).toBe("SCORE_MISMATCH");
    expect(result.exclusionReasons[0]?.championId).toBe(2);
  });

  it("exclui o caso quando a configuração muda a curva e o risco não está congelado", () => {
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
      candidate: candidate({ postAggregationThresholds: { executionRiskPenaltyStart: 40 } })
    });

    expect(result.replayStatus).toBe("REPLAY_MISSING_HISTORICAL_INPUT");
    expect(result.exclusionReasons[0]?.code).toBe("PENALTY_NOT_REPRODUCIBLE");
    expect(result.exclusionReasons[0]?.missingHistoricalInput).toBe(
      "RecommendationMetric EXECUTION_RISK"
    );
  });

  it("recusa a versão de agregação não suportada", () => {
    const result = replaySnapshotCase({
      caseInput: caseInput({ aggregationVersion: "2.0.0" }),
      candidate: candidate()
    });

    expect(result.replayStatus).toBe("REPLAY_UNSUPPORTED_VERSION");
  });

  it("marca snapshot sem candidatos como input histórico faltante", () => {
    const result = replaySnapshotCase({
      caseInput: caseInput({ recommendations: [] }),
      candidate: candidate()
    });

    expect(result.replayStatus).toBe("REPLAY_MISSING_HISTORICAL_INPUT");
    expect(result.baseline.entries).toEqual([]);
  });

  it("não produz nenhum campo de resultado da partida", () => {
    const result = replaySnapshotCase({ caseInput: caseInput(), candidate: candidate() });
    const serialized = JSON.stringify(result);

    for (const forbidden of ["won", "win", "loss", "kda", "timeline", "postGame", "matchResult"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("preserva a referência da avaliação humana pré-resultado", () => {
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
  function run(overrides: Partial<ReplayCaseInput> = {}, config = candidate()) {
    const input = caseInput(overrides);
    return { caseInput: input, comparison: replaySnapshotCase({ caseInput: input, candidate: config }) };
  }

  function cases() {
    return [
      run(),
      run({ draftSessionId: "s2", snapshotId: "snap-2", role: "MID", patch: "26.15" }),
      run({
        draftSessionId: "s3",
        snapshotId: "snap-3",
        recommendations: [{ ...CONFORTAVEL, totalScore: 12.3 }]
      })
    ];
  }

  it("separa casos reproduzidos de excluídos e não mistura os dois nas médias", () => {
    const report = summarizeCalibrationExperiment({ candidate: candidate(), cases: cases() });

    expect(report.totalCases).toBe(3);
    expect(report.replayedCases).toBe(2);
    expect(report.excludedCases).toBe(2 - 1);
    expect(report.nonReproducibleCases).toBe(1);
    expect(report.topOnePreservedCases).toBe(0);
    expect(report.averageRankDisplacement).toBe(1);
    expect(report.medianRankDisplacement).toBe(1);
  });

  it("agrega os motivos de exclusão", () => {
    const report = summarizeCalibrationExperiment({ candidate: candidate(), cases: cases() });

    expect(report.exclusions[0]?.code).toBe("SCORE_MISMATCH");
    expect(report.exclusions[0]?.cases).toBe(1);
  });

  it("segmenta por posição, patch, fila, período, pool, cobertura e versão", () => {
    const report = summarizeCalibrationExperiment({ candidate: candidate(), cases: cases() });
    const dimensions = new Set(report.segments.map((segment) => segment.dimension));

    expect(dimensions).toContain("role");
    expect(dimensions).toContain("patch");
    expect(dimensions).toContain("queue");
    expect(dimensions).toContain("period");
    expect(dimensions).toContain("poolSize");
    expect(dimensions).toContain("baselineDataCoverage");
    expect(dimensions).toContain("engineVersion");
    expect(
      report.segments.filter((s) => s.dimension === "role").map((s) => s.value).sort()
    ).toEqual(["JUNGLE", "MID"]);
  });

  it("conta revisões humanas pré-resultado sem virar nota", () => {
    const comRevisao = run({
      preMatchReview: { reviewId: "r1", overallRating: "WEAK", issueTags: ["RANKING"] }
    });
    const forte = run(
      {
        draftSessionId: "s4",
        snapshotId: "snap-4",
        preMatchReview: { reviewId: "r2", overallRating: "STRONG", issueTags: [] }
      },
      candidate({ metricWeights: { PERSONAL_PERFORMANCE: 1 } })
    );
    const report = summarizeCalibrationExperiment({
      candidate: candidate(),
      cases: [comRevisao, forte, ...cases()]
    });

    expect(report.humanReview.casesWithReview).toBe(2);
    expect(report.humanReview.casesWithoutReview).toBe(2);
    expect(report.humanReview.weakCasesAltered).toBe(1);
    expect(report.humanReview.strongCasesPreserved).toBe(1);
    expect(report.humanReview.issueTagsAffected).toEqual([
      { tag: "RANKING", casesAltered: 1, casesTotal: 1 }
    ]);
  });

  it("não promove sozinha: o status vem da própria configuração", () => {
    const avaliada = summarizeCalibrationExperiment({ candidate: candidate(), cases: cases() });
    const aprovada = summarizeCalibrationExperiment({
      candidate: candidate({ status: "APPROVED_FOR_FUTURE_RELEASE" }),
      cases: cases()
    });

    expect(avaliada.candidateStatus).toBe("READY");
    expect(aprovada.candidateStatus).toBe("APPROVED_FOR_FUTURE_RELEASE");
  });

  it("produz o mesmo relatório para o mesmo input funcional", () => {
    const first = summarizeCalibrationExperiment({ candidate: candidate(), cases: cases() });
    const second = summarizeCalibrationExperiment({ candidate: candidate(), cases: cases() });

    expect(first).toEqual(second);
  });
});

describe("faixas de segmentação", () => {
  it("agrupa cobertura, pool e período sem fingir precisão", () => {
    expect(coverageBand(1)).toBe("0.9-1.0");
    expect(coverageBand(0.75)).toBe("0.7-0.9");
    expect(coverageBand(0.6)).toBe("0.5-0.7");
    expect(coverageBand(0.2)).toBe("<0.5");
    expect(poolSizeBand(20)).toBe("15+");
    expect(poolSizeBand(11)).toBe("10-14");
    expect(poolSizeBand(6)).toBe("5-9");
    expect(poolSizeBand(2)).toBe("<5");
    expect(periodBand("2026-07-30T12:00:00.000Z")).toBe("2026-07");
  });
});

describe("canonicalExperimentInputString", () => {
  const base = {
    candidate: candidate(),
    snapshotIds: ["s2", "s1"],
    filters: { roles: ["MID", "JUNGLE"], issueTags: ["B", "A"] },
    algorithmVersions: { recommendationEngine: "1.0.0" }
  };

  it("independe da ordem de snapshots, filtros e arrays", () => {
    expect(canonicalExperimentInputString(base)).toBe(
      canonicalExperimentInputString({
        ...base,
        snapshotIds: ["s1", "s2"],
        filters: { issueTags: ["A", "B"], roles: ["JUNGLE", "MID"] }
      })
    );
  });

  it("ignora identidade e status da configuração", () => {
    expect(canonicalExperimentInputString(base)).toBe(
      canonicalExperimentInputString({
        ...base,
        candidate: candidate({ id: "outro", name: "outro", status: "EVALUATED" })
      })
    );
  });

  it("muda quando um filtro funcional muda", () => {
    expect(canonicalExperimentInputString(base)).not.toBe(
      canonicalExperimentInputString({ ...base, filters: { ...base.filters, roles: ["TOP"] } })
    );
  });

  it("muda quando um peso da configuração muda", () => {
    expect(canonicalExperimentInputString(base)).not.toBe(
      canonicalExperimentInputString({
        ...base,
        candidate: candidate({ metricWeights: { TEAM_COMPOSITION: 0.5, PERSONAL_PERFORMANCE: 0.5 } })
      })
    );
  });
});

describe("determinismo do caso", () => {
  it("o mesmo input funcional produz a mesma comparação", () => {
    const first: CalibrationCaseComparison = replaySnapshotCase({
      caseInput: caseInput(),
      candidate: candidate()
    });
    const second: CalibrationCaseComparison = replaySnapshotCase({
      caseInput: caseInput(),
      candidate: candidate()
    });

    expect(first).toEqual(second);
  });
});
