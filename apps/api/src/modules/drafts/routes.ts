import type { FastifyPluginAsync } from "fastify";
import {
  aggregateMatchupData,
  generatePreGameAnalysis,
  recommendPicks,
  type MatchupData,
  type PlayerChampionStats,
  type PlayerProfile
} from "@sparta/core";
import { draftRecommendationRequestSchema, preGameAnalysisRequestSchema } from "../../routes/schemas.js";
import { compositionRules } from "../../config/composition-rules.js";
import { prisma } from "../../db/prisma.js";
import { getAuthenticatedUserId } from "../auth/routes.js";
import { findAllChampionTags, findChampionNamesByIds } from "../catalog/champion-repository.js";
import { findPersonalLaneMatchupHistory } from "../matches/matchup-repository.js";
import {
  deriveObservedRoles,
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

    // Sem posicao a rota nao roda o motor. Assumir MID aqui produziria
    // recomendacoes do papel errado sem nenhum sinal disso na resposta.
    if (!payload.draft.playerRole) {
      reply.code(422);
      return {
        code: "PLAYER_ROLE_UNAVAILABLE",
        message: "A posição do jogador ainda não foi identificada."
      };
    }

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
        preferredRoles: deriveObservedRoles(championStats),
        championStats,
        ...insights
      };
    }

    const [championTags, laneHistory] = await Promise.all([
      findAllChampionTags(),
      riotAccount
        ? findPersonalLaneMatchupHistory(riotAccount.puuid, payload.draft.playerRole)
        : Promise.resolve([])
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

  /**
   * Analise pre-game real, derivada do draft atual. A rota so orquestra:
   * valida o payload, resolve nomes pelo catalogo real, carrega as tags e o
   * matchup pessoal, e chama o motor puro do dominio
   * (`generatePreGameAnalysis`). Nenhuma frase e montada aqui.
   */
  app.post("/drafts/pre-game-analysis", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    const payload = preGameAnalysisRequestSchema.parse(request.body);
    const { draft } = payload;

    // Os dois pre-requisitos sao checados antes de qualquer consulta: sem
    // eles a analise nao existe, e ir ao banco so gastaria tempo.
    if (!draft.playerRole) {
      reply.code(422);
      return {
        code: "PLAYER_ROLE_UNAVAILABLE",
        message: "A posição do jogador ainda não foi identificada."
      };
    }
    if (draft.selectedChampionId === undefined) {
      reply.code(422);
      return {
        code: "SELECTED_CHAMPION_UNAVAILABLE",
        message: "Nenhum campeão foi confirmado para esta partida."
      };
    }

    const playerRole = draft.playerRole;
    const selectedChampionId = draft.selectedChampionId;

    const [names, championTags] = await Promise.all([
      findChampionNamesByIds(
        [selectedChampionId, draft.enemyLaneChampionId].filter((id): id is number => id !== undefined)
      ),
      findAllChampionTags()
    ]);

    const selectedChampionName = names.get(selectedChampionId);
    if (!selectedChampionName) {
      // O id nao existe no catalogo real: analisar assim mesmo exigiria
      // inventar um nome, e o motor casa tags por nome.
      reply.code(422);
      return {
        code: "SELECTED_CHAMPION_UNAVAILABLE",
        message: "O campeão confirmado não foi encontrado no catálogo."
      };
    }

    const enemyLaneChampionName =
      draft.enemyLaneChampionId !== undefined ? names.get(draft.enemyLaneChampionId) : undefined;

    // Matchup **pessoal** (Etapa 3): so as partidas do proprio jogador, com
    // este campeao, contra este adversario, nesta posicao. Sem adversario
    // revelado nao ha o que consultar.
    let personalMatchup: MatchupData | undefined;
    if (draft.enemyLaneChampionId !== undefined) {
      const riotAccount = await prisma.riotAccount.findFirst({ where: { userId } });
      if (riotAccount) {
        const history = await findPersonalLaneMatchupHistory(riotAccount.puuid, playerRole);
        personalMatchup = aggregateMatchupData(history).find(
          (entry) =>
            entry.championId === selectedChampionId &&
            entry.enemyChampionId === draft.enemyLaneChampionId &&
            entry.role === playerRole
        );
      }
    }

    const result = generatePreGameAnalysis({
      draft: { ...draft, playerRole, selectedChampionId },
      selectedChampionTag: championTags.find((tag) => tag.championId === selectedChampionId),
      selectedChampionName,
      championTags,
      personalMatchup,
      enemyLaneChampionName,
      now: new Date().toISOString()
    });

    if (!result.ok) {
      reply.code(422);
      return {
        code: result.reason,
        message:
          result.reason === "PLAYER_ROLE_UNAVAILABLE"
            ? "A posição do jogador ainda não foi identificada."
            : "Nenhum campeão foi confirmado para esta partida."
      };
    }

    return result.analysis;
  });
};
