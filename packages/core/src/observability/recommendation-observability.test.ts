import { describe, expect, it } from "vitest";
import {
  buildLongitudinalRecommendationReport,
  filterRecommendationObservations,
  type RecommendationObservation
} from "./recommendation-observability.js";

function observation(
  overrides: Partial<RecommendationObservation> = {}
): RecommendationObservation {
  return {
    draftSessionId: "draft-1",
    snapshotId: "snapshot-1",
    matchId: "BR1_1",
    championId: 234,
    role: "JUNGLE",
    observedRole: "JUNGLE",
    selectionGroup: "PRIMARY",
    poolSource: "PERSONAL_OBSERVED",
    originalRank: 1,
    originalScore: 65,
    originalCoverage: 0.82,
    originalExecutionRisk: 42,
    matchWon: true,
    positionMatched: true,
    patch: "26.14",
    queueId: 420,
    playedAt: "2026-07-20T12:00:00.000Z",
    algorithmVersions: {
      recommendationEngine: "recommendation-engine/3.0.0",
      draftStrategy: "draft-strategy/1.0.0",
      executionRisk: "execution-risk/1.0.0",
      postgameComparison: "draft-postgame-comparison/1.0.0"
    },
    postgameComparisonStatus: "PARTIAL",
    comparableSignalKeys: ["POSITION_ALIGNMENT"],
    unavailableSignalKeys: ["GLOBAL_MATCHUP"],
    ...overrides
  };
}

