import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  MAX_PROMOTION_STATUS,
  RECOMMENDATION_ENGINE_VERSION,
  RELEASE_ARTIFACT_SCHEMA_VERSION,
  SUPPORTED_AGGREGATION_VERSIONS,
  buildEffectiveConfigurationFromCandidate,
  buildReleaseArtifact,
  canTransitionReleaseLifecycle,
  transitionReleaseLifecycle,
  validateReleaseArtifact,
  type CalibrationCandidate,
  type CalibrationExperimentReport,
  type LaboratoryEquivalenceCase,
  type ReleaseExperimentEvidence,
  type ReleaseLifecycleStatus,
  type ReleaseValidationResult,
  type RecommendationReleaseArtifact,
  type ReplayInputBundle
} from "@sparta/core";
import { prisma } from "../../db/prisma.js";
import { algorithmVersionsOf } from "../drafts/evaluation-context.js";
import { findCandidate, findExperiment } from "../calibration/calibration-repository.js";

/**
 * Persistência e operação segura de releases (Etapa 27b).
 *
 * ## O que este módulo NÃO faz
 *
 * Não injeta configuração no motor (isso é `active-configuration-provider.ts`)
 * e não implementa nenhuma regra de domínio nova — todo cálculo de hash,
 * artefato, validação e transição de estado vem literalmente de
 * `packages/core/src/release/*` (Etapa 27a). Este arquivo só orquestra:
 * carrega o que a validação/ativação precisa, chama o domínio puro, e
 * persiste o resultado numa transação.
 *
 * ## Por que `candidateId` e `candidateRevisionId` são campos distintos
 *
 * `candidateId` é a identidade estável da candidata (`lineageId` de
 * `CalibrationCandidateConfig`) — sobrevive a revisões. `candidateRevisionId`
 * é a revisão exata (`CalibrationCandidateConfig.id`) que o artefato
 * congelou; é o único dos dois com FK, porque é o único que precisa
 * continuar apontando pra uma linha real e imutável.
 */

function hashCanonical(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex");
}

export type ReleaseFailureCode =
  | "CANDIDATE_NOT_FOUND"
  | "CANDIDATE_NOT_APPROVED"
  | "EXPERIMENT_NOT_COMPLETED"
  | "RELEASE_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "VALIDATION_NOT_PASSED"
  | "ARTIFACT_CHANGED"
  | "NOT_CURRENTLY_ACTIVE"
  | "CONCURRENT_CONFLICT";

export interface ReleaseFailure {
  code: ReleaseFailureCode;
  message: string;
  details?: unknown;
}

export interface ReleaseRow {
  id: string;
  riotAccountId: string;
  candidateId: string;
  candidateRevisionId: string;
  experimentId: string;
  releaseVersion: string;
  baselineVersion: string;
  candidateVersion: string;
  status: ReleaseLifecycleStatus;
  artifact: RecommendationReleaseArtifact;
  artifactHash: string;
  configHash: string;
  validation?: ReleaseValidationResult;
  validatedArtifactHash?: string;
  validatedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activatedBy?: string;
  activatedAt?: string;
  previousReleaseId?: string;
  rolledBackBy?: string;
  rolledBackAt?: string;
  rolledBackReason?: string;
  /** `true` quando esta é a release atualmente apontada por `ActivePointer`. */
  currentlyActive: boolean;
}

type ReleaseRecord = Awaited<ReturnType<typeof prisma.recommendationEngineRelease.findFirstOrThrow>>;

function toReleaseRow(row: ReleaseRecord, currentlyActive: boolean): ReleaseRow {
  return {
    id: row.id,
    riotAccountId: row.riotAccountId,
    candidateId: row.candidateId,
    candidateRevisionId: row.candidateRevisionId,
    experimentId: row.experimentId,
    releaseVersion: row.releaseVersion,
    baselineVersion: row.baselineVersion,
    candidateVersion: row.candidateVersion,
    status: row.status as ReleaseLifecycleStatus,
    artifact: row.artifactJson as unknown as RecommendationReleaseArtifact,
    artifactHash: row.artifactHash,
    configHash: row.configHash,
    ...(row.validationJson ? { validation: row.validationJson as unknown as ReleaseValidationResult } : {}),
    ...(row.validatedArtifactHash ? { validatedArtifactHash: row.validatedArtifactHash } : {}),
    ...(row.validatedAt ? { validatedAt: row.validatedAt.toISOString() } : {}),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.activatedBy ? { activatedBy: row.activatedBy } : {}),
    ...(row.activatedAt ? { activatedAt: row.activatedAt.toISOString() } : {}),
    ...(row.previousReleaseId ? { previousReleaseId: row.previousReleaseId } : {}),
    ...(row.rolledBackBy ? { rolledBackBy: row.rolledBackBy } : {}),
    ...(row.rolledBackAt ? { rolledBackAt: row.rolledBackAt.toISOString() } : {}),
    ...(row.rolledBackReason ? { rolledBackReason: row.rolledBackReason } : {}),
    currentlyActive
  };
}

