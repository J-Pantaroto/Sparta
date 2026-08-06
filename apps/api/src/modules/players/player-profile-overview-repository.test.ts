import { beforeEach, describe, expect, it, vi } from "vitest";

const { riotAccountFindFirstMock, matchParticipantFindManyMock } = vi.hoisted(() => ({
  riotAccountFindFirstMock: vi.fn(),
  matchParticipantFindManyMock: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    riotAccount: { findFirst: riotAccountFindFirstMock },
    matchParticipant: { findMany: matchParticipantFindManyMock }
  }
}));

import { findPlayerProfileOverviewByUserId } from "./player-profile-overview-repository.js";

const account = {
  id: "account-1",
  userId: "user-1",
  puuid: "puuid-1",
  gameName: "Sparta",
  tagLine: "BR1",
  platformRegion: "br1",
  regionalRouting: "americas",
  updatedAt: new Date("2026-08-05T12:00:00.000Z"),
  profile: {
    matchAnalysisLimit: 50,
    updatedAt: new Date("2026-08-05T12:00:00.000Z")
  }
};

function matchRow() {
  return {
    championId: 61,
    champion: { name: "Orianna" },
    role: "MID",
    won: false,
    kills: 0,
    deaths: 2,
    assists: 0,
    csPerMinute: 7,
    goldPerMinute: 350,
    damagePerMinute: 420,
    visionScorePerMinute: 0,
    killParticipation: 0,
    objectiveParticipation: 0,
    objectiveTakedowns: 0,
    teamObjectiveKills: 3,
    match: {
      matchId: "BR1_1",
      durationSeconds: 1800,
      queueId: 420,
      patch: "26.15",
      startedAt: new Date("2026-08-05T10:00:00.000Z"),
      timeline: { id: "timeline-1" },
      postgameReports: [{ id: "postgame-1" }],
      draftComparisons: []
    },
    observation: {
      normalizedRole: "MID",
      positionStatus: "CONFIRMED",
      itemSlots: [{ slot: 0, state: "OBSERVED", itemId: 1056, itemName: "Anel de Doran" }],
      runeSelections: [
        {
          tree: "PRIMARY",
          slotOrder: 0,
          perkId: 8214,
          perkName: "Invocar Aery",
          isKeystone: true
        }
      ],
      summonerSpellSlots: [{ slot: 0, state: "OBSERVED", spellId: 4, spellName: "Flash" }]
    }
  };
}

describe("player profile overview repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    riotAccountFindFirstMock.mockResolvedValue(account);
    matchParticipantFindManyMock.mockResolvedValue([]);
  });

  it("isola a consulta pelo userId e não retorna outra conta", async () => {
    riotAccountFindFirstMock.mockResolvedValue(null);

    await expect(
      findPlayerProfileOverviewByUserId("user-sem-vinculo", new Date("2026-08-06T00:00:00.000Z"))
    ).resolves.toBeNull();
    expect(riotAccountFindFirstMock).toHaveBeenCalledWith({
      where: { userId: "user-sem-vinculo" },
      include: { profile: true }
    });
    expect(matchParticipantFindManyMock).not.toHaveBeenCalled();
  });

  it("preserva zeros reais e declara rank ausente sem inventar dados", async () => {
    matchParticipantFindManyMock.mockResolvedValue([matchRow()]);

    const profile = await findPlayerProfileOverviewByUserId(
      "user-1",
      new Date("2026-08-06T00:00:00.000Z")
    );

    expect(profile?.ranked).toMatchObject({
      status: "UNAVAILABLE",
      tier: null,
      division: null,
      leaguePoints: null
    });
    expect(profile?.identity).toMatchObject({
      riotId: "Sparta#BR1",
      profileIconId: null,
      summonerLevel: null
    });
    expect(profile?.recentMatches[0]).toMatchObject({
      matchId: "BR1_1",
      killParticipation: 0,
      objectiveParticipation: 0,
      objectiveTakedowns: 0,
      timelineAvailable: true,
      postGameAvailable: true,
      draftComparisonAvailable: false
    });
    expect(
      profile?.recentPerformance.metrics.find((metric) => metric.key === "OBJECTIVES")
    ).toMatchObject({ value: 0, status: "AVAILABLE", availableSampleSize: 1 });
    expect(profile?.coverage.loadout).toMatchObject({ status: "AVAILABLE", coverage: 1 });
  });

  it("diferencia perfil sem partidas de valores observados", async () => {
    const profile = await findPlayerProfileOverviewByUserId(
      "user-1",
      new Date("2026-08-06T00:00:00.000Z")
    );

    expect(profile?.recentPerformance).toMatchObject({
      sampleSize: 0,
      wins: 0,
      losses: 0,
      winRate: null
    });
    expect(profile?.recentMatches).toEqual([]);
    expect(profile?.coverage.matches.status).toBe("UNAVAILABLE");
    expect(profile?.topChampions).toEqual([]);
  });

  it("marca dados observados antigos como desatualizados", async () => {
    matchParticipantFindManyMock.mockResolvedValue([matchRow()]);

    const profile = await findPlayerProfileOverviewByUserId(
      "user-1",
      new Date("2026-08-20T00:00:00.000Z")
    );

    expect(profile?.status).toBe("STALE");
    expect(profile?.coverage.matches.status).toBe("STALE");
    expect(profile?.provenance.find((entry) => entry.sourceId === "riot-match-v5")?.status).toBe(
      "STALE"
    );
  });
});
