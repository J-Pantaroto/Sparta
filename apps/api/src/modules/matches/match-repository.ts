import type { Prisma } from "@prisma/client";
import type { MatchSummary, MatchTimelineSummary } from "@sparta/core";
import { prisma } from "../../db/prisma.js";

export async function findExistingMatchIds(matchIds: string[]): Promise<Set<string>> {
  if (matchIds.length === 0) return new Set();
  const rows = await prisma.match.findMany({ where: { matchId: { in: matchIds } }, select: { matchId: true } });
  return new Set(rows.map((row) => row.matchId));
}

export interface PersistMatchInput {
  riotAccountId: string;
  platform: string;
  summary: MatchSummary;
  timeline: MatchTimelineSummary;
  rawMatch: Prisma.InputJsonValue;
}

/**
 * Persiste uma partida nova: upsert de Match (idempotente por matchId - se
 * a partida ja existir, nao sobrescreve nada), criacao do MatchParticipant
 * do jogador rastreado e do MatchTimeline. So grava o participante
 * rastreado, nao os outros 9 - persistir os 10 participantes (necessario
 * pra matchups/composicao reais) fica pra Fase 2.
 */
export async function persistMatch(input: PersistMatchInput): Promise<void> {
  const { summary, timeline, riotAccountId, platform, rawMatch } = input;

  await prisma.$transaction(async (tx) => {
    const match = await tx.match.upsert({
      where: { matchId: summary.matchId },
      update: {},
      create: {
        matchId: summary.matchId,
        platform,
        patch: summary.patch,
        durationSeconds: summary.durationSeconds,
        startedAt: new Date(summary.startedAt),
        rawJson: rawMatch
      }
    });

    await tx.matchParticipant.create({
      data: {
        matchId: match.id,
        riotAccountId,
        puuid: summary.puuid,
        championId: summary.championId,
        role: summary.role,
        won: summary.won,
        kills: summary.metrics.kills,
        deaths: summary.metrics.deaths,
        assists: summary.metrics.assists,
        csPerMinute: summary.metrics.csPerMinute,
        goldPerMinute: summary.metrics.goldPerMinute,
        damagePerMinute: summary.metrics.damagePerMinute,
        visionScorePerMinute: summary.metrics.visionScorePerMinute,
        killParticipation: summary.metrics.killParticipation,
        objectiveParticipation: summary.metrics.objectiveParticipation
      }
    });

    await tx.matchTimeline.create({
      data: {
        matchId: match.id,
        deathsBefore10: timeline.deathsBefore10,
        deathsBefore15: timeline.deathsBefore15,
        csAt10: timeline.csAt10,
        csAt15: timeline.csAt15,
        goldDiffAt15: timeline.goldDiffAt15,
        eventsJson: timeline.objectiveEvents
      }
    });
  });
}

export interface ParticipationRecord {
  matchId: string;
  championId: number;
  championName: string;
  role: string;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  csPerMinute: number;
  goldPerMinute: number;
  damagePerMinute: number;
  visionScorePerMinute: number;
  killParticipation: number | null;
  objectiveParticipation: number | null;
}

/**
 * Busca todo o historico persistido do jogador (todos os campeoes/roles),
 * do mais recente pro mais antigo - usado pra recalcular PlayerChampionStats
 * agrupando por (championId, role). Partidas sem Match.startedAt (nao
 * deveria acontecer, mas o campo e opcional no schema) ficam por ultimo.
 */
export async function findParticipationHistory(puuid: string): Promise<ParticipationRecord[]> {
  const rows = await prisma.matchParticipant.findMany({
    where: { puuid },
    include: { match: true, champion: true },
    orderBy: { match: { startedAt: "desc" } }
  });

  return rows.map((row) => ({
    matchId: row.match.matchId,
    championId: row.championId,
    championName: row.champion.name,
    role: row.role,
    won: row.won,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    csPerMinute: row.csPerMinute,
    goldPerMinute: row.goldPerMinute,
    damagePerMinute: row.damagePerMinute,
    visionScorePerMinute: row.visionScorePerMinute,
    killParticipation: row.killParticipation,
    objectiveParticipation: row.objectiveParticipation
  }));
}
