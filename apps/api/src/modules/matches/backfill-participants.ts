import { extractParticipantTeams, mapMatchToSummaries, type RiotMatchDto } from "@sparta/riot";
import {
  backfillMatchParticipants,
  findMatchesMissingParticipants,
  type ParticipantToPersist
} from "./match-repository.js";

export interface BackfillSummary {
  matchesProcessed: number;
  participantsInserted: number;
  skippedParticipants: { matchId: string; puuid: string }[];
  matchesWithErrors: { matchId: string; reason: string }[];
}

/**
 * Completa os MatchParticipant faltantes das partidas ja sincronizadas antes
 * da Fase 3 (quando so o jogador rastreado era gravado), reconstruindo os 10
 * participantes a partir do `Match.rawJson` ja salvo desde a Fase 1 - sem
 * nenhuma chamada nova a Riot API. Idempotente: pode ser rodado quantas
 * vezes for preciso (createMany + skipDuplicates no repositorio).
 */
export async function backfillMatchParticipantsFromRawJson(): Promise<BackfillSummary> {
  const matches = await findMatchesMissingParticipants();
  const summary: BackfillSummary = {
    matchesProcessed: 0,
    participantsInserted: 0,
    skippedParticipants: [],
    matchesWithErrors: []
  };

  for (const match of matches) {
    if (!match.rawJson) continue;

    try {
      const rawMatch = match.rawJson as unknown as RiotMatchDto;
      const summaries = mapMatchToSummaries(rawMatch);
      const teams = extractParticipantTeams(rawMatch);

      const participants: ParticipantToPersist[] = summaries.flatMap((summary) => {
        const team = teams.find((entry) => entry.puuid === summary.puuid);
        return team ? [{ summary, teamId: team.teamId }] : [];
      });

      const result = await backfillMatchParticipants(match.id, participants);
      summary.matchesProcessed += 1;
      summary.participantsInserted += participants.length - result.skippedParticipantPuuids.length;
      for (const puuid of result.skippedParticipantPuuids) {
        summary.skippedParticipants.push({ matchId: match.matchId, puuid });
      }
    } catch (error) {
      summary.matchesWithErrors.push({ matchId: match.matchId, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return summary;
}
