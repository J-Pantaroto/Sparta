import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  aggregatePersonalLoadoutEvidence,
  analyzeTheoreticalPatchImpact,
  buildDraftPostGameComparison,
  DRAFT_POSTGAME_COMPARISON_VERSION,
  type DraftPostGameComparison,
  type DraftPostGameComparisonInput,
  type KnownDraftState,
  type PersistedRecommendation,
  type Role
} from "@sparta/core";
import { prisma } from "../../db/prisma.js";
import { findChampionCapabilityProfile } from "../catalog/champion-capability-repository.js";
import { findMatchLoadoutObservation } from "../matches/match-observation-repository.js";
import { findPatchRelease } from "../patches/patch-repository.js";
import { findPersonalLoadoutObservations } from "../players/personal-loadout-repository.js";

export type DraftComparisonApiState =
  | "AVAILABLE"
  | "PARTIAL"
  | "MATCH_NOT_LINKED"
  | "SNAPSHOT_MISSING"
  | "TIMELINE_UNAVAILABLE"
  | "NOT_GENERATED";

export interface DraftComparisonApiResponse {
  state: DraftComparisonApiState;
  draftSessionId?: string;
  report: DraftPostGameComparison | null;
  reason?: string;
}

type LoadedSession = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

export function hashDraftComparisonInput(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

async function loadSession(riotAccountId: string, sessionId: string) {
  return prisma.draftSession.findFirst({
    where: { id: sessionId, riotAccountId },
    include: {
      snapshots: {
        include: { recommendations: true },
        orderBy: { createdAt: "desc" },
        take: 1
      },
      linkedMatch: {
        include: {
          timeline: true,
          participants: { include: { champion: true } }
        }
      }
    }
  });
}

async function loadSessionByMatch(riotAccountId: string, matchId: string) {
  const session = await prisma.draftSession.findFirst({
    where: { riotAccountId, linkedMatchId: matchId },
    select: { id: true }
  });
  return session ? loadSession(riotAccountId, session.id) : null;
}

function latestPersistedReport(
  riotAccountId: string,
  draftSessionId: string
): Promise<{ reportJson: Prisma.JsonValue } | null> {
  return prisma.draftPostGameComparisonRevision.findFirst({
    where: { riotAccountId, draftSessionId },
    orderBy: { revision: "desc" },
    select: { reportJson: true }
  });
}

function stateFor(report: DraftPostGameComparison): DraftComparisonApiState {
  if (!report.coverageDimensions.snapshotAvailable) return "SNAPSHOT_MISSING";
  if (!report.coverageDimensions.timelineAvailable) return "TIMELINE_UNAVAILABLE";
  return report.status === "AVAILABLE" ? "AVAILABLE" : "PARTIAL";
}

async function responseForLoadedSession(
  riotAccountId: string,
  session: LoadedSession
): Promise<DraftComparisonApiResponse> {
  if (!session.linkedMatchId || !session.linkedMatch) {
    return {
      state: "MATCH_NOT_LINKED",
      draftSessionId: session.id,
      report: null,
      reason: "A sessão ainda não possui partida vinculada com segurança."
    };
  }
  const row = await latestPersistedReport(riotAccountId, session.id);
  if (!row) {
    return {
      state: "NOT_GENERATED",
      draftSessionId: session.id,
      report: null,
      reason: "A comparação ainda não foi gerada."
    };
  }
  const report = row.reportJson as unknown as DraftPostGameComparison;
  return { state: stateFor(report), draftSessionId: session.id, report };
}

export async function findDraftComparisonBySession(
  riotAccountId: string,
  sessionId: string
): Promise<DraftComparisonApiResponse | null> {
  const session = await loadSession(riotAccountId, sessionId);
  return session ? responseForLoadedSession(riotAccountId, session) : null;
}

export async function findDraftComparisonByMatch(
  riotAccountId: string,
  matchId: string
): Promise<DraftComparisonApiResponse | null> {
  const session = await loadSessionByMatch(riotAccountId, matchId);
  return session ? responseForLoadedSession(riotAccountId, session) : null;
}

function rawParticipant(
  rawJson: Prisma.JsonValue | null,
  puuid: string
): {
  totalCs?: number;
  goldEarned?: number;
  damageToChampions?: number;
  visionScore?: number;
} {
  const raw = rawJson as unknown as {
    info?: {
      participants?: Array<{
        puuid?: string;
        totalMinionsKilled?: number;
        neutralMinionsKilled?: number;
        goldEarned?: number;
        totalDamageDealtToChampions?: number;
        visionScore?: number;
      }>;
    };
  };
  const participant = raw.info?.participants?.find((entry) => entry.puuid === puuid);
  if (!participant) return {};
  const totalCs =
    participant.totalMinionsKilled !== undefined && participant.neutralMinionsKilled !== undefined
      ? participant.totalMinionsKilled + participant.neutralMinionsKilled
      : undefined;
  return {
    ...(totalCs !== undefined ? { totalCs } : {}),
    ...(participant.goldEarned !== undefined ? { goldEarned: participant.goldEarned } : {}),
    ...(participant.totalDamageDealtToChampions !== undefined
      ? { damageToChampions: participant.totalDamageDealtToChampions }
      : {}),
    ...(participant.visionScore !== undefined ? { visionScore: participant.visionScore } : {})
  };
}

async function buildInputMaterial(session: LoadedSession, puuid: string) {
  const match = session.linkedMatch;
  if (!match || !session.linkedMatchId || session.selectedChampionId === null) return null;
  const own = match.participants.find((participant) => participant.puuid === puuid);
  if (!own) return null;

  const snapshotRow = session.snapshots[0];
  const snapshot = snapshotRow
    ? {
        id: snapshotRow.id,
        inputHash: snapshotRow.inputHash,
        createdAt: snapshotRow.createdAt.toISOString(),
        dataCoverage: snapshotRow.dataCoverage,
        algorithmVersions: snapshotRow.algorithmVersionsJson as Record<string, string>,
        recommendations: snapshotRow.recommendations
          .map((recommendation) => recommendation.detailJson as unknown as PersistedRecommendation)
          .sort((left, right) => left.rank - right.rank)
      }
    : undefined;

  const selectedChampion =
    match.participants.find((participant) => participant.championId === session.selectedChampionId)
      ?.champion ??
    (await prisma.champion.findUnique({ where: { id: session.selectedChampionId } }));
  const currentLoadout = await findMatchLoadoutObservation(match.matchId, puuid);

  const historicalLoadout = snapshot
    ? aggregatePersonalLoadoutEvidence(
        await findPersonalLoadoutObservations(
          puuid,
          session.selectedChampionId,
          session.role as Role
        ),
        {
          championId: session.selectedChampionId,
          role: session.role as Role,
          playedAtTo: snapshot.createdAt
        }
      )
    : undefined;

  const directOpponentChampionId = (session.knownDraftJson as unknown as KnownDraftState)
    .directOpponentChampionId;
  const possibleOpponents =
    directOpponentChampionId === undefined || own.teamId === null
      ? []
      : match.participants.filter(
          (participant) =>
            participant.teamId !== null &&
            participant.teamId !== own.teamId &&
            participant.championId === directOpponentChampionId &&
            participant.role === session.role
        );
  const confirmedOpponent = possibleOpponents.length === 1 ? possibleOpponents[0] : undefined;

  let patchContext: DraftPostGameComparisonInput["patchContext"];
  if (match.patch) {
    const release = await findPatchRelease(match.patch, "pt_BR");
    if (release) {
      const changes = release.changes.filter(
        (change) =>
          change.entityType === "CHAMPION" && change.entityId === session.selectedChampionId
      );
      if (changes.length > 0) {
        const capabilityProfile = await findChampionCapabilityProfile(session.selectedChampionId);
        patchContext = {
          changes,
          availableAtDraft:
            snapshot !== undefined &&
            new Date(release.collectedAt).getTime() <= new Date(snapshot.createdAt).getTime(),
          theoreticalImpact: analyzeTheoreticalPatchImpact({
            release,
            championId: session.selectedChampionId,
            capabilityProfile
          })
        };
      }
    }
  }

  const material = {
    draftSessionId: session.id,
    matchId: match.matchId,
    session: {
      role: session.role as Role,
      roleSource: session.roleSource as "LCU" | "USER",
      ...(session.patch ? { patch: session.patch } : {}),
      ...(session.queueId !== null ? { queueId: session.queueId } : {}),
      selectedChampionId: session.selectedChampionId,
      knownDraft: session.knownDraftJson as unknown as KnownDraftState
    },
    ...(snapshot ? { snapshot } : {}),
    selectedChampionName: selectedChampion?.name ?? `Campeão ${session.selectedChampionId}`,
    observed: {
      championId: own.championId,
      championName: own.champion.name,
      won: own.won,
      ...(own.role ? { observedRole: own.role as Role } : {}),
      ...(currentLoadout?.position.assignedRole
        ? { assignedRole: currentLoadout.position.assignedRole }
        : {}),
      positionStatus: currentLoadout?.position.status ?? ("UNAVAILABLE" as const),
      kills: own.kills,
      deaths: own.deaths,
      assists: own.assists,
      ...rawParticipant(match.rawJson, puuid),
      csPerMinute: own.csPerMinute,
      goldPerMinute: own.goldPerMinute,
      damagePerMinute: own.damagePerMinute,
      visionScorePerMinute: own.visionScorePerMinute,
      ...(own.killParticipation !== null ? { killParticipation: own.killParticipation } : {}),
      ...(own.objectiveParticipation !== null
        ? { objectiveParticipation: own.objectiveParticipation }
        : {}),
      ...(own.objectiveTakedowns !== null ? { objectiveTakedowns: own.objectiveTakedowns } : {}),
      ...(own.teamObjectiveKills !== null ? { teamObjectiveKills: own.teamObjectiveKills } : {}),
      ...(match.durationSeconds !== null ? { durationSeconds: match.durationSeconds } : {}),
      ...(match.queueId !== null ? { queueId: match.queueId } : {}),
      ...(match.patch ? { patch: match.patch } : {}),
      ...(match.gameVersion ? { gameVersion: match.gameVersion } : {})
    },
    ...(match.timeline
      ? {
          timeline: {
            deathsBefore10: match.timeline.deathsBefore10,
            deathsBefore15: match.timeline.deathsBefore15,
            ...(match.timeline.csAt10 !== null ? { csAt10: match.timeline.csAt10 } : {}),
            ...(match.timeline.csAt15 !== null ? { csAt15: match.timeline.csAt15 } : {}),
            ...(match.timeline.goldDiffAt15 !== null
              ? { goldDiffAt15: match.timeline.goldDiffAt15 }
              : {})
          }
        }
      : {}),
    ...(currentLoadout ? { currentLoadout } : {}),
    ...(historicalLoadout ? { historicalLoadout } : {}),
    ...(directOpponentChampionId !== undefined
      ? {
          directOpponent: {
            championId: directOpponentChampionId,
            championName: confirmedOpponent?.champion.name ?? `Campeão ${directOpponentChampionId}`,
            confirmed: confirmedOpponent !== undefined
          }
        }
      : {}),
    ...(patchContext ? { patchContext } : {})
  } satisfies Omit<DraftPostGameComparisonInput, "generatedAt">;

  return material;
}

export type GenerateDraftComparisonResult =
  | { ok: true; created: boolean; report: DraftPostGameComparison }
  | {
      ok: false;
      reason: "NOT_FOUND" | "MATCH_NOT_LINKED" | "CHOICE_NOT_RECORDED" | "PLAYER_NOT_IN_MATCH";
    };

export async function generateDraftComparison(
  riotAccountId: string,
  puuid: string,
  sessionId: string
): Promise<GenerateDraftComparisonResult> {
  const session = await loadSession(riotAccountId, sessionId);
  if (!session) return { ok: false, reason: "NOT_FOUND" };
  if (!session.linkedMatchId || !session.linkedMatch) {
    return { ok: false, reason: "MATCH_NOT_LINKED" };
  }
  if (session.selectedChampionId === null) {
    return { ok: false, reason: "CHOICE_NOT_RECORDED" };
  }

  const material = await buildInputMaterial(session, puuid);
  if (!material) return { ok: false, reason: "PLAYER_NOT_IN_MATCH" };
  const inputHash = hashDraftComparisonInput(material);

  const existing = await prisma.draftPostGameComparisonRevision.findUnique({
    where: {
      draftSessionId_inputHash_algorithmVersion: {
        draftSessionId: session.id,
        inputHash,
        algorithmVersion: DRAFT_POSTGAME_COMPARISON_VERSION
      }
    }
  });
  if (existing) {
    return {
      ok: true,
      created: false,
      report: existing.reportJson as unknown as DraftPostGameComparison
    };
  }

  const generatedAt = new Date().toISOString();
  const baseReport = buildDraftPostGameComparison({ ...material, generatedAt });
  const postgameReport = await prisma.postgameReport.findUnique({
    where: {
      matchId_puuid: {
        matchId: session.linkedMatch.id,
        puuid
      }
    },
    select: { id: true }
  });

  let created: DraftPostGameComparison;
  try {
    created = await prisma.$transaction(async (tx) => {
      const latest = await tx.draftPostGameComparisonRevision.findFirst({
        where: { draftSessionId: session.id },
        orderBy: { revision: "desc" },
        select: { revision: true }
      });
      const revision = (latest?.revision ?? 0) + 1;
      const report: DraftPostGameComparison = {
        ...baseReport,
        revision,
        inputHash
      };
      const row = await tx.draftPostGameComparisonRevision.create({
        data: {
          draftSessionId: session.id,
          matchId: session.linkedMatch!.id,
          snapshotId: material.snapshot?.id,
          postgameReportId: postgameReport?.id,
          riotAccountId,
          revision,
          inputHash,
          algorithmVersion: report.algorithmVersion,
          sourceVersionsJson: report.sourceAlgorithmVersions as Prisma.InputJsonValue,
          snapshotSignalIdsJson: report.snapshotSignalIds as Prisma.InputJsonValue,
          coverage: report.coverage,
          status: report.status,
          unavailableReasonsJson: report.unavailableSignals.map((signal) => ({
            id: signal.id,
            reason: signal.unavailableReason
          })) as Prisma.InputJsonValue,
          reportJson: report as unknown as Prisma.InputJsonValue,
          generatedAt: new Date(generatedAt)
        }
      });
      return row.reportJson as unknown as DraftPostGameComparison;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrent = await prisma.draftPostGameComparisonRevision.findUnique({
        where: {
          draftSessionId_inputHash_algorithmVersion: {
            draftSessionId: session.id,
            inputHash,
            algorithmVersion: DRAFT_POSTGAME_COMPARISON_VERSION
          }
        }
      });
      if (concurrent) {
        return {
          ok: true,
          created: false,
          report: concurrent.reportJson as unknown as DraftPostGameComparison
        };
      }
    }
    throw error;
  }

  return { ok: true, created: true, report: created };
}
