import { beforeEach, describe, expect, it, vi } from "vitest";
import { RiotApiError } from "@sparta/riot";

const { findExistingMatchIdsMock, persistMatchMock, getMatchMock, getMatchTimelineMock, getMatchIdsByPuuidMock } = vi.hoisted(
  () => ({
    findExistingMatchIdsMock: vi.fn(),
    persistMatchMock: vi.fn(),
    getMatchMock: vi.fn(),
    getMatchTimelineMock: vi.fn(),
    getMatchIdsByPuuidMock: vi.fn()
  })
);

vi.mock("../matches/match-repository", () => ({
  findExistingMatchIds: findExistingMatchIdsMock,
  persistMatch: persistMatchMock
}));

vi.mock("../riot-integration/client-factory", () => ({
  getRiotApiClient: () => ({
    getMatchIdsByPuuid: getMatchIdsByPuuidMock,
    getMatch: getMatchMock,
    getMatchTimeline: getMatchTimelineMock
  })
}));

import { syncPlayerMatches } from "./riot-sync-service";

const PUUID = "puuid-player-1";
const player = { riotAccountId: "acc-1", puuid: PUUID, platformRegion: "br1" };

function rawMatch(matchId: string) {
  return {
    metadata: { matchId, participants: [PUUID, "puuid-enemy"] },
    info: {
      gameDuration: 1800,
      gameVersion: "14.14.1.1",
      participants: [
        {
          puuid: PUUID,
          championId: 61,
          championName: "Orianna",
          teamId: 100,
          teamPosition: "MIDDLE",
          win: true,
          kills: 5,
          deaths: 2,
          assists: 8,
          totalMinionsKilled: 150,
          neutralMinionsKilled: 0,
          goldEarned: 10000,
          totalDamageDealtToChampions: 18000,
          visionScore: 20
        },
        {
          puuid: "puuid-enemy",
          championId: 157,
          championName: "Yasuo",
          teamId: 200,
          teamPosition: "MIDDLE",
          win: false,
          kills: 2,
          deaths: 5,
          assists: 3,
          totalMinionsKilled: 140,
          neutralMinionsKilled: 0,
          goldEarned: 8000,
          totalDamageDealtToChampions: 12000,
          visionScore: 10
        }
      ]
    }
  };
}

function rawTimeline(matchId: string) {
  return {
    metadata: { matchId, participants: [PUUID, "puuid-enemy"] },
    info: {
      frameInterval: 60000,
      frames: [
        {
          timestamp: 0,
          participantFrames: {
            "1": { participantId: 1, minionsKilled: 0, jungleMinionsKilled: 0, totalGold: 500 },
            "2": { participantId: 2, minionsKilled: 0, jungleMinionsKilled: 0, totalGold: 500 }
          },
          events: []
        }
      ]
    }
  };
}

describe("syncPlayerMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pula partidas ja existentes e so processa as novas", async () => {
    getMatchIdsByPuuidMock.mockResolvedValue(["m1", "m2", "m3"]);
    findExistingMatchIdsMock.mockResolvedValue(new Set(["m1", "m2"]));
    getMatchMock.mockResolvedValue(rawMatch("m3"));
    getMatchTimelineMock.mockResolvedValue(rawTimeline("m3"));
    persistMatchMock.mockResolvedValue(undefined);

    const result = await syncPlayerMatches(player);

    expect(result.requested).toBe(3);
    expect(result.skippedExisting).toBe(2);
    expect(result.imported).toBe(1);
    expect(result.failed).toEqual([]);
    expect(getMatchMock).toHaveBeenCalledTimes(1);
    expect(persistMatchMock).toHaveBeenCalledTimes(1);
  });

  it("falha isolada em uma partida nao aborta as outras", async () => {
    getMatchIdsByPuuidMock.mockResolvedValue(["m1", "m2"]);
    findExistingMatchIdsMock.mockResolvedValue(new Set());
    getMatchMock.mockResolvedValueOnce(rawMatch("m1")).mockResolvedValueOnce(rawMatch("m2"));
    getMatchTimelineMock.mockResolvedValue(rawTimeline("irrelevant"));
    persistMatchMock.mockRejectedValueOnce(new Error("Foreign key violation: championId")).mockResolvedValueOnce(undefined);

    const result = await syncPlayerMatches(player);

    expect(result.imported).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].matchId).toBe("m1");
    expect(getMatchMock).toHaveBeenCalledTimes(2);
  });

  it("para o sync inteiro quando o rate limit da Riot esgota (nao tenta as demais partidas)", async () => {
    getMatchIdsByPuuidMock.mockResolvedValue(["m1", "m2"]);
    findExistingMatchIdsMock.mockResolvedValue(new Set());
    getMatchMock.mockRejectedValue(new RiotApiError("Too many requests", 429, 60));

    const result = await syncPlayerMatches(player);

    expect(result.stoppedEarly).toBe("rate_limited");
    expect(result.imported).toBe(0);
    expect(getMatchMock).toHaveBeenCalledTimes(1);
  });

  it("marca stoppedEarly max_reached quando ha mais partidas novas do que o teto configurado", async () => {
    getMatchIdsByPuuidMock.mockResolvedValue(["m1", "m2", "m3"]);
    findExistingMatchIdsMock.mockResolvedValue(new Set());
    getMatchMock.mockImplementation((matchId: string) => Promise.resolve(rawMatch(matchId)));
    getMatchTimelineMock.mockImplementation((matchId: string) => Promise.resolve(rawTimeline(matchId)));
    persistMatchMock.mockResolvedValue(undefined);

    const result = await syncPlayerMatches(player, { maxNewMatches: 2 });

    expect(result.imported).toBe(2);
    expect(result.stoppedEarly).toBe("max_reached");
  });
});
