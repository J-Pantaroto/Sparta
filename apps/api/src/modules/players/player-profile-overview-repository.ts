import {
  PLAYER_PROFILE_FRESHNESS_DAYS,
  PLAYER_PROFILE_OVERVIEW_ALGORITHM_VERSION,
  buildPlayerProfileAnalytics,
  type AvailabilityStatus,
  type PlayerProfileMatchInput,
  type PlayerProfileOverview,
  type ProfileCoverageItem,
  type ProfileRecentMatch,
  type Role
} from "@sparta/core";
import { prisma } from "../../db/prisma.js";
import { mapParticipantRowToProfileRecentMatch, matchHistoryInclude } from "../matches/match-history-mapper.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_MATCH_LIMIT = 10;
const ROLES = new Set<Role>(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);

function asRole(value: string | null | undefined): Role | null {
  return value && ROLES.has(value as Role) ? (value as Role) : null;
}

function coverageItem(input: {
  sampleSize: number;
  availableSampleSize: number;
  updatedAt: string | null;
  stale: boolean;
  reason?: string;
}): ProfileCoverageItem {
  const coverage = input.sampleSize === 0 ? 0 : input.availableSampleSize / input.sampleSize;
  let status: AvailabilityStatus;
  if (input.availableSampleSize === 0) status = "UNAVAILABLE";
  else if (input.stale) status = "STALE";
  else if (coverage < 1) status = "PARTIAL";
  else status = "AVAILABLE";
  return {
    status,
    sampleSize: input.sampleSize,
    availableSampleSize: input.availableSampleSize,
    coverage,
    updatedAt: input.updatedAt,
    ...(input.reason ? { reason: input.reason } : {})
  };
}

