import type { MatchParticipantSummary, MatchParticipantsOverview, Role } from "@sparta/core";
import { prisma } from "../../db/prisma.js";
import { findMatchLoadoutObservation } from "./match-observation-repository.js";

/**
 * Os 10 participantes de uma partida específica, só pra quem de fato jogou
 * nela - a checagem de posse é implícita (mesmo padrão de
 * `/matches/:matchId/observation`): sem uma linha `MatchParticipant` com o
 * puuid do próprio usuário nesta partida, devolve `null` sem revelar se a
 * partida existe.
 */
export async function findMatchParticipantsOverview(
  matchId: string,
  requestingPuuid: string
): Promise<MatchParticipantsOverview | null> {
  const own = await prisma.matchParticipant.findFirst({
    where: { puuid: requestingPuuid, match: { matchId } },
    select: { id: true }
  });
  if (!own) return null;

  const rows = await prisma.matchParticipant.findMany({
    where: { match: { matchId } },
    include: { champion: { select: { name: true } } }
  });
  if (rows.length === 0) return null;

  const loadouts = await Promise.all(
    rows.map((row) => findMatchLoadoutObservation(matchId, row.puuid))
  );

  const participants: MatchParticipantSummary[] = rows.map((row, index) => ({
    puuid: row.puuid,
    teamId: row.teamId ?? undefined,
    championId: row.championId,
    championName: row.champion.name,
    role: (row.role as Role | null) ?? undefined,
    won: row.won,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    csPerMinute: row.csPerMinute,
    goldPerMinute: row.goldPerMinute,
    damagePerMinute: row.damagePerMinute,
    visionScorePerMinute: row.visionScorePerMinute,
    killParticipation: row.killParticipation ?? undefined,
    objectiveParticipation: row.objectiveParticipation ?? undefined,
    isTrackedPlayer: row.puuid === requestingPuuid,
    loadout: loadouts[index] ?? undefined
  }));

  return { matchId, participants };
}
