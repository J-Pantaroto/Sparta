import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { getAuthenticatedUserId } from "../auth/routes.js";
import { findMatchLoadoutObservation } from "./match-observation-repository.js";
import { findMatchParticipantsOverview } from "./match-participants-repository.js";

export const matchesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/matches/:matchId/observation", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Não autenticado." };
    }
    const { matchId } = z.object({ matchId: z.string().min(1) }).parse(request.params);
    const account = await prisma.riotAccount.findFirst({
      where: { userId },
      select: { puuid: true }
    });
    if (!account) {
      reply.code(404);
      return { error: "Nenhuma conta Riot vinculada." };
    }
    const observation = await findMatchLoadoutObservation(matchId, account.puuid);
    if (!observation) {
      reply.code(404);
      return { error: "Observação normalizada indisponível para esta partida." };
    }
    return observation;
  });

  app.get("/matches/:matchId/participants", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Não autenticado." };
    }
    const { matchId } = z.object({ matchId: z.string().min(1) }).parse(request.params);
    const account = await prisma.riotAccount.findFirst({
      where: { userId },
      select: { puuid: true }
    });
    if (!account) {
      reply.code(404);
      return { error: "Nenhuma conta Riot vinculada." };
    }
    const overview = await findMatchParticipantsOverview(matchId, account.puuid);
    if (!overview) {
      reply.code(404);
      return { error: "Partida não encontrada para esta conta." };
    }
    return overview;
  });
};
