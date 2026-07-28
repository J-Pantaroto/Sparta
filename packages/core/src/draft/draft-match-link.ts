import type { DraftSessionSource, DraftSessionStatus, KnownDraftState } from "./draft-session.js";
import type { Role } from "../types/domain.js";

export const DRAFT_MATCH_LINK_ALGORITHM_VERSION = "draft-match-link/1.0.0";
export const DRAFT_MATCH_LINK_CLOCK_SKEW_MS = 2 * 60 * 1000;
export const DRAFT_MATCH_LINK_MAX_START_DELAY_MS = 20 * 60 * 1000;

export type DraftMatchLinkStatus =
  "PENDING" | "LINKED" | "AMBIGUOUS" | "UNLINKABLE" | "NOT_APPLICABLE";

export type DraftMatchLinkStrategy = "EXACT_GAME_ID" | "STRONG_EVIDENCE";

export interface DraftMatchLinkEvidence {
  signal:
    | "source"
    | "lifecycle"
    | "gameId"
    | "player"
    | "platform"
    | "champion"
    | "role"
    | "queue"
    | "startedAt"
    | "knownParticipants";
  expected?: string | number | string[] | number[];
  observed?: string | number | string[] | number[];
  matched: boolean;
  source: "LCU" | "DRAFT_SESSION" | "MATCH_V5";
}

export interface DraftMatchCandidate {
  matchId: string;
  gameId?: string;
  platform: string;
  puuid: string;
  championId: number;
  role?: Role;
  queueId?: number;
  startedAt?: string;
  participantChampionIds: number[];
}

export interface DraftMatchLinkDecision {
  status: DraftMatchLinkStatus;
  strategy?: DraftMatchLinkStrategy;
  matchId?: string;
  externalGameId?: string;
  candidateCount: number;
  evidence: DraftMatchLinkEvidence[];
  reason: string;
  algorithmVersion: typeof DRAFT_MATCH_LINK_ALGORITHM_VERSION;
}

export interface DraftMatchLinkInput {
  source: DraftSessionSource;
  lifecycleStatus: DraftSessionStatus;
  puuid: string;
  platform: string;
  role: Role;
  queueId?: number;
  selectedChampionId?: number;
  knownDraft: KnownDraftState;
  startedAt: string;
  lockedInAt?: string;
  updatedAt: string;
  externalGameId?: string;
  currentLink?: {
    status: DraftMatchLinkStatus;
    strategy?: DraftMatchLinkStrategy;
    matchId?: string;
  };
  candidates: readonly DraftMatchCandidate[];
}

function decision(value: Omit<DraftMatchLinkDecision, "algorithmVersion">): DraftMatchLinkDecision {
  return { ...value, algorithmVersion: DRAFT_MATCH_LINK_ALGORITHM_VERSION };
}

function samePlatform(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

function canonicalGameId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && /^\d+$/.test(trimmed) ? trimmed : undefined;
}

function gameIdFromMatchId(matchId: string): string | undefined {
  const suffix = matchId.trim().match(/_(\d+)$/)?.[1];
  return canonicalGameId(suffix);
}

function knownChampionIds(input: DraftMatchLinkInput): number[] {
  return [
    ...new Set([
      ...input.knownDraft.allies.map((pick) => pick.championId),
      ...input.knownDraft.enemies.map((pick) => pick.championId)
    ])
  ].sort((left, right) => left - right);
}

function evidenceForCandidate(
  input: DraftMatchLinkInput,
  candidate: DraftMatchCandidate
): { plausible: boolean; evidence: DraftMatchLinkEvidence[] } {
  const start = Date.parse(input.startedAt);
  const anchor = Date.parse(input.lockedInAt ?? input.updatedAt);
  const observedStart = candidate.startedAt ? Date.parse(candidate.startedAt) : Number.NaN;
  const earliest = start - DRAFT_MATCH_LINK_CLOCK_SKEW_MS;
  const latest = anchor + DRAFT_MATCH_LINK_MAX_START_DELAY_MS;
  const timeMatches =
    Number.isFinite(start) &&
    Number.isFinite(anchor) &&
    Number.isFinite(observedStart) &&
    observedStart >= earliest &&
    observedStart <= latest;
  const participants = [...new Set(candidate.participantChampionIds)].sort(
    (left, right) => left - right
  );
  const known = knownChampionIds(input);
  const knownParticipantsMatch = known.every((championId) => participants.includes(championId));
  const roleMatches = candidate.role === undefined || candidate.role === input.role;
  const queueMatches =
    input.queueId === undefined ||
    candidate.queueId === undefined ||
    input.queueId === candidate.queueId;

  const evidence: DraftMatchLinkEvidence[] = [
    {
      signal: "player",
      expected: input.puuid,
      observed: candidate.puuid,
      matched: candidate.puuid === input.puuid,
      source: "MATCH_V5"
    },
    {
      signal: "platform",
      expected: input.platform,
      observed: candidate.platform,
      matched: samePlatform(candidate.platform, input.platform),
      source: "MATCH_V5"
    },
    {
      signal: "champion",
      expected: input.selectedChampionId,
      observed: candidate.championId,
      matched:
        input.selectedChampionId !== undefined && candidate.championId === input.selectedChampionId,
      source: "MATCH_V5"
    },
    {
      signal: "startedAt",
      expected: `${new Date(earliest).toISOString()}..${new Date(latest).toISOString()}`,
      observed: candidate.startedAt,
      matched: timeMatches,
      source: "MATCH_V5"
    },
    {
      signal: "role",
      expected: input.role,
      observed: candidate.role,
      matched: roleMatches,
      source: "MATCH_V5"
    },
    {
      signal: "queue",
      expected: input.queueId,
      observed: candidate.queueId,
      matched: queueMatches,
      source: "MATCH_V5"
    },
    {
      signal: "knownParticipants",
      expected: known,
      observed: participants,
      matched: knownParticipantsMatch,
      source: "MATCH_V5"
    }
  ];

  return {
    plausible:
      candidate.puuid === input.puuid &&
      samePlatform(candidate.platform, input.platform) &&
      input.selectedChampionId !== undefined &&
      candidate.championId === input.selectedChampionId &&
      timeMatches &&
      roleMatches &&
      queueMatches &&
      knownParticipantsMatch,
    evidence
  };
}

