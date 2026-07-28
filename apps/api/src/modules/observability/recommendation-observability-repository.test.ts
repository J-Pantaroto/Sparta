import { beforeEach, describe, expect, it, vi } from "vitest";

const { draftSessionFindManyMock } = vi.hoisted(() => ({
  draftSessionFindManyMock: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    draftSession: { findMany: draftSessionFindManyMock }
  }
}));

import {
  findRecommendationObservations,
  selectSnapshotAtLockIn
} from "./recommendation-observability-repository.js";

describe("recommendation observability repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("seleciona somente o snapshot vigente no lock-in", () => {
    const old = {
      id: "old",
      createdAt: new Date("2026-07-20T11:00:00.000Z"),
      supersededAt: new Date("2026-07-20T11:30:00.000Z")
    };
    const current = {
      id: "current",
      createdAt: new Date("2026-07-20T11:30:00.000Z"),
      supersededAt: null
    };
    const after = {
      id: "after",
      createdAt: new Date("2026-07-20T12:30:00.000Z"),
      supersededAt: null
    };

    expect(
      selectSnapshotAtLockIn([old, current, after], new Date("2026-07-20T12:00:00.000Z"))?.id
    ).toBe("current");
    expect(selectSnapshotAtLockIn([current], null)).toBeNull();
  });

  it("mapeia uma sessão uma vez e não cria score para escolha fora do snapshot", async () => {
    draftSessionFindManyMock.mockResolvedValue([
      {
        id: "draft-1",
        role: "JUNGLE",
        lockedInAt: new Date("2026-07-20T12:00:00.000Z"),
        selectedChampionId: 234,
        snapshots: [
          {
            id: "snapshot-1",
            createdAt: new Date("2026-07-20T11:00:00.000Z"),
            supersededAt: null,
            algorithmVersionsJson: {
              recommendationEngine: "recommendation-engine/3.0.0"
            },
            recommendations: [
              {
                championId: 64,
                recGroup: "PRIMARY",
                rank: 1,
                totalScore: 70,
                dataCoverage: 0.8,
                poolSource: "PERSONAL_OBSERVED",
                detailJson: { metricDetails: [] }
              }
            ]
          }
        ],
        linkedMatch: {
          matchId: "BR1_1",
          patch: "26.14",
          queueId: 420,
          startedAt: new Date("2026-07-20T12:05:00.000Z"),
          participants: [
            {
              won: true,
              role: "JUNGLE",
              observation: { normalizedRole: "JUNGLE" }
            }
          ]
        },
        postgameComparisons: [
          {
            reportJson: {
              algorithmVersion: "draft-postgame-comparison/1.0.0",
              status: "PARTIAL",
              comparableSignals: [{ key: "POSITION_ALIGNMENT" }],
              unavailableSignals: [{ key: "GLOBAL_MATCHUP" }]
            }
          }
        ]
      },
      {
        id: "draft-1",
        role: "JUNGLE",
        lockedInAt: new Date("2026-07-20T12:00:00.000Z"),
        selectedChampionId: 234,
        snapshots: [],
        linkedMatch: {
          matchId: "BR1_duplicate",
          patch: null,
          queueId: null,
          startedAt: null,
          participants: [{ won: false, role: null, observation: null }]
        },
        postgameComparisons: []
      }
    ]);

    const observations = await findRecommendationObservations("account-1", "puuid-1");

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      draftSessionId: "draft-1",
      selectionGroup: "NOT_IN_SNAPSHOT",
      originalRank: null,
      originalScore: null,
      originalCoverage: null,
      originalExecutionRisk: null,
      matchWon: true,
      positionMatched: true,
      algorithmVersions: {
        recommendationEngine: "recommendation-engine/3.0.0",
        postgameComparison: "draft-postgame-comparison/1.0.0"
      },
      comparableSignalKeys: ["POSITION_ALIGNMENT"],
      unavailableSignalKeys: ["GLOBAL_MATCHUP"]
    });
  });
});
