import type { Prisma } from "@prisma/client";
import {
  RiotApiError,
  extractParticipantTeams,
  mapMatchToSummaries,
  mapTimelineToSummary,
  type RiotMatchDto,
  type RiotMatchTimelineDto
} from "@sparta/riot";
import { getRiotApiClient } from "../riot-integration/client-factory";
import { findExistingMatchIds, persistMatch } from "../matches/match-repository";

export interface SyncFailure {
  matchId: string;
  reason: string;
}

export interface SyncResult {
  requested: number;
  imported: number;
  skippedExisting: number;
  failed: SyncFailure[];
  stoppedEarly?: "rate_limited" | "max_reached";
}

const DEFAULT_MAX_NEW_MATCHES = 20;
const MAX_NEW_MATCHES_CEILING = 50;
const MATCH_ID_WINDOW = 20;

export interface SyncablePlayer {
  riotAccountId: string;
  puuid: string;
  platformRegion: string;
}

/**
 * Sincroniza as partidas novas de um jogador: busca os IDs mais recentes na
 * Riot, filtra os que ja estao persistidos (Match.matchId e unico), e busca
 * detalhe+timeline so dos novos, ate um teto por chamada. Chamadas
 * sequenciais (nao paralelas) pra nao estourar rate limit de uma chave de
 * dev. Falha em uma partida especifica (ex.: campeao novo sem catalogo
 * sincronizado) nao aborta o resto - so um 429 esgotado para o sync inteiro,
 * ja que continuar batendo na Riot so pioraria o rate limit.
 */
export async function syncPlayerMatches(player: SyncablePlayer, opts?: { maxNewMatches?: number }): Promise<SyncResult> {
  const maxNewMatches = Math.min(opts?.maxNewMatches ?? DEFAULT_MAX_NEW_MATCHES, MAX_NEW_MATCHES_CEILING);
  const client = getRiotApiClient();

  const matchIds = await client.getMatchIdsByPuuid(player.puuid, MATCH_ID_WINDOW);
  const existing = await findExistingMatchIds(matchIds);
  const newIds = matchIds.filter((id) => !existing.has(id));
  const idsToProcess = newIds.slice(0, maxNewMatches);

  const result: SyncResult = {
    requested: matchIds.length,
    imported: 0,
    skippedExisting: existing.size,
    failed: []
  };

  for (const matchId of idsToProcess) {
    try {
      const rawMatch = (await client.getMatch(matchId)) as RiotMatchDto;
      const rawTimeline = (await client.getMatchTimeline(matchId)) as RiotMatchTimelineDto;

      const teams = extractParticipantTeams(rawMatch);
      const participantTeam = teams.find((team) => team.puuid === player.puuid);
      const summary = mapMatchToSummaries(rawMatch).find((entry) => entry.puuid === player.puuid);

      if (!participantTeam || !summary) {
        result.failed.push({ matchId, reason: "Puuid do jogador nao encontrado entre os participantes da partida." });
        continue;
      }

      const timeline = mapTimelineToSummary(rawTimeline, participantTeam.participantId, teams);

      await persistMatch({
        riotAccountId: player.riotAccountId,
        platform: player.platformRegion,
        summary,
        timeline,
        rawMatch: rawMatch as unknown as Prisma.InputJsonValue
      });

      result.imported += 1;
    } catch (error) {
      if (error instanceof RiotApiError && error.status === 429) {
        result.failed.push({ matchId, reason: "Rate limit da Riot atingido durante o sync." });
        result.stoppedEarly = "rate_limited";
        break;
      }
      result.failed.push({ matchId, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  if (!result.stoppedEarly && newIds.length > idsToProcess.length) {
    result.stoppedEarly = "max_reached";
  }

  return result;
}