/**
 * Decide somente com identificadores oficiais ou evidência conjunta forte.
 * Nunca pontua candidatos nem desempata por proximidade: zero permanece
 * pendente, dois ou mais são ambíguos e somente um candidato pode vincular.
 */
export function decideDraftMatchLink(input: DraftMatchLinkInput): DraftMatchLinkDecision {
  if (input.source === "USER") {
    return decision({
      status: "NOT_APPLICABLE",
      candidateCount: 0,
      evidence: [
        {
          signal: "source",
          expected: "LCU",
          observed: "USER",
          matched: false,
          source: "DRAFT_SESSION"
        }
      ],
      reason: "Sessões manuais não representam uma partida observada pelo LCU."
    });
  }

  if (input.lifecycleStatus === "ABANDONED") {
    return decision({
      status: "NOT_APPLICABLE",
      candidateCount: 0,
      evidence: [
        {
          signal: "lifecycle",
          expected: "partida iniciada",
          observed: "ABANDONED",
          matched: false,
          source: "DRAFT_SESSION"
        }
      ],
      reason: "A sessão foi encerrada sem partida e não pode consumir a partida seguinte."
    });
  }

  if (
    input.currentLink?.status === "LINKED" &&
    input.currentLink.strategy === "EXACT_GAME_ID" &&
    input.currentLink.matchId
  ) {
    return decision({
      status: "LINKED",
      strategy: "EXACT_GAME_ID",
      matchId: input.currentLink.matchId,
      externalGameId: canonicalGameId(input.externalGameId),
      candidateCount: 1,
      evidence: [
        {
          signal: "gameId",
          expected: canonicalGameId(input.externalGameId),
          observed: input.currentLink.matchId,
          matched: true,
          source: "MATCH_V5"
        }
      ],
      reason: "Vínculo exato já confirmado; estratégias heurísticas não podem substituí-lo."
    });
  }

  const externalGameId = canonicalGameId(input.externalGameId);
  if (externalGameId) {
    const exact = input.candidates.filter(
      (candidate) =>
        samePlatform(candidate.platform, input.platform) &&
        (canonicalGameId(candidate.gameId) ?? gameIdFromMatchId(candidate.matchId)) ===
          externalGameId
    );
    if (exact.length === 1) {
      const candidate = exact[0];
      return decision({
        status: "LINKED",
        strategy: "EXACT_GAME_ID",
        matchId: candidate.matchId,
        externalGameId,
        candidateCount: 1,
        evidence: [
          {
            signal: "gameId",
            expected: externalGameId,
            observed: canonicalGameId(candidate.gameId) ?? gameIdFromMatchId(candidate.matchId),
            matched: true,
            source: "MATCH_V5"
          },
          {
            signal: "platform",
            expected: input.platform,
            observed: candidate.platform,
            matched: true,
            source: "MATCH_V5"
          }
        ],
        reason: "O gameId oficial observado no LCU corresponde exatamente à partida do Match-V5."
      });
    }
    if (exact.length > 1) {
      return decision({
        status: "AMBIGUOUS",
        externalGameId,
        candidateCount: exact.length,
        evidence: [],
        reason: "Mais de uma partida possui o mesmo gameId e plataforma; nenhuma foi escolhida."
      });
    }
    return decision({
      status: "PENDING",
      externalGameId,
      candidateCount: 0,
      evidence: [
        {
          signal: "gameId",
          expected: externalGameId,
          matched: false,
          source: "MATCH_V5"
        }
      ],
      reason: "O gameId foi observado, mas a partida ainda não está disponível no Match-V5 local."
    });
  }

  if (input.lifecycleStatus === "ACTIVE") {
    return decision({
      status: "PENDING",
      candidateCount: 0,
      evidence: [],
      reason: "O champion select ainda está em andamento."
    });
  }

  if (
    !input.selectedChampionId ||
    !Date.parse(input.startedAt) ||
    !input.puuid ||
    !input.platform
  ) {
    return decision({
      status: "UNLINKABLE",
      candidateCount: 0,
      evidence: [],
      reason: "A sessão não possui o conjunto mínimo de evidências para reconciliação segura."
    });
  }

  const evaluated = input.candidates.map((candidate) => ({
    candidate,
    ...evidenceForCandidate(input, candidate)
  }));
  const plausible = evaluated.filter((entry) => entry.plausible);

  if (plausible.length === 1) {
    const chosen = plausible[0];
    return decision({
      status: "LINKED",
      strategy: "STRONG_EVIDENCE",
      matchId: chosen.candidate.matchId,
      candidateCount: 1,
      evidence: chosen.evidence,
      reason: "Há um único candidato compatível com todo o conjunto de evidências fortes."
    });
  }
  if (plausible.length > 1) {
    return decision({
      status: "AMBIGUOUS",
      candidateCount: plausible.length,
      evidence: plausible.flatMap((entry) => entry.evidence),
      reason: "Há mais de um candidato plausível; o reconciliador não desempata por pontuação."
    });
  }

  return decision({
    status: "PENDING",
    candidateCount: 0,
    evidence: evaluated.flatMap((entry) => entry.evidence),
    reason: "Nenhuma partida sincronizada satisfaz simultaneamente todas as evidências exigidas."
  });
}
