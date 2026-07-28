import {
  aggregatePlayerChampionRoleEvidence,
  type MatchRoleObservationSource,
  type PlayerChampionRoleEvidence,
  type PlayerChampionRoleEvidenceFilters,
  type PlayerChampionRoleObservationRecord,
  type Role
} from "@sparta/core";
import { prisma } from "../../db/prisma.js";

export interface FindPlayerChampionRoleEvidenceFilters {
  patches?: string[];
  queueIds?: number[];
  playedAtFrom?: string;
  playedAtTo?: string;
  gameModes?: string[];
  gameTypes?: string[];
}

/**
 * Fonte deliberadamente única: MatchObservation da Etapa 10. O papel legado
 * em MatchParticipant e os agregados PlayerChampionStats não participam.
 */
export async function findPlayerChampionRoleEvidence(
  puuid: string,
  championId: number,
  role: Role,
  filters: FindPlayerChampionRoleEvidenceFilters = {}
): Promise<PlayerChampionRoleEvidence> {
  const rows = await prisma.matchObservation.findMany({
    where: {
      positionStatus: "AVAILABLE",
      normalizedRole: role,
      matchParticipant: {
        puuid,
        championId,
        match: {
          ...(filters.patches ? { patch: { in: filters.patches } } : {}),
          ...(filters.queueIds ? { queueId: { in: filters.queueIds } } : {}),
          ...(filters.gameModes ? { gameMode: { in: filters.gameModes } } : {}),
          ...(filters.gameTypes ? { gameType: { in: filters.gameTypes } } : {}),
          ...(filters.playedAtFrom || filters.playedAtTo
            ? {
                startedAt: {
                  ...(filters.playedAtFrom ? { gte: new Date(filters.playedAtFrom) } : {}),
                  ...(filters.playedAtTo ? { lte: new Date(filters.playedAtTo) } : {})
                }
              }
            : {})
        }
      }
    },
    select: {
      extractorVersion: true,
      normalizedRole: true,
      normalizedRoleSource: true,
      matchParticipant: {
        select: {
          championId: true,
          won: true,
          match: {
            select: {
              startedAt: true,
              patch: true,
              queueId: true,
              gameMode: true,
              gameType: true
            }
          }
        }
      }
    }
  });

  const records: PlayerChampionRoleObservationRecord[] = rows.map((row) => ({
    championId: row.matchParticipant.championId,
    role: row.normalizedRole as Role,
    won: row.matchParticipant.won,
    playedAt: row.matchParticipant.match.startedAt?.toISOString(),
    patch: row.matchParticipant.match.patch ?? undefined,
    queueId: row.matchParticipant.match.queueId ?? undefined,
    gameMode: row.matchParticipant.match.gameMode ?? undefined,
    gameType: row.matchParticipant.match.gameType ?? undefined,
    extractorVersion: row.extractorVersion,
    normalizationSource:
      (row.normalizedRoleSource as MatchRoleObservationSource | null) ?? undefined
  }));

  const aggregateFilters: PlayerChampionRoleEvidenceFilters = {
    championId,
    role,
    ...filters
  };
  return aggregatePlayerChampionRoleEvidence(records, aggregateFilters);
}
