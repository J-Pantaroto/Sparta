import type { MatchLoadoutObservation } from "./match-observation.js";
import type { Role } from "./domain.js";

/**
 * Resumo factual de um participante numa partida específica, pros dois times
 * (10 jogadores) - diferente de `MatchSummary`, que é sempre o histórico do
 * jogador rastreado. Nenhum campo é inventado quando ausente do Match-V5;
 * não existe "nível" aqui porque a Riot não persiste esse dado em nenhuma
 * tabela do Sparta (`MatchParticipant` guarda só taxas por minuto).
 */
export interface MatchParticipantSummary {
  puuid: string;
  /**
   * `100`/`200` da Riot. Ausente só em linhas legadas anteriores à Etapa 3
   * (o backfill daquela etapa cobriu o histórico existente na época) -
   * nunca inferido, então uma linha sem time fica fora de qualquer
   * agrupamento visual em vez de cair arbitrariamente num dos dois lados.
   */
  teamId?: number;
  championId: number;
  championName: string;
  /** Posição observada (ver `MatchSummary.role`) - ausente, nunca chutada. */
  role?: Role;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  csPerMinute: number;
  goldPerMinute: number;
  damagePerMinute: number;
  visionScorePerMinute: number;
  killParticipation?: number;
  objectiveParticipation?: number;
  /** Marca a linha do jogador logado dentre os 10 - só um `true` por partida. */
  isTrackedPlayer: boolean;
  /**
   * Itens/runas/feitiços observados, quando extraídos. Ausente pra
   * participantes cuja `MatchObservation` não foi persistida (ex.: conta
   * sem vínculo Sparta) - nunca reconstruído a partir de suposição.
   */
  loadout?: MatchLoadoutObservation;
}

/** Os dois times de uma partida específica, para o detalhe de pós-game. */
export interface MatchParticipantsOverview {
  matchId: string;
  participants: MatchParticipantSummary[];
}
