import type { Role } from "@sparta/core";
import { prisma } from "../../db/prisma.js";

export interface LaneParticipantRecord {
  matchId: string;
  championId: number;
  role: Role;
  teamId: number;
  won: boolean;
}

/**
 * Histórico do PRÓPRIO jogador num role, mais os oponentes dessas mesmas
 * partidas. Isso produz matchup pessoal; o banco local não é amostra do
 * meta e nunca deve ser usado como matchup global.
 */
export async function findPersonalLaneMatchupHistory(puuid: string, role: Role): Promise<LaneParticipantRecord[]> {
  const playerRows = await prisma.matchParticipant.findMany({
    where: { puuid, role, teamId: { not: null } },
    select: { matchId: true }
  });
  const matchIds = playerRows.map((row) => row.matchId);
  if (matchIds.length === 0) return [];

  const rows = await prisma.matchParticipant.findMany({
    where: { matchId: { in: matchIds }, role, teamId: { not: null } },
    select: { matchId: true, championId: true, role: true, teamId: true, won: true }
  });

  return rows.map((row) => ({
    matchId: row.matchId,
    championId: row.championId,
    role: row.role as Role,
    teamId: row.teamId as number,
    won: row.won
  }));
}
