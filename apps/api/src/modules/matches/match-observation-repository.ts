import type { Prisma } from "@prisma/client";
import type {
  CatalogEnrichment,
  MatchLoadoutObservation,
  ObservedItemSlot,
  ObservedRuneFragment,
  ObservedRuneSelection,
  ObservedSummonerSpellSlot
} from "@sparta/core";
import {
  MATCH_OBSERVATION_EXTRACTOR_VERSION,
  extractMatchLoadoutObservations,
  type RiotMatchDto
} from "@sparta/riot";
import { prisma } from "../../db/prisma.js";

const observedProvenance = (patch?: string) => ({
  sourceType: "OBSERVED" as const,
  sourceId: "riot-match-v5",
  resource: "/lol/match/v5/matches/{matchId}",
  patch,
  status: "AVAILABLE" as const
});

function catalogEnrichment(row: {
  catalogStatus: string;
  catalogVersion: string | null;
  itemName?: string | null;
  perkName?: string | null;
  fragmentName?: string | null;
  spellName?: string | null;
  asset?: string | null;
}): CatalogEnrichment {
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
            unavailableReason: "Catálogo local compatível não disponível."
          }
        : {
            sourceType: "OFFICIAL",
            sourceId: "data-dragon-local-catalog",
            status: status === "EXACT" ? "AVAILABLE" : "STALE",
            ...(status === "OTHER_VERSION"
              ? { staleReason: "Versão do catálogo local diverge do patch observado." }
              : {})
          }
  };
}

export interface PersistObservationResult {
  extracted: number;
  updated: number;
  unavailable: number;
}

/**
 * Persiste observações em entidades consultáveis. Uma observação na versão
 * atual é ignorada; ao mudar a versão do extrator, filhos são substituídos
 * dentro da mesma transação, sem duplicatas.
 */
export async function persistMatchObservationsInTransaction(
  tx: Prisma.TransactionClient,
  matchDbId: string,
  platform: string,
  raw: RiotMatchDto
): Promise<PersistObservationResult> {
  const extracted = extractMatchLoadoutObservations(raw, { platform });
  const context = extracted[0]?.context;
  if (context) {
    await tx.match.update({
      where: { id: matchDbId },
      data: {
        gameVersion: context.gameVersion,
        patch: context.patch,
        queueId: context.queueId,
        gameMode: context.gameMode,
        gameType: context.gameType,
        durationSeconds: context.durationSeconds,
        startedAt: context.startedAt ? new Date(context.startedAt) : undefined
      }
    });
  }
  if (extracted.length === 0) return { extracted: 0, updated: 0, unavailable: 0 };

  const participants = await tx.matchParticipant.findMany({
    where: { matchId: matchDbId },
    select: {
      id: true,
      puuid: true,
      observation: { select: { id: true, extractorVersion: true } }
    }
  });
  const participantByPuuid = new Map(
    participants.map((participant) => [participant.puuid, participant])
  );
  let updated = 0;
  let unavailable = 0;

  for (const value of extracted) {
    const participant = participantByPuuid.get(value.participantPuuid);
    if (!participant) {
      unavailable += 1;
      continue;
    }
    if (participant.observation?.extractorVersion === MATCH_OBSERVATION_EXTRACTOR_VERSION) continue;

    if (participant.observation) {
      await tx.matchObservation.delete({ where: { id: participant.observation.id } });
    }

    await tx.matchParticipant.update({
      where: { id: participant.id },
      data: { role: value.position.normalizedRole ?? null }
    });
    await tx.matchObservation.create({
      data: {
        matchParticipantId: participant.id,
        extractorVersion: value.extractorVersion,
        teamPosition: value.position.teamPosition,
        individualPosition: value.position.individualPosition,
        positionAssignedByMatchmaking: value.position.positionAssignedByMatchmaking,
        normalizedRole: value.position.normalizedRole,
        normalizedRoleSource: value.position.normalizedRoleSource,
        assignedRole: value.position.assignedRole,
        positionDiverged: value.position.diverged,
        positionStatus: value.position.status,
        runesStatus: value.runes.status,
        primaryStyleId: value.runes.primaryStyleId,
        secondaryStyleId: value.runes.secondaryStyleId,
        itemSlots: {
          create: value.items.map((item) => ({
            slot: item.slot,
            state: item.state,
            itemId: item.itemId,
            itemName: item.enrichment.name,
            asset: item.enrichment.asset,
            catalogVersion: item.enrichment.catalogVersion,
            catalogStatus: item.enrichment.status
          }))
        },
        runeSelections: {
          create: value.runes.selections.map((selection) => ({
            tree: selection.tree,
            slotOrder: selection.order,
            perkId: selection.perkId,
            perkName: selection.enrichment.name,
            isKeystone: selection.isKeystone,
            catalogVersion: selection.enrichment.catalogVersion,
            catalogStatus: selection.enrichment.status
          }))
        },
        runeFragments: {
          create: value.runes.fragments.map((fragment) => ({
            slot: fragment.slot,
            state: fragment.state,
            fragmentId: fragment.fragmentId,
            fragmentName: fragment.enrichment.name,
            catalogVersion: fragment.enrichment.catalogVersion,
            catalogStatus: fragment.enrichment.status
          }))
        },
        summonerSpellSlots: {
          create: value.summonerSpells.map((spell) => ({
            slot: spell.slot,
            state: spell.state,
            spellId: spell.spellId,
            spellName: spell.enrichment.name,
            asset: spell.enrichment.asset,
            catalogVersion: spell.enrichment.catalogVersion,
            catalogStatus: spell.enrichment.status
          }))
        }
      }
    });
    updated += 1;
  }

  return { extracted: extracted.length, updated, unavailable };
}

