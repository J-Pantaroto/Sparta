import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LongitudinalRecommendationReport } from "@sparta/core";
import { ReportContent } from "./MotorHistoryScreen";

const ratio = (numerator: number, denominator: number) => ({
  numerator,
  denominator,
  percentage: denominator ? (numerator / denominator) * 100 : null
});

function report(): LongitudinalRecommendationReport {
  const emptyBand = {
    dimension: "SCORE" as const,
    unit: "POINTS" as const,
    bandsVersion: "bands/1",
    availableSampleSize: 1,
    unavailableCount: 1,
    observations: [
      {
        id: "60",
        label: "60 a 69.9",
        minimum: 60,
        maximum: 70,
        includeMaximum: false,
        sampleSize: 1,
        outcomes: {
          sampleSize: 1,
          wins: ratio(1, 1),
          losses: ratio(0, 1)
        }
      }
    ],
    limitation: "Faixas descritivas."
  };
  return {
    status: "PARTIAL",
    filters: { playerId: "puuid-1" },
    sampleSize: 3,
    linkedSessionCount: 3,
    availableComparisonCount: 2,
    selectionDistribution: {
      sampleSize: 3,
      groups: [
        {
          group: "PRIMARY",
          selections: ratio(1, 3),
          outcomes: { sampleSize: 1, wins: ratio(1, 1), losses: ratio(0, 1) }
        },
        {
          group: "ALTERNATIVE",
          selections: ratio(1, 3),
          outcomes: { sampleSize: 1, wins: ratio(0, 1), losses: ratio(1, 1) }
        },
        {
          group: "NOT_IN_SNAPSHOT",
          selections: ratio(1, 3),
          outcomes: { sampleSize: 1, wins: ratio(1, 1), losses: ratio(0, 1) }
        }
      ]
    },
    rankDistribution: {
      sampleSize: 2,
      unavailableCount: 1,
      mean: 2,
      median: 2,
      ranks: [
        {
          rank: 1,
          selections: ratio(1, 2),
          outcomes: { sampleSize: 1, wins: ratio(1, 1), losses: ratio(0, 1) }
        }
      ]
    },
    outcomeDistribution: {
      sampleSize: 3,
      wins: ratio(2, 3),
      losses: ratio(1, 3)
    },
    positionDivergence: {
      comparableSampleSize: 2,
      unavailableCount: 1,
      divergences: ratio(1, 2)
    },
    scoreBands: emptyBand,
    coverageBands: {
      ...emptyBand,
      dimension: "COVERAGE",
      unit: "RATIO"
    },
    executionRiskBands: {
      ...emptyBand,
      dimension: "EXECUTION_RISK"
    },
    roleBreakdown: [
      {
        value: "JUNGLE",
        sampleSize: 3,
        selections: ratio(3, 3),
        outcomes: { sampleSize: 3, wins: ratio(2, 3), losses: ratio(1, 3) }
      }
    ],
    patchBreakdown: [],
    queueBreakdown: [],
    championBreakdown: [],
    algorithmVersionBreakdown: [
      {
        dimension: "recommendationEngine",
        version: "recommendation-engine/3",
        sampleSize: 2,
        observations: ratio(2, 3),
        firstSeenAt: "2026-07-20T00:00:00.000Z",
        lastSeenAt: "2026-07-21T00:00:00.000Z",
        patches: ["26.14"],
        roles: ["JUNGLE"],
        selectionGroups: ["PRIMARY"],
        poolSources: ["PERSONAL_OBSERVED"],
        meanOriginalCoverage: 0.8,
        originalCoverageRange: { minimum: 0.8, maximum: 0.8 },
        metricAvailability: []
      },
      {
        dimension: "recommendationEngine",
        version: "recommendation-engine/4",
        sampleSize: 1,
        observations: ratio(1, 3),
        firstSeenAt: "2026-07-22T00:00:00.000Z",
        lastSeenAt: "2026-07-22T00:00:00.000Z",
        patches: ["26.15"],
        roles: ["MID"],
        selectionGroups: ["ALTERNATIVE"],
        poolSources: ["USER_PROVIDED"],
        meanOriginalCoverage: 0.5,
        originalCoverageRange: { minimum: 0.5, maximum: 0.5 },
        metricAvailability: []
      }
    ],
    algorithmVersionComparisons: [
      {
        dimension: "recommendationEngine",
        status: "UNAVAILABLE",
        versions: ["recommendation-engine/3", "recommendation-engine/4"],
        displaySampleThreshold: 5,
        reasons: ["As versões não possuem patch em comum."],
        limitation: "Contextos incompatíveis."
      }
    ],
    postgameSignalFrequencies: [
      {
        key: "POSITION_ALIGNMENT",
        comparable: ratio(1, 2),
        unavailable: ratio(1, 2)
      }
    ],
    unavailableSignalCount: 1,
    unavailableDimensions: [
      {
        dimension: "SCORE",
        unavailable: ratio(1, 3),
        reasons: ["Nenhum score histórico foi registrado para esta escolha."]
      }
    ],
    mixedAlgorithmVersions: true,
    displaySampleThreshold: 5,
    generatedAt: "2026-07-28T21:00:00.000Z",
    algorithmVersion: "recommendation-observability/1.0.0",
    provenance: { sourceType: "CALCULATED" },
    limitation:
      "Resultados observados descrevem o histórico disponível e não demonstram que a recomendação causou vitória ou derrota."
  };
}

describe("Histórico do motor", () => {
  it("mostra contagens, versões e limitações sem criar placar de acertos", () => {
    render(<ReportContent report={report()} />);

    expect(screen.getByText("Escolhas registradas")).toBeTruthy();
    expect(screen.getByText("Fora do snapshot")).toBeTruthy();
    expect(screen.getByText(/Resultado observado quando a primeira recomendação/)).toBeTruthy();
    expect(screen.getByText("recommendation-engine/3")).toBeTruthy();
    expect(screen.getByText(/dados insuficientes para comparar versões/)).toBeTruthy();
    expect(screen.getByText(/não demonstram que a recomendação causou/)).toBeTruthy();
    expect(screen.queryByText(/taxa de acerto/i)).toBeNull();
    expect(screen.queryByText(/recomendação correta|recomendação errada/i)).toBeNull();
  });
});
