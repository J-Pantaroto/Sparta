import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  describeSnapshotReplayCapability,
  extractFrozenCandidate,
  reconstructBaseline,
  verifyReplayBundle,
  type PersistedRecommendation,
  type ReplayInputBundle,
  type ReplayVerificationResult,
  type SnapshotReplayCapabilityReport
} from "@sparta/core";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

/**
 * Superficie de leitura e verificacao do ReplayInputBundle (Etapa 26b).
 *
 * ## O que este modulo NAO faz
 *
 * As tres consultas usam exclusivamente `RecommendationSnapshot`,
 * `PersistedRecommendation` e `ReplayInputBundleRecord` — os tres registros
 * imutaveis gravados atomicamente na Etapa 26a. Nenhuma funcao aqui consulta
 * `PlayerChampionStats`, `ChampionTag`, `ChampionCapabilityProfile` ou
 * qualquer outra tabela mutavel: a verificacao teria deixado de ser prova de
 * reproducibilidade historica se dependesse do estado atual.
 *
 * A verificacao **nunca corrige** o bundle nem o snapshot; ela so relata.
 */

type OwnedSnapshot = NonNullable<Awaited<ReturnType<typeof loadOwnedSnapshot>>>;

async function loadOwnedSnapshot(riotAccountId: string, snapshotId: string) {
  return prisma.recommendationSnapshot.findFirst({
    where: { id: snapshotId, draftSession: { riotAccountId } },
    include: { recommendations: true, replayBundle: true }
  });
}

/**
 * `true` quando a Etapa 25 consegue reconstruir o score congelado de **todo**
 * candidato do snapshot a partir das metricas persistidas. Um unico candidato
 * irreprodutivel já tira a reponderação da amostra confiável.
 */
function computeReweightAvailability(snapshot: OwnedSnapshot): boolean {
  const recommendations = snapshot.recommendations.map(
    (row) => row.detailJson as unknown as PersistedRecommendation
  );
  if (recommendations.length === 0) return false;

  const versions = snapshot.algorithmVersionsJson as Record<string, string>;
  const aggregationVersion = versions.recommendationEngine ?? "desconhecida";

  return recommendations.every((recommendation) => {
    const frozen = extractFrozenCandidate(recommendation);
    return reconstructBaseline({ frozen, aggregationVersion }).status === "EXACT_REPLAY";
  });
}

/**
 * Descreve a capacidade do snapshot a partir do que já está persistido — não
 * dispara uma verificação nova. `GET` fica barato e sem efeito colateral;
 * disparar a verificação é responsabilidade exclusiva de `verifySnapshotReplay`.
 */
function describeCapability(snapshot: OwnedSnapshot): SnapshotReplayCapabilityReport {
  const reweightAvailable = computeReweightAvailability(snapshot);
  const bundleRow = snapshot.replayBundle;
  const bundle = bundleRow ? (bundleRow.contentJson as unknown as ReplayInputBundle) : null;
  const verification = bundleRow?.lastVerification
    ? (bundleRow.lastVerification as unknown as ReplayVerificationResult)
    : null;

  return describeSnapshotReplayCapability({ bundle, verification, reweightAvailable });
}

export interface ReplayCapabilityResponse extends SnapshotReplayCapabilityReport {
  sessionId: string;
  snapshotId: string | null;
}

/**
 * Capacidade do snapshot **atual** (mais recente) de uma sessão. `null` só
 * quando a sessão não existe ou não pertence à conta — nunca por ausência de
 * snapshot, que é um estado válido e reportado como tal.
 */
export async function findSessionReplayCapability(
  riotAccountId: string,
  sessionId: string
): Promise<ReplayCapabilityResponse | null> {
  const session = await prisma.draftSession.findFirst({
    where: { id: sessionId, riotAccountId },
    select: { id: true }
  });
  if (!session) return null;

  const snapshot = await prisma.recommendationSnapshot.findFirst({
    where: { draftSessionId: sessionId },
    include: { recommendations: true, replayBundle: true },
    orderBy: { createdAt: "desc" }
  });

  if (!snapshot) {
    return {
      sessionId,
      snapshotId: null,
      capability: "FULL_DERIVATION_REPLAY_UNAVAILABLE",
      reason: "Nenhum snapshot foi registrado para esta sessão.",
      reweightAvailable: false,
      missingDependencies: []
    };
  }

  return { sessionId, snapshotId: snapshot.id, ...describeCapability(snapshot) };
}

