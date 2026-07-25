import { beforeEach, describe, expect, it, vi } from "vitest";

const { matchParticipantFindManyMock } = vi.hoisted(() => ({
  matchParticipantFindManyMock: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: { matchParticipant: { findMany: matchParticipantFindManyMock } }
}));

import { findPersonalLaneMatchupHistory } from "./matchup-repository.js";

describe("findPersonalLaneMatchupHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("limita o confronto às partidas do jogador e traz apenas os laners dessas partidas", async () => {
    matchParticipantFindManyMock
      .mockResolvedValueOnce([{ matchId: "m-1" }, { matchId: "m-2" }])
      .mockResolvedValueOnce([
        { matchId: "m-1", championId: 61, role: "MID", teamId: 100, won: true },
        { matchId: "m-1", championId: 157, role: "MID", teamId: 200, won: false }
      ]);

    const result = await findPersonalLaneMatchupHistory("puuid-player", "MID");

    expect(matchParticipantFindManyMock).toHaveBeenNthCalledWith(1, {
      where: { puuid: "puuid-player", role: "MID", teamId: { not: null } },
      select: { matchId: true }
    });
    expect(matchParticipantFindManyMock).toHaveBeenNthCalledWith(2, {
      where: { matchId: { in: ["m-1", "m-2"] }, role: "MID", teamId: { not: null } },
      select: { matchId: true, championId: true, role: true, teamId: true, won: true }
    });
    expect(result).toHaveLength(2);
  });

  it("não consulta o banco inteiro quando o jogador não tem partidas na posição", async () => {
    matchParticipantFindManyMock.mockResolvedValueOnce([]);

    await expect(findPersonalLaneMatchupHistory("puuid-player", "MID")).resolves.toEqual([]);
    expect(matchParticipantFindManyMock).toHaveBeenCalledTimes(1);
  });
});