async function writeEvent(input: {
  riotAccountId: string;
  releaseId: string;
  eventType: string;
  fromStatus?: string;
  toStatus?: string;
  actor?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const client = input.tx ?? prisma;
  await client.recommendationEngineReleaseEvent.create({
    data: {
      riotAccountId: input.riotAccountId,
      releaseId: input.releaseId,
      eventType: input.eventType,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actor: input.actor ?? null,
      reason: input.reason ?? null,
      metadataJson: (input.metadata ?? {}) as object
    }
  });
}

async function activePointerFor(riotAccountId: string): Promise<string | null> {
  const pointer = await prisma.recommendationEngineActivePointer.findUnique({ where: { riotAccountId } });
  return pointer?.releaseId ?? null;
}

/**
 * Cria uma release em `DRAFT` a partir de uma candidata já aprovada.
 *
 * Constrói a `EffectiveRecommendationConfiguration` e o
 * `RecommendationReleaseArtifact` inteiros aqui — nenhum dos dois é
 * persistido pela Etapa 25b, que só guarda `CalibrationCandidate`.
 */
export async function createRelease(input: {
  riotAccountId: string;
  candidateId: string;
  releaseVersion: string;
  createdBy: string;
}): Promise<{ ok: true; row: ReleaseRow } | { ok: false; failure: ReleaseFailure }> {
  const candidateRow = await findCandidate(input.riotAccountId, input.candidateId);
  if (!candidateRow) {
    return { ok: false, failure: { code: "CANDIDATE_NOT_FOUND", message: "Configuração candidata não encontrada." } };
  }
  if (candidateRow.status !== MAX_PROMOTION_STATUS || !candidateRow.decision?.experimentId) {
    return {
      ok: false,
      failure: {
        code: "CANDIDATE_NOT_APPROVED",
        message: `A candidata precisa estar em ${MAX_PROMOTION_STATUS}, com um experimento de aprovação registrado.`
      }
    };
  }

  const experimentRow = await findExperiment(input.riotAccountId, candidateRow.decision.experimentId);
  if (!experimentRow || experimentRow.status !== "COMPLETED" || !experimentRow.report) {
    return {
      ok: false,
      failure: {
        code: "EXPERIMENT_NOT_COMPLETED",
        message: "O experimento que aprovou esta candidata precisa estar concluído."
      }
    };
  }

  const releaseId = randomUUID();
  const candidate: CalibrationCandidate = candidateRow.candidate;
  const configuration = buildEffectiveConfigurationFromCandidate({
    candidate,
    version: candidate.candidateVersion,
    source: { type: "RELEASE", releaseId },
    algorithmCompatibility: {
      ...algorithmVersionsOf(),
      aggregation: candidate.baselineAggregationVersion
    },
    computeHash: hashCanonical
  });

  const knownLimitations: string[] = [];
  if (experimentRow.excludedCases > 0) {
    knownLimitations.push(
      `${experimentRow.excludedCases} caso(s) do experimento não puderam ser reexecutados pelo motor e ficaram fora da equivalência.`
    );
  }
  if (experimentRow.totalCases < 20) {
    knownLimitations.push(`Amostra pequena: ${experimentRow.totalCases} caso(s) no experimento.`);
  }

  const experimentEvidence: ReleaseExperimentEvidence = {
    experimentId: experimentRow.id,
    experimentInputHash: experimentRow.inputHash,
    laboratoryVersion: experimentRow.laboratoryVersion,
    filters: experimentRow.filters,
    sampleSize: experimentRow.totalCases,
    exactReplayCases: experimentRow.exactReplayCases,
    excludedCases: experimentRow.excludedCases,
    summary: experimentRow.report as unknown as CalibrationExperimentReport,
    knownLimitations
  };

  const artifact = buildReleaseArtifact({
    releaseVersion: input.releaseVersion,
    candidateId: candidateRow.lineageId,
    candidateRevisionId: candidateRow.id,
    experimentId: experimentRow.id,
    baselineVersion: RECOMMENDATION_ENGINE_VERSION,
    candidateVersion: candidate.candidateVersion,
    configuration,
    experimentEvidence,
    compatibility: {
      releaseArtifactSchemaVersion: RELEASE_ARTIFACT_SCHEMA_VERSION,
      requiredAlgorithmVersions: algorithmVersionsOf(),
      supportedAggregationVersions: SUPPORTED_AGGREGATION_VERSIONS
    },
    createdAt: new Date().toISOString(),
    computeHash: hashCanonical
  });

  const created = await prisma.recommendationEngineRelease.create({
    data: {
      id: releaseId,
      riotAccountId: input.riotAccountId,
      candidateId: candidateRow.lineageId,
      candidateRevisionId: candidateRow.id,
      experimentId: experimentRow.id,
      releaseVersion: input.releaseVersion,
      baselineVersion: artifact.baselineVersion,
      candidateVersion: artifact.candidateVersion,
      artifactSchemaVersion: artifact.artifactSchemaVersion,
      artifactJson: artifact as unknown as Prisma.InputJsonValue,
      artifactHash: artifact.artifactHash,
      configHash: artifact.configHash,
      status: "DRAFT",
      createdBy: input.createdBy
    }
  });

  await writeEvent({
    riotAccountId: input.riotAccountId,
    releaseId,
    eventType: "CREATED",
    toStatus: "DRAFT",
    actor: input.createdBy
  });

  return { ok: true, row: toReleaseRow(created, false) };
}

export async function listReleases(riotAccountId: string): Promise<ReleaseRow[]> {
  const [rows, activeReleaseId] = await Promise.all([
    prisma.recommendationEngineRelease.findMany({
      where: { riotAccountId },
      orderBy: { createdAt: "desc" }
    }),
    activePointerFor(riotAccountId)
  ]);
  return rows.map((row) => toReleaseRow(row, row.id === activeReleaseId));
}

export async function findRelease(riotAccountId: string, releaseId: string): Promise<ReleaseRow | null> {
  const [row, activeReleaseId] = await Promise.all([
    prisma.recommendationEngineRelease.findFirst({ where: { id: releaseId, riotAccountId } }),
    activePointerFor(riotAccountId)
  ]);
  return row ? toReleaseRow(row, row.id === activeReleaseId) : null;
}

/**
 * Casos do experimento com bundle histórico disponível, no formato que a
 * equivalência laboratório×motor (Etapa 27a) exige. Só entram casos com
 * `replayStatus: "EXACT_REPLAY"` (únicos com `candidate` preenchido) e cujo
 * snapshot tem `ReplayInputBundleRecord` — a mesma dupla condição que
 * `evaluateLaboratoryEquivalence` já verifica sozinha, filtrada aqui só pra
 * não carregar bundle de caso que nunca vai ser comparável.
 */
async function loadLaboratoryCases(experimentId: string): Promise<LaboratoryEquivalenceCase[]> {
  const cases = await prisma.calibrationExperimentCase.findMany({
    where: { experimentId, replayStatus: "EXACT_REPLAY" },
    select: { snapshotId: true, comparisonJson: true }
  });
  if (cases.length === 0) return [];

  const bundles = await prisma.replayInputBundleRecord.findMany({
    where: { snapshotId: { in: cases.map((entry) => entry.snapshotId) } },
    select: { snapshotId: true, contentJson: true }
  });
  const bundleBySnapshot = new Map(bundles.map((entry) => [entry.snapshotId, entry.contentJson]));

  const result: LaboratoryEquivalenceCase[] = [];
  for (const entry of cases) {
    const bundle = bundleBySnapshot.get(entry.snapshotId);
    if (!bundle) continue;
    const comparison = entry.comparisonJson as { candidate: unknown };
    if (!comparison.candidate) continue;
    result.push({
      snapshotId: entry.snapshotId,
      bundle: bundle as unknown as ReplayInputBundle,
      laboratoryCandidateRanking: comparison.candidate as LaboratoryEquivalenceCase["laboratoryCandidateRanking"]
    });
  }
  return result;
}

/**
 * Valida o artefato pré-ativação. Recalcula hashes, confirma estado da
 * candidata e do experimento, e roda a equivalência laboratório×motor com
 * bundles reais — exatamente o que `validateReleaseArtifact` (Etapa 27a)
 * exige, com tudo carregado aqui.
 */
export async function validateRelease(input: {
  riotAccountId: string;
  releaseId: string;
  actor: string;
}): Promise<{ ok: true; row: ReleaseRow } | { ok: false; failure: ReleaseFailure }> {
  const releaseRecord = await prisma.recommendationEngineRelease.findFirst({
    where: { id: input.releaseId, riotAccountId: input.riotAccountId }
  });
  if (!releaseRecord) {
    return { ok: false, failure: { code: "RELEASE_NOT_FOUND", message: "Release não encontrada." } };
  }
  const from = releaseRecord.status as ReleaseLifecycleStatus;
  if (!canTransitionReleaseLifecycle(from, "VALIDATING")) {
    return {
      ok: false,
      failure: {
        code: "INVALID_TRANSITION",
        message: `Não é possível validar uma release em ${from}.`
      }
    };
  }

  await prisma.recommendationEngineRelease.update({
    where: { id: releaseRecord.id },
    data: { status: "VALIDATING" }
  });
  await writeEvent({
    riotAccountId: input.riotAccountId,
    releaseId: releaseRecord.id,
    eventType: "VALIDATION_STARTED",
    fromStatus: from,
    toStatus: "VALIDATING",
    actor: input.actor
  });

  const candidateRevision = await prisma.calibrationCandidateConfig.findFirst({
    where: { id: releaseRecord.candidateRevisionId, riotAccountId: input.riotAccountId }
  });
  const experimentRow = await findExperiment(input.riotAccountId, releaseRecord.experimentId);
  const laboratoryCases = await loadLaboratoryCases(releaseRecord.experimentId);

  const artifact = releaseRecord.artifactJson as unknown as RecommendationReleaseArtifact;
  const result: ReleaseValidationResult = !candidateRevision
    ? {
        status: "INVALID_CANDIDATE_STATE",
        reason: "A revisão exata da candidata referenciada pelo artefato não existe mais."
      }
    : validateReleaseArtifact({
        artifact,
        // O `status` dentro de `configJson` é o valor do instante da CRIAÇÃO da
        // revisão (a Etapa 25b só aceita DRAFT/READY ali) e nunca é reescrito —
        // `decideCandidate` grava a decisão na COLUNA `status`. A coluna é a
        // fonte autoritativa do ciclo de vida; ler o JSON aqui reprovaria toda
        // candidata aprovada com `INVALID_CANDIDATE_STATE` (encontrado na
        // validação real contra o Postgres, não por teste sintético).
        candidate: {
          ...(candidateRevision.configJson as unknown as CalibrationCandidate),
          status: candidateRevision.status as CalibrationCandidate["status"]
        },
        experimentStatus: experimentRow?.status ?? "FAILED",
        laboratoryCases,
        computeHash: hashCanonical
      });

  const nextStatus: ReleaseLifecycleStatus = result.status === "VALID" ? "READY_FOR_ACTIVATION" : "VALIDATION_FAILED";
  const transition = transitionReleaseLifecycle({ from: "VALIDATING", to: nextStatus, validation: result });
  // As duas transicoes de VALIDATING sao sempre estruturalmente permitidas
  // (ver ALLOWED_TRANSITIONS); a unica guarda e VALIDATION_NOT_PASSED pra
  // READY_FOR_ACTIVATION, que so dispara se `result.status !== "VALID"` — e
  // nesse caso `nextStatus` já é VALIDATION_FAILED. `transition.ok` é sempre
  // `true` aqui; a checagem abaixo é defensiva, não um caminho esperado.
  const finalStatus = transition.ok ? transition.status : "VALIDATION_FAILED";

  const updated = await prisma.recommendationEngineRelease.update({
    where: { id: releaseRecord.id },
    data: {
      status: finalStatus,
      validationJson: result as unknown as Prisma.InputJsonValue,
      validatedArtifactHash: releaseRecord.artifactHash,
      validatedAt: new Date()
    }
  });

  await writeEvent({
    riotAccountId: input.riotAccountId,
    releaseId: releaseRecord.id,
    eventType: finalStatus === "READY_FOR_ACTIVATION" ? "VALIDATION_COMPLETED" : "VALIDATION_FAILED",
    fromStatus: "VALIDATING",
    toStatus: finalStatus,
    actor: input.actor,
    reason: result.reason,
    metadata: { validationStatus: result.status }
  });

  const activeReleaseId = await activePointerFor(input.riotAccountId);
  return { ok: true, row: toReleaseRow(updated, updated.id === activeReleaseId) };
}

/**
 * Ativa uma release já `READY_FOR_ACTIVATION`. Não aceita peso nenhum —
 * só `releaseId`. Revalida o artefato de novo antes de comprometer, e roda
 * tudo numa transação serializável: a reivindicação (`updateMany` condicional
 * no status) é o mesmo padrão atômico que `calibration-repository.ts` já usa
 * pra `PENDING -> RUNNING`, e garante que só uma de duas ativações
 * concorrentes vence.
 */
export async function activateRelease(input: {
  riotAccountId: string;
  releaseId: string;
  actor: string;
  reason?: string;
}): Promise<{ ok: true; row: ReleaseRow } | { ok: false; failure: ReleaseFailure }> {
  const releaseRecord = await prisma.recommendationEngineRelease.findFirst({
    where: { id: input.releaseId, riotAccountId: input.riotAccountId }
  });
  if (!releaseRecord) {
    return { ok: false, failure: { code: "RELEASE_NOT_FOUND", message: "Release não encontrada." } };
  }
  if (releaseRecord.status !== "READY_FOR_ACTIVATION") {
    return {
      ok: false,
      failure: {
        code: "INVALID_TRANSITION",
        message: `Só uma release em READY_FOR_ACTIVATION pode ser ativada; esta está em ${releaseRecord.status}.`
      }
    };
  }

  // Revalida a integridade sem recanonicalizar aqui: o artefato persistido
  // já é imutável desde READY_FOR_ACTIVATION, então a checagem que importa é
  // que ele não mudou desde a validação — comparação de hash, não recálculo
  // de canonicalização duplicada (isso já rodou dentro de `validateRelease`).
  if (releaseRecord.validatedArtifactHash !== releaseRecord.artifactHash) {
    return {
      ok: false,
      failure: {
        code: "ARTIFACT_CHANGED",
        message: "O artefato mudou desde a última validação; valide novamente antes de ativar."
      }
    };
  }

  try {
    const activated = await prisma.$transaction(
      async (tx) => {
        const pointer = await tx.recommendationEngineActivePointer.findUnique({
          where: { riotAccountId: input.riotAccountId }
        });
        const previousReleaseId = pointer?.releaseId ?? null;

        const claimed = await tx.recommendationEngineRelease.updateMany({
          where: { id: input.releaseId, riotAccountId: input.riotAccountId, status: "READY_FOR_ACTIVATION" },
          data: {
            status: "ACTIVE",
            activatedBy: input.actor,
            activatedAt: new Date(),
            previousReleaseId
          }
        });
        if (claimed.count === 0) {
          throw new ConcurrentConflictError();
        }

        await tx.recommendationEngineActivePointer.upsert({
          where: { riotAccountId: input.riotAccountId },
          create: { riotAccountId: input.riotAccountId, releaseId: input.releaseId, updatedBy: input.actor },
          update: { releaseId: input.releaseId, updatedBy: input.actor }
        });

        await writeEvent({
          riotAccountId: input.riotAccountId,
          releaseId: input.releaseId,
          eventType: "ACTIVATED",
          fromStatus: "READY_FOR_ACTIVATION",
          toStatus: "ACTIVE",
          actor: input.actor,
          ...(input.reason ? { reason: input.reason } : {}),
          metadata: { previousReleaseId },
          tx
        });

        return tx.recommendationEngineRelease.findFirstOrThrow({ where: { id: input.releaseId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return { ok: true, row: toReleaseRow(activated, true) };
  } catch (error) {
    if (error instanceof ConcurrentConflictError || isSerializationFailure(error)) {
      return {
        ok: false,
        failure: { code: "CONCURRENT_CONFLICT", message: "Outra ativação já venceu a corrida; recarregue e tente de novo." }
      };
    }
    throw error;
  }
}

/**
 * Reverte a release atualmente ativa. Só aceita a release que É a apontada
 * agora (não qualquer release cujo `status` histórico seja `ACTIVE` — uma
 * release superada por outra continua com esse status, ver comentário no
 * schema). Restaura o ponteiro pra `previousReleaseId` sem reconstruir nada:
 * o artefato anterior já está integralmente persistido e imutável.
 */
export async function rollbackRelease(input: {
  riotAccountId: string;
  releaseId: string;
  actor: string;
  reason?: string;
}): Promise<{ ok: true; row: ReleaseRow } | { ok: false; failure: ReleaseFailure }> {
  const releaseRecord = await prisma.recommendationEngineRelease.findFirst({
    where: { id: input.releaseId, riotAccountId: input.riotAccountId }
  });
  if (!releaseRecord) {
    return { ok: false, failure: { code: "RELEASE_NOT_FOUND", message: "Release não encontrada." } };
  }
  if (releaseRecord.status !== "ACTIVE") {
    return {
      ok: false,
      failure: {
        code: "INVALID_TRANSITION",
        message: `Só uma release ACTIVE pode ser revertida; esta está em ${releaseRecord.status}.`
      }
    };
  }

  try {
    const rolledBack = await prisma.$transaction(
      async (tx) => {
        const pointer = await tx.recommendationEngineActivePointer.findUnique({
          where: { riotAccountId: input.riotAccountId }
        });
        if (!pointer || pointer.releaseId !== input.releaseId) {
          throw new NotCurrentlyActiveError();
        }

        const claimed = await tx.recommendationEngineRelease.updateMany({
          where: { id: input.releaseId, riotAccountId: input.riotAccountId, status: "ACTIVE" },
          data: {
            status: "ROLLED_BACK",
            rolledBackBy: input.actor,
            rolledBackAt: new Date(),
            rolledBackReason: input.reason ?? null
          }
        });
        if (claimed.count === 0) {
          throw new ConcurrentConflictError();
        }

        const target = releaseRecord.previousReleaseId;
        if (target) {
          await tx.recommendationEngineActivePointer.update({
            where: { riotAccountId: input.riotAccountId },
            data: { releaseId: target, updatedBy: input.actor }
          });
        } else {
          await tx.recommendationEngineActivePointer.delete({ where: { riotAccountId: input.riotAccountId } });
        }

        await writeEvent({
          riotAccountId: input.riotAccountId,
          releaseId: input.releaseId,
          eventType: "ROLLED_BACK",
          fromStatus: "ACTIVE",
          toStatus: "ROLLED_BACK",
          actor: input.actor,
          ...(input.reason ? { reason: input.reason } : {}),
          metadata: { restoredReleaseId: target ?? null },
          tx
        });

        return tx.recommendationEngineRelease.findFirstOrThrow({ where: { id: input.releaseId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return { ok: true, row: toReleaseRow(rolledBack, false) };
  } catch (error) {
    if (error instanceof NotCurrentlyActiveError) {
      return {
        ok: false,
        failure: {
          code: "NOT_CURRENTLY_ACTIVE",
          message: "Esta release não é a atualmente ativa; só a release corrente pode ser revertida."
        }
      };
    }
    if (error instanceof ConcurrentConflictError || isSerializationFailure(error)) {
      return {
        ok: false,
        failure: { code: "CONCURRENT_CONFLICT", message: "Conflito de concorrência; recarregue e tente de novo." }
      };
    }
    throw error;
  }
}

/**
 * Release ativa da conta, pronta pra o provider consumir. `null` = nenhuma
 * release ativa, o que resolve pra baseline (Etapa 27a). Usada exclusivamente
 * por `active-configuration-provider.ts` e pela rota de leitura pública
 * `GET /recommendation-engine/active-release`.
 */
export async function findActiveReleaseForAccount(riotAccountId: string): Promise<ReleaseRow | null> {
  const pointer = await prisma.recommendationEngineActivePointer.findUnique({ where: { riotAccountId } });
  if (!pointer) return null;
  const row = await prisma.recommendationEngineRelease.findFirst({
    where: { id: pointer.releaseId, riotAccountId }
  });
  return row ? toReleaseRow(row, true) : null;
}

export async function listReleaseEvents(riotAccountId: string, releaseId: string) {
  return prisma.recommendationEngineReleaseEvent.findMany({
    where: { riotAccountId, releaseId },
    orderBy: { createdAt: "asc" }
  });
}

class ConcurrentConflictError extends Error {}
class NotCurrentlyActiveError extends Error {}

/** Postgres `40001` (serialization_failure) reportado pelo Prisma como P2034. */
function isSerializationFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "40001")
  );
}
