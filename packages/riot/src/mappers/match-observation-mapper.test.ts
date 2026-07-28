import { describe, expect, it } from "vitest";
import {
  extractMatchLoadoutObservations,
  extractPlayerChampionRoleObservation,
  type RiotMatchDto,
  type RiotMatchParticipantDto
} from "../index.js";

function participant(overrides: Partial<RiotMatchParticipantDto> = {}): RiotMatchParticipantDto {
  return {
    puuid: "player",
    championId: 61,
    championName: "Orianna",
    teamId: 100,
    teamPosition: "MIDDLE",
    individualPosition: "MIDDLE",
    positionAssignedByMatchmaking: "MIDDLE",
    win: true,
    kills: 5,
    deaths: 2,
    assists: 7,
    totalMinionsKilled: 180,
    neutralMinionsKilled: 10,
    goldEarned: 12000,
    totalDamageDealtToChampions: 24000,
    visionScore: 30,
    ...overrides
  };
}

function match(value: RiotMatchParticipantDto): RiotMatchDto {
  return {
    metadata: { matchId: "BR1_1", participants: [value.puuid] },
    info: {
      gameDuration: 1800,
      gameVersion: "16.14.794.5912",
      gameStartTimestamp: 1_721_000_000_000,
      queueId: 420,
      gameMode: "CLASSIC",
      gameType: "MATCHED_GAME",
      participants: [value]
    }
  };
}

describe("match observation mapper", () => {
  it("preserva os sete slots finais e separa vazio, ausente e ID desconhecido", () => {
    const rawParticipant = participant({ item0: 0, item1: 999999, item3: 2003, item6: 3340 });
    const [observation] = extractMatchLoadoutObservations(match(rawParticipant), {
      platform: "BR1"
    });

    expect(observation.items).toHaveLength(7);
    expect(observation.items[0]).toMatchObject({ slot: 0, state: "EMPTY" });
    expect(observation.items[0]).not.toHaveProperty("itemId");
    expect(observation.items[1]).toMatchObject({
      slot: 1,
      state: "PRESENT",
      itemId: 999999,
      enrichment: { status: "UNAVAILABLE" }
    });
    expect(observation.items[2]).toMatchObject({ slot: 2, state: "UNAVAILABLE" });
    expect(observation.items[2]).not.toHaveProperty("itemId");
    expect(observation.items[3]).toMatchObject({ slot: 3, state: "PRESENT", itemId: 2003 });
    expect(observation.items[6]).toMatchObject({ slot: 6, state: "PRESENT", itemId: 3340 });
  });

  it("não transforma runas ausentes em página vazia disponível", () => {
    const [observation] = extractMatchLoadoutObservations(match(participant()), {
      platform: "BR1"
    });

    expect(observation.runes).toMatchObject({
      status: "UNAVAILABLE",
      selections: [],
      fragments: []
    });
  });

  it("preserva ordem das árvores, identifica a keystone e separa fragmentos", () => {
    const rawParticipant = participant({
      perks: {
        styles: [
          {
            description: "primaryStyle",
            style: 8200,
            selections: [{ perk: 8214 }, { perk: 8226 }, { perk: 8210 }, { perk: 8237 }]
          },
          {
            description: "subStyle",
            style: 8300,
            selections: [{ perk: 8304 }, { perk: 8347 }]
          }
        ],
        statPerks: { offense: 5005, flex: 5008, defense: 5001 }
      }
    });
    const [observation] = extractMatchLoadoutObservations(match(rawParticipant), {
      platform: "BR1"
    });

    expect(observation.runes.status).toBe("AVAILABLE");
    expect(
      observation.runes.selections.map(({ tree, order, perkId, isKeystone }) => ({
        tree,
        order,
        perkId,
        isKeystone
      }))
    ).toEqual([
      { tree: "PRIMARY", order: 0, perkId: 8214, isKeystone: true },
      { tree: "PRIMARY", order: 1, perkId: 8226, isKeystone: false },
      { tree: "PRIMARY", order: 2, perkId: 8210, isKeystone: false },
      { tree: "PRIMARY", order: 3, perkId: 8237, isKeystone: false },
      { tree: "SECONDARY", order: 0, perkId: 8304, isKeystone: false },
      { tree: "SECONDARY", order: 1, perkId: 8347, isKeystone: false }
    ]);
    expect(
      observation.runes.fragments.map(({ slot, fragmentId }) => ({ slot, fragmentId }))
    ).toEqual([
      { slot: "OFFENSE", fragmentId: 5005 },
      { slot: "FLEX", fragmentId: 5008 },
      { slot: "DEFENSE", fragmentId: 5001 }
    ]);
  });

  it("mantém a ordem dos dois feitiços e o contexto real da partida", () => {
    const [observation] = extractMatchLoadoutObservations(
      match(participant({ summoner1Id: 14, summoner2Id: 4 })),
      { platform: "BR1" }
    );

    expect(observation.summonerSpells.map(({ slot, spellId }) => ({ slot, spellId }))).toEqual([
      { slot: 1, spellId: 14 },
      { slot: 2, spellId: 4 }
    ]);
    expect(observation.context).toMatchObject({
      gameVersion: "16.14.794.5912",
      patch: "16.14",
      queueId: 420,
      gameMode: "CLASSIC",
      gameType: "MATCHED_GAME",
      platform: "BR1",
      durationSeconds: 1800,
      won: true
    });
  });

  it("preserva divergência e não deixa matchmaking divergente substituir a posição jogada", () => {
    const position = extractPlayerChampionRoleObservation({
      teamPosition: "MIDDLE",
      individualPosition: "MIDDLE",
      positionAssignedByMatchmaking: "BOTTOM"
    });

    expect(position).toMatchObject({
      teamPosition: "MIDDLE",
      individualPosition: "MIDDLE",
      positionAssignedByMatchmaking: "BOTTOM",
      normalizedRole: "MID",
      normalizedRoleSource: "TEAM_POSITION",
      assignedRole: "ADC",
      diverged: true
    });
  });

  it("usa individualPosition como fallback e nunca inventa MID", () => {
    expect(
      extractPlayerChampionRoleObservation({
        teamPosition: "NONE",
        individualPosition: "TOP",
        positionAssignedByMatchmaking: "INVALID"
      })
    ).toMatchObject({ normalizedRole: "TOP", normalizedRoleSource: "INDIVIDUAL_POSITION" });

    expect(
      extractPlayerChampionRoleObservation({
        teamPosition: "",
        individualPosition: "UNKNOWN",
        positionAssignedByMatchmaking: "NONE"
      })
    ).toMatchObject({
      normalizedRole: undefined,
      normalizedRoleSource: undefined,
      status: "UNAVAILABLE"
    });
  });

  it("rejeita números não finitos sem produzir NaN ou Infinity", () => {
    const rawParticipant = participant({
      item0: Number.NaN,
      summoner1Id: Number.POSITIVE_INFINITY
    });
    const [observation] = extractMatchLoadoutObservations(match(rawParticipant), {
      platform: "BR1"
    });

    expect(observation.items[0]).toMatchObject({ state: "UNAVAILABLE" });
    expect(observation.items[0]).not.toHaveProperty("itemId");
    expect(observation.summonerSpells[0]).toMatchObject({ state: "UNAVAILABLE" });
    expect(observation.summonerSpells[0].spellId).toBeUndefined();
  });
});