export async function findPlayerProfileOverviewByUserId(
  userId: string,
  now = new Date()
): Promise<PlayerProfileOverview | null> {
  const account = await prisma.riotAccount.findFirst({
    where: { userId },
    include: { profile: true }
  });
  if (!account) return null;

  const analysisLimit = account.profile?.matchAnalysisLimit ?? 50;
  const rows = await prisma.matchParticipant.findMany({
    // A posição normalizada pode existir mesmo quando o campo legado do
    // participante está ausente; a filtragem final acontece em `asRole`.
    where: { riotAccountId: account.id },
    include: matchHistoryInclude(account),
    orderBy: { match: { startedAt: "desc" } },
    take: analysisLimit
  });

  const usable = rows.flatMap((row) => {
    const role = asRole(row.observation?.normalizedRole ?? row.role);
    if (!role) return [];
    const analytics: PlayerProfileMatchInput = {
      matchId: row.match.matchId,
      championId: row.championId,
      championName: row.champion.name,
      role,
      won: row.won,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      csPerMinute: row.csPerMinute,
      goldPerMinute: row.goldPerMinute,
      damagePerMinute: row.damagePerMinute,
      visionScorePerMinute: row.visionScorePerMinute,
      killParticipation: row.killParticipation,
      objectiveParticipation: row.objectiveParticipation,
      ...(row.match.startedAt ? { observedAt: row.match.startedAt.toISOString() } : {})
    };
    return [{ row, role, analytics }];
  });

  const analytics = buildPlayerProfileAnalytics(usable.map((entry) => entry.analytics));
  const updatedAt = account.profile?.updatedAt ?? account.updatedAt;
  const updatedAtIso = updatedAt.toISOString();
  const stale = now.getTime() - updatedAt.getTime() > PLAYER_PROFILE_FRESHNESS_DAYS * DAY_MS;
  const objectiveSamples = usable.filter(
    (entry) => entry.row.objectiveParticipation !== null
  ).length;
  const loadoutSamples = usable.filter(
    (entry) =>
      entry.row.observation !== null &&
      (entry.row.observation.itemSlots.length > 0 ||
        entry.row.observation.runeSelections.length > 0 ||
        entry.row.observation.summonerSpellSlots.length > 0)
  ).length;
  const datedSamples = usable.filter((entry) => entry.row.match.startedAt !== null).length;

  const recentMatches: ProfileRecentMatch[] = usable
    .slice(0, RECENT_MATCH_LIMIT)
    .map(({ row, role }) => mapParticipantRowToProfileRecentMatch(row, role));

  const sampleSize = usable.length;
  const coverage = {
    identity: coverageItem({
      sampleSize: 1,
      availableSampleSize: 1,
      updatedAt: account.updatedAt.toISOString(),
      stale: false
    }),
    ranked: coverageItem({
      sampleSize: 0,
      availableSampleSize: 0,
      updatedAt: null,
      stale: false,
      reason: "O Sparta ainda não persiste dados da League-V4."
    }),
    roles: coverageItem({
      sampleSize,
      availableSampleSize: sampleSize,
      updatedAt: updatedAtIso,
      stale
    }),
    recentPerformance: coverageItem({
      sampleSize,
      availableSampleSize: sampleSize,
      updatedAt: updatedAtIso,
      stale
    }),
    trend: coverageItem({
      sampleSize,
      availableSampleSize: datedSamples,
      updatedAt: updatedAtIso,
      stale,
      ...(datedSamples < sampleSize
        ? { reason: "Parte das partidas não possui data observada." }
        : {})
    }),
    champions: coverageItem({
      sampleSize,
      availableSampleSize: sampleSize,
      updatedAt: updatedAtIso,
      stale
    }),
    matches: coverageItem({
      sampleSize,
      availableSampleSize: sampleSize,
      updatedAt: updatedAtIso,
      stale
    }),
    objectives: coverageItem({
      sampleSize,
      availableSampleSize: objectiveSamples,
      updatedAt: updatedAtIso,
      stale,
      ...(objectiveSamples < sampleSize
        ? { reason: "Participação em objetivos não existe em parte da amostra." }
        : {})
    }),
    loadout: coverageItem({
      sampleSize,
      availableSampleSize: loadoutSamples,
      updatedAt: updatedAtIso,
      stale,
      ...(loadoutSamples < sampleSize
        ? { reason: "Loadout normalizado não existe em parte da amostra." }
        : {})
    })
  };

  return {
    status: stale && sampleSize > 0 ? "STALE" : "PARTIAL",
    identity: {
      riotId: `${account.gameName}#${account.tagLine}`,
      platform: account.platformRegion.toUpperCase(),
      regionLabel: `Servidor ${account.platformRegion.toUpperCase()} · ${account.regionalRouting}`,
      profileIconId: null,
      summonerLevel: null,
      updatedAt: account.updatedAt.toISOString()
    },
    ranked: {
      status: "UNAVAILABLE",
      queue: null,
      tier: null,
      division: null,
      leaguePoints: null,
      wins: null,
      losses: null,
      winRate: null,
      updatedAt: null,
      unavailableReason: "Elo não está disponível: a League-V4 ainda não integra este perfil."
    },
    ...analytics,
    recentMatches,
    coverage,
    provenance: [
      {
        sourceType: "OFFICIAL",
        sourceId: "riot-account-v1",
        resource: "RiotAccount",
        region: account.regionalRouting,
        collectedAt: account.updatedAt.toISOString(),
        status: "AVAILABLE"
      },
      {
        sourceType: "OBSERVED",
        sourceId: "riot-match-v5",
        resource: "MatchParticipant + MatchObservation",
        region: account.regionalRouting,
        sampleSize,
        collectedAt: updatedAtIso,
        status: sampleSize === 0 ? "UNAVAILABLE" : stale ? "STALE" : "AVAILABLE",
        ...(sampleSize === 0 ? { unavailableReason: "Nenhuma partida sincronizada." } : {}),
        ...(stale
          ? {
              staleReason: `Última sincronização há mais de ${PLAYER_PROFILE_FRESHNESS_DAYS} dias.`
            }
          : {})
      },
      {
        sourceType: "CALCULATED",
        sourceId: "sparta",
        resource: "PlayerProfileOverview",
        sampleSize,
        collectedAt: now.toISOString(),
        algorithmVersion: PLAYER_PROFILE_OVERVIEW_ALGORITHM_VERSION,
        status: sampleSize === 0 ? "UNAVAILABLE" : "AVAILABLE",
        ...(sampleSize === 0 ? { unavailableReason: "Nenhuma partida para agregar." } : {})
      },
      {
        sourceType: "OFFICIAL",
        sourceId: "riot-league-v4",
        resource: "ranked entries",
        status: "UNAVAILABLE",
        unavailableReason: "Fonte ainda não integrada e nenhum valor foi inferido."
      }
    ],
    algorithmVersion: PLAYER_PROFILE_OVERVIEW_ALGORITHM_VERSION,
    generatedAt: now.toISOString()
  };
}
