import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  CALIBRATION_LAB_VERSION,
  MAX_PROMOTION_STATUS,
  POST_AGGREGATION_THRESHOLDS,
  REPLAY_CAPABILITY_REGISTRY,
  WEIGHTABLE_METRIC_KEYS,
  validateCalibrationCandidate,
  type CalibrationCandidate
} from "@sparta/core";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { getAuthenticatedUserId } from "../auth/routes.js";
import {
  createAndRunExperiment,
  createCandidate,
  createCandidateRevision,
  decideCandidate,
  findCandidate,
  findExperiment,
  listCandidates,
  listExperimentCases,
  listExperiments,
  type CalibrationFailure
} from "./calibration-repository.js";

/**
 * API do laboratorio offline de calibracao (Etapa 25b).
 *
 * Nenhuma rota daqui altera peso, threshold, versao ou qualquer configuracao do
 * motor operacional. Aprovar uma configuracao e ato **documental**: a ativacao
 * e uma etapa separada e nao existe endpoint que a realize.
 *
 * O cliente nunca envia resultado calculado: score, ranking e agregados sao
 * sempre produzidos no servidor pelo dominio da Etapa 25a.
 */

const metricKeySchema = z.enum(
  WEIGHTABLE_METRIC_KEYS as unknown as [string, ...string[]]
);

const candidateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  baselineAggregationVersion: z.string().min(1).max(40),
  candidateVersion: z.string().min(1).max(40),
  metricWeights: z.record(z.string(), z.number()),
  disabledMetrics: z.array(metricKeySchema).optional(),
  postAggregationThresholds: z.record(z.string(), z.number()).optional(),
  status: z.enum(["DRAFT", "READY"]).default("DRAFT")
});

