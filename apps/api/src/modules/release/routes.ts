import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { buildBaselineConfiguration, type DraftState } from "@sparta/core";
import { prisma } from "../../db/prisma.js";
import { getAuthenticatedUserId } from "../auth/routes.js";
import {
  activateRelease,
  createRelease,
  findActiveReleaseForAccount,
  findRelease,
  listReleaseEvents,
  listReleases,
  rollbackRelease,
  validateRelease,
  type ReleaseFailure
} from "./release-repository.js";
import { invalidateActiveConfigurationCache } from "./active-configuration-provider.js";
import { createHash } from "node:crypto";

/**
 * API de persistência e operação de releases (Etapa 27b).
 *
 * Vive sob `/calibration/*` pra combinar com o laboratório (a release nasce
 * de uma candidata de lá) e ganha uma rota própria fora desse prefixo,
 * `GET /recommendation-engine/active-release`, porque ela descreve a
 * configuração **operacional** — não é mais sobre o laboratório.
 *
 * Nenhuma rota aqui aceita peso, threshold ou qualquer parâmetro de
 * configuração no corpo: ativar e reverter recebem só `releaseId` (na URL) e
 * um motivo opcional. Os únicos números que definem uma release vêm da
 * candidata já aprovada no laboratório, nunca do request de ativação.
 */

function hashCanonical(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex");
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
      message: "Vincule uma conta Riot para gerenciar releases."
    });
    return null;
  }
  return { id: account.id, userId };
}

function statusFor(failure: ReleaseFailure): number {
  switch (failure.code) {
    case "CANDIDATE_NOT_FOUND":
    case "RELEASE_NOT_FOUND":
      return 404;
    case "CANDIDATE_NOT_APPROVED":
    case "EXPERIMENT_NOT_COMPLETED":
    case "VALIDATION_NOT_PASSED":
      return 422;
    case "INVALID_TRANSITION":
    case "ARTIFACT_CHANGED":
    case "NOT_CURRENTLY_ACTIVE":
    case "CONCURRENT_CONFLICT":
      return 409;
    default:
      return 400;
  }
}

const createReleaseSchema = z.object({
  releaseVersion: z.string().min(1).max(60)
});

const reasonSchema = z.object({
  reason: z.string().max(2000).optional()
});

/** Três drafts sintéticos, um por tabela de `selectWeights` (Etapa 27a). */
function baselineScenarios() {
  const base: Omit<DraftState, "pickOrder" | "enemyLaneChampionId"> = {
    allies: [],
    enemies: [],
    bannedChampionIds: []
  };
  const scenarios: { label: string; draft: DraftState }[] = [
    { label: "BLIND_PICK", draft: { ...base, pickOrder: 1 } },
    { label: "ENEMY_LANE_REVEALED", draft: { ...base, pickOrder: 3, enemyLaneChampionId: 1 } },
    { label: "MID_DRAFT", draft: { ...base, pickOrder: 3 } }
  ];
  return scenarios.map((entry) => ({
    label: entry.label,
    configuration: buildBaselineConfiguration(entry.draft, { computeHash: hashCanonical, version: entry.label })
  }));
}

