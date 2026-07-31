import { createHash, randomUUID } from "node:crypto";
import {
  CALIBRATION_LAB_VERSION,
  canonicalCandidateString,
  canonicalExperimentInputString,
  replaySnapshotCase,
  summarizeCalibrationExperiment,
  validateCalibrationCandidate,
  type CalibrationCandidate,
  type CalibrationCandidateStatus,
  type CalibrationCaseComparison,
  type CalibrationExperimentFilters,
  type PreMatchReviewReference,
  type ReplayCaseInput
} from "@sparta/core";
import type { PersistedRecommendation } from "@sparta/core";
import type { Role } from "@sparta/core";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

/**
 * Persistencia e execucao do laboratorio offline de calibracao (Etapa 25b).
 *
 * ## O que este modulo NAO faz
 *
 * Nao le nem escreve nenhuma configuracao do motor operacional. Nao consulta
 * estatistica pessoal atual, catalogo atual, resultado da partida, timeline nem
 * revisao pos-resultado. A unica fonte da execucao sao os snapshots historicos
 * ja congelados, filtrados pela conta do proprio usuario.
 *
 * O hash mora aqui, e nao no dominio, porque `packages/core` tambem roda no
 * renderer e nao pode depender de `node:crypto`.
 */

export function hashCandidate(candidate: CalibrationCandidate): string {
  return createHash("sha256").update(canonicalCandidateString(candidate)).digest("hex");
}

export function hashExperimentInput(input: {
  candidate: CalibrationCandidate;
  snapshotIds: readonly string[];
  filters?: CalibrationExperimentFilters;
  algorithmVersions?: Record<string, string>;
}): string {
  return createHash("sha256").update(canonicalExperimentInputString(input)).digest("hex");
}

export type CalibrationFailureCode =
  | "CANDIDATE_NOT_FOUND"
  | "CANDIDATE_INVALID"
  | "CANDIDATE_NOT_READY"
  | "CANDIDATE_SUPERSEDED"
  | "EXPERIMENT_NOT_FOUND"
  | "EXPERIMENT_IMMUTABLE"
  | "EXPERIMENT_ALREADY_RUNNING"
  | "NO_SNAPSHOTS"
  | "DECISION_REQUIRES_COMPLETED_EXPERIMENT";

export interface CalibrationFailure {
  code: CalibrationFailureCode;
  message: string;
  details?: unknown;
}

export interface CandidateRow {
  id: string;
  lineageId: string;
  revision: number;
  name: string;
  description?: string;
  status: CalibrationCandidateStatus;
  configHash: string;
  laboratoryVersion: string;
  candidate: CalibrationCandidate;
  createdAt: string;
  supersededAt?: string;
  decision?: {
    by: string;
    at: string;
    note?: string;
    experimentId?: string;
  };
}

function toCandidateRow(row: {
  id: string;
  lineageId: string;
  revision: number;
  name: string;
  description: string | null;
  status: string;
  configHash: string;
  laboratoryVersion: string;
  configJson: unknown;
  createdAt: Date;
  supersededAt: Date | null;
  decisionBy: string | null;
  decisionAt: Date | null;
  decisionNote: string | null;
  decisionExperimentId: string | null;
}): CandidateRow {
  return {
    id: row.id,
    lineageId: row.lineageId,
    revision: row.revision,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    status: row.status as CalibrationCandidateStatus,
    configHash: row.configHash,
    laboratoryVersion: row.laboratoryVersion,
    candidate: row.configJson as CalibrationCandidate,
    createdAt: row.createdAt.toISOString(),
    ...(row.supersededAt ? { supersededAt: row.supersededAt.toISOString() } : {}),
    ...(row.decisionBy && row.decisionAt
      ? {
          decision: {
            by: row.decisionBy,
            at: row.decisionAt.toISOString(),
            ...(row.decisionNote ? { note: row.decisionNote } : {}),
            ...(row.decisionExperimentId ? { experimentId: row.decisionExperimentId } : {})
          }
        }
      : {})
  };
}

/**
 * Cria a primeira revisao de uma configuracao.
 *
 * Configuracao invalida **nunca** e persistida como `READY`: a validacao do
 * dominio roda antes da escrita e a rejeicao estruturada volta para o chamador.
 */
