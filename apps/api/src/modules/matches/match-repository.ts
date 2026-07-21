import type { Prisma } from "@prisma/client";
import type { MatchSummary, MatchTimelineSummary } from "@sparta/core";
import { prisma } from "../../db/prisma";

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
