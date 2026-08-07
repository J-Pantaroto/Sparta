import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  aggregatePersonalLoadoutEvidence,
  computeGrowthJourney,
  rankChampionPool,
  unavailableGlobalChampionRoleEligibility,
  type RecentChampionMatch,
  type Role
} from "@sparta/core";
import { prisma } from "../../db/prisma.js";
import { loadEnv } from "../../config/env.js";
import { safeExternalErrorLog } from "../../http/external-error-response.js";
import { opaqueIdentifier } from "../../http/log-redaction.js";
import { getAuthenticatedUserId } from "../auth/routes.js";
import { findParticipationHistory } from "../matches/match-repository.js";
import { findPostgameReportsByPuuid } from "../postgame/postgame-repository.js";
import { lookupRiotAccount } from "../riot-integration/account-lookup.js";
import {
  deriveObservedRoles,
  findChampionStatsByPuuid,
  findMatchAnalysisLimitByPuuid,
  findPlayerInsightsByPuuid,
  findRiotAccountByRiotId,
  MAX_MATCH_ANALYSIS_LIMIT,
  MIN_MATCH_ANALYSIS_LIMIT,
  setMatchAnalysisLimit
} from "./player-stats-repository.js";
import { syncPlayerMatches } from "../sync/riot-sync-service.js";
import { findPlayerChampionRoleEvidence } from "./player-champion-role-evidence-repository.js";
import {
  addUserProvidedPoolEntry,
  disableUserProvidedPoolEntry,
  findPlayerPool
} from "./player-pool-repository.js";
import { findPersonalLoadoutObservations } from "./personal-loadout-repository.js";
import { findPlayerProfileOverviewByUserId } from "./player-profile-overview-repository.js";
import { findMatchHistoryByPuuid } from "../matches/match-history-repository.js";

export const linkRiotAccountSchema = z.object({
  gameName: z.string().min(3, "Informe o nome do invocador"),
  tagLine: z.string().min(1, "Informe a tag (ex.: BR1)"),
  platformRegion: z.string().min(2).default("br1"),
  regionalRouting: z.string().min(2).default("americas")
});

const roleSchema = z.enum(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);
const commaSeparatedStrings = z
  .string()
  .optional()
  .transform((value) =>
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
const commaSeparatedNumbers = z
  .string()
  .optional()
  .transform((value, context) => {
    if (value === undefined) return undefined;
    const values = value.split(",").map((item) => Number(item.trim()));
    if (values.some((item) => !Number.isInteger(item))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "queueId deve conter inteiros." });
      return z.NEVER;
    }
    return values;
  });