export async function createCandidate(input: {
  riotAccountId: string;
  candidate: CalibrationCandidate;
}): Promise<{ ok: true; row: CandidateRow } | { ok: false; failure: CalibrationFailure }> {
  const validation = validateCalibrationCandidate(input.candidate);
  if (!validation.valid) {
    return {
      ok: false,
      failure: {
        code: "CANDIDATE_INVALID",
        message: "A configuração candidata tem parâmetros não reproduzíveis ou inválidos.",
        details: validation.rejections
      }
    };
  }

  const lineageId = randomUUID();
  const created = await prisma.calibrationCandidateConfig.create({
    data: {
      riotAccountId: input.riotAccountId,
      lineageId,
      revision: 1,
      name: input.candidate.name,
      description: input.candidate.description ?? null,
      baselineAggregationVersion: input.candidate.baselineAggregationVersion,
      candidateVersion: input.candidate.candidateVersion,
      configJson: { ...input.candidate, id: lineageId } as object,
      configHash: hashCandidate(input.candidate),
      status: input.candidate.status === "DRAFT" ? "DRAFT" : "READY",
      laboratoryVersion: CALIBRATION_LAB_VERSION
    }
  });

  return { ok: true, row: toCandidateRow(created) };
}

/**
 * Cria uma revisao nova preservando a anterior.
 *
 * Alteracao **funcional** e o que cria revisao: o `configHash` ignora nome e
 * descricao, entao renomear devolve a revisao atual sem duplicar historico.
 */
export async function createCandidateRevision(input: {
  riotAccountId: string;
  candidateId: string;
  candidate: CalibrationCandidate;
}): Promise<{ ok: true; row: CandidateRow } | { ok: false; failure: CalibrationFailure }> {
  const current = await prisma.calibrationCandidateConfig.findFirst({
    where: { id: input.candidateId, riotAccountId: input.riotAccountId }
  });
  if (!current) {
    return {
      ok: false,
      failure: { code: "CANDIDATE_NOT_FOUND", message: "Configuração não encontrada." }
    };
  }

  const validation = validateCalibrationCandidate(input.candidate);
  if (!validation.valid) {
    return {
      ok: false,
      failure: {
        code: "CANDIDATE_INVALID",
        message: "A configuração candidata tem parâmetros não reproduzíveis ou inválidos.",
        details: validation.rejections
      }
    };
  }

  const configHash = hashCandidate(input.candidate);
  if (configHash === current.configHash) {
    // Nada funcional mudou: atualizar rotulos nao cria revisao nem invalida
    // experimentos ja executados contra este hash.
    const renamed = await prisma.calibrationCandidateConfig.update({
      where: { id: current.id },
      data: {
        name: input.candidate.name,
        description: input.candidate.description ?? null
      }
    });
    return { ok: true, row: toCandidateRow(renamed) };
  }

  const latest = await prisma.calibrationCandidateConfig.findFirst({
    where: { lineageId: current.lineageId },
    orderBy: { revision: "desc" }
  });

  const created = await prisma.$transaction(async (tx) => {
    await tx.calibrationCandidateConfig.updateMany({
      where: { lineageId: current.lineageId, supersededAt: null },
      data: { supersededAt: new Date() }
    });
    return tx.calibrationCandidateConfig.create({
      data: {
        riotAccountId: input.riotAccountId,
        lineageId: current.lineageId,
        revision: (latest?.revision ?? current.revision) + 1,
        name: input.candidate.name,
        description: input.candidate.description ?? null,
        baselineAggregationVersion: input.candidate.baselineAggregationVersion,
        candidateVersion: input.candidate.candidateVersion,
        configJson: { ...input.candidate, id: current.lineageId } as object,
        configHash,
        status: input.candidate.status === "DRAFT" ? "DRAFT" : "READY",
        laboratoryVersion: CALIBRATION_LAB_VERSION
      }
    });
  });

  return { ok: true, row: toCandidateRow(created) };
}

export async function listCandidates(riotAccountId: string): Promise<CandidateRow[]> {
  const rows = await prisma.calibrationCandidateConfig.findMany({
    where: { riotAccountId },
    orderBy: [{ createdAt: "desc" }, { revision: "desc" }]
  });
  return rows.map(toCandidateRow);
}

export async function findCandidate(
  riotAccountId: string,
  candidateId: string
): Promise<CandidateRow | null> {
  const row = await prisma.calibrationCandidateConfig.findFirst({
    where: { id: candidateId, riotAccountId }
  });
  return row ? toCandidateRow(row) : null;
}

