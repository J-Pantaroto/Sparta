import type {
  CatalogEnrichment,
  MatchLoadoutObservation,
  ObservedItemSlot,
  ObservedRuneFragment,
  ObservedRuneSelection,
  ObservedSummonerSpellSlot,
  Role
} from "@sparta/core";
import { prisma } from "../../db/prisma.js";

interface StoredCatalogRow {
  catalogStatus: string;
  catalogVersion: string | null;
  itemName?: string | null;
  perkName?: string | null;
  fragmentName?: string | null;
  spellName?: string | null;
  asset?: string | null;
}

interface StoredLoadoutRow {
  extractorVersion: string;
  normalizedRole: string | null;
  normalizedRoleSource: string | null;
  teamPosition: string | null;
  individualPosition: string | null;
  positionAssignedByMatchmaking: string | null;
  assignedRole: string | null;
  positionDiverged: boolean;
  positionStatus: string;
  runesStatus: string;
  primaryStyleId: number | null;
  secondaryStyleId: number | null;
  itemSlots: Array<
    StoredCatalogRow & {
      slot: number;
      state: string;
      itemId: number | null;
      itemName: string | null;
      asset: string | null;
    }
  >;
  runeSelections: Array<
    StoredCatalogRow & {
      tree: string;
      slotOrder: number;
      perkId: number;
      perkName: string | null;
      isKeystone: boolean;
    }
  >;
  runeFragments: Array<
    StoredCatalogRow & {
      slot: string;
      state: string;
      fragmentId: number | null;
      fragmentName: string | null;
    }
  >;
  summonerSpellSlots: Array<
    StoredCatalogRow & {
      slot: number;
      state: string;
      spellId: number | null;
      spellName: string | null;
      asset: string | null;
    }
  >;
  matchParticipant: {
    championId: number;
    won: boolean;
    match: {
      matchId: string;
      platform: string;
      patch: string | null;
      gameVersion: string | null;
      queueId: number | null;
      gameMode: string | null;
      gameType: string | null;
      startedAt: Date | null;
      durationSeconds: number | null;
    };
  };
}

function observedProvenance(patch?: string) {
  return {
    sourceType: "OBSERVED" as const,
    sourceId: "riot-match-v5",
    resource: "/lol/match/v5/matches/{matchId}",
    patch,
    status: "AVAILABLE" as const
  };
}

function catalogEnrichment(row: StoredCatalogRow): CatalogEnrichment {
  const name = row.itemName ?? row.perkName ?? row.fragmentName ?? row.spellName ?? undefined;
  const status = row.catalogStatus as CatalogEnrichment["status"];
  return {
    status,
    catalogVersion: row.catalogVersion ?? undefined,
    name,
    asset: row.asset ?? undefined,
    provenance:
      status === "UNAVAILABLE"
        ? {
            sourceType: "OFFICIAL",
            sourceId: "data-dragon-local-catalog",
            status: "UNAVAILABLE",
            unavailableReason: "O catálogo persistido não resolveu este ID."
          }
        : {
            sourceType: "OFFICIAL",
            sourceId: "data-dragon-local-catalog",
            status: status === "EXACT" ? "AVAILABLE" : "STALE",
            ...(status === "OTHER_VERSION"
              ? { staleReason: "O catálogo usado pertence a outra versão." }
              : {})
          }
  };
}

