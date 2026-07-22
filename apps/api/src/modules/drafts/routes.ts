import type { FastifyPluginAsync } from "fastify";
import { aggregateMatchupData, recommendPicks, type PlayerChampionStats, type PlayerProfile } from "@sparta/core";
import { draftRecommendationRequestSchema } from "../../routes/schemas.js";
import { compositionRules } from "../../config/composition-rules.js";
import { prisma } from "../../db/prisma.js";
import { getAuthenticatedUserId } from "../auth/routes.js";
import { findAllChampionTags } from "../catalog/champion-repository.js";
import { findLaneMatchupHistory } from "../matches/matchup-repository.js";
import {
  derivePreferredRoles,
  findChampionStatsByPuuid,
  findPlayerInsightsByPuuid
} from "../players/player-stats-repository.js";

const neutralRecentForm = { last10Score: 50, last20Score: 50, last50Score: 50, trend: "stable" as const, confidence: "low" as const };

export const draftsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Recomendacoes reais de draft: player/championStats/strengths/weaknesses/
   * recentForm vem da conta Riot do usuario autenticado (Fase 1/2),
   * championTags da tabela real (catalog), matchups agregados na hora a
   * partir do historico persistido (Fase 3). Usuario autenticado sem conta
   * Riot vinculada, ou sem sync ainda, recebe um perfil neutro/vazio -
   * poucas ou nenhuma recomendacao honesta, nao dado mockado.
   */
  app.post("/drafts/recommendations", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    const payload = draftRecommendationRequestSchema.parse(request.body);
    const riotAccount = await prisma.riotAccount.findFirst({ where: { userId } });

    let player: PlayerProfile;
    let championStats: PlayerChampionStats[];

    if (!riotAccount) {
      championStats = [];
      player = {
        id: userId,
        account: { puuid: "", gameName: "", tagLine: "", platformRegion: "", regionalRouting: "" },
        preferredRoles: [],
        championStats: [],
        strengths: [],
        weaknesses: [],
        recentForm: neutralRecentForm
      };
    } else {
      championStats = await findChampionStatsByPuuid(riotAccount.puuid);
      const insights = await findPlayerInsightsByPuuid(riotAccount.puuid);
      player = {
        id: riotAccount.puuid,
        account: {
          puuid: riotAccount.puuid,
          gameName: riotAccount.gameName,
          tagLine: riotAccount.tagLine,
          platformRegion: riotAccount.platformRegion,
          regionalRouting: riotAccount.regionalRouting
        },
        preferredRoles: derivePreferredRoles(championStats),
        championStats,
        ...insights
      };
    }

    const [championTags, laneHistory] = await Promise.all([
      findAllChampionTags(),
      findLaneMatchupHistory(payload.draft.playerRole)
    ]);
    const matchups = aggregateMatchupData(laneHistory);

    return {
      recommendations: recommendPicks({
        draft: payload.draft,
        player,
        championStats,
        championTags,
        matchups,
        compositionRules,
        patchMeta: null,
        limit: 5
      })
    };
  });

  app.post("/drafts/pre-game-analysis", async () => ({
    allyStrengths: ["Boa capacidade de teamfight se o engage for coordenado."],
    allyWeaknesses: ["Evitar lutas sem visão antes do primeiro item."],
    enemyThreats: ["Respeitar spikes de nível 6 e controle de objetivos."],
    winCondition: "Jogar por prioridade de rota, visão em objetivo e lutas agrupadas no mid game.",
    realtimeAssistance: false
  }));
};