export interface ExperimentRow {
  id: string;
  candidateId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  filters: CalibrationExperimentFilters;
  inputHash: string;
  laboratoryVersion: string;
  totalCases: number;
  exactReplayCases: number;
  integrityFailedCases: number;
  unsupportedCases: number;
  missingInputCases: number;
  excludedCases: number;
  report?: unknown;
  failureReason?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

function toExperimentRow(row: {
  id: string;
  candidateId: string;
  status: string;
  filtersJson: unknown;
  inputHash: string;
  laboratoryVersion: string;
  totalCases: number;
  exactReplayCases: number;
  integrityFailedCases: number;
  unsupportedCases: number;
  missingInputCases: number;
  excludedCases: number;
  reportJson: unknown;
  failureReason: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}): ExperimentRow {
  return {
    id: row.id,
    candidateId: row.candidateId,
    status: row.status as ExperimentRow["status"],
    filters: (row.filtersJson ?? {}) as CalibrationExperimentFilters,
    inputHash: row.inputHash,
    laboratoryVersion: row.laboratoryVersion,
    totalCases: row.totalCases,
    exactReplayCases: row.exactReplayCases,
    integrityFailedCases: row.integrityFailedCases,
    unsupportedCases: row.unsupportedCases,
    missingInputCases: row.missingInputCases,
    excludedCases: row.excludedCases,
    ...(row.reportJson ? { report: row.reportJson } : {}),
    ...(row.failureReason ? { failureReason: row.failureReason } : {}),
    createdAt: row.createdAt.toISOString(),
    ...(row.startedAt ? { startedAt: row.startedAt.toISOString() } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {})
  };
}

/**
 * Carrega os casos historicos autorizados.
 *
 * Somente snapshots **nao substituidos** de sessoes da propria conta: eles sao
 * a analise que valia quando a sessao terminou. Incluir os ticks intermediarios
 * contaria a mesma decisao varias vezes.
 *
 * A revisao humana entra apenas na fase **pre-resultado** e somente quando ja
 * foi submetida — a query nem seleciona as colunas pos-resultado.
 */
async function loadAuthorizedCases(input: {
  riotAccountId: string;
  filters: CalibrationExperimentFilters;
}): Promise<ReplayCaseInput[]> {
  const { filters } = input;
  const snapshots = await prisma.recommendationSnapshot.findMany({
    where: {
      supersededAt: null,
      draftSession: {
        riotAccountId: input.riotAccountId,
        ...(filters.roles?.length ? { role: { in: [...filters.roles] } } : {}),
        ...(filters.patches?.length ? { patch: { in: [...filters.patches] } } : {})
      },
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {})
            }
          }
        : {})
    },
    include: {
      draftSession: true,
      recommendations: { orderBy: { rank: "asc" } }
    },
    orderBy: { createdAt: "asc" }
  });

  const sessionIds = snapshots.map((snapshot) => snapshot.draftSessionId);
  const reviews = sessionIds.length
    ? await prisma.draftReview.findMany({
        where: {
          draftSessionId: { in: sessionIds },
          riotAccountId: input.riotAccountId,
          supersededAt: null,
          preMatchJson: { not: Prisma.DbNull }
        },
        select: {
          id: true,
          draftSessionId: true,
          preMatchJson: true,
          issueTags: true
        }
      })
    : [];
  const reviewBySession = new Map(reviews.map((review) => [review.draftSessionId, review]));

  const cases: ReplayCaseInput[] = [];
  for (const snapshot of snapshots) {
    const versions = (snapshot.algorithmVersionsJson ?? {}) as Record<string, string>;
    const aggregationVersion = versions.recommendationEngine ?? "desconhecida";
    const canonical = (snapshot.canonicalInputJson ?? {}) as { pool?: unknown[] };
    const review = reviewBySession.get(snapshot.draftSessionId);
    const preMatch = (review?.preMatchJson ?? {}) as { overallRating?: string };

    const queue = snapshot.draftSession.queueId;
    if (filters.queues?.length && !filters.queues.includes(String(queue ?? ""))) continue;
    const poolSize = Array.isArray(canonical.pool) ? canonical.pool.length : undefined;
    if (
      typeof filters.minimumPoolSize === "number" &&
      (poolSize ?? 0) < filters.minimumPoolSize
    ) {
      continue;
    }
    if (
      typeof filters.minimumBaselineCoverage === "number" &&
      snapshot.dataCoverage < filters.minimumBaselineCoverage
    ) {
      continue;
    }
    if (
      filters.engineVersions?.length &&
      !filters.engineVersions.includes(aggregationVersion)
    ) {
      continue;
    }

    const reviewReference: PreMatchReviewReference | undefined =
      review && typeof preMatch.overallRating === "string"
        ? {
            reviewId: review.id,
            overallRating: preMatch.overallRating as PreMatchReviewReference["overallRating"],
            issueTags: [...review.issueTags]
          }
        : undefined;

    if (filters.preMatchRatings?.length) {
      if (!reviewReference || !filters.preMatchRatings.includes(reviewReference.overallRating)) {
        continue;
      }
    }
    if (filters.issueTags?.length) {
      if (!reviewReference?.issueTags.some((tag) => filters.issueTags?.includes(tag))) continue;
    }

    cases.push({
      draftSessionId: snapshot.draftSessionId,
      snapshotId: snapshot.id,
      role: snapshot.draftSession.role as Role,
      ...(snapshot.draftSession.patch ? { patch: snapshot.draftSession.patch } : {}),
      ...(queue !== null && queue !== undefined ? { queue: String(queue) } : {}),
      capturedAt: snapshot.createdAt.toISOString(),
      ...(poolSize !== undefined ? { poolSize } : {}),
      aggregationVersion,
      algorithmVersions: versions,
      recommendations: snapshot.recommendations.map(
        (recommendation) => recommendation.detailJson as unknown as PersistedRecommendation
      ),
      ...(snapshot.draftSession.selectedChampionId !== null
        ? { selectedChampionId: snapshot.draftSession.selectedChampionId }
        : {}),
      ...(reviewReference ? { preMatchReview: reviewReference } : {})
    });
  }

  return cases;
}

