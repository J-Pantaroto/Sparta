import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { rankChampionPool } from "@sparta/core";
import { mockChampionStats, mockPlayerProfile } from "../../routes/mock-data";

export const playerSyncSchema = z.object({
  riotId: z.string().min(3).regex(/^.+#.+$/, "Use o formato Nome#TAG"),
  platformRegion: z.string().min(2),
  regionalRouting: z.string().min(2)
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
};
