import type { RiotMatchDto } from "@sparta/riot";
import { prisma } from "../../db/prisma.js";
import { persistMatchObservations } from "./match-observation-repository.js";

export interface MatchObservationBackfillSummary {
  matchesProcessed: number;
  matchesUpdated: number;
  matchesUnavailable: number;
  matchesWithErrors: number;
  participantsUpdated: number;
  errors: { reason: string }[];
}

function isUsableRawMatch(value: unknown): value is RiotMatchDto {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    metadata?: { matchId?: unknown };
    info?: { participants?: unknown };
  };
  return (
    typeof candidate.metadata?.matchId === "string" && Array.isArray(candidate.info?.participants)
  );
}

/**
 * Reprocessa exclusivamente `Match.rawJson`. Não instancia clientes Riot ou
 * Data Dragon e não registra matchId, puuid ou payload em erros/logs.
 */
export async function backfillMatchObservations(): Promise<MatchObservationBackfillSummary> {
  const summary: MatchObservationBackfillSummary = {
    matchesProcessed: 0,
    matchesUpdated: 0,
    matchesUnavailable: 0,
    matchesWithErrors: 0,
    participantsUpdated: 0,
    errors: []
  };
  const matches = await prisma.match.findMany({
    select: { id: true, platform: true, rawJson: true }
  });

  for (const match of matches) {
    summary.matchesProcessed += 1;
    if (!isUsableRawMatch(match.rawJson)) {
      summary.matchesUnavailable += 1;
      continue;
    }

    try {
      const result = await persistMatchObservations(match.id, match.platform, match.rawJson);
      if (result.extracted === 0 || result.unavailable === result.extracted) {
        summary.matchesUnavailable += 1;
      }
      if (result.updated > 0) {
        summary.matchesUpdated += 1;
        summary.participantsUpdated += result.updated;
      }
    } catch {
      summary.matchesWithErrors += 1;
      summary.errors.push({ reason: "MATCH_OBSERVATION_EXTRACTION_FAILED" });
    }
  }
  return summary;
}