export interface CreateExperimentResult {
  experiment: ExperimentRow;
  /** `true` quando o mesmo input funcional ja tinha um experimento. */
  reused: boolean;
}

/**
 * Cria (ou reaproveita) um experimento e o executa em seguida.
 *
 * Exclusao mutua sem lock aplicativo: a transicao `PENDING → RUNNING` e um
 * `updateMany` condicional, atomico no Postgres. Duas chamadas simultaneas
 * produzem uma reivindicacao e uma recusa.
 */
export async function createAndRunExperiment(input: {
  riotAccountId: string;
  candidateId: string;
  filters: CalibrationExperimentFilters;
}): Promise<{ ok: true; result: CreateExperimentResult } | { ok: false; failure: CalibrationFailure }> {
  const candidateRow = await findCandidate(input.riotAccountId, input.candidateId);
  if (!candidateRow) {
    return {
      ok: false,
      failure: { code: "CANDIDATE_NOT_FOUND", message: "Configuração não encontrada." }
    };
  }
  if (candidateRow.supersededAt) {
    return {
      ok: false,
      failure: {
        code: "CANDIDATE_SUPERSEDED",
        message: "Esta revisão foi substituída; execute a revisão atual."
      }
    };
  }

  const validation = validateCalibrationCandidate(candidateRow.candidate);
  if (!validation.valid) {
    return {
      ok: false,
      failure: {
        code: "CANDIDATE_INVALID",
        message: "A configuração candidata não é reproduzível; o experimento não foi iniciado.",
        details: validation.rejections
      }
    };
  }

  const cases = await loadAuthorizedCases({
    riotAccountId: input.riotAccountId,
    filters: input.filters
  });
  if (cases.length === 0) {
    return {
      ok: false,
      failure: {
        code: "NO_SNAPSHOTS",
        message: "Nenhum snapshot histórico atende aos filtros informados."
      }
    };
  }

  const snapshotIds = cases.map((entry) => entry.snapshotId);
  const inputHash = hashExperimentInput({
    candidate: candidateRow.candidate,
    snapshotIds,
    filters: input.filters,
    algorithmVersions: { calibrationLab: CALIBRATION_LAB_VERSION }
  });

  const existing = await prisma.calibrationExperiment.findUnique({
    where: { riotAccountId_inputHash: { riotAccountId: input.riotAccountId, inputHash } }
  });
  if (existing && existing.status === "COMPLETED") {
    return { ok: true, result: { experiment: toExperimentRow(existing), reused: true } };
  }
  if (existing && existing.status === "RUNNING") {
    return {
      ok: false,
      failure: {
        code: "EXPERIMENT_ALREADY_RUNNING",
        message: "Este experimento já está em execução."
      }
    };
  }

  const experiment =
    existing ??
    (await prisma.calibrationExperiment.create({
      data: {
        riotAccountId: input.riotAccountId,
        candidateId: candidateRow.id,
        status: "PENDING",
        filtersJson: input.filters as object,
        inputHash,
        laboratoryVersion: CALIBRATION_LAB_VERSION,
        snapshotIdsJson: snapshotIds as object
      }
    }));

  // Reivindicacao atomica: so quem transiciona PENDING/FAILED -> RUNNING executa.
  const claimed = await prisma.calibrationExperiment.updateMany({
    where: { id: experiment.id, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "RUNNING", startedAt: new Date(), failureReason: null }
  });
  if (claimed.count === 0) {
    return {
      ok: false,
      failure: {
        code: "EXPERIMENT_ALREADY_RUNNING",
        message: "Este experimento já está em execução."
      }
    };
  }

  try {
    const comparisons = cases.map((caseInput) => ({
      caseInput,
      comparison: replaySnapshotCase({ caseInput, candidate: candidateRow.candidate })
    }));
    const report = summarizeCalibrationExperiment({
      candidate: candidateRow.candidate,
      cases: comparisons
    });

    const counts = comparisons.reduce(
      (totals, { comparison }) => {
        if (comparison.replayStatus === "EXACT_REPLAY") totals.exact += 1;
        if (comparison.replayStatus === "REPLAY_INTEGRITY_FAILED") totals.integrity += 1;
        if (comparison.replayStatus === "REPLAY_UNSUPPORTED_VERSION") totals.unsupported += 1;
        if (comparison.replayStatus === "REPLAY_MISSING_HISTORICAL_INPUT") totals.missing += 1;
        return totals;
      },
      { exact: 0, integrity: 0, unsupported: 0, missing: 0 }
    );

    const completed = await prisma.$transaction(async (tx) => {
      // Reexecucao apos falha nao pode somar aos casos da tentativa anterior.
      await tx.calibrationExperimentCase.deleteMany({ where: { experimentId: experiment.id } });
      await tx.calibrationExperimentCase.createMany({
        data: comparisons.map(({ comparison }) => ({
          experimentId: experiment.id,
          draftSessionId: comparison.draftSessionId,
          snapshotId: comparison.snapshotId,
          replayStatus: comparison.replayStatus,
          role: comparison.role,
          patch: comparison.patch ?? null,
          comparisonJson: comparison as unknown as object
        }))
      });
      return tx.calibrationExperiment.update({
        where: { id: experiment.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          totalCases: comparisons.length,
          exactReplayCases: counts.exact,
          integrityFailedCases: counts.integrity,
          unsupportedCases: counts.unsupported,
          missingInputCases: counts.missing,
          excludedCases: comparisons.length - counts.exact,
          reportJson: report as unknown as object
        }
      });
    });

    await prisma.calibrationCandidateConfig.updateMany({
      where: { id: candidateRow.id, status: { in: ["DRAFT", "READY"] } },
      data: { status: "EVALUATED" }
    });

    return { ok: true, result: { experiment: toExperimentRow(completed), reused: false } };
  } catch (error) {
    // Falha nao deixa resultado parcial consultavel: os casos da tentativa sao
    // removidos e o experimento fica FAILED, sem relatorio.
    await prisma.calibrationExperimentCase.deleteMany({ where: { experimentId: experiment.id } });
    await prisma.calibrationExperiment.update({
      where: { id: experiment.id },
      data: {
        status: "FAILED",
        completedAt: null,
        reportJson: undefined,
        totalCases: 0,
        exactReplayCases: 0,
        integrityFailedCases: 0,
        unsupportedCases: 0,
        missingInputCases: 0,
        excludedCases: 0,
        failureReason: sanitizeFailure(error)
      }
    });
    return {
      ok: false,
      failure: {
        code: "EXPERIMENT_NOT_FOUND",
        message: "A execução falhou; nenhum resultado parcial foi preservado."
      }
    };
  }
}

