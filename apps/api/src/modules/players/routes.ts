import type { FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { rankChampionPool } from "@sparta/core";
import { prisma } from "../../db/prisma.js";
import { mockChampionStats, mockPlayerProfile } from "../../routes/mock-data.js";
import { getAuthenticatedUserId } from "../auth/routes.js";

export const playerSyncSchema = z.object({
  riotId: z.string().min(3).regex(/^.+#.+$/, "Use o formato Nome#TAG"),
  platformRegion: z.string().min(2),
  regionalRouting: z.string().min(2)
});

export const linkRiotAccountSchema = z.object({
  gameName: z.string().min(3, "Informe o nome do invocador"),
  tagLine: z.string().min(1, "Informe a tag (ex.: BR1)"),
  platformRegion: z.string().min(2).default("br1"),
  regionalRouting: z.string().min(2).default("americas")
});

export const playersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/players/:riotName/:tagLine/profile", async (request) => {
    const params = z.object({ riotName: z.string(), tagLine: z.string() }).parse(request.params);
    return {
      ...mockPlayerProfile,
      account: {
        ...mockPlayerProfile.account,
        gameName: params.riotName,
        tagLine: params.tagLine
      }
    };
  });

  app.post("/players/sync", async (request, reply) => {
    const payload = playerSyncSchema.parse(request.body);
    reply.code(202);
    return {
      status: "queued",
      riotId: payload.riotId,
      message: "Sync mock criado. A integração Riot real fica no backend e requer RIOT_API_KEY."
    };
  });

  app.get("/players/:puuid/recent-matches", async (request) => {
    const query = z.object({ limit: z.coerce.number().min(1).max(50).default(10) }).parse(request.query);
    return {
      puuid: z.object({ puuid: z.string() }).parse(request.params).puuid,
      matches: mockChampionStats[0].recentMatches.slice(0, query.limit)
    };
  });

  app.get("/players/:puuid/champion-performance", async (request) => ({
    puuid: z.object({ puuid: z.string() }).parse(request.params).puuid,
    champions: rankChampionPool(mockChampionStats)
  }));

  /**
   * Vincula um Riot ID (gameName#tagLine) ao usuario autenticado.
   *
   * Ainda nao chama a Account-V1 real (requer RIOT_API_KEY apenas no
   * backend, ver docs/riot-compliance.md). Enquanto isso, gera um puuid
   * deterministico local para permitir o fluxo completo de vinculo de
   * conta ponta a ponta.
   */
  app.post("/players/link-riot-account", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    const payload = linkRiotAccountSchema.parse(request.body);
    const mockPuuid = createHash("sha256").update(`${payload.gameName}#${payload.tagLine}`.toLowerCase()).digest("hex");

    const account = await prisma.riotAccount.upsert({
      where: { puuid: mockPuuid },
      create: {
        puuid: mockPuuid,
        gameName: payload.gameName,
        tagLine: payload.tagLine,
        platformRegion: payload.platformRegion,
        regionalRouting: payload.regionalRouting,
        userId
      },
      update: {
        gameName: payload.gameName,
        tagLine: payload.tagLine,
        platformRegion: payload.platformRegion,
        regionalRouting: payload.regionalRouting,
        userId
      }
    });

    reply.code(201);
    return {
      riotAccount: {
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        platformRegion: account.platformRegion,
        regionalRouting: account.regionalRouting
      }
    };
  });
};