export const playersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me/player-profile", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { code: "UNAUTHENTICATED", message: "Não autenticado." };
    }

    const profile = await findPlayerProfileOverviewByUserId(userId);
    if (!profile) {
      reply.code(404);
      return {
        code: "RIOT_ACCOUNT_NOT_LINKED",
        message: "Nenhuma conta Riot vinculada foi encontrada para esta sessão."
      };
    }

    return profile;
  });

  app.get("/players/:riotName/:tagLine/profile", async (request, reply) => {
    const params = z.object({ riotName: z.string(), tagLine: z.string() }).parse(request.params);
    const account = await findRiotAccountByRiotId(params.riotName, params.tagLine);
    if (!account) {
      reply.code(404);
      return { error: "Conta Riot nao encontrada. Ela precisa ser vinculada no Sparta primeiro." };
    }

    const championStats = await findChampionStatsByPuuid(account.puuid);
    const insights = await findPlayerInsightsByPuuid(account.puuid);

    const observedRoles = deriveObservedRoles(championStats);
    return {
      id: account.puuid,
      account,
      observedRoles,
      // Alias legado: representa volume pessoal observado, nunca
      // elegibilidade global de campeões.
      preferredRoles: observedRoles,
      championStats,
      ...insights
    };
  });

  app.get("/players/:puuid/champions/:championId/role-evidence", async (request) => {
    const params = z
      .object({ puuid: z.string().min(1), championId: z.coerce.number().int().positive() })
      .parse(request.params);
    const query = z
      .object({
        role: roleSchema,
        patch: commaSeparatedStrings,
        queueId: commaSeparatedNumbers,
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        gameMode: commaSeparatedStrings,
        gameType: commaSeparatedStrings
      })
      .refine((value) => !value.from || !value.to || value.from <= value.to, {
        message: "from deve ser anterior ou igual a to."
      })
      .parse(request.query);

    const filters = {
      patches: query.patch,
      queueIds: query.queueId,
      playedAtFrom: query.from,
      playedAtTo: query.to,
      gameModes: query.gameMode,
      gameTypes: query.gameType
    };
    const personalRoleEvidence = await findPlayerChampionRoleEvidence(
      params.puuid,
      params.championId,
      query.role,
      filters
    );

    return {
      personalRoleEvidence,
      globalRoleEligibility: unavailableGlobalChampionRoleEligibility(
        params.championId,
        query.role
      ),
      scope: filters
    };
  });

  app.get(
    "/players/:playerId/champions/:championId/roles/:role/loadout-evidence",
    async (request, reply) => {
      const userId = await getAuthenticatedUserId(request);
      if (!userId) {
        reply.code(401);
        return { code: "UNAUTHENTICATED", message: "Não autenticado." };
      }
      const params = z
        .object({
          playerId: z.string().min(1),
          championId: z.coerce.number().int().positive(),
          role: roleSchema
        })
        .parse(request.params);
      const query = z
        .object({
          patch: z.string().min(1).max(40).optional(),
          queueId: commaSeparatedNumbers,
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          recentMatches: z.coerce.number().int().min(1).max(200).optional()
        })
        .refine((value) => !value.from || !value.to || value.from <= value.to, {
          message: "from deve ser anterior ou igual a to."
        })
        .parse(request.query);
      const riotAccount = await prisma.riotAccount.findFirst({ where: { userId } });
      if (!riotAccount) {
        reply.code(404);
        return {
          code: "RIOT_ACCOUNT_NOT_LINKED",
          message: "Nenhuma conta Riot vinculada."
        };
      }
      if (params.playerId !== riotAccount.puuid) {
        reply.code(403);
        return {
          code: "PLAYER_HISTORY_FORBIDDEN",
          message: "O histórico pessoal de outra conta não pode ser consultado."
        };
      }

      const observations = await findPersonalLoadoutObservations(
        riotAccount.puuid,
        params.championId,
        params.role
      );
      return aggregatePersonalLoadoutEvidence(observations, {
        championId: params.championId,
        role: params.role,
        requestedPatch: query.patch,
        queueIds: query.queueId,
        playedAtFrom: query.from,
        playedAtTo: query.to,
        recentMatches: query.recentMatches
      });
    }
  );

  app.get("/players/pool", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }
    const query = z.object({ role: roleSchema.optional() }).parse(request.query);
    const riotAccount = await prisma.riotAccount.findFirst({ where: { userId } });
    if (!riotAccount) {
      reply.code(404);
      return { error: "Nenhuma conta Riot vinculada." };
    }
    return findPlayerPool(riotAccount.id, riotAccount.puuid, query.role);
  });

  app.post("/players/pool", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }
    const payload = z
      .object({ championId: z.number().int().positive(), role: roleSchema })
      .strict()
      .parse(request.body);
    const riotAccount = await prisma.riotAccount.findFirst({ where: { userId } });
    if (!riotAccount) {
      reply.code(404);
      return { error: "Nenhuma conta Riot vinculada." };
    }
    const result = await addUserProvidedPoolEntry(
      riotAccount.id,
      riotAccount.puuid,
      payload.championId,
      payload.role
    );
    if (result.status === "CHAMPION_NOT_FOUND") {
      reply.code(404);
      return { code: "CHAMPION_NOT_FOUND", message: "Campeão não encontrado no catálogo." };
    }
    reply.code(result.status === "CREATED" ? 201 : 200);
    return { entry: result.entry };
  });

  app.patch("/players/pool/:championId", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }
    const params = z
      .object({ championId: z.coerce.number().int().positive() })
      .parse(request.params);
    const payload = z
      .object({ role: roleSchema, enabled: z.literal(false) })
      .strict()
      .parse(request.body);
    const riotAccount = await prisma.riotAccount.findFirst({ where: { userId } });
    if (!riotAccount) {
      reply.code(404);
      return { error: "Nenhuma conta Riot vinculada." };
    }
    const result = await disableUserProvidedPoolEntry(
      riotAccount.id,
      params.championId,
      payload.role
    );
    if (result.status === "NOT_FOUND") {
      reply.code(404);
      return { code: "POOL_ENTRY_NOT_FOUND", message: "Entrada não encontrada no seu pool." };
    }
    if (result.status === "OBSERVED_ENTRY") {
      reply.code(409);
      return {
        code: "OBSERVED_ENTRY_CANNOT_BE_DISABLED",
        message: "Uma entrada observada não pode ser classificada nem removida como manual."
      };
    }
    return { entry: result.entry };
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
            ...safeExternalErrorLog(error)
          });
        }
      }
    );

    for (const failure of result.failed) {
      request.log.error({
        event: "riot_sync_match_failed",
        code: failure.reason
      });
    }

    for (const skipped of result.skippedParticipants) {
      request.log.warn({
        event: "riot_sync_participant_skipped",
        matchId: skipped.matchId,
        playerRef: opaqueIdentifier(skipped.puuid),
        reason: "Campeao ainda nao esta no catalogo (catalog:sync desatualizado)."
      });
    }

    return result;
  });

  app.get("/players/:puuid/recent-matches", async (request) => {
    const params = z.object({ puuid: z.string() }).parse(request.params);
    const query = z
      .object({ limit: z.coerce.number().min(1).max(50).default(10) })
      .parse(request.query);

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
      // `null` atravessa como `null`: a partida pode nao ter esse dado, e
      // 0 aqui seria participacao zero medida.
      killParticipation: entry.killParticipation,
      objectiveParticipation: entry.objectiveParticipation
    }));

    return { puuid: params.puuid, matches };
  });

  /**
   * Histórico pessoal moderno (Etapa 31H): filtros e paginação sobre o
   * mesmo enriquecimento por partida que `/me/player-profile` já usa
   * (`match-history-mapper.ts`) - contrato/comportamento daquela rota não
   * mudam. Sem novo cálculo, inferência ou vínculo Match-V5.
   */
  app.get("/players/:puuid/match-history", async (request, reply) => {
    const params = z.object({ puuid: z.string() }).parse(request.params);
    const query = z
      .object({
        role: z.enum(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]).optional(),
        // z.coerce.boolean() trataria a string "false" como truthy - aceita
        // só os dois literais esperados e converte explicitamente.
        won: z
          .enum(["true", "false"])
          .transform((value) => value === "true")
          .optional(),
        queueId: z.coerce.number().int().optional(),
        championId: z.coerce.number().int().optional(),
        periodDays: z
          .enum(["7", "14", "30"])
          .transform((value) => Number(value) as 7 | 14 | 30)
          .optional(),
        limit: z.coerce.number().min(1).max(100).default(20),
        offset: z.coerce.number().min(0).default(0)
      })
      .parse(request.query);

    const page = await findMatchHistoryByPuuid(params.puuid, query);
    if (!page) {
      reply.code(404);
      return { error: "Nenhuma conta Riot vinculada." };
    }
    return { puuid: params.puuid, ...page };
  });

  app.get("/players/:puuid/champion-performance", async (request) => {
    const params = z.object({ puuid: z.string() }).parse(request.params);
    const championStats = await findChampionStatsByPuuid(params.puuid);
    return { puuid: params.puuid, champions: rankChampionPool(championStats) };
  });

  /**
   * Growth Journey (Fase 5): progressao dos pontos fracos identificados no
   * Post-Game Coach ao longo das partidas ja analisadas. Deriva tudo dos
   * PostgameReport ja persistidos - sem tabela nova. Sem historico de
   * relatorios ainda, volta uma lista vazia (nunca inventa tendencia).
   */
  app.get("/players/:puuid/growth-journey", async (request) => {
    const params = z.object({ puuid: z.string() }).parse(request.params);
    const matchAnalysisLimit = await findMatchAnalysisLimitByPuuid(params.puuid);
    const reports = await findPostgameReportsByPuuid(params.puuid, matchAnalysisLimit);
    return { puuid: params.puuid, ...computeGrowthJourney(reports) };
  });

  /**
   * Configuracao pessoal "quantas partidas o Sparta deve analisar" (Fase
   * 6b). Autenticadas, resolvem a conta Riot do usuario no servidor (mesmo
   * padrao de /drafts/recommendations) - nunca recebem puuid do cliente.
   */
  app.get("/players/settings", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    const riotAccount = await prisma.riotAccount.findFirst({ where: { userId } });
    if (!riotAccount) {
      reply.code(404);
      return { error: "Nenhuma conta Riot vinculada." };
    }

    const matchAnalysisLimit = await findMatchAnalysisLimitByPuuid(riotAccount.puuid);
    return { matchAnalysisLimit };
  });

  /**
   * Atualiza a configuracao e dispara um sync na hora (mesma chamada de
   * POST /players/sync) pra aplicar o novo limite imediatamente, em vez de
   * so valer a partir do proximo sync espontaneo.
   */
  app.put("/players/settings", async (request, reply) => {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { error: "Nao autenticado." };
    }

    const riotAccount = await prisma.riotAccount.findFirst({ where: { userId } });
    if (!riotAccount) {
      reply.code(404);
      return { error: "Nenhuma conta Riot vinculada." };
    }

    const payload = z
      .object({
        matchAnalysisLimit: z
          .number()
          .int()
          .min(MIN_MATCH_ANALYSIS_LIMIT)
          .max(MAX_MATCH_ANALYSIS_LIMIT)
      })
      .parse(request.body);

    await setMatchAnalysisLimit(riotAccount.id, payload.matchAnalysisLimit);

    // O sync imediato e so pra nao deixar o usuario esperando o proximo sync
    // espontaneo - a configuracao ja foi salva no passo acima, entao uma
    // falha aqui (rate limit, chave da Riot expirada, etc.) nao pode derrubar
    // a resposta de sucesso do que realmente importa nesta rota.
    try {
      await syncPlayerMatches(
        {
          riotAccountId: riotAccount.id,
          puuid: riotAccount.puuid,
          platformRegion: riotAccount.platformRegion
        },
        {
          onInsightsFailed: (error) => {
            request.log.error({
              event: "riot_sync_insights_failed",
              ...safeExternalErrorLog(error)
            });
          }
        }
      );
    } catch (error) {
      request.log.error({
        event: "riot_sync_after_settings_update_failed",
        ...safeExternalErrorLog(error)
      });
    }

    return { matchAnalysisLimit: payload.matchAnalysisLimit };
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

    const env = loadEnv();
    if (env.IDENTITY_MODE === "RSO_REQUIRED" || !env.LOCAL_RIOT_LINK_ENABLED) {
      reply.code(env.IDENTITY_MODE === "RSO_REQUIRED" && !env.RSO_ENABLED ? 503 : 409);
      return {
        code:
          env.IDENTITY_MODE === "RSO_REQUIRED" && !env.RSO_ENABLED
            ? "RSO_NOT_CONFIGURED"
            : "LOCAL_RIOT_LINK_DISABLED",
        message:
          "O vinculo local por Riot ID nao verifica propriedade e nao esta habilitado neste ambiente."
      };
    }

    const payload = linkRiotAccountSchema.parse(request.body);

    const riotAccountInfo = await lookupRiotAccount(payload.gameName, payload.tagLine);

    const [targetAccount, ownAccount] = await Promise.all([
      prisma.riotAccount.findUnique({ where: { puuid: riotAccountInfo.puuid } }),
      prisma.riotAccount.findUnique({ where: { userId } })
    ]);
    if (targetAccount?.userId && targetAccount.userId !== userId) {
      reply.code(409);
      return {
        code: "RIOT_IDENTITY_ALREADY_ASSOCIATED",
        message: "Esta identidade Riot nao pode ser vinculada a esta conta."
      };
    }
    if (targetAccount && ownAccount && targetAccount.id !== ownAccount.id) {
      reply.code(409);
      return {
        code: "RIOT_ACCOUNT_LINK_CONFLICT",
        message: "A conta ja possui outro vinculo Riot controlado."
      };
    }

    const common = {
      gameName: riotAccountInfo.gameName,
      tagLine: riotAccountInfo.tagLine,
      platformRegion: payload.platformRegion,
      regionalRouting: payload.regionalRouting,
      userId,
      linkStatus: "UNVERIFIED_LEGACY" as const,
      verifiedAt: null,
      verificationMethod: null,
      verificationEvidenceHash: null,
      revokedAt: null,
      reauthenticationRequiredAt: null
    };
    const account = targetAccount
      ? await prisma.riotAccount.update({ where: { id: targetAccount.id }, data: common })
      : ownAccount
        ? await prisma.riotAccount.update({
            where: { id: ownAccount.id },
            data: { ...common, puuid: riotAccountInfo.puuid }
          })
        : await prisma.riotAccount.create({
            data: {
              puuid: riotAccountInfo.puuid,
              ...common
            }
          });

    reply.code(201);
    return {
      riotAccount: {
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        platformRegion: account.platformRegion,
        regionalRouting: account.regionalRouting,
        linkStatus: account.linkStatus,
        verifiedAt: account.verifiedAt?.toISOString() ?? null
      },
      linkStatus: account.linkStatus,
      verification: "NOT_VERIFIED"
    };
  });
};
