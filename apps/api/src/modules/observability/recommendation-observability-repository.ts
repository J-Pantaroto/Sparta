import type { Prisma } from "@prisma/client";
import {
  buildLongitudinalRecommendationReport,
  type DraftPostGameComparison,
  type LongitudinalRecommendationReport,
  type LongitudinalReportFilters,
  type PersistedRecommendation,
  type RecommendationObservation,
  type Role
} from "@sparta/core";
import { prisma } from "../../db/prisma.js";

const ROLES = new Set<Role>(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);

interface SnapshotCandidate {
  id: string;
  createdAt: Date;
  supersededAt: Date | null;
}

/**
 * Resolve o snapshot que estava vigente no instante do lock-in. Um snapshot
 * criado depois da confirmação ou já substituído naquele instante não pode
 * virar retroativamente a recomendação apresentada ao jogador.
 */
export function selectSnapshotAtLockIn<T extends SnapshotCandidate>(
  snapshots: T[],
  lockedInAt: Date | null
): T | null {
  if (!lockedInAt) return null;
  const instant = lockedInAt.getTime();
  return (
    snapshots
      .filter(
        (snapshot) =>
          snapshot.createdAt.getTime() <= instant &&
          (snapshot.supersededAt === null || snapshot.supersededAt.getTime() > instant)
      )
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id, "en")
      )[0] ?? null
  );
}

function roleOf(value: string | null | undefined): Role | null {
  return value && ROLES.has(value as Role) ? (value as Role) : null;
}

function executionRiskOf(recommendation: PersistedRecommendation | null): number | null {
  const metric = recommendation?.metricDetails?.find((entry) => entry.key === "EXECUTION_RISK");
  return metric && metric.status !== "UNAVAILABLE" && metric.value !== null ? metric.value : null;
}

function comparisonOf(value: Prisma.JsonValue): DraftPostGameComparison | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = value as unknown as DraftPostGameComparison;
  return typeof report.algorithmVersion === "string" ? report : null;
}

export async function findRecommendationObservations(
  riotAccountId: string,
  puuid: string
): Promise<RecommendationObservation[]> {
  const sessions = await prisma.draftSession.findMany({
    where: {
      riotAccountId,
      linkedMatchId: { not: null },
      selectedChampionId: { not: null }
    },
    include: {
      snapshots: {
        include: { recommendations: true },
        orderBy: { createdAt: "desc" }
      },
      linkedMatch: {
        include: {
          participants: {
            where: { puuid },
            include: { observation: true }
          }
        }
      },
      postgameComparisons: {
        orderBy: [{ revision: "desc" }],
        take: 1
      }
    },
    orderBy: [{ lockedInAt: "asc" }, { id: "asc" }]
  });

  const observations: RecommendationObservation[] = [];
  for (const session of sessions) {
    if (!session.linkedMatch || session.selectedChampionId === null) continue;
    const participant = session.linkedMatch.participants[0];
    if (!participant) continue;

    const snapshot = selectSnapshotAtLockIn(session.snapshots, session.lockedInAt);
    const selectedRow =
      snapshot?.recommendations.find(
        (recommendation) => recommendation.championId === session.selectedChampionId
      ) ?? null;
    const persistedRecommendation = selectedRow
      ? (selectedRow.detailJson as unknown as PersistedRecommendation)
      : null;
    const comparison = session.postgameComparisons[0]
      ? comparisonOf(session.postgameComparisons[0].reportJson)
      : null;
    const observedRole =
      roleOf(participant.observation?.normalizedRole) ?? roleOf(participant.role);
    const analysisRole = roleOf(session.role);
    if (!analysisRole) continue;

    const algorithmVersions = snapshot
      ? {
          ...(snapshot.algorithmVersionsJson as Record<string, string>),
          ...(comparison ? { postgameComparison: comparison.algorithmVersion } : {})
        }
      : comparison
        ? { postgameComparison: comparison.algorithmVersion }
        : {};

    observations.push({
      draftSessionId: session.id,
      snapshotId: snapshot?.id ?? null,
      matchId: session.linkedMatch.matchId,
      championId: session.selectedChampionId,
      role: analysisRole,
      observedRole,
      selectionGroup: selectedRow
        ? selectedRow.recGroup === "ALTERNATIVE"
          ? "ALTERNATIVE"
          : "PRIMARY"
        : "NOT_IN_SNAPSHOT",
      poolSource: selectedRow?.poolSource ?? null,
      originalRank: selectedRow?.rank ?? null,
      originalScore: selectedRow?.totalScore ?? null,
      originalCoverage: selectedRow?.dataCoverage ?? null,
      originalExecutionRisk: executionRiskOf(persistedRecommendation),
      matchWon: participant.won,
      positionMatched: observedRole ? observedRole === analysisRole : null,
      patch: session.linkedMatch.patch,
      queueId: session.linkedMatch.queueId,
      playedAt: session.linkedMatch.startedAt?.toISOString() ?? null,
      algorithmVersions,
      postgameComparisonStatus: comparison?.status ?? "UNAVAILABLE",
      comparableSignalKeys: comparison
        ? [...new Set(comparison.comparableSignals.map((signal) => signal.key))]
        : [],
      unavailableSignalKeys: comparison
        ? [...new Set(comparison.unavailableSignals.map((signal) => signal.key))]
        : []
    });
  }

  // A unicidade de DraftSession já impede duplicação no banco. A defesa aqui
  // mantém a unidade de análise estável mesmo em um adapter de teste ou banco
  // legado inconsistente.
  const unique = new Map<string, RecommendationObservation>();
  for (const observation of observations) {
    if (!unique.has(observation.draftSessionId)) {
      unique.set(observation.draftSessionId, observation);
    }
  }
  return [...unique.values()];
}

export async function buildRecommendationObservabilityForPlayer(input: {
  riotAccountId: string;
  puuid: string;
  filters: Omit<LongitudinalReportFilters, "playerId">;
  generatedAt: string;
  displaySampleThreshold?: number;
}): Promise<LongitudinalRecommendationReport> {
  const observations = await findRecommendationObservations(input.riotAccountId, input.puuid);
  return buildLongitudinalRecommendationReport({
    observations,
    filters: { playerId: input.puuid, ...input.filters },
    generatedAt: input.generatedAt,
    ...(input.displaySampleThreshold !== undefined
      ? { displaySampleThreshold: input.displaySampleThreshold }
      : {})
  });
}
