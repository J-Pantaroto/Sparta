import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  DEFAULT_VERSION_DISPLAY_SAMPLE_THRESHOLD,
  type LongitudinalReportFilters,
  type RecommendationSelectionGroup,
  type Role
} from "@sparta/core";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { getAuthenticatedUserId } from "../auth/routes.js";
import { buildRecommendationObservabilityForPlayer } from "./recommendation-observability-repository.js";

const roleSchema = z.enum(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);
const groupSchema = z.enum(["PRIMARY", "ALTERNATIVE", "NOT_IN_SNAPSHOT"]);

function commaSeparated<T>(
  schema: z.ZodType<T>
): z.ZodEffects<z.ZodOptional<z.ZodString>, T[] | undefined, string | undefined> {
  return z
    .string()
    .optional()
    .transform((value, context) => {
      if (value === undefined) return undefined;
      const parsed = value
        .split(",")
        .map((entry) => schema.safeParse(entry.trim()))
        .filter((entry) => entry.success)
        .map((entry) => (entry as z.SafeParseSuccess<T>).data);
      if (parsed.length !== value.split(",").filter((entry) => entry.trim()).length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Filtro inválido." });
        return z.NEVER;
      }
      return parsed;
    });
}

const observabilityQuerySchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    patch: commaSeparated(z.string().min(1).max(40)),
    queueId: commaSeparated(z.coerce.number().int()),
    role: commaSeparated(roleSchema),
    championId: commaSeparated(z.coerce.number().int().positive()),
    group: commaSeparated(groupSchema),
    algorithmDimension: z.string().min(1).max(80).optional(),
    algorithmVersion: commaSeparated(z.string().min(1).max(160)),
    recommendationVersion: commaSeparated(z.string().min(1).max(160)),
    strategicVersion: commaSeparated(z.string().min(1).max(160)),
    executionRiskVersion: commaSeparated(z.string().min(1).max(160)),
    postgameVersion: commaSeparated(z.string().min(1).max(160)),
    displaySampleThreshold: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(DEFAULT_VERSION_DISPLAY_SAMPLE_THRESHOLD)
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from deve ser anterior ou igual a to."
  })
  .refine(
    (value) => (value.algorithmDimension === undefined) === (value.algorithmVersion === undefined),
    {
      message: "algorithmDimension e algorithmVersion devem ser informados juntos."
    }
  );

type ObservabilityQuery = z.infer<typeof observabilityQuerySchema>;

function filtersOf(
  query: ObservabilityQuery,
  forcedRole?: Role
): Omit<LongitudinalReportFilters, "playerId"> {
  const algorithmVersions: Record<string, string[]> = {};
  if (query.algorithmDimension && query.algorithmVersion) {
    algorithmVersions[query.algorithmDimension] = query.algorithmVersion;
  }
  if (query.recommendationVersion) {
    algorithmVersions.recommendationEngine = query.recommendationVersion;
  }
  if (query.strategicVersion) algorithmVersions.draftStrategy = query.strategicVersion;
  if (query.executionRiskVersion) algorithmVersions.executionRisk = query.executionRiskVersion;
  if (query.postgameVersion) algorithmVersions.postgameComparison = query.postgameVersion;
  return {
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
    ...(query.patch ? { patches: query.patch } : {}),
    ...(query.queueId ? { queueIds: query.queueId } : {}),
    ...(forcedRole ? { roles: [forcedRole] } : query.role ? { roles: query.role } : {}),
    ...(query.championId ? { championIds: query.championId } : {}),
    ...(query.group ? { selectionGroups: query.group as RecommendationSelectionGroup[] } : {}),
    ...(Object.keys(algorithmVersions).length > 0 ? { algorithmVersions } : {})
  };
}

export const recommendationObservabilityRoutes: FastifyPluginAsync = async (app) => {
  async function reportFor(request: FastifyRequest, reply: FastifyReply, forcedRole?: Role) {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      reply.code(401);
      return { code: "UNAUTHENTICATED", message: "Não autenticado." };
    }
    const params = z.object({ playerId: z.string().min(1) }).parse(request.params);
    const account = await prisma.riotAccount.findFirst({
      where: { userId, puuid: params.playerId }
    });
    if (!account) {
      reply.code(403);
      return {
        code: "PLAYER_OBSERVABILITY_FORBIDDEN",
        message: "O histórico do motor de outra conta não pode ser consultado."
      };
    }
    const query = observabilityQuerySchema.parse(request.query);
    return buildRecommendationObservabilityForPlayer({
      riotAccountId: account.id,
      puuid: account.puuid,
      filters: filtersOf(query, forcedRole),
      generatedAt: new Date().toISOString(),
      displaySampleThreshold: query.displaySampleThreshold
    });
  }

  app.get("/players/:playerId/recommendation-observability", async (request, reply) =>
    reportFor(request, reply)
  );

  app.get("/players/:playerId/recommendation-observability/versions", async (request, reply) =>
    reportFor(request, reply)
  );

  app.get("/players/:playerId/recommendation-observability/roles/:role", async (request, reply) => {
    const { role } = z.object({ role: roleSchema }).parse(request.params);
    return reportFor(request, reply, role);
  });
};
