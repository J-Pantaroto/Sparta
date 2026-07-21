import type { PlayerChampionStats, RecentChampionMatch, Role } from "../types/domain.js";

export interface MatchParticipationRecord {
  matchId: string;
  championId: number;
  role: Role;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  csPerMinute: number;
  goldPerMinute: number;
  damagePerMinute: number;
  visionScorePerMinute: number;
  killParticipation: number | null;
  objectiveParticipation: number | null;
}

const RECENT_MATCHES_LIMIT = 20;

function sum(matches: MatchParticipationRecord[], selector: (match: MatchParticipationRecord) => number): number {
  return matches.reduce((total, match) => total + selector(match), 0);
}

function average(matches: MatchParticipationRecord[], selector: (match: MatchParticipationRecord) => number): number {
  if (matches.length === 0) return 0;
  return sum(matches, selector) / matches.length;
}

/**
 * Media de killParticipation/objectiveParticipation so sobre as partidas
 * que realmente tem o dado (challenges da Riot, ausente em patches
 * antigos) - nao inventa 0 pras que faltam. So cai pra 0 se NENHUMA
 * partida do campeao tiver o dado (caso raro: jogador so jogou esse
 * campeao em patches sem o objeto challenges).
 */
function averageAvailable(matches: MatchParticipationRecord[], selector: (match: MatchParticipationRecord) => number | null): number {
  const available = matches.filter((match) => selector(match) !== null);
  if (available.length === 0) return 0;
  return available.reduce((total, match) => total + (selector(match) as number), 0) / available.length;
}

/**
 * Agrega o historico de partidas de um (championId, role) num
 * PlayerChampionStats. Pura, sem I/O - quem chama (player-stats-repository)
 * decide de onde vem o historico e garante que `matches` esta ordenado do
 * mais recente pro mais antigo (recentMatches[0] precisa ser a partida mais
 * nova, ja que scoreChampionPerformance pondera forma recente por indice).
 */
export function aggregatePlayerChampionStats(
  championId: number,
  championName: string,
  role: Role,
  matches: MatchParticipationRecord[]
): PlayerChampionStats {
  const recentMatches: RecentChampionMatch[] = matches.slice(0, RECENT_MATCHES_LIMIT).map((match) => ({
    matchId: match.matchId,
    championId: match.championId,
    role: match.role,
    won: match.won,
    kills: match.kills,
    deaths: match.deaths,
    assists: match.assists,
    csPerMinute: match.csPerMinute,
    goldPerMinute: match.goldPerMinute,
    damagePerMinute: match.damagePerMinute,
    visionScorePerMinute: match.visionScorePerMinute,
    killParticipation: match.killParticipation ?? 0,
    objectiveParticipation: match.objectiveParticipation ?? 0
  }));

  return {
    championId,
    championName,
    role,
    games: matches.length,
    wins: matches.filter((match) => match.won).length,
    kills: sum(matches, (match) => match.kills),
    deaths: sum(matches, (match) => match.deaths),
    assists: sum(matches, (match) => match.assists),
    csPerMinute: average(matches, (match) => match.csPerMinute),
    goldPerMinute: average(matches, (match) => match.goldPerMinute),
    damagePerMinute: average(matches, (match) => match.damagePerMinute),
    visionScorePerMinute: average(matches, (match) => match.visionScorePerMinute),
    killParticipation: averageAvailable(matches, (match) => match.killParticipation),
    objectiveParticipation: averageAvailable(matches, (match) => match.objectiveParticipation),
    recentMatches
  };
}