describe("recommendation observability", () => {
  it("preserva grupos, valores históricos e resultados como contagens observadas", () => {
    const report = buildLongitudinalRecommendationReport({
      observations: [
        observation(),
        observation({
          draftSessionId: "draft-2",
          matchId: "BR1_2",
          selectionGroup: "ALTERNATIVE",
          originalRank: 6,
          matchWon: false,
          playedAt: "2026-07-21T12:00:00.000Z"
        }),
        observation({
          draftSessionId: "draft-3",
          matchId: "BR1_3",
          snapshotId: "snapshot-3",
          selectionGroup: "NOT_IN_SNAPSHOT",
          poolSource: null,
          originalRank: null,
          originalScore: null,
          originalCoverage: null,
          originalExecutionRisk: null,
          matchWon: true,
          playedAt: "2026-07-22T12:00:00.000Z"
        })
      ],
      filters: { playerId: "puuid-1" },
      generatedAt: "2026-07-28T21:00:00.000Z"
    });

    expect(report.sampleSize).toBe(3);
    expect(report.outcomeDistribution.wins).toEqual({
      numerator: 2,
      denominator: 3,
      percentage: 66.7
    });
    expect(
      report.selectionDistribution.groups.map((group) => [
        group.group,
        group.selections.numerator,
        group.outcomes.wins.numerator,
        group.outcomes.wins.denominator
      ])
    ).toEqual([
      ["PRIMARY", 1, 1, 1],
      ["ALTERNATIVE", 1, 0, 1],
      ["NOT_IN_SNAPSHOT", 1, 1, 1]
    ]);
    expect(report.rankDistribution.sampleSize).toBe(2);
    expect(report.rankDistribution.mean).toBe(3.5);
    expect(report.rankDistribution.unavailableCount).toBe(1);
    expect(report.scoreBands.availableSampleSize).toBe(2);
    expect(report.scoreBands.unavailableCount).toBe(1);
    expect(report.limitation).toMatch(/não demonstram/);
    expect(JSON.stringify(report)).not.toMatch(
      /taxa de acerto|recomendação correta|recomendação errada/i
    );
  });

  it("mantém zero real disponível e ausência separada", () => {
    const report = buildLongitudinalRecommendationReport({
      observations: [
        observation({
          originalScore: 0,
          originalCoverage: 0,
          originalExecutionRisk: 0
        }),
        observation({
          draftSessionId: "draft-2",
          matchId: "BR1_2",
          originalScore: null,
          originalCoverage: null,
          originalExecutionRisk: null
        })
      ],
      filters: { playerId: "puuid-1" },
      generatedAt: "2026-07-28T21:00:00.000Z"
    });

    expect(report.scoreBands.availableSampleSize).toBe(1);
    expect(report.scoreBands.observations[0].sampleSize).toBe(1);
    expect(report.coverageBands.availableSampleSize).toBe(1);
    expect(report.executionRiskBands.availableSampleSize).toBe(1);
    expect(
      report.unavailableDimensions.find((entry) => entry.dimension === "SCORE")?.unavailable
    ).toEqual({ numerator: 1, denominator: 2, percentage: 50 });
  });

  it("aplica filtros ao numerador e denominador sem duplicar sessões", () => {
    const duplicated = observation();
    const filtered = filterRecommendationObservations(
      [
        duplicated,
        observation({
          draftSessionId: "draft-2",
          matchId: "BR1_2",
          championId: 64,
          role: "TOP",
          observedRole: "TOP",
          patch: "26.15",
          queueId: 440,
          selectionGroup: "ALTERNATIVE",
          playedAt: "2026-07-25T12:00:00.000Z"
        })
      ],
      {
        playerId: "puuid-1",
        from: "2026-07-24T00:00:00.000Z",
        patches: ["26.15"],
        queueIds: [440],
        roles: ["TOP"],
        championIds: [64],
        selectionGroups: ["ALTERNATIVE"]
      }
    );

    expect(filtered.map((entry) => entry.draftSessionId)).toEqual(["draft-2"]);
    const report = buildLongitudinalRecommendationReport({
      observations: filtered,
      filters: { playerId: "puuid-1" },
      generatedAt: "2026-07-28T21:00:00.000Z"
    });
    expect(report.selectionDistribution.groups[1].selections).toEqual({
      numerator: 1,
      denominator: 1,
      percentage: 100
    });
  });

  it("explicita divergência de posição e relatório pós-game ausente", () => {
    const report = buildLongitudinalRecommendationReport({
      observations: [
        observation({ observedRole: "MID", positionMatched: false }),
        observation({
          draftSessionId: "draft-2",
          matchId: "BR1_2",
          observedRole: null,
          positionMatched: null,
          postgameComparisonStatus: "UNAVAILABLE",
          comparableSignalKeys: [],
          unavailableSignalKeys: []
        })
      ],
      filters: { playerId: "puuid-1" },
      generatedAt: "2026-07-28T21:00:00.000Z"
    });

    expect(report.positionDivergence).toEqual({
      comparableSampleSize: 1,
      unavailableCount: 1,
      divergences: { numerator: 1, denominator: 1, percentage: 100 }
    });
    expect(report.availableComparisonCount).toBe(1);
    expect(
      report.unavailableDimensions.find((entry) => entry.dimension === "POSTGAME_COMPARISON")
        ?.unavailable
    ).toEqual({ numerator: 1, denominator: 2, percentage: 50 });
  });

  it("não sustenta comparação de versões sem patch ou amostra sobrepostos", () => {
    const observations = [
      observation(),
      observation({
        draftSessionId: "draft-2",
        matchId: "BR1_2",
        patch: "26.15",
        playedAt: "2026-07-25T12:00:00.000Z",
        algorithmVersions: {
          recommendationEngine: "recommendation-engine/4.0.0",
          draftStrategy: "draft-strategy/1.0.0",
          executionRisk: "execution-risk/1.0.0",
          postgameComparison: "draft-postgame-comparison/1.0.0"
        }
      })
    ];
    const report = buildLongitudinalRecommendationReport({
      observations,
      filters: { playerId: "puuid-1" },
      generatedAt: "2026-07-28T21:00:00.000Z",
      displaySampleThreshold: 2
    });
    const comparison = report.algorithmVersionComparisons.find(
      (entry) => entry.dimension === "recommendationEngine"
    );

    expect(report.mixedAlgorithmVersions).toBe(true);
    expect(comparison?.status).toBe("UNAVAILABLE");
    expect(comparison?.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/menos de 2 observações/),
        "As versões não possuem patch em comum."
      ])
    );
  });

  it("produz o mesmo relatório funcional para os mesmos inputs", () => {
    const input = {
      observations: [observation()],
      filters: { playerId: "puuid-1" },
      generatedAt: "2026-07-28T21:00:00.000Z"
    };
    expect(buildLongitudinalRecommendationReport(input)).toEqual(
      buildLongitudinalRecommendationReport(input)
    );
  });
});
