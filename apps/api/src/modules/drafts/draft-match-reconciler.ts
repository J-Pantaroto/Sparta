import {
  decideDraftMatchLink,
  DRAFT_MATCH_LINK_CLOCK_SKEW_MS,
  DRAFT_MATCH_LINK_MAX_START_DELAY_MS,
  type DraftMatchCandidate,
  type DraftMatchLinkDecision,
  type DraftMatchLinkStatus,
  type DraftMatchLinkStrategy,
  type KnownDraftState,
  type Role
} from "@sparta/core";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

const MAX_SERIALIZATION_RETRIES = 3;

export interface DraftMatchReconciliationReport {
  processed: number;
  linked: number;
  ambiguous: number;
  pending: number;
  unlinkable: number;
  notApplicable: number;
  unchanged: number;
  failed: number;
}

function emptyReport(): DraftMatchReconciliationReport {
  return {
    processed: 0,
    linked: 0,
    ambiguous: 0,
    pending: 0,
    unlinkable: 0,
    notApplicable: 0,
    unchanged: 0,
    failed: 0
  };
}

function increment(report: DraftMatchReconciliationReport, status: DraftMatchLinkStatus) {
  if (status === "LINKED") report.linked += 1;
  else if (status === "AMBIGUOUS") report.ambiguous += 1;
  else if (status === "PENDING") report.pending += 1;
  else if (status === "UNLINKABLE") report.unlinkable += 1;
  else report.notApplicable += 1;
}

function materiallyEqual(
  current: {
    matchLinkStatus: string;
    matchLinkStrategy: string | null;
    linkedMatchId: string | null;
    matchLinkCandidateCount: number;
    matchLinkAlgorithmVersion: string | null;
    matchLinkReason: string | null;
    matchLinkEvidenceJson: Prisma.JsonValue;
  },
  decision: DraftMatchLinkDecision
): boolean {
  return (
    current.matchLinkStatus === decision.status &&
    current.matchLinkStrategy === (decision.strategy ?? null) &&
    current.linkedMatchId === (decision.matchId ?? null) &&
    current.matchLinkCandidateCount === decision.candidateCount &&
    current.matchLinkAlgorithmVersion === decision.algorithmVersion &&
    current.matchLinkReason === decision.reason &&
    JSON.stringify(current.matchLinkEvidenceJson) === JSON.stringify(decision.evidence)
  );
}

async function appendRevision(
  tx: Prisma.TransactionClient,
  sessionId: string,
  decision: DraftMatchLinkDecision
) {
  const latest = await tx.draftMatchLinkRevision.findFirst({
    where: { draftSessionId: sessionId },
    orderBy: { revision: "desc" },
    select: { revision: true }
  });
  await tx.draftMatchLinkRevision.create({
    data: {
      draftSessionId: sessionId,
      revision: (latest?.revision ?? 0) + 1,
      status: decision.status,
      strategy: decision.strategy ?? null,
      matchId: decision.matchId ?? null,
      externalGameId: decision.externalGameId ?? null,
      evidenceJson: decision.evidence as unknown as Prisma.InputJsonValue,
      candidateCount: decision.candidateCount,
      algorithmVersion: decision.algorithmVersion,
      reason: decision.reason
    }
  });
}

async function findCandidates(
  tx: Prisma.TransactionClient,
  session: {
    externalGameId: string | null;
    startedAt: Date;
    lockedInAt: Date | null;
    updatedAt: Date;
  },
  account: { puuid: string; platformRegion: string }
): Promise<DraftMatchCandidate[]> {
  const earliest = new Date(session.startedAt.getTime() - DRAFT_MATCH_LINK_CLOCK_SKEW_MS);
  const anchor = session.lockedInAt ?? session.updatedAt;
  const latest = new Date(anchor.getTime() + DRAFT_MATCH_LINK_MAX_START_DELAY_MS);
  const matches = await tx.match.findMany({
    where: {
      platform: { equals: account.platformRegion, mode: "insensitive" },
      participants: { some: { puuid: account.puuid } },
      OR: [
        ...(session.externalGameId ? [{ gameId: session.externalGameId }] : []),
        { startedAt: { gte: earliest, lte: latest } }
      ]
    },
    include: {
      participants: {
        select: { puuid: true, championId: true, role: true }
      }
    },
    orderBy: { startedAt: "asc" }
  });

  return matches.flatMap((match) => {
    const player = match.participants.find((participant) => participant.puuid === account.puuid);
    if (!player) return [];
    return [
      {
        matchId: match.matchId,
        ...(match.gameId ? { gameId: match.gameId } : {}),
        platform: match.platform,
        puuid: player.puuid,
        championId: player.championId,
        ...(player.role ? { role: player.role as Role } : {}),
        ...(match.queueId !== null ? { queueId: match.queueId } : {}),
        ...(match.startedAt ? { startedAt: match.startedAt.toISOString() } : {}),
        participantChampionIds: match.participants.map((participant) => participant.championId)
      }
    ];
  });
}

