import type { Prisma } from "@prisma/client";
import type { ProfileRecentMatch, Role } from "@sparta/core";

const QUEUE_LABELS: Record<number, string> = {
  400: "Normal alternada",
  420: "Ranqueada Solo/Duo",
  430: "Normal às cegas",
  440: "Ranqueada Flex",
  450: "ARAM",
  490: "Quickplay"
};

export function queueLabel(queueId: number | null): string {
  return queueId === null ? "Fila não informada" : (QUEUE_LABELS[queueId] ?? `Fila ${queueId}`);
}

/**
 * `include` compartilhado entre o perfil (`/me/player-profile`) e o
 * histórico filtrável (`/players/:puuid/match-history`) - os dois precisam
 * exatamente do mesmo enriquecimento por partida, e mantê-los como uma única
 * fonte evita que os dois contratos divirjam silenciosamente com o tempo.
 * Os filtros de `postgameReports`/`draftComparisons` dependem da conta
 * (`puuid`/`id`), por isso é uma função, não um objeto estático.
 */
export function matchHistoryInclude(account: { id: string; puuid: string }) {
  return {
    champion: true,
    match: {
      include: {
        timeline: { select: { id: true } },
        postgameReports: {
          where: { puuid: account.puuid },
          select: { id: true },
          take: 1
        },
        draftComparisons: {
          where: { riotAccountId: account.id },
          select: { id: true },
          take: 1
        }
      }
    },
    observation: {
      include: {
        itemSlots: { orderBy: { slot: "asc" as const } },
        runeSelections: { orderBy: [{ tree: "asc" as const }, { slotOrder: "asc" as const }] },
        summonerSpellSlots: { orderBy: { slot: "asc" as const } }
      }
    }
  } satisfies Prisma.MatchParticipantInclude;
}

export type MatchHistoryParticipantRow = Prisma.MatchParticipantGetPayload<{
  include: ReturnType<typeof matchHistoryInclude>;
}>;

/** Pura - traduz uma linha já carregada (com `matchHistoryInclude`) pro contrato público. */
export function mapParticipantRowToProfileRecentMatch(
  row: MatchHistoryParticipantRow,
  role: Role
): ProfileRecentMatch {
  return {
    matchId: row.match.matchId,
    championId: row.championId,
    championName: row.champion.name,
    role,
    won: row.won,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    csPerMinute: row.csPerMinute,
    damagePerMinute: row.damagePerMinute,
    visionScorePerMinute: row.visionScorePerMinute,
    killParticipation: row.killParticipation,
    objectiveParticipation: row.objectiveParticipation,
    objectiveTakedowns: row.objectiveTakedowns,
    teamObjectiveKills: row.teamObjectiveKills,
    durationSeconds: row.match.durationSeconds,
    queueId: row.match.queueId,
    queueLabel: queueLabel(row.match.queueId),
    patch: row.match.patch,
    observedAt: row.match.startedAt?.toISOString() ?? null,
    items:
      row.observation?.itemSlots.map((item) => ({
        slot: item.slot,
        state: item.state,
        itemId: item.itemId,
        itemName: item.itemName
      })) ?? [],
    runes:
      row.observation?.runeSelections.map((rune) => ({
        tree: rune.tree,
        slotOrder: rune.slotOrder,
        perkId: rune.perkId,
        perkName: rune.perkName,
        isKeystone: rune.isKeystone
      })) ?? [],
    spells:
      row.observation?.summonerSpellSlots.map((spell) => ({
        slot: spell.slot,
        state: spell.state,
        spellId: spell.spellId,
        spellName: spell.spellName
      })) ?? [],
    timelineAvailable: row.match.timeline !== null,
    postGameAvailable: row.match.postgameReports.length > 0,
    draftComparisonAvailable: row.match.draftComparisons.length > 0,
    positionStatus: row.observation?.positionStatus ?? null
  };
}