export const releaseRoutes: FastifyPluginAsync = async (app) => {
  /** Cria uma release em DRAFT a partir de uma candidata já aprovada. */
  app.post<{ Params: { candidateId: string } }>(
    "/calibration/candidates/:candidateId/releases",
    async (request, reply) => {
      const account = await resolveAccount(request, reply);
      if (!account) return;
      const parsed = createReleaseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
      }
      const result = await createRelease({
        riotAccountId: account.id,
        candidateId: request.params.candidateId,
        releaseVersion: parsed.data.releaseVersion,
        createdBy: account.userId
      });
      if (!result.ok) return reply.status(statusFor(result.failure)).send(result.failure);
      request.log.info({
        event: "release_created",
        releaseId: result.row.id,
        candidateId: result.row.candidateId,
        configHash: result.row.configHash
      });
      return reply.status(201).send(result.row);
    }
  );

  app.get("/calibration/releases", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return;
    return { releases: await listReleases(account.id) };
  });

  app.get<{ Params: { releaseId: string } }>("/calibration/releases/:releaseId", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return;
    const row = await findRelease(account.id, request.params.releaseId);
    if (!row) return reply.status(404).send({ error: "release_not_found" });
    const events = await listReleaseEvents(account.id, request.params.releaseId);
    return { ...row, events };
  });

  /**
   * Roda a validação pré-ativação inteira: hashes, estado da candidata e do
   * experimento, e equivalência laboratório×motor com bundles reais.
   */
  app.post<{ Params: { releaseId: string } }>(
    "/calibration/releases/:releaseId/validate",
    async (request, reply) => {
      const account = await resolveAccount(request, reply);
      if (!account) return;
      const result = await validateRelease({
        riotAccountId: account.id,
        releaseId: request.params.releaseId,
        actor: account.userId
      });
      if (!result.ok) return reply.status(statusFor(result.failure)).send(result.failure);
      request.log.info({
        event: "release_validated",
        releaseId: result.row.id,
        status: result.row.status,
        validationStatus: result.row.validation?.status
      });
      return result.row;
    }
  );

  /**
   * Ativa uma release READY_FOR_ACTIVATION. Só aceita `releaseId` (na URL) e
   * um motivo opcional — nenhum peso, threshold nem configuração no corpo.
   */
  app.post<{ Params: { releaseId: string } }>(
    "/calibration/releases/:releaseId/activate",
    async (request, reply) => {
      const account = await resolveAccount(request, reply);
      if (!account) return;
      const parsed = reasonSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });
      const result = await activateRelease({
        riotAccountId: account.id,
        releaseId: request.params.releaseId,
        actor: account.userId,
        ...(parsed.data.reason ? { reason: parsed.data.reason } : {})
      });
      if (!result.ok) return reply.status(statusFor(result.failure)).send(result.failure);
      invalidateActiveConfigurationCache(account.id);
      request.log.info({
        event: "release_activated",
        releaseId: result.row.id,
        previousReleaseId: result.row.previousReleaseId ?? null,
        cacheInvalidated: true
      });
      return result.row;
    }
  );

  /** Reverte a release atualmente ativa pra exatamente a anterior. */
  app.post<{ Params: { releaseId: string } }>(
    "/calibration/releases/:releaseId/rollback",
    async (request, reply) => {
      const account = await resolveAccount(request, reply);
      if (!account) return;
      const parsed = reasonSchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.status(400).send({ error: "invalid_body" });
      const result = await rollbackRelease({
        riotAccountId: account.id,
        releaseId: request.params.releaseId,
        actor: account.userId,
        ...(parsed.data.reason ? { reason: parsed.data.reason } : {})
      });
      if (!result.ok) return reply.status(statusFor(result.failure)).send(result.failure);
      invalidateActiveConfigurationCache(account.id);
      request.log.info({
        event: "release_rolled_back",
        releaseId: result.row.id,
        restoredReleaseId: result.row.previousReleaseId ?? null,
        cacheInvalidated: true
      });
      return result.row;
    }
  );

  /**
   * Configuração operacional atual. Com release ativa, devolve a release
   * (nunca editável por aqui). Sem release ativa, devolve as três tabelas
   * reais da baseline por cenário de draft — não fabrica "a" baseline única,
   * porque ela não existe: varia por blind/lane revelada/meio do draft
   * (`buildBaselineConfiguration`, Etapa 27a).
   */
  app.get("/recommendation-engine/active-release", async (request, reply) => {
    const account = await resolveAccount(request, reply);
    if (!account) return;
    const active = await findActiveReleaseForAccount(account.id);
    if (active) {
      return { source: "RELEASE", release: active };
    }
    return {
      source: "BUILT_IN_BASELINE",
      note: "Nenhuma release está ativa. A baseline varia por cenário do draft; as três tabelas reais estão em `scenarios`.",
      scenarios: baselineScenarios()
    };
  });
};