function fromStoredRow(row: StoredLoadoutRow): MatchLoadoutObservation {
  const patch = row.matchParticipant.match.patch ?? undefined;
  const items: ObservedItemSlot[] = row.itemSlots.map((item) => ({
    slot: item.slot,
    state: item.state as ObservedItemSlot["state"],
    itemId: item.itemId ?? undefined,
    enrichment: catalogEnrichment(item),
    provenance: observedProvenance(patch)
  }));
  const selections: ObservedRuneSelection[] = row.runeSelections.map((selection) => ({
    tree: selection.tree as ObservedRuneSelection["tree"],
    order: selection.slotOrder,
    perkId: selection.perkId,
    isKeystone: selection.isKeystone,
    enrichment: catalogEnrichment(selection),
    provenance: observedProvenance(patch)
  }));
  const fragmentPosition = { OFFENSE: 0, FLEX: 1, DEFENSE: 2 };
  const fragments: ObservedRuneFragment[] = row.runeFragments
    .map((fragment) => ({
      slot: fragment.slot as ObservedRuneFragment["slot"],
      state: fragment.state as ObservedRuneFragment["state"],
      fragmentId: fragment.fragmentId ?? undefined,
      enrichment: catalogEnrichment(fragment),
      provenance: observedProvenance(patch)
    }))
    .sort((left, right) => fragmentPosition[left.slot] - fragmentPosition[right.slot]);
  const summonerSpells: ObservedSummonerSpellSlot[] = row.summonerSpellSlots.map((spell) => ({
    slot: spell.slot as 1 | 2,
    state: spell.state as ObservedSummonerSpellSlot["state"],
    spellId: spell.spellId ?? undefined,
    enrichment: catalogEnrichment(spell),
    provenance: observedProvenance(patch)
  }));

  return {
    extractorVersion: row.extractorVersion,
    matchId: row.matchParticipant.match.matchId,
    championId: row.matchParticipant.championId,
    context: {
      gameVersion: row.matchParticipant.match.gameVersion ?? undefined,
      patch,
      queueId: row.matchParticipant.match.queueId ?? undefined,
      gameMode: row.matchParticipant.match.gameMode ?? undefined,
      gameType: row.matchParticipant.match.gameType ?? undefined,
      platform: row.matchParticipant.match.platform,
      startedAt: row.matchParticipant.match.startedAt?.toISOString(),
      durationSeconds: row.matchParticipant.match.durationSeconds ?? undefined,
      won: row.matchParticipant.won
    },
    items,
    runes: {
      status: row.runesStatus as MatchLoadoutObservation["runes"]["status"],
      primaryStyleId: row.primaryStyleId ?? undefined,
      secondaryStyleId: row.secondaryStyleId ?? undefined,
      selections,
      fragments,
      provenance: {
        ...observedProvenance(patch),
        status: row.runesStatus as MatchLoadoutObservation["runes"]["status"]
      }
    },
    summonerSpells,
    position: {
      teamPosition: row.teamPosition ?? undefined,
      individualPosition: row.individualPosition ?? undefined,
      positionAssignedByMatchmaking: row.positionAssignedByMatchmaking ?? undefined,
      normalizedRole: row.normalizedRole as Role | undefined,
      normalizedRoleSource:
        row.normalizedRoleSource as MatchLoadoutObservation["position"]["normalizedRoleSource"],
      assignedRole: row.assignedRole as Role | undefined,
      diverged: row.positionDiverged,
      status: row.positionStatus as MatchLoadoutObservation["position"]["status"],
      observedProvenance: observedProvenance(patch),
      normalizedProvenance: {
        sourceType: "CALCULATED",
        sourceId: "sparta",
        resource: "MatchObservation.normalizedRole",
        algorithmVersion: row.extractorVersion,
        patch,
        status: row.positionStatus as MatchLoadoutObservation["position"]["status"]
      }
    }
  };
}

/**
 * Lê somente as observações normalizadas do jogador/campeão/posição.
 * Filtros temporais, patch, fila e recência ficam no agregador puro para que
 * o mesmo conjunto também possa produzir o histórico separado.
 */
export async function findPersonalLoadoutObservations(
  puuid: string,
  championId: number,
  role: Role
): Promise<MatchLoadoutObservation[]> {
  const rows = await prisma.matchObservation.findMany({
    where: {
      positionStatus: "AVAILABLE",
      normalizedRole: role,
      matchParticipant: {
        puuid,
        championId
      }
    },
    include: {
      itemSlots: { orderBy: { slot: "asc" } },
      runeSelections: { orderBy: [{ tree: "asc" }, { slotOrder: "asc" }] },
      runeFragments: true,
      summonerSpellSlots: { orderBy: { slot: "asc" } },
      matchParticipant: { include: { match: true } }
    }
  });
  return rows.map((row) => fromStoredRow(row as unknown as StoredLoadoutRow));
}
