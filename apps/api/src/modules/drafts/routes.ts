import type { FastifyPluginAsync } from "fastify";
import { recommendPicks } from "@sparta/core";
import { draftRecommendationRequestSchema } from "../../routes/schemas";
import {
  compositionRules,
  mockChampionStats,
  mockChampionTags,
  mockMatchups,
  mockPlayerProfile
} from "../../routes/mock-data";

export const draftsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/drafts/recommendations", async (request) => {
    const payload = draftRecommendationRequestSchema.parse(request.body);
    return {
      recommendations: recommendPicks({
        draft: payload.draft,
        player: mockPlayerProfile,
        championStats: payload.championStats ?? mockChampionStats,
        championTags: mockChampionTags,
        matchups: mockMatchups,
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
