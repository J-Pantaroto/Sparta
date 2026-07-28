import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MATCH_OBSERVATION_EXTRACTOR_VERSION, type RiotMatchDto } from "@sparta/riot";
import { persistMatchObservationsInTransaction } from "./match-observation-repository.js";

const raw = {
  metadata: { matchId: "BR1_1", participants: ["p1"] },
  info: {
    gameDuration: 1800,
    gameVersion: "16.14.794.5912",
    gameStartTimestamp: 1_721_000_000_000,
    queueId: 420,
    gameMode: "CLASSIC",
    gameType: "MATCHED_GAME",
    participants: [
      {
        puuid: "p1",
        championId: 61,
        championName: "Orianna",
        teamId: 100,
        teamPosition: "MIDDLE",
        individualPosition: "MIDDLE",
        positionAssignedByMatchmaking: "BOTTOM",
        item0: 0,
        item1: 6655,
        item2: 3089,
        item3: 3020,
        item4: 4645,
        item5: 3135,
        item6: 3363,
        summoner1Id: 14,
        summoner2Id: 4,
        perks: {
          styles: [
            { description: "primaryStyle", style: 8200, selections: [{ perk: 8214 }] },
            { description: "subStyle", style: 8300, selections: [{ perk: 8347 }] }
          ],
          statPerks: { offense: 5005, flex: 5008, defense: 5001 }
        },
        win: true,
        kills: 5,
        deaths: 2,
        assists: 7,
        totalMinionsKilled: 180,
        neutralMinionsKilled: 5,
        goldEarned: 12000,
        totalDamageDealtToChampions: 24000,
        visionScore: 30
      }
    ]
  }
} as RiotMatchDto;

function transaction(existingVersion?: string) {
  const matchUpdate = vi.fn().mockResolvedValue(undefined);
  const participantFindMany = vi.fn().mockResolvedValue([
    {
      id: "participant-db",
      puuid: "p1",
      observation: existingVersion
        ? { id: "observation-db", extractorVersion: existingVersion }
        : null
    }
  ]);
  const participantUpdate = vi.fn().mockResolvedValue(undefined);
  const observationDelete = vi.fn().mockResolvedValue(undefined);
  const observationCreate = vi.fn().mockResolvedValue(undefined);
  return {
    client: {
      match: { update: matchUpdate },
      matchParticipant: { findMany: participantFindMany, update: participantUpdate },
      matchObservation: { delete: observationDelete, create: observationCreate }
    } as unknown as Prisma.TransactionClient,
    matchUpdate,
    participantUpdate,
    observationDelete,
    observationCreate
  };
}

describe("persistMatchObservationsInTransaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("não regrava nem duplica filhos na mesma versão do extrator", async () => {
    const tx = transaction(MATCH_OBSERVATION_EXTRACTOR_VERSION);

    const result = await persistMatchObservationsInTransaction(tx.client, "match-db", "BR1", raw);

    expect(result).toEqual({ extracted: 1, updated: 0, unavailable: 0 });
    expect(tx.observationDelete).not.toHaveBeenCalled();
    expect(tx.observationCreate).not.toHaveBeenCalled();
    expect(tx.participantUpdate).not.toHaveBeenCalled();
  });

  it("substitui a versão antiga e grava slots/ordens sem duplicar", async () => {
    const tx = transaction("match-observation/0.9.0");

    const result = await persistMatchObservationsInTransaction(tx.client, "match-db", "BR1", raw);

    expect(result).toEqual({ extracted: 1, updated: 1, unavailable: 0 });
    expect(tx.observationDelete).toHaveBeenCalledWith({ where: { id: "observation-db" } });
    const data = tx.observationCreate.mock.calls[0][0].data;
    expect(data.itemSlots.create).toHaveLength(7);
    expect(data.itemSlots.create[0]).toMatchObject({ slot: 0, state: "EMPTY", itemId: undefined });
    expect(
      data.runeSelections.create.map((entry: { tree: string; slotOrder: number }) => [
        entry.tree,
        entry.slotOrder
      ])
    ).toEqual([
      ["PRIMARY", 0],
      ["SECONDARY", 0]
    ]);
    expect(data.runeFragments.create).toHaveLength(3);
    expect(
      data.summonerSpellSlots.create.map((entry: { slot: number; spellId: number }) => [
        entry.slot,
        entry.spellId
      ])
    ).toEqual([
      [1, 14],
      [2, 4]
    ]);
    expect(data).toMatchObject({
      normalizedRole: "MID",
      normalizedRoleSource: "TEAM_POSITION",
      assignedRole: "ADC",
      positionDiverged: true
    });
  });
});