/** Mensagem curta e sem stack, credencial ou payload. */
function sanitizeFailure(error: unknown): string {
  if (error instanceof Error && error.name) return `Falha na execução (${error.name}).`;
  return "Falha na execução do experimento.";
}

export async function listExperiments(
  riotAccountId: string,
  candidateId?: string
): Promise<ExperimentRow[]> {
  const rows = await prisma.calibrationExperiment.findMany({
    where: { riotAccountId, ...(candidateId ? { candidateId } : {}) },
    orderBy: { createdAt: "desc" }
  });
  return rows.map(toExperimentRow);
}

export async function findExperiment(
  riotAccountId: string,
  experimentId: string
): Promise<ExperimentRow | null> {
  const row = await prisma.calibrationExperiment.findFirst({
    where: { id: experimentId, riotAccountId }
  });
  return row ? toExperimentRow(row) : null;
}

export interface ExperimentCasePage {
  total: number;
  limit: number;
  offset: number;
  cases: CalibrationCaseComparison[];
}

export async function listExperimentCases(input: {
  riotAccountId: string;
  experimentId: string;
  limit: number;
  offset: number;
  replayStatus?: string;
}): Promise<ExperimentCasePage | null> {
  const experiment = await prisma.calibrationExperiment.findFirst({
    where: { id: input.experimentId, riotAccountId: input.riotAccountId },
    select: { id: true }
  });
  if (!experiment) return null;

  const where = {
    experimentId: experiment.id,
    ...(input.replayStatus ? { replayStatus: input.replayStatus } : {})
  };
  const [total, rows] = await Promise.all([
    prisma.calibrationExperimentCase.count({ where }),
    prisma.calibrationExperimentCase.findMany({
      where,
      orderBy: [{ replayStatus: "asc" }, { snapshotId: "asc" }],
      skip: input.offset,
      take: input.limit
    })
  ]);

  return {
    total,
    limit: input.limit,
    offset: input.offset,
    cases: rows.map((row) => row.comparisonJson as unknown as CalibrationCaseComparison)
  };
}

