import type { Prisma } from "@prisma/client";
import {
  RiotApiError,
  extractParticipantTeams,
  mapMatchToSummaries,
  mapTimelineToSummary,
  type RiotMatchDto,
  type RiotMatchTimelineDto
} from "@sparta/riot";
import { getRiotApiClient } from "../riot-integration/client-factory.js";
import { findExistingMatchIds, persistMatch, type ParticipantToPersist } from "../matches/match-repository.js";
import {
  computeAndPersistPlayerInsights,
  findMatchAnalysisLimitByPuuid,
  recomputeChampionStats,
  type ChampionRolePair
} from "../players/player-stats-repository.js";

export interface SyncFailure {
  matchId: string;
  reason: string;
}

export interface SkippedParticipant {
  matchId: string;
  puuid: string;
}

export interface SyncResult {
  requested: number;
  imported: number;
  skippedExisting: number;
  failed: SyncFailure[];
  skippedParticipants: SkippedParticipant[];
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
export async function syncPlayerMatches(
  player: SyncablePlayer,
  opts?: { maxNewMatches?: number; onInsightsFailed?: (error: unknown) => void }
): Promise<SyncResult> {
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
    failed: [],
    skippedParticipants: []
  };
  const touchedPairs: ChampionRolePair[] = [];

  for (const matchId of idsToProcess) {
    try {
      const rawMatch = (await client.getMatch(matchId)) as RiotMatchDto;
      const rawTimeline = (await client.getMatchTimeline(matchId)) as RiotMatchTimelineDto;

      const teams = extractParticipantTeams(rawMatch);
      const participantTeam = teams.find((team) => team.puuid === player.puuid);
      const summaries = mapMatchToSummaries(rawMatch);
      const summary = summaries.find((entry) => entry.puuid === player.puuid);

      if (!participantTeam || !summary) {
        result.failed.push({ matchId, reason: "Puuid do jogador nao encontrado entre os participantes da partida." });
        continue;
      }

      const timeline = mapTimelineToSummary(rawTimeline, participantTeam.participantId, teams);

      // Zipa os 10 MatchSummary com o teamId correspondente (mesmo puuid) -
      // participante sem par nos dois lados (nao deveria acontecer, mas a
      // Riot as vezes tem inconsistencias) fica de fora em vez de gravar
      // dado incompleto/inventado.
      const participants: ParticipantToPersist[] = summaries.flatMap((entrySummary) => {
        const team = teams.find((entry) => entry.puuid === entrySummary.puuid);
        return team ? [{ summary: entrySummary, teamId: team.teamId }] : [];
      });

      const persistResult = await persistMatch({
        platform: player.platformRegion,
        trackedPuuid: player.puuid,
        participants,
        timeline,
        rawMatch: rawMatch as unknown as Prisma.InputJsonValue
      });

      for (const puuid of persistResult.skippedParticipantPuuids) {
        result.skippedParticipants.push({ matchId, puuid });
      }

      touchedPairs.push({ championId: summary.championId, role: summary.role });
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

  // Configuracao pessoal "quantas partidas analisar" (Fase 6b) - limita o
  // historico usado pra recalcular stats/insights, nao o quanto e buscado
  // da Riot (isso continua governado por maxNewMatches/rate limit acima).
  const matchAnalysisLimit = await findMatchAnalysisLimitByPuuid(player.puuid);

  await recomputeChampionStats(player.riotAccountId, player.puuid, touchedPairs, matchAnalysisLimit);

  // Strengths/weaknesses/recentForm dependem do historico inteiro do
  // jogador (nao so das partidas novas) - so vale recalcular quando essa
  // rodada de fato trouxe partida nova, senao seria reler/reescrever o
  // historico inteiro em toda chamada repetida de sync sem ganho nenhum.
  // Falha aqui nao deve derrubar um sync de partidas que ja funcionou.
  if (touchedPairs.length > 0) {
    try {
      await computeAndPersistPlayerInsights(player.riotAccountId, player.puuid, matchAnalysisLimit);
    } catch (error) {
      opts?.onInsightsFailed?.(error);
    }
  }

  return result;
}
