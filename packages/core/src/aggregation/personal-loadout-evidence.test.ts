import { describe, expect, it } from "vitest";
import type {
  CatalogEnrichment,
  MatchLoadoutObservation,
  ObservedRunePage
} from "../types/match-observation.js";
import {
  aggregatePersonalLoadoutEvidence,
  PERSONAL_LOADOUT_EVIDENCE_VERSION
} from "./personal-loadout-evidence.js";

const observed = {
  sourceType: "OBSERVED" as const,
  sourceId: "riot-match-v5",
  status: "AVAILABLE" as const
};

function enrichment(id: number, status: CatalogEnrichment["status"] = "EXACT"): CatalogEnrichment {
  return {
    status,
    ...(status === "UNAVAILABLE"
      ? {}
      : {
          catalogVersion: status === "EXACT" ? "16.14" : "16.13",
          name: `Nome ${id}`,
          asset: `${id}.png`
        }),
    provenance: {
      sourceType: "OFFICIAL",
      sourceId: "data-dragon-local-catalog",
      status:
        status === "EXACT" ? "AVAILABLE" : status === "OTHER_VERSION" ? "STALE" : "UNAVAILABLE"
    }
  };
}

function runePage(overrides: Partial<ObservedRunePage> = {}): ObservedRunePage {
  return {
    status: "AVAILABLE",
    primaryStyleId: 8200,
    secondaryStyleId: 8300,
    selections: [
      {
        tree: "PRIMARY",
        order: 0,
        perkId: 8214,
        isKeystone: true,
        enrichment: enrichment(8214),
        provenance: observed
      },
      {
        tree: "SECONDARY",
        order: 0,
        perkId: 8347,
        isKeystone: false,
        enrichment: enrichment(8347),
        provenance: observed
      }
    ],
    fragments: [
      {
        slot: "OFFENSE",
        state: "PRESENT",
        fragmentId: 5005,
        enrichment: enrichment(5005),
        provenance: observed
      },
      {
        slot: "FLEX",
        state: "PRESENT",
        fragmentId: 5008,
        enrichment: enrichment(5008),
        provenance: observed
      },
      {
        slot: "DEFENSE",
        state: "PRESENT",
        fragmentId: 5001,
        enrichment: enrichment(5001),
        provenance: observed
      }
    ],
    provenance: observed,
    ...overrides
  };
}

function observation(
  matchId: string,
  overrides: Partial<MatchLoadoutObservation> = {}
): MatchLoadoutObservation {
  return {
    extractorVersion: "match-observation/1.0.0",
    matchId,
    championId: 161,
    context: {
      patch: "16.14",
      queueId: 420,
      gameMode: "CLASSIC",
      gameType: "MATCHED_GAME",
      platform: "BR1",
      startedAt: "2026-07-20T12:00:00.000Z",
      won: true
    },
    items: [1001, 1001, 3078, 0, 0, 0, 0].map((itemId, slot) =>
      itemId === 0
        ? {
            slot,
            state: "EMPTY" as const,
            enrichment: enrichment(0, "UNAVAILABLE"),
            provenance: observed
          }
        : {
            slot,
            state: "PRESENT" as const,
            itemId,
            enrichment: enrichment(itemId),
            provenance: observed
          }
    ),
    runes: runePage(),
    summonerSpells: [
      {
        slot: 1,
        state: "PRESENT",
        spellId: 4,
        enrichment: enrichment(4),
        provenance: observed
      },
      {
        slot: 2,
        state: "PRESENT",
        spellId: 14,
        enrichment: enrichment(14),
        provenance: observed
      }
    ],
    position: {
      normalizedRole: "SUPPORT",
      normalizedRoleSource: "TEAM_POSITION",
      diverged: false,
      status: "AVAILABLE",
      observedProvenance: observed,
      normalizedProvenance: {
        sourceType: "CALCULATED",
        sourceId: "sparta",
        status: "AVAILABLE"
      }
    },
    ...overrides
  };
}

const filters = { championId: 161, role: "SUPPORT" as const };

