import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMatchesMissingParticipantsMock, backfillMatchParticipantsMock } = vi.hoisted(() => ({
  findMatchesMissingParticipantsMock: vi.fn(),
  backfillMatchParticipantsMock: vi.fn()
}));

vi.mock("./match-repository.js", () => ({
  findMatchesMissingParticipants: findMatchesMissingParticipantsMock,
  backfillMatchParticipants: backfillMatchParticipantsMock
}));

import { backfillMatchParticipantsFromRawJson } from "./backfill-participants.js";

const PUUID_TRACKED = "puuid-tracked";
const PUUID_ENEMY = "puuid-enemy";

function rawMatchJson(matchId: string) {
  return {
    metadata: { matchId, participants: [PUUID_TRACKED, PUUID_ENEMY] },
    info: {
      gameDuration: 1800,
      gameVersion: "14.14.1.1",
      gameStartTimestamp: 1720000000000,
      participants: [
        {
          puuid: PUUID_TRACKED,
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
          puuid: PUUID_ENEMY,
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

describe("backfillMatchParticipantsFromRawJson", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reconstroi os participantes a partir do rawJson e chama backfillMatchParticipants por partida", async () => {
    findMatchesMissingParticipantsMock.mockResolvedValue([
      { id: "db-1", matchId: "m1", rawJson: rawMatchJson("m1") }
    ]);
    backfillMatchParticipantsMock.mockResolvedValue({ skippedParticipantPuuids: [] });

    const summary = await backfillMatchParticipantsFromRawJson();

    expect(backfillMatchParticipantsMock).toHaveBeenCalledTimes(1);
    const [matchDbId, participants] = backfillMatchParticipantsMock.mock.calls[0];
    expect(matchDbId).toBe("db-1");
    expect(participants).toHaveLength(2);
    expect(participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamId: 100, summary: expect.objectContaining({ puuid: PUUID_TRACKED }) }),
        expect.objectContaining({ teamId: 200, summary: expect.objectContaining({ puuid: PUUID_ENEMY }) })
      ])
    );
    expect(summary.matchesProcessed).toBe(1);
    expect(summary.participantsInserted).toBe(2);
  });

  it("acumula participantes pulados e nao interrompe o backfill quando uma partida falha", async () => {
    findMatchesMissingParticipantsMock.mockResolvedValue([
      { id: "db-1", matchId: "m1", rawJson: rawMatchJson("m1") },
      { id: "db-2", matchId: "m2", rawJson: rawMatchJson("m2") }
    ]);
    backfillMatchParticipantsMock
      .mockResolvedValueOnce({ skippedParticipantPuuids: [PUUID_ENEMY] })
      .mockRejectedValueOnce(new Error("erro de banco"));

    const summary = await backfillMatchParticipantsFromRawJson();

    expect(summary.matchesProcessed).toBe(1);
    expect(summary.skippedParticipants).toEqual([{ matchId: "m1", puuid: PUUID_ENEMY }]);
    expect(summary.matchesWithErrors).toEqual([{ matchId: "m2", reason: "erro de banco" }]);
  });

  it("pula partidas sem rawJson em vez de falhar", async () => {
    findMatchesMissingParticipantsMock.mockResolvedValue([{ id: "db-1", matchId: "m1", rawJson: null }]);

    const summary = await backfillMatchParticipantsFromRawJson();

    expect(backfillMatchParticipantsMock).not.toHaveBeenCalled();
    expect(summary.matchesProcessed).toBe(0);
  });
});
