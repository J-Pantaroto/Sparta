import {
  calculateKda,
  calculateRecentForm,
  confidenceFromGames,
  normalizeInverse,
  roleBaselines,
  scoreChampionPerformance
} from "../scoring/champion-performance.js";
import { buildRatioSignal, buildScoreSignal, round, type DimensionSignal } from "../scoring/dimension-signals.js";
import type {
  PlayerChampionStats,
  PlayerStrength,
  PlayerWeakness,
  RecentChampionMatch,
  RecentForm
} from "../types/domain.js";
import type { MatchParticipationRecord } from "./player-champion-stats.js";

const PREVIOUS_BLOCK_MIN_GAMES = 3;
const TREND_THRESHOLD_POINTS = 5;

function toRecentChampionMatch(record: MatchParticipationRecord): RecentChampionMatch {
  return {
    matchId: record.matchId,
    championId: record.championId,
    role: record.role,
    won: record.won,
    kills: record.kills,
    deaths: record.deaths,
    assists: record.assists,
    csPerMinute: record.csPerMinute,
    goldPerMinute: record.goldPerMinute,
    damagePerMinute: record.damagePerMinute,
    visionScorePerMinute: record.visionScorePerMinute,
    // calculateRecentForm nao usa kp/objective na formula - coagir null pra 0
    // aqui e inocuo (nao afeta o score, so preenche o formato exigido).
    killParticipation: record.killParticipation ?? 0,
    objectiveParticipation: record.objectiveParticipation ?? 0
  };
}

/**
 * Forma recente do jogador (todos os campeoes/roles), nao por campeao -
 * `history` precisa vir ordenado do mais recente pro mais antigo (mesmo
 * contrato de `aggregatePlayerChampionStats`). Tendencia compara o bloco
 * mais recente (10 partidas) com o bloco imediatamente anterior (10
 * partidas antes dessas) em vez de last10 vs last20, ja que last20 inclui
 * as mesmas 10 partidas de last10 e diluiria a diferenca.
 */
export function computeRecentForm(history: MatchParticipationRecord[]): RecentForm {
  if (history.length === 0) {
    return { last10Score: 50, last20Score: 50, last50Score: 50, trend: "stable", confidence: "low" };
  }

  const matches = history.map(toRecentChampionMatch);
  const last10Score = round(calculateRecentForm(matches.slice(0, 10)));
  const last20Score = round(calculateRecentForm(matches.slice(0, 20)));
  const last50Score = round(calculateRecentForm(matches.slice(0, 50)));

  const blockA = matches.slice(0, 10);
  const blockB = matches.slice(10, 20);
  let trend: RecentForm["trend"] = "stable";
  if (blockB.length >= PREVIOUS_BLOCK_MIN_GAMES) {
    const diff = calculateRecentForm(blockA) - calculateRecentForm(blockB);
    if (diff >= TREND_THRESHOLD_POINTS) trend = "improving";
    else if (diff <= -TREND_THRESHOLD_POINTS) trend = "declining";
  }

  return { last10Score, last20Score, last50Score, trend, confidence: confidenceFromGames(history.length) };
}

interface WeightedItem {
  value: number;
  weight: number;
}

function weightedAverage(items: WeightedItem[]): number | undefined {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return undefined;
  return items.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

const MAX_STRENGTHS = 3;
const MAX_WEAKNESSES = 3;

/**
 * Deriva pontos fortes/fracos do jogador a partir do pool de campeoes
 * elegiveis (mesmo piso de `scoreChampionPerformance`: >=5 partidas). Nao
 * reaproveita `components` (ja clampado e centrado em 75 pras razoes, nao
 * em 50) - em vez disso agrega a razao bruta valor/baseline por campeao,
 * ponderada por jogos, e so entao aplica o corte de sinal diretamente
 * sobre a razao agregada. kp/objective excluem campeoes com o valor
 * exatamente 0, que na agregacao de PlayerChampionStats significa "sem
 * dado" (challenges ausente da Riot em patches antigos), nao "0% real".
 */
export function derivePlayerStrengthsWeaknesses(
  championStats: PlayerChampionStats[]
): { strengths: PlayerStrength[]; weaknesses: PlayerWeakness[] } {
  const eligible = championStats.filter((stats) => scoreChampionPerformance(stats).eligible);
  if (eligible.length === 0) return { strengths: [], weaknesses: [] };

  const totalGames = eligible.reduce((sum, stats) => sum + stats.games, 0);
  const confidence = confidenceFromGames(totalGames);

  const ratioValues: Record<string, number | undefined> = {
    kda: weightedAverage(
      eligible.map((stats) => ({
        value: calculateKda(stats.kills, stats.deaths, stats.assists) / roleBaselines[stats.role].kda,
        weight: stats.games
      }))
    ),
    cs: weightedAverage(
      eligible.map((stats) => ({ value: stats.csPerMinute / roleBaselines[stats.role].cs, weight: stats.games }))
    ),
    damage: weightedAverage(
      eligible.map((stats) => ({ value: stats.damagePerMinute / roleBaselines[stats.role].damage, weight: stats.games }))
    ),
    gold: weightedAverage(
      eligible.map((stats) => ({ value: stats.goldPerMinute / roleBaselines[stats.role].gold, weight: stats.games }))
    ),
    vision: weightedAverage(
      eligible.map((stats) => ({
        value: stats.visionScorePerMinute / roleBaselines[stats.role].vision,
        weight: stats.games
      }))
    ),
    kp: weightedAverage(
      eligible
        .filter((stats) => stats.killParticipation > 0)
        .map((stats) => ({ value: stats.killParticipation / roleBaselines[stats.role].kp, weight: stats.games }))
    ),
    objective: weightedAverage(
      eligible
        .filter((stats) => stats.objectiveParticipation > 0)
        .map((stats) => ({ value: stats.objectiveParticipation / roleBaselines[stats.role].objective, weight: stats.games }))
    )
  };

  const deathsPerGame = weightedAverage(eligible.map((stats) => ({ value: stats.deaths / stats.games, weight: stats.games })));
  const scoreValues: Record<string, number | undefined> = {
    winrate: weightedAverage(eligible.map((stats) => ({ value: (stats.wins / stats.games) * 100, weight: stats.games }))),
    deaths: deathsPerGame === undefined ? undefined : normalizeInverse(deathsPerGame, 7)
  };

  const signals: DimensionSignal[] = [
    ...Object.entries(ratioValues)
      .map(([key, ratio]) => buildRatioSignal(key, ratio))
      .filter((signal): signal is DimensionSignal => signal !== undefined),
    ...Object.entries(scoreValues)
      .map(([key, score]) => buildScoreSignal(key, score))
      .filter((signal): signal is DimensionSignal => signal !== undefined)
  ];

  const strengths: PlayerStrength[] = signals
    .filter((signal) => signal.kind === "strength")
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, MAX_STRENGTHS)
    .map((signal) => ({ code: signal.code, label: signal.label, detail: signal.detail, confidence }));

  const weaknesses: PlayerWeakness[] = signals
    .filter((signal) => signal.kind === "weakness")
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, MAX_WEAKNESSES)
    .map((signal) => ({
      code: signal.code,
      label: signal.label,
      detail: signal.detail,
      severity: signal.severity,
      confidence
    }));

  return { strengths, weaknesses };
}
