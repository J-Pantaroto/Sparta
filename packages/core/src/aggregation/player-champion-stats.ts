import type { PlayerChampionStats, RecentChampionMatch, Role, StatCoverage } from "../types/domain.js";
import { availableCoverage, partialCoverage, unavailableCoverage } from "../types/stat-coverage.js";

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

/**
 * Média dos campos que **toda** partida tem (CS, ouro, dano, visão). Só é
 * chamada com a coleção não vazia - `aggregatePlayerChampionStats` devolve
 * `null` antes de chegar aqui quando não há partida nenhuma, em vez de
 * produzir uma média 0 que ninguém conseguiria distinguir de desempenho
 * zerado real.
 */
function average(matches: MatchParticipationRecord[], selector: (match: MatchParticipationRecord) => number): number {
  return sum(matches, selector) / matches.length;
}

interface PartialAverage {
  value: number | null;
  coverage: StatCoverage;
}

/**
 * Média sobre as partidas que realmente têm o dado, com a cobertura
 * declarada junto.
 *
 * O denominador é a quantidade de observações **válidas**, não o total de
 * partidas: dividir pelo total diluiria o valor proporcionalmente ao
 * tanto de dado que falta, o que é uma forma silenciosa de tratar ausência
 * como zero. Sem nenhuma observação válida o resultado é `null` - antes da
 * Etapa 4 era `0`, e esse `0` chegava ao score como participação zero
 * medida.
 */
function averageAvailable(
  matches: MatchParticipationRecord[],
  selector: (match: MatchParticipationRecord) => number | null,
  unavailableReason: string
): PartialAverage {
  const available = matches
    .map(selector)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const sampleSize = matches.length;

  if (available.length === 0) {
    return { value: null, coverage: unavailableCoverage(sampleSize, unavailableReason) };
  }

  const value = available.reduce((total, entry) => total + entry, 0) / available.length;
  const coverage =
    available.length < sampleSize ? partialCoverage(sampleSize, available.length) : availableCoverage(sampleSize);

  return { value, coverage };
}

const KILL_PARTICIPATION_UNAVAILABLE =
  "Nenhuma das partidas traz participação em abates (a Riot não envia `challenges` em patches antigos).";
const OBJECTIVE_PARTICIPATION_UNAVAILABLE =
  "O Sparta ainda não extrai participação em objetivos de nenhuma fonte.";

/**
 * Agrega o historico de partidas de um (championId, role) num
 * PlayerChampionStats. Pura, sem I/O - quem chama (player-stats-repository)
 * decide de onde vem o historico e garante que `matches` esta ordenado do
 * mais recente pro mais antigo (recentMatches[0] precisa ser a partida mais
 * nova, ja que scoreChampionPerformance pondera forma recente por indice).
 *
 * Devolve `null` sem nenhuma partida: agregação sem observação não é um
 * agregado com valores zerados, é a ausência de agregado.
 */
export function aggregatePlayerChampionStats(
  championId: number,
  championName: string,
  role: Role,
  matches: MatchParticipationRecord[]
): PlayerChampionStats | null {
  if (matches.length === 0) return null;

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
    killParticipation: match.killParticipation,
    objectiveParticipation: match.objectiveParticipation
  }));

  const killParticipation = averageAvailable(
    matches,
    (match) => match.killParticipation,
    KILL_PARTICIPATION_UNAVAILABLE
  );
  const objectiveParticipation = averageAvailable(
    matches,
    (match) => match.objectiveParticipation,
    OBJECTIVE_PARTICIPATION_UNAVAILABLE
  );

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
    killParticipation: killParticipation.value,
    objectiveParticipation: objectiveParticipation.value,
    coverage: {
      killParticipation: killParticipation.coverage,
      objectiveParticipation: objectiveParticipation.coverage
    },
    recentMatches
  };
}