/**
 * Registra a decisao humana.
 *
 * `APPROVED_FOR_FUTURE_RELEASE` exige um experimento **concluido** da propria
 * conta. A escrita e apenas documental: nenhum peso operacional muda, e o motor
 * nao le esta tabela.
 */
export async function decideCandidate(input: {
  riotAccountId: string;
  candidateId: string;
  decision: "REJECTED" | "APPROVED_FOR_FUTURE_RELEASE";
  decidedBy: string;
  experimentId?: string;
  note?: string;
}): Promise<{ ok: true; row: CandidateRow } | { ok: false; failure: CalibrationFailure }> {
  const candidateRow = await findCandidate(input.riotAccountId, input.candidateId);
  if (!candidateRow) {
    return {
      ok: false,
      failure: { code: "CANDIDATE_NOT_FOUND", message: "Configuração não encontrada." }
    };
  }

  if (input.decision === "APPROVED_FOR_FUTURE_RELEASE") {
    if (!input.experimentId) {
      return {
        ok: false,
        failure: {
          code: "DECISION_REQUIRES_COMPLETED_EXPERIMENT",
          message: "Aprovar exige indicar o experimento concluído que fundamenta a decisão."
        }
      };
    }
    // O experimento precisa ser concluido, da propria conta e da MESMA
    // configuracao funcional. Nao se exige a mesma linha: `inputHash` ignora
    // identidade e nome, entao duas configuracoes funcionalmente identicas
    // compartilham o experimento - exigir a linha exata deixaria a segunda sem
    // caminho de aprovacao, sem nenhum ganho de garantia.
    const experiment = await prisma.calibrationExperiment.findFirst({
      where: {
        id: input.experimentId,
        riotAccountId: input.riotAccountId,
        status: "COMPLETED",
        candidate: { configHash: candidateRow.configHash }
      },
      select: { id: true }
    });
    if (!experiment) {
      return {
        ok: false,
        failure: {
          code: "DECISION_REQUIRES_COMPLETED_EXPERIMENT",
          message: "Nenhum experimento concluído desta configuração corresponde ao informado."
        }
      };
    }
  }

  const updated = await prisma.calibrationCandidateConfig.update({
    where: { id: candidateRow.id },
    data: {
      status: input.decision,
      decisionBy: input.decidedBy,
      decisionAt: new Date(),
      decisionNote: input.note ?? null,
      decisionExperimentId: input.experimentId ?? null
    }
  });

  return { ok: true, row: toCandidateRow(updated) };
}
