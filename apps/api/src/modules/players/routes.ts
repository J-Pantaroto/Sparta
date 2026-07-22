import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { rankChampionPool, type RecentChampionMatch, type Role } from "@sparta/core";
import { RiotApiError } from "@sparta/riot";
import { prisma } from "../../db/prisma.js";
import { getAuthenticatedUserId } from "../auth/routes.js";
import { findParticipationHistory } from "../matches/match-repository.js";
import { lookupRiotAccount } from "../riot-integration/account-lookup.js";
import {
  derivePreferredRoles,
  findChampionStatsByPuuid,
  findPlayerInsightsByPuuid,
  findRiotAccountByRiotId
} from "./player-stats-repository.js";
import { syncPlayerMatches } from "../sync/riot-sync-service.js";

export const linkRiotAccountSchema = z.object({
  gameName: z.string().min(3, "Informe o nome do invocador"),
  tagLine: z.string().min(1, "Informe a tag (ex.: BR1)"),
  platformRegion: z.string().min(2).default("br1"),
  regionalRouting: z.string().min(2).default("americas")
});

export const playersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/players/:riotName/:tagLine/profile", async (request, reply) => {
    const params = z.object({ riotName: z.string(), tagLine: z.string() }).parse(request.params);
    const account = await findRiotAccountByRiotId(params.riotName, params.tagLine);
    if (!account) {
      reply.code(404);
      return { error: "Conta Riot nao encontrada. Ela precisa ser vinculada no Sparta primeiro." };
    }

    const championStats = await findChampionStatsByPuuid(account.puuid);
    const insights = await findPlayerInsightsByPuuid(account.puuid);

    return {
      id: account.puuid,
      account,
      preferredRoles: derivePreferredRoles(championStats),
      championStats,
      ...insights
    };
  });

  /**
   * Sincroniza as partidas novas do jogador autenticado. Nao recebe riotId
   * no payload - resolve a conta Riot ja vinculada ao usuario (evita
   * sincronizar a conta de outra pessoa so porque o cliente mandou um puuid
   * diferente no corpo da requisicao).
   */
  app.post("/players/sync", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    const riotAccount = await prisma.riotAccount.findFirst({ where: { userId } });
    if (!riotAccount) {
      reply.code(404);
      return { error: "Nenhuma conta Riot vinculada. Vincule uma conta antes de sincronizar." };
    }

    const result = await syncPlayerMatches(
      {
        riotAccountId: riotAccount.id,
        puuid: riotAccount.puuid,
        platformRegion: riotAccount.platformRegion
      },
      {
        onInsightsFailed: (error) => {
          request.log.error({
            event: "riot_sync_insights_failed",
            puuid: riotAccount.puuid,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    );

    for (const failure of result.failed) {
      request.log.error({
        event: "riot_sync_match_failed",
        puuid: riotAccount.puuid,
        matchId: failure.matchId,
        reason: failure.reason
      });
    }

    for (const skipped of result.skippedParticipants) {
      request.log.warn({
        event: "riot_sync_participant_skipped",
        matchId: skipped.matchId,
        puuid: skipped.puuid,
        reason: "Campeao ainda nao esta no catalogo (catalog:sync desatualizado)."
      });
    }

    return result;
  });

  app.get("/players/:puuid/recent-matches", async (request) => {
    const params = z.object({ puuid: z.string() }).parse(request.params);
    const query = z.object({ limit: z.coerce.number().min(1).max(50).default(10) }).parse(request.query);

    const history = await findParticipationHistory(params.puuid);
    const matches: RecentChampionMatch[] = history.slice(0, query.limit).map((entry) => ({
      matchId: entry.matchId,
      championId: entry.championId,
      role: entry.role as Role,
      won: entry.won,
      kills: entry.kills,
      deaths: entry.deaths,
      assists: entry.assists,
      csPerMinute: entry.csPerMinute,
      goldPerMinute: entry.goldPerMinute,
      damagePerMinute: entry.damagePerMinute,
      visionScorePerMinute: entry.visionScorePerMinute,
      killParticipation: entry.killParticipation ?? 0,
      objectiveParticipation: entry.objectiveParticipation ?? 0
    }));

    return { puuid: params.puuid, matches };
  });

  app.get("/players/:puuid/champion-performance", async (request) => {
    const params = z.object({ puuid: z.string() }).parse(request.params);
    const championStats = await findChampionStatsByPuuid(params.puuid);
    return { puuid: params.puuid, champions: rankChampionPool(championStats) };
  });

  /**
   * Vincula um Riot ID (gameName#tagLine) ao usuario autenticado, resolvendo
   * o puuid real via Account-V1 (RIOT_API_KEY so existe no backend, ver
   * docs/riot-compliance.md).
   */
  app.post("/players/link-riot-account", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    const payload = linkRiotAccountSchema.parse(request.body);

    let riotAccountInfo: { puuid: string; gameName: string; tagLine: string };
    try {
      riotAccountInfo = await lookupRiotAccount(payload.gameName, payload.tagLine);
    } catch (error) {
      const notFound = error instanceof RiotApiError && error.status === 404;
      request.log.error({
        event: "link_riot_account_failed",
        gameName: payload.gameName,
        tagLine: payload.tagLine,
        status: error instanceof RiotApiError ? error.status : undefined,
        message: error instanceof Error ? error.message : String(error)
      });
      reply.code(notFound ? 404 : 502);
      return {
        error: notFound
          ? "Riot ID nao encontrado."
          : "Nao foi possivel confirmar a conta Riot agora. Tente novamente em instantes."
      };
    }

    const account = await prisma.riotAccount.upsert({
      where: { puuid: riotAccountInfo.puuid },
      create: {
        puuid: riotAccountInfo.puuid,
        gameName: riotAccountInfo.gameName,
        tagLine: riotAccountInfo.tagLine,
        platformRegion: payload.platformRegion,
        regionalRouting: payload.regionalRouting,
        userId
      },
      update: {
        gameName: riotAccountInfo.gameName,
        tagLine: riotAccountInfo.tagLine,
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
