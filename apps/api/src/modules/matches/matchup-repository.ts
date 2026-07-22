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
 * Historico de participantes de um role especifico, com teamId conhecido -
 * insumo pra `aggregateMatchupData` (packages/core) parear laners opostos.
 * Escopado por role pra limitar o tamanho da consulta (o draft so precisa
 * de matchups do role sendo draftado). So inclui linhas com teamId
 * preenchido - partidas persistidas antes da Fase 3 nao tem esse dado ainda,
 * ate rodar o backfill (`pnpm backfill:match-participants`).
 */
export async function findLaneMatchupHistory(role: Role): Promise<LaneParticipantRecord[]> {
  const rows = await prisma.matchParticipant.findMany({
    where: { role, teamId: { not: null } },
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