const filtersSchema = z.object({
  roles: z.array(z.enum(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"])).optional(),
  patches: z.array(z.string().min(1).max(20)).optional(),
  queues: z.array(z.string().min(1).max(20)).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  minimumPoolSize: z.number().int().min(0).max(200).optional(),
  minimumBaselineCoverage: z.number().min(0).max(1).optional(),
  engineVersions: z.array(z.string().min(1).max(40)).optional(),
  preMatchRatings: z
    .array(z.enum(["STRONG", "ADEQUATE", "WEAK", "INSUFFICIENT_DATA", "NOT_APPLICABLE"]))
    .optional(),
  issueTags: z.array(z.string().min(1).max(60)).optional()
});

const decisionSchema = z.object({
  experimentId: z.string().min(1).optional(),
  note: z.string().max(2000).optional()
});

function toCandidate(
  body: z.infer<typeof candidateSchema>,
  id: string
): CalibrationCandidate {
  return {
    id,
    name: body.name,
    ...(body.description ? { description: body.description } : {}),
    baselineAggregationVersion: body.baselineAggregationVersion,
    candidateVersion: body.candidateVersion,
    metricWeights: body.metricWeights as CalibrationCandidate["metricWeights"],
    ...(body.disabledMetrics
      ? { disabledMetrics: body.disabledMetrics as CalibrationCandidate["disabledMetrics"] }
      : {}),
    ...(body.postAggregationThresholds
      ? { postAggregationThresholds: body.postAggregationThresholds }
      : {}),
    status: body.status
  };
}

async function resolveAccount(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ id: string; userId: string } | null> {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    await reply.status(401).send({ error: "unauthorized" });
    return null;
  }
  const account = await prisma.riotAccount.findFirst({ where: { userId } });
  if (!account) {
    await reply.status(422).send({
      error: "riot_account_unavailable",
      message: "Vincule uma conta Riot para usar o laboratório."
    });
    return null;
  }
  return { id: account.id, userId };
}

function statusFor(failure: CalibrationFailure): number {
  switch (failure.code) {
    case "CANDIDATE_NOT_FOUND":
    case "EXPERIMENT_NOT_FOUND":
      return 404;
    case "EXPERIMENT_ALREADY_RUNNING":
    case "EXPERIMENT_IMMUTABLE":
    case "CANDIDATE_SUPERSEDED":
      return 409;
    default:
      return 422;
  }
}

export const calibrationRoutes: FastifyPluginAsync = async (app) => {
  /** Vocabulario publicado: o que da pra calibrar e o que fica bloqueado. */
  app.get("/calibration/parameters", async () => ({
    laboratoryVersion: CALIBRATION_LAB_VERSION,
    maxPromotionStatus: MAX_PROMOTION_STATUS,
    weightableMetrics: WEIGHTABLE_METRIC_KEYS,
    postAggregationThresholds: POST_AGGREGATION_THRESHOLDS,
    registry: REPLAY_CAPABILITY_REGISTRY
  }));

  /** Valida sem persistir - a tela usa isto para mostrar rejeicoes ao editar. */
  app.post("/calibration/candidates/validate", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return;
    const parsed = candidateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    return validateCalibrationCandidate(toCandidate(parsed.data, "preview"));
  });

  app.post("/calibration/candidates", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return;
    const parsed = candidateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const result = await createCandidate({
      riotAccountId: account.id,
      candidate: toCandidate(parsed.data, "new")
    });
    if (!result.ok) return reply.status(statusFor(result.failure)).send(result.failure);
    return reply.status(201).send(result.row);
  });

  app.get("/calibration/candidates", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return;
    return { candidates: await listCandidates(account.id) };
  });

  app.get<{ Params: { id: string } }>("/calibration/candidates/:id", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return;
    const row = await findCandidate(account.id, request.params.id);
    if (!row) return reply.status(404).send({ error: "candidate_not_found" });
    return row;
  });

  app.post<{ Params: { id: string } }>(
    "/calibration/candidates/:id/revisions",
    async (request, reply) => {
      const account = await resolveAccount(request, reply);
      if (!account) return;
      const parsed = candidateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      }
      const result = await createCandidateRevision({
        riotAccountId: account.id,
        candidateId: request.params.id,
        candidate: toCandidate(parsed.data, request.params.id)
      });
      if (!result.ok) return reply.status(statusFor(result.failure)).send(result.failure);
      return reply.status(201).send(result.row);
    }
  );

  app.post("/calibration/experiments", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return;
    const parsed = z
      .object({ candidateId: z.string().min(1), filters: filtersSchema.default({}) })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }
    const result = await createAndRunExperiment({
      riotAccountId: account.id,
      candidateId: parsed.data.candidateId,
      filters: parsed.data.filters
    });
    if (!result.ok) return reply.status(statusFor(result.failure)).send(result.failure);
    return reply.status(result.result.reused ? 200 : 201).send(result.result);
  });

  app.get("/calibration/experiments", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return;
    const query = z
      .object({ candidateId: z.string().min(1).optional() })
      .safeParse(request.query ?? {});
    if (!query.success) return reply.status(400).send({ error: "invalid_query" });
    return { experiments: await listExperiments(account.id, query.data.candidateId) };
  });

  app.get<{ Params: { id: string } }>("/calibration/experiments/:id", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return;
    const row = await findExperiment(account.id, request.params.id);
    if (!row) return reply.status(404).send({ error: "experiment_not_found" });
    return row;
  });

  app.get<{ Params: { id: string } }>(
    "/calibration/experiments/:id/cases",
    async (request, reply) => {
      const account = await resolveAccount(request, reply);
      if (!account) return;
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(20),
          offset: z.coerce.number().int().min(0).default(0),
          replayStatus: z
            .enum([
              "EXACT_REPLAY",
              "REPLAY_INTEGRITY_FAILED",
              "REPLAY_UNSUPPORTED_VERSION",
              "REPLAY_MISSING_HISTORICAL_INPUT"
            ])
            .optional()
        })
        .safeParse(request.query ?? {});
      if (!query.success) return reply.status(400).send({ error: "invalid_query" });

      const page = await listExperimentCases({
        riotAccountId: account.id,
        experimentId: request.params.id,
        limit: query.data.limit,
        offset: query.data.offset,
        ...(query.data.replayStatus ? { replayStatus: query.data.replayStatus } : {})
      });
      if (!page) return reply.status(404).send({ error: "experiment_not_found" });
      return page;
    }
  );

  app.post<{ Params: { id: string } }>(
    "/calibration/candidates/:id/reject",
    async (request, reply) => {
      const account = await resolveAccount(request, reply);
      if (!account) return;
      const parsed = decisionSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });
      const result = await decideCandidate({
        riotAccountId: account.id,
        candidateId: request.params.id,
        decision: "REJECTED",
        decidedBy: account.userId,
        ...(parsed.data.experimentId ? { experimentId: parsed.data.experimentId } : {}),
        ...(parsed.data.note ? { note: parsed.data.note } : {})
      });
      if (!result.ok) return reply.status(statusFor(result.failure)).send(result.failure);
      return result.row;
    }
  );

  /**
   * Aprova **apenas para versao futura**. Nao publica peso, nao troca versao
   * ativa e nao toca o Champion Select - registra revisao, experimento e autor.
   */
  app.post<{ Params: { id: string } }>(
    "/calibration/candidates/:id/approve-for-future-release",
    async (request, reply) => {
      const account = await resolveAccount(request, reply);
      if (!account) return;
      const parsed = decisionSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });
      const result = await decideCandidate({
        riotAccountId: account.id,
        candidateId: request.params.id,
        decision: "APPROVED_FOR_FUTURE_RELEASE",
        decidedBy: account.userId,
        ...(parsed.data.experimentId ? { experimentId: parsed.data.experimentId } : {}),
        ...(parsed.data.note ? { note: parsed.data.note } : {})
      });
      if (!result.ok) return reply.status(statusFor(result.failure)).send(result.failure);
      return {
        ...result.row,
        activation: "NOT_ACTIVATED",
        note: "Aprovação documental. Nenhum peso operacional foi alterado."
      };
    }
  );
};