/**
 * Identidade da configuração que produziu o snapshot (Etapa 27c).
 *
 * Deliberadamente **não** carrega pesos, métricas desligadas nem regras
 * pós-agregação: a interface comum precisa saber *qual* configuração valia e
 * se o replay é possível, não reproduzir a configuração inteira. Quem quer os
 * parâmetros usa a tela de releases, que os lê do artefato.
 */
export interface ReplayConfigurationIdentity {
  source: "BUILT_IN_BASELINE" | "RELEASE";
  releaseId: string | null;
  version: string | null;
  configHash: string | null;
  /** `true` quando o bundle carrega a configuração efetiva completa (v2+). */
  embeddedInBundle: boolean;
}

export interface ReplayBundleSummaryResponse extends SnapshotReplayCapabilityReport {
  snapshotId: string;
  hasBundle: boolean;
  contentBytes?: number;
  evaluatedAt?: string;
  createdAt?: string;
  lastVerification?: unknown;
  configuration?: ReplayConfigurationIdentity;
}

/**
 * Resumo do bundle sem o `contentJson` completo — só o que a interface e a
 * observabilidade precisam. O conteúdo funcional (draft, stats, tags,
 * capacidades) nunca sai desta função.
 */
/**
 * Identidade da configuração, lida do **snapshot** (o eco gravado pela 27b) e
 * do bundle. Snapshot anterior à 27b não tem o eco e sai como baseline sem
 * `configHash` — que é o fato: naquela versão não existia release nenhuma.
 */
function describeConfiguration(snapshot: OwnedSnapshot): ReplayConfigurationIdentity {
  const bundle = snapshot.replayBundle
    ? (snapshot.replayBundle.contentJson as unknown as ReplayInputBundle)
    : null;
  return {
    source: (snapshot.configurationSource as "BUILT_IN_BASELINE" | "RELEASE") ?? "BUILT_IN_BASELINE",
    releaseId: snapshot.configurationReleaseId,
    version: snapshot.configurationVersion,
    configHash: snapshot.configHash,
    embeddedInBundle: bundle?.effectiveRecommendationConfiguration !== undefined
  };
}

export async function findReplayBundleSummary(
  riotAccountId: string,
  snapshotId: string
): Promise<ReplayBundleSummaryResponse | null> {
  const snapshot = await loadOwnedSnapshot(riotAccountId, snapshotId);
  if (!snapshot) return null;

  const report = describeCapability(snapshot);
  const bundleRow = snapshot.replayBundle;

  return {
    snapshotId,
    hasBundle: bundleRow !== null,
    ...report,
    configuration: describeConfiguration(snapshot),
    ...(bundleRow
      ? {
          contentBytes: bundleRow.contentBytes,
          evaluatedAt: bundleRow.evaluatedAt.toISOString(),
          createdAt: bundleRow.createdAt.toISOString(),
          lastVerification: bundleRow.lastVerification ?? undefined
        }
      : {})
  };
}

export type VerifySnapshotReplayResult =
  | { ok: true; result: ReplayVerificationResult; report: SnapshotReplayCapabilityReport; durationMs: number; bundleSchemaVersion: string }
  | { ok: false; reason: "NOT_FOUND" }
  | { ok: false; reason: "NO_BUNDLE" };

/**
 * Roda a verificação de fato e persiste o resultado como `lastVerification`
 * — observabilidade, não correção: o bundle e o snapshot em si nunca são
 * reescritos por esta função.
 */
export async function verifySnapshotReplay(
  riotAccountId: string,
  snapshotId: string
): Promise<VerifySnapshotReplayResult> {
  const snapshot = await loadOwnedSnapshot(riotAccountId, snapshotId);
  if (!snapshot) return { ok: false, reason: "NOT_FOUND" };
  if (!snapshot.replayBundle) return { ok: false, reason: "NO_BUNDLE" };

  const bundle = snapshot.replayBundle.contentJson as unknown as ReplayInputBundle;
  const recommendations = snapshot.recommendations.map(
    (row) => row.detailJson as unknown as PersistedRecommendation
  );

  const startedAt = performance.now();
  const result = verifyReplayBundle({
    bundle,
    snapshot: recommendations,
    computeHash: (canonical) => createHash("sha256").update(canonical).digest("hex")
  });
  const durationMs = performance.now() - startedAt;

  const verificationRecord = { ...result, verifiedAt: new Date().toISOString() };
  await prisma.replayInputBundleRecord.update({
    where: { snapshotId },
    data: { lastVerification: verificationRecord as unknown as Prisma.InputJsonValue }
  });

  const reweightAvailable = computeReweightAvailability(snapshot);
  const report = describeSnapshotReplayCapability({ bundle, verification: result, reweightAvailable });

  return { ok: true, result, report, durationMs, bundleSchemaVersion: bundle.schemaVersion };
}
