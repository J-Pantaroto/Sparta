import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { generatePostGameAnalysis, type PostGameAnalysis } from "@sparta/core";
import { prisma } from "../../db/prisma.js";
import { getAuthenticatedUserId } from "../auth/routes.js";
import { findMatchDetail } from "../matches/match-repository.js";
import { findChampionStatsByPuuid } from "../players/player-stats-repository.js";

async function resolveRiotAccount(userId: string) {
  return prisma.riotAccount.findFirst({ where: { userId } });
}

export const postgameRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Gera (e persiste) a analise pos-game real de uma partida ja sincronizada
   * do usuario autenticado. Body encolhe pra so `{ matchId }` - o servidor
   * resolve tudo a partir de dado real (Match/MatchTimeline/MatchParticipant
   * desde a Fase 1/3, PlayerChampionStats desde a Fase 1), sem confiar em
   * performance vinda do cliente como o mock antigo fazia. Upsert em vez de
   * so criar: reanalisar depois de mais historico acumulado atualiza o
   * texto em vez de devolver um relatorio velho.
   */
  app.post("/postgame/analyze", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    const payload = z.object({ matchId: z.string() }).parse(request.body);

    const riotAccount = await resolveRiotAccount(userId);
    if (!riotAccount) {
      reply.code(404);
      return { error: "Nenhuma conta Riot vinculada. Vincule uma conta antes de analisar uma partida." };
    }

    const detail = await findMatchDetail(payload.matchId, riotAccount.puuid);
    if (!detail || !detail.timeline) {
      reply.code(404);
      return { error: "Partida nao sincronizada pra essa conta ainda. Rode POST /players/sync primeiro." };
    }

    const championStats = await findChampionStatsByPuuid(riotAccount.puuid);
    const championHistory = championStats.find(
      (stats) => stats.championId === detail.ownParticipant.championId && stats.role === detail.ownParticipant.role
    );

    const analysis = generatePostGameAnalysis({
      matchId: detail.matchId,
      championId: detail.ownParticipant.championId,
      championName: detail.ownParticipant.championName,
      role: detail.ownParticipant.role,
      won: detail.ownParticipant.won,
      durationSeconds: detail.durationSeconds,
      metrics: {
        kills: detail.ownParticipant.kills,
        deaths: detail.ownParticipant.deaths,
        assists: detail.ownParticipant.assists,
        csPerMinute: detail.ownParticipant.csPerMinute,
        goldPerMinute: detail.ownParticipant.goldPerMinute,
        damagePerMinute: detail.ownParticipant.damagePerMinute,
        visionScorePerMinute: detail.ownParticipant.visionScorePerMinute,
        killParticipation: detail.ownParticipant.killParticipation ?? undefined,
        objectiveParticipation: detail.ownParticipant.objectiveParticipation ?? undefined
      },
      timeline: detail.timeline,
      championHistory,
      enemyLaneChampionName: detail.enemyLaneChampionName
    });

    await prisma.postgameReport.upsert({
      where: { matchId_puuid: { matchId: detail.matchDbId, puuid: riotAccount.puuid } },
      update: { reportJson: analysis as unknown as Prisma.InputJsonValue },
      create: {
        matchId: detail.matchDbId,
        puuid: riotAccount.puuid,
        reportJson: analysis as unknown as Prisma.InputJsonValue
      }
    });

    return analysis;
  });

  /**
   * Le o PostgameReport persistido do usuario autenticado pra essa partida.
   * 404 honesto se ainda nao foi analisada - nunca inventa um relatorio.
   */
  app.get("/postgame/:matchId", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    const params = z.object({ matchId: z.string() }).parse(request.params);

    const riotAccount = await resolveRiotAccount(userId);
    if (!riotAccount) {
      reply.code(404);
      return { error: "Nenhuma conta Riot vinculada." };
    }

    const match = await prisma.match.findUnique({ where: { matchId: params.matchId }, select: { id: true } });
    if (!match) {
      reply.code(404);
      return { error: "Partida nao encontrada." };
    }

    const report = await prisma.postgameReport.findUnique({
      where: { matchId_puuid: { matchId: match.id, puuid: riotAccount.puuid } }
    });
    if (!report) {
      reply.code(404);
      return { error: "Ainda nao analisado. Chame POST /postgame/analyze primeiro." };
    }

    return report.reportJson as unknown as PostGameAnalysis;
  });
};