describe("aggregatePersonalLoadoutEvidence", () => {
  it("agrupa inventários iguais em slots diferentes, preserva duplicatas e ignora item zero", () => {
    const first = observation("BR1_1");
    const second = observation("BR1_2", {
      context: {
        ...observation("base").context,
        startedAt: "2026-07-21T12:00:00.000Z",
        won: false
      },
      items: [3078, 0, 1001, 0, 1001, 0, 0].map((itemId, slot) =>
        itemId === 0
          ? {
              slot,
              state: "EMPTY" as const,
              enrichment: enrichment(0, "UNAVAILABLE"),
              provenance: observed
            }
          : {
              slot,
              state: "PRESENT" as const,
              itemId,
              enrichment: enrichment(itemId),
              provenance: observed
            }
      )
    });

    const result = aggregatePersonalLoadoutEvidence([second, first], filters);

    expect(result.finalInventories).toHaveLength(1);
    expect(result.finalInventories[0]).toMatchObject({
      itemIds: [1001, 1001, 3078],
      games: 2,
      wins: 1,
      losses: 1
    });
    expect(result.finalInventories[0]?.items.find((item) => item.id === 1001)?.quantity).toBe(2);
    expect(result.finalInventories[0]?.itemIds).not.toContain(0);
  });

  it("preserva ID desconhecido mesmo quando o catálogo não resolve nome nem asset", () => {
    const input = observation("BR1_unknown");
    input.items[0] = {
      slot: 0,
      state: "PRESENT",
      itemId: 999999,
      enrichment: enrichment(999999, "UNAVAILABLE"),
      provenance: observed
    };

    const result = aggregatePersonalLoadoutEvidence([input], filters);
    const item = result.finalInventories[0]?.items.find((entry) => entry.id === 999999);

    expect(item).toMatchObject({ id: 999999, status: "UNAVAILABLE", names: [], assets: [] });
    expect(result.finalInventories[0]?.limitations.join(" ")).toContain("999999");
  });

  it("não agrupa páginas diferentes nem transforma página parcial em completa", () => {
    const complete = observation("BR1_complete");
    const different = observation("BR1_different", {
      runes: runePage({
        selections: runePage().selections.map((selection, index) =>
          index === 0 ? { ...selection, perkId: 8229, enrichment: enrichment(8229) } : selection
        )
      })
    });
    const partial = observation("BR1_partial", {
      runes: runePage({
        status: "PARTIAL",
        fragments: runePage().fragments.map((fragment) =>
          fragment.slot === "DEFENSE"
            ? {
                ...fragment,
                state: "UNAVAILABLE" as const,
                fragmentId: undefined,
                enrichment: enrichment(0, "UNAVAILABLE")
              }
            : fragment
        )
      })
    });

    const result = aggregatePersonalLoadoutEvidence([partial, different, complete], filters);

    expect(result.runePages).toHaveLength(3);
    expect(result.runePages.filter((pattern) => pattern.status === "PARTIAL")).toHaveLength(1);
    expect(
      result.runePages.find((pattern) => pattern.status === "PARTIAL")?.fragments
    ).toContainEqual({ slot: "DEFENSE" });
  });

  it("trata pares invertidos como equivalentes e preserva as ordens observadas", () => {
    const inverted = observation("BR1_inverted", {
      summonerSpells: [
        {
          slot: 1,
          state: "PRESENT",
          spellId: 14,
          enrichment: enrichment(14),
          provenance: observed
        },
        {
          slot: 2,
          state: "PRESENT",
          spellId: 4,
          enrichment: enrichment(4),
          provenance: observed
        }
      ]
    });

    const result = aggregatePersonalLoadoutEvidence(
      [observation("BR1_regular"), inverted],
      filters
    );

    expect(result.summonerSpellSets).toHaveLength(1);
    expect(result.summonerSpellSets[0]).toMatchObject({
      spellIds: [4, 14],
      games: 2,
      observedOrders: [
        [4, 14],
        [14, 4]
      ]
    });
  });

  it("mantém posição estrita e ausência não vira MID", () => {
    const support = observation("BR1_support");
    const missingRole = observation("BR1_missing", {
      position: {
        diverged: false,
        status: "UNAVAILABLE",
        observedProvenance: observed,
        normalizedProvenance: {
          sourceType: "CALCULATED",
          sourceId: "sparta",
          status: "UNAVAILABLE"
        }
      }
    });

    expect(aggregatePersonalLoadoutEvidence([support, missingRole], filters).sampleSize).toBe(1);
    const mid = aggregatePersonalLoadoutEvidence([support, missingRole], {
      championId: 161,
      role: "MID"
    });
    expect(mid.status).toBe("UNAVAILABLE");
    expect(mid.sampleSize).toBe(0);
  });

  it("separa patch solicitado de histórico anterior sem apresentá-lo como atual", () => {
    const old = observation("BR1_old", {
      context: {
        ...observation("base").context,
        patch: "16.13",
        startedAt: "2026-07-10T12:00:00.000Z"
      }
    });

    const absentCurrent = aggregatePersonalLoadoutEvidence([old], {
      ...filters,
      requestedPatch: "16.14.1"
    });

    expect(absentCurrent.status).toBe("UNAVAILABLE");
    expect(absentCurrent.patchScope.hasRequestedPatchObservations).toBe(false);
    expect(absentCurrent.recentHistory).toMatchObject({
      status: "STALE",
      sampleSize: 1,
      patchScope: { observedPatches: ["16.13"] }
    });
    expect(absentCurrent.recentHistory?.staleReason).toContain("16.14.1");
  });

  it("mantém disponibilidade independente entre itens, runas e feitiços", () => {
    const input = observation("BR1_partial_parts", {
      runes: {
        status: "UNAVAILABLE",
        selections: [],
        fragments: [],
        provenance: {
          ...observed,
          status: "UNAVAILABLE",
          unavailableReason: "Campo perks ausente."
        }
      }
    });

    const result = aggregatePersonalLoadoutEvidence([input], filters);

    expect(result.status).toBe("PARTIAL");
    expect(result.parts.finalInventories.status).toBe("AVAILABLE");
    expect(result.parts.runePages.status).toBe("UNAVAILABLE");
    expect(result.parts.summonerSpellSets.status).toBe("AVAILABLE");
    expect(result.runePages).toEqual([]);
  });

  it("filtra fila/data/recência e ordena padrões de forma determinística sem mutar o input", () => {
    const newest = observation("BR1_newest", {
      context: {
        ...observation("base").context,
        queueId: 440,
        startedAt: "2026-07-22T12:00:00.000Z"
      }
    });
    const middle = observation("BR1_middle", {
      context: {
        ...observation("base").context,
        startedAt: "2026-07-21T12:00:00.000Z"
      }
    });
    const oldest = observation("BR1_oldest", {
      context: {
        ...observation("base").context,
        startedAt: "2026-07-19T12:00:00.000Z"
      }
    });
    const input = [oldest, newest, middle];
    const copy = JSON.parse(JSON.stringify(input));
    const requested = {
      ...filters,
      queueIds: [420],
      playedAtFrom: "2026-07-20T00:00:00.000Z",
      recentMatches: 1
    };

    const first = aggregatePersonalLoadoutEvidence(input, requested);
    const second = aggregatePersonalLoadoutEvidence([...input].reverse(), requested);

    expect(first).toEqual(second);
    expect(first.sampleSize).toBe(1);
    expect(first.queueScope).toMatchObject({
      requestedQueueIds: [420],
      observedQueueIds: [420]
    });
    expect(first.algorithmVersion).toBe(PERSONAL_LOADOUT_EVIDENCE_VERSION);
    expect(input).toEqual(copy);
    expect(first.finalInventories[0]?.limitations.join(" ")).toContain("Amostra de uma partida");
  });

  it("compara período por instante e desempata datas ausentes por matchId", () => {
    const beforeWindow = observation("BR1_before", {
      context: {
        ...observation("base").context,
        startedAt: "2026-07-20T02:00:00.000Z"
      }
    });
    const missingB = observation("BR1_b", {
      context: { ...observation("base").context, startedAt: undefined }
    });
    const missingA = observation("BR1_a", {
      context: { ...observation("base").context, startedAt: undefined }
    });

    const filtered = aggregatePersonalLoadoutEvidence([beforeWindow], {
      ...filters,
      playedAtFrom: "2026-07-20T00:00:00.000-03:00"
    });
    const firstMissing = aggregatePersonalLoadoutEvidence([missingB, missingA], {
      ...filters,
      recentMatches: 1
    });
    const reversedMissing = aggregatePersonalLoadoutEvidence([missingA, missingB], {
      ...filters,
      recentMatches: 1
    });

    expect(filtered.status).toBe("UNAVAILABLE");
    expect(firstMissing).toEqual(reversedMissing);
    expect(firstMissing.sampleSize).toBe(1);
  });
});