async function reconcileOnce(
  client: PrismaClient,
  riotAccountId: string,
  sessionId: string
): Promise<{ decision: DraftMatchLinkDecision; changed: boolean }> {
  return client.$transaction(
    async (tx) => {
      const [account, session] = await Promise.all([
        tx.riotAccount.findUnique({
          where: { id: riotAccountId },
          select: { puuid: true, platformRegion: true }
        }),
        tx.draftSession.findFirst({ where: { id: sessionId, riotAccountId } })
      ]);
      if (!account || !session) throw new Error("DRAFT_SESSION_NOT_FOUND");

      const candidates = await findCandidates(tx, session, account);
      const decision = decideDraftMatchLink({
        source: session.source as "LCU" | "USER",
        lifecycleStatus: session.status as
          "ACTIVE" | "LOCKED_IN" | "IN_GAME" | "COMPLETED" | "ABANDONED",
        puuid: account.puuid,
        platform: account.platformRegion,
        role: session.role as Role,
        ...(session.queueId !== null ? { queueId: session.queueId } : {}),
        ...(session.selectedChampionId !== null
          ? { selectedChampionId: session.selectedChampionId }
          : {}),
        knownDraft: session.knownDraftJson as unknown as KnownDraftState,
        startedAt: session.startedAt.toISOString(),
        ...(session.lockedInAt ? { lockedInAt: session.lockedInAt.toISOString() } : {}),
        updatedAt: session.updatedAt.toISOString(),
        ...(session.externalGameId ? { externalGameId: session.externalGameId } : {}),
        currentLink: {
          status: session.matchLinkStatus as DraftMatchLinkStatus,
          ...(session.matchLinkStrategy
            ? { strategy: session.matchLinkStrategy as DraftMatchLinkStrategy }
            : {}),
          ...(session.linkedMatchId ? { matchId: session.linkedMatchId } : {})
        },
        candidates
      });

      if (materiallyEqual(session, decision)) return { decision, changed: false };

      if (decision.status === "LINKED" && decision.matchId) {
        const conflict = await tx.draftSession.findFirst({
          where: {
            riotAccountId,
            linkedMatchId: decision.matchId,
            id: { not: session.id }
          }
        });
        if (conflict) {
          const existingIsExact = conflict.matchLinkStrategy === "EXACT_GAME_ID";
          const incomingIsExact = decision.strategy === "EXACT_GAME_ID";
          if (!incomingIsExact || existingIsExact) {
            const ambiguous: DraftMatchLinkDecision = {
              ...decision,
              status: "AMBIGUOUS",
              strategy: undefined,
              matchId: undefined,
              candidateCount: Math.max(2, decision.candidateCount),
              reason: "A partida já está vinculada a outra sessão incompatível da mesma conta."
            };
            await tx.draftSession.update({
              where: { id: session.id },
              data: {
                matchLinkStatus: ambiguous.status,
                matchLinkStrategy: null,
                linkedMatchId: null,
                matchLinkAlgorithmVersion: ambiguous.algorithmVersion,
                matchLinkEvidenceJson: ambiguous.evidence as unknown as Prisma.InputJsonValue,
                matchLinkCandidateCount: ambiguous.candidateCount,
                matchLinkReason: ambiguous.reason,
                matchLinkDecidedAt: new Date()
              }
            });
            await appendRevision(tx, session.id, ambiguous);
            return { decision: ambiguous, changed: true };
          }

          const displaced: DraftMatchLinkDecision = {
            status: "AMBIGUOUS",
            candidateCount: 2,
            evidence: [],
            reason: "Vínculo heurístico removido porque outra sessão apresentou o gameId oficial.",
            algorithmVersion: decision.algorithmVersion
          };
          await tx.draftSession.update({
            where: { id: conflict.id },
            data: {
              status: conflict.status === "COMPLETED" ? "IN_GAME" : conflict.status,
              completedAt: null,
              linkedMatchId: null,
              matchLinkStatus: "AMBIGUOUS",
              matchLinkStrategy: null,
              matchLinkAlgorithmVersion: displaced.algorithmVersion,
              matchLinkEvidenceJson: [],
              matchLinkCandidateCount: 2,
              matchLinkReason: displaced.reason,
              matchLinkDecidedAt: new Date()
            }
          });
          await appendRevision(tx, conflict.id, displaced);
        }
      }

      const now = new Date();
      await tx.draftSession.update({
        where: { id: session.id },
        data: {
          ...(decision.status === "LINKED" && session.status !== "ABANDONED"
            ? { status: "COMPLETED", completedAt: session.completedAt ?? now }
            : {}),
          linkedMatchId: decision.matchId ?? null,
          matchLinkStatus: decision.status,
          matchLinkStrategy: decision.strategy ?? null,
          matchLinkAlgorithmVersion: decision.algorithmVersion,
          matchLinkEvidenceJson: decision.evidence as unknown as Prisma.InputJsonValue,
          matchLinkCandidateCount: decision.candidateCount,
          matchLinkReason: decision.reason,
          matchLinkDecidedAt: now
        }
      });
      await appendRevision(tx, session.id, decision);
      return { decision, changed: true };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

async function reconcileWithRetry(riotAccountId: string, sessionId: string) {
  for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt += 1) {
    try {
      return await reconcileOnce(prisma, riotAccountId, sessionId);
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002");
      if (!retryable || attempt === MAX_SERIALIZATION_RETRIES) throw error;
    }
  }
  throw new Error("DRAFT_MATCH_RECONCILIATION_RETRY_EXHAUSTED");
}

/**
 * Backfill/reprocessamento: lê apenas sessões já existentes e nunca cria
 * sessões sintéticas. Cada sessão é isolada para uma falha não parar as demais.
 */
export async function reconcileDraftSessionsForAccount(
  riotAccountId: string
): Promise<DraftMatchReconciliationReport> {
  const report = emptyReport();
  const sessions = await prisma.draftSession.findMany({
    where: { riotAccountId },
    select: { id: true },
    orderBy: { startedAt: "asc" }
  });

  for (const session of sessions) {
    report.processed += 1;
    try {
      const result = await reconcileWithRetry(riotAccountId, session.id);
      increment(report, result.decision.status);
      if (!result.changed) report.unchanged += 1;
    } catch {
      report.failed += 1;
    }
  }
  return report;
}