export async function persistMatchObservations(
  matchDbId: string,
  platform: string,
  raw: RiotMatchDto
): Promise<PersistObservationResult> {
  return prisma.$transaction((tx) =>
    persistMatchObservationsInTransaction(tx, matchDbId, platform, raw)
  );
}

function itemFromRow(
  row: {
    slot: number;
    state: string;
    itemId: number | null;
    itemName: string | null;
    asset: string | null;
    catalogVersion: string | null;
    catalogStatus: string;
  },
  patch?: string
): ObservedItemSlot {
  return {
    slot: row.slot,
    state: row.state as ObservedItemSlot["state"],
    itemId: row.itemId ?? undefined,
    enrichment: catalogEnrichment(row),
    provenance: observedProvenance(patch)
  };
}

export async function findMatchLoadoutObservation(
  matchId: string,
  puuid: string
): Promise<MatchLoadoutObservation | null> {
  const participant = await prisma.matchParticipant.findFirst({
    where: { puuid, match: { matchId } },
    include: {
      match: true,
      observation: {
        include: {
          itemSlots: { orderBy: { slot: "asc" } },
          runeSelections: { orderBy: [{ tree: "asc" }, { slotOrder: "asc" }] },
          runeFragments: true,
          summonerSpellSlots: { orderBy: { slot: "asc" } }
        }
      }
    }
  });
  const observation = participant?.observation;
  if (!participant || !observation) return null;
  const patch = participant.match.patch ?? undefined;

  const selections: ObservedRuneSelection[] = observation.runeSelections.map((row) => ({
    tree: row.tree as ObservedRuneSelection["tree"],
    order: row.slotOrder,
    perkId: row.perkId,
    isKeystone: row.isKeystone,
    enrichment: catalogEnrichment(row),
    provenance: observedProvenance(patch)
  }));
  const fragmentOrder = { OFFENSE: 0, FLEX: 1, DEFENSE: 2 };
  const fragments: ObservedRuneFragment[] = observation.runeFragments
    .map((row) => ({
      slot: row.slot as ObservedRuneFragment["slot"],
      state: row.state as ObservedRuneFragment["state"],
      fragmentId: row.fragmentId ?? undefined,
      enrichment: catalogEnrichment(row),
      provenance: observedProvenance(patch)
    }))
    .sort((left, right) => fragmentOrder[left.slot] - fragmentOrder[right.slot]);
  const spells: ObservedSummonerSpellSlot[] = observation.summonerSpellSlots.map((row) => ({
    slot: row.slot as 1 | 2,
    state: row.state as ObservedSummonerSpellSlot["state"],
    spellId: row.spellId ?? undefined,
    enrichment: catalogEnrichment(row),
    provenance: observedProvenance(patch)
  }));

  return {
    extractorVersion: observation.extractorVersion,
    matchId: participant.match.matchId,
    championId: participant.championId,
    context: {
      gameVersion: participant.match.gameVersion ?? undefined,
      patch,
      queueId: participant.match.queueId ?? undefined,
      gameMode: participant.match.gameMode ?? undefined,
      gameType: participant.match.gameType ?? undefined,
      platform: participant.match.platform,
      startedAt: participant.match.startedAt?.toISOString(),
      durationSeconds: participant.match.durationSeconds ?? undefined,
      won: participant.won
    },
    items: observation.itemSlots.map((row) => itemFromRow(row, patch)),
    runes: {
      status: observation.runesStatus as MatchLoadoutObservation["runes"]["status"],
      primaryStyleId: observation.primaryStyleId ?? undefined,
      secondaryStyleId: observation.secondaryStyleId ?? undefined,
      selections,
      fragments,
      provenance: {
        ...observedProvenance(patch),
        status: observation.runesStatus as MatchLoadoutObservation["runes"]["status"]
      }
    },
    summonerSpells: spells,
    position: {
      teamPosition: observation.teamPosition ?? undefined,
      individualPosition: observation.individualPosition ?? undefined,
      positionAssignedByMatchmaking: observation.positionAssignedByMatchmaking ?? undefined,
      normalizedRole:
        observation.normalizedRole as MatchLoadoutObservation["position"]["normalizedRole"],
      normalizedRoleSource:
        observation.normalizedRoleSource as MatchLoadoutObservation["position"]["normalizedRoleSource"],
      assignedRole: observation.assignedRole as MatchLoadoutObservation["position"]["assignedRole"],
      diverged: observation.positionDiverged,
      status: observation.positionStatus as MatchLoadoutObservation["position"]["status"],
      observedProvenance: observedProvenance(patch),
      normalizedProvenance: {
        sourceType: "CALCULATED",
        sourceId: "sparta",
        algorithmVersion: observation.extractorVersion,
        patch,
        status: observation.positionStatus as MatchLoadoutObservation["position"]["status"]
      }
    }
  };
}
