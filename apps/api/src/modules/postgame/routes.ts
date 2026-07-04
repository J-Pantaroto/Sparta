import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

export const postgameRoutes: FastifyPluginAsync = async (app) => {
  app.post("/postgame/analyze", async (request) => {
    const payload = z
      .object({
        matchId: z.string(),
        championName: z.string(),
        won: z.boolean(),
        deathsBefore10: z.number().default(0),
        csAt10: z.number().optional()
      })
      .parse(request.body);

    return {
      matchId: payload.matchId,
      pickAssessment: `${payload.championName} fazia sentido se o plano de draft foi executado com prioridade e visão.`,
      executionSummary: payload.won
        ? "A execução confirmou boa parte da expectativa pré-game."
        : "A execução ficou abaixo da expectativa e deve ser revisada por rota, visão e objetivos.",
      tips: [
        "Reveja as duas primeiras ondas e o primeiro reset.",
        "Anote se as mortes antes de 10 minutos vieram sem informação do jungle inimigo.",
        "Compare sua participação em objetivos com a condição de vitória prevista."
      ]
    };
  });

  app.get("/postgame/:matchId", async (request) => ({
    matchId: z.object({ matchId: z.string() }).parse(request.params).matchId,
    status: "not_found",
    message: "Relatórios persistidos serão retornados após a integração com banco e Match-V5."
  }));
};
