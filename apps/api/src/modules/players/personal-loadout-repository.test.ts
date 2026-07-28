import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({ findManyMock: vi.fn() }));

vi.mock("../../db/prisma.js", () => ({
  prisma: { matchObservation: { findMany: findManyMock } }
}));

import { findPersonalLoadoutObservations } from "./personal-loadout-repository.js";

function catalog(status = "EXACT") {
  return {
    catalogStatus: status,
    catalogVersion: status === "UNAVAILABLE" ? null : "16.14"
  };
}

describe("findPersonalLoadoutObservations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("consulta estritamente jogador, campeão e posição e reconstrói IDs originais", async () => {
    findManyMock.mockResolvedValue([
      {
        extractorVersion: "match-observation/1.0.0",
        normalizedRole: "SUPPORT",
        normalizedRoleSource: "TEAM_POSITION",
        teamPosition: "UTILITY",
        individualPosition: "UTILITY",
        positionAssignedByMatchmaking: "UTILITY",
        assignedRole: "SUPPORT",
        positionDiverged: false,
        positionStatus: "AVAILABLE",
        runesStatus: "PARTIAL",
        primaryStyleId: 8200,
        secondaryStyleId: 8300,
        itemSlots: [
          {
            slot: 0,
            state: "PRESENT",
            itemId: 999999,
            itemName: null,
            asset: null,
            ...catalog("UNAVAILABLE")
          },
          {
            slot: 1,
            state: "EMPTY",
            itemId: null,
            itemName: null,
            asset: null,
            ...catalog("UNAVAILABLE")
          }
        ],
        runeSelections: [
          {
            tree: "PRIMARY",
            slotOrder: 0,
            perkId: 8214,
            perkName: "Invocar Aery",
            isKeystone: true,
            ...catalog()
          }
        ],
        runeFragments: [
          {
            slot: "OFFENSE",
            state: "PRESENT",
            fragmentId: 5005,
            fragmentName: "Velocidade de ataque",
            ...catalog()
          }
        ],
        summonerSpellSlots: [
          {
            slot: 1,
            state: "PRESENT",
            spellId: 4,
            spellName: "Flash",
            asset: "flash.png",
            ...catalog()
          }
        ],
        matchParticipant: {
          championId: 161,
          won: true,
          match: {
            matchId: "BR1_1",
            platform: "BR1",
            patch: "16.14",
            gameVersion: "16.14.1",
            queueId: 420,
            gameMode: "CLASSIC",
            gameType: "MATCHED_GAME",
            startedAt: new Date("2026-07-20T12:00:00.000Z"),
            durationSeconds: 1800
          }
        }
      }
    ]);

    const result = await findPersonalLoadoutObservations("puuid-1", 161, "SUPPORT");

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          positionStatus: "AVAILABLE",
          normalizedRole: "SUPPORT",
          matchParticipant: { puuid: "puuid-1", championId: 161 }
        }
      })
    );
    expect(result[0]).toMatchObject({
      matchId: "BR1_1",
      championId: 161,
      context: { patch: "16.14", queueId: 420, won: true },
      items: [
        {
          slot: 0,
          state: "PRESENT",
          itemId: 999999,
          enrichment: { status: "UNAVAILABLE" }
        },
        { slot: 1, state: "EMPTY" }
      ],
      runes: {
        status: "PARTIAL",
        selections: [{ perkId: 8214 }]
      },
      summonerSpells: [{ slot: 1, spellId: 4 }],
      position: { normalizedRole: "SUPPORT" }
    });
  });

  it("não cria fallback quando não há observação normalizada", async () => {
    findManyMock.mockResolvedValue([]);

    await expect(findPersonalLoadoutObservations("puuid-1", 161, "MID")).resolves.toEqual([]);
  });
});
