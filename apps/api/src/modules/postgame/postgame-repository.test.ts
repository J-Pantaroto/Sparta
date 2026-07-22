import { describe, expect, it, vi } from "vitest";

const { postgameReportFindManyMock } = vi.hoisted(() => ({
  postgameReportFindManyMock: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    postgameReport: { findMany: postgameReportFindManyMock }
  }
}));

import { findPostgameReportsByPuuid } from "./postgame-repository.js";

describe("findPostgameReportsByPuuid", () => {
  it("filtra por puuid, exclui partidas sem startedAt e ordena pela mais recente", async () => {
    postgameReportFindManyMock.mockResolvedValue([]);

    await findPostgameReportsByPuuid("puuid-1");

    expect(postgameReportFindManyMock).toHaveBeenCalledWith({
      where: { puuid: "puuid-1", match: { startedAt: { not: null } } },
      include: { match: true },
      orderBy: { match: { startedAt: "desc" } }
    });
  });

  it("mapeia reportJson de volta pra PostGameAnalysis", async () => {
    const reportA = { matchId: "m1", pickAssessment: "a" };
    const reportB = { matchId: "m2", pickAssessment: "b" };
    postgameReportFindManyMock.mockResolvedValue([{ reportJson: reportA }, { reportJson: reportB }]);

    const result = await findPostgameReportsByPuuid("puuid-1");

    expect(result).toEqual([reportA, reportB]);
  });
});
