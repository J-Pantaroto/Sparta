import { beforeEach, describe, expect, it, vi } from "vitest";

const { participantFindFirstMock, participantFindManyMock, observationMock } = vi.hoisted(() => ({
  participantFindFirstMock: vi.fn(),
  participantFindManyMock: vi.fn(),
  observationMock: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    matchParticipant: {
      findFirst: participantFindFirstMock,
      findMany: participantFindManyMock
    }
  }
}));

vi.mock("./match-observation-repository.js", () => ({
  findMatchLoadoutObservation: observationMock
}));

import { findMatchParticipantsOverview } from "./match-participants-repository.js";

describe("findMatchParticipantsOverview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve null quando o puuid solicitante não tem linha nesta partida (posse implícita)", async () => {
    participantFindFirstMock.mockResolvedValue(null);
    const result = await findMatchParticipantsOverview("BR1_1", "outro-puuid");
    expect(result).toBeNull();
    expect(participantFindManyMock).not.toHaveBeenCalled();
  });

  it("monta os 10 participantes com a linha do jogador marcada e teamId ausente preservado", async () => {
    participantFindFirstMock.mockResolvedValue({ id: "own-row" });
    participantFindManyMock.mockResolvedValue([
      {
        puuid: "own-puuid",
        teamId: 100,
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
        objectiveParticipation: 0.4
      },
      {
        puuid: "legacy-puuid",
        teamId: null,
        championId: 1,
        champion: { name: "Annie" },
        role: null,
        won: false,
        kills: 1,
        deaths: 6,
        assists: 2,
        csPerMinute: 4.1,
        goldPerMinute: 250,
        damagePerMinute: 300,
        visionScorePerMinute: 0.5,
        killParticipation: null,
        objectiveParticipation: null
      }
    ]);
    observationMock.mockResolvedValueOnce({ extractorVersion: "match-observation/1.0.0" }).mockResolvedValueOnce(null);

    const result = await findMatchParticipantsOverview("BR1_1", "own-puuid");

    expect(result?.matchId).toBe("BR1_1");
    expect(result?.participants).toHaveLength(2);
    const own = result?.participants.find((p) => p.puuid === "own-puuid");
    expect(own?.isTrackedPlayer).toBe(true);
    expect(own?.teamId).toBe(100);
    expect(own?.loadout).toEqual({ extractorVersion: "match-observation/1.0.0" });

    const legacy = result?.participants.find((p) => p.puuid === "legacy-puuid");
    expect(legacy?.isTrackedPlayer).toBe(false);
    expect(legacy?.teamId).toBeUndefined();
    expect(legacy?.role).toBeUndefined();
    expect(legacy?.killParticipation).toBeUndefined();
    expect(legacy?.loadout).toBeUndefined();
  });
});
