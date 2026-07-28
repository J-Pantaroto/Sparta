import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock("../../db/prisma.js", () => ({
  prisma: { matchObservation: { findMany: findManyMock } }
}));

import { findPlayerChampionRoleEvidence } from "./player-champion-role-evidence-repository.js";

describe("findPlayerChampionRoleEvidence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("consulta somente MatchObservation normalizada e preserva patch/fila/origem", async () => {
    findManyMock.mockResolvedValue([
      {
        extractorVersion: "match-observation/1.0.0",
        normalizedRole: "SUPPORT",
        normalizedRoleSource: "TEAM_POSITION",
        matchParticipant: {
          championId: 161,
          won: true,
          match: {
            startedAt: new Date("2026-07-20T12:00:00.000Z"),
            patch: "16.14",
            queueId: 420,
            gameMode: "CLASSIC",
            gameType: "MATCHED_GAME"
          }
        }
      }
    ]);

    const result = await findPlayerChampionRoleEvidence("puuid-1", 161, "SUPPORT", {
      patches: ["16.14"],
      queueIds: [420]
    });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          positionStatus: "AVAILABLE",
          normalizedRole: "SUPPORT",
          matchParticipant: expect.objectContaining({
            puuid: "puuid-1",
            championId: 161
          })
        })
      })
    );
    expect(result).toMatchObject({
      status: "AVAILABLE",
      games: 1,
      wins: 1,
      queueIds: [420],
      patches: ["16.14"],
      normalization: {
        extractorVersions: ["match-observation/1.0.0"],
        sources: ["TEAM_POSITION"]
      }
    });
  });

  it("não usa fallback quando não há observação de posição", async () => {
    findManyMock.mockResolvedValue([]);

    const result = await findPlayerChampionRoleEvidence("puuid-1", 161, "MID");

    expect(result.status).toBe("UNAVAILABLE");
    expect(result.games).toBe(0);
    expect(result.provenance.sampleSize).toBe(0);
  });
});
