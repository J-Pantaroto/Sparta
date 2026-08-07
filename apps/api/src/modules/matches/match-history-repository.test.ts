import { beforeEach, describe, expect, it, vi } from "vitest";

const { riotAccountFindFirstMock, participantCountMock, participantFindManyMock } = vi.hoisted(() => ({
  riotAccountFindFirstMock: vi.fn(),
  participantCountMock: vi.fn(),
  participantFindManyMock: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    riotAccount: { findFirst: riotAccountFindFirstMock },
    matchParticipant: { count: participantCountMock, findMany: participantFindManyMock }
  }
}));

import { findMatchHistoryByPuuid } from "./match-history-repository.js";

const account = { id: "account-1", puuid: "puuid-1" };

function row(overrides: Record<string, unknown> = {}) {
  return {
    championId: 61,
    champion: { name: "Orianna" },
    role: "MID",
    won: true,
    kills: 5,
    deaths: 2,
    assists: 7,
    csPerMinute: 7.5,
    goldPerMinute: 420,
    damagePerMinute: 700,
    visionScorePerMinute: 1.2,
    killParticipation: 0.6,
    objectiveParticipation: 0.4,
    objectiveTakedowns: 2,
    teamObjectiveKills: 5,
    match: {
      matchId: "BR1_1",
      durationSeconds: 1800,
      queueId: 420,
      patch: "26.15",
      startedAt: new Date("2026-08-05T10:00:00.000Z"),
      timeline: null,
      postgameReports: [],
      draftComparisons: []
    },
    observation: null,
    ...overrides
  };
}

describe("findMatchHistoryByPuuid", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve null quando a conta nao existe", async () => {
    riotAccountFindFirstMock.mockResolvedValue(null);
    const result = await findMatchHistoryByPuuid("puuid-x");
    expect(result).toBeNull();
    expect(participantCountMock).not.toHaveBeenCalled();
  });

  it("aplica limit/offset padrão e devolve a página com total", async () => {
    riotAccountFindFirstMock.mockResolvedValue(account);
    participantCountMock.mockResolvedValue(3);
    participantFindManyMock.mockResolvedValue([row(), row({ match: { ...row().match, matchId: "BR1_2" } })]);

    const result = await findMatchHistoryByPuuid("puuid-1");

    expect(result?.total).toBe(3);
    expect(result?.limit).toBe(20);
    expect(result?.offset).toBe(0);
    expect(result?.matches).toHaveLength(2);
    expect(participantFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
  });

  it("nunca lista partida sem posição conhecida (mesma regra desde a Etapa 6)", async () => {
    riotAccountFindFirstMock.mockResolvedValue(account);
    participantCountMock.mockResolvedValue(1);
    participantFindManyMock.mockResolvedValue([row({ role: null, observation: null })]);

    const result = await findMatchHistoryByPuuid("puuid-1");

    expect(result?.matches).toEqual([]);
  });

  it("filtra por role, resultado e período, e satura limit no máximo permitido", async () => {
    riotAccountFindFirstMock.mockResolvedValue(account);
    participantCountMock.mockResolvedValue(0);
    participantFindManyMock.mockResolvedValue([]);

    await findMatchHistoryByPuuid(
      "puuid-1",
      { role: "JUNGLE", won: false, periodDays: 7, limit: 999, offset: -5 },
      new Date("2026-08-10T00:00:00.000Z")
    );

    const where = participantCountMock.mock.calls[0][0].where;
    expect(where.role).toBe("JUNGLE");
    expect(where.won).toBe(false);
    expect(where.match.startedAt.gte).toEqual(new Date("2026-08-03T00:00:00.000Z"));
    expect(participantFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 100 })
    );
  });
});
