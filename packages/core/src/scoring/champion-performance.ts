import type { Confidence, PlayerChampionStats, RecentChampionMatch, Role } from "../types/domain.js";

export interface ChampionPerformanceScore {
  championId: number;
  championName: string;
  role: Role;
  score: number;
  confidence: Confidence;
  eligible: boolean;
  games: number;
  components: Record<string, number>;
}

const roleBaselines: Record<Role, Record<string, number>> = {
  TOP: { kda: 3.2, cs: 7.5, damage: 700, gold: 420, vision: 0.8, kp: 0.5, objective: 0.35 },
  JUNGLE: { kda: 3.5, cs: 5.8, damage: 560, gold: 390, vision: 1.0, kp: 0.62, objective: 0.62 },
  MID: { kda: 3.4, cs: 7.7, damage: 760, gold: 430, vision: 0.85, kp: 0.56, objective: 0.38 },
  ADC: { kda: 3.2, cs: 8.2, damage: 780, gold: 440, vision: 0.7, kp: 0.58, objective: 0.42 },
  SUPPORT: { kda: 3.1, cs: 1.2, damage: 360, gold: 270, vision: 2.2, kp: 0.64, objective: 0.5 }
};

const weights: Record<Role, Record<string, number>> = {
  TOP: { kda: 0.2, winrate: 0.15, cs: 0.15, damage: 0.15, gold: 0.1, deaths: 0.1, recent: 0.1, vision: 0.05 },
  MID: { kda: 0.2, winrate: 0.15, cs: 0.15, damage: 0.15, gold: 0.1, deaths: 0.1, recent: 0.1, vision: 0.05 },
  ADC: { kda: 0.2, winrate: 0.15, cs: 0.15, damage: 0.15, gold: 0.1, deaths: 0.1, recent: 0.1, vision: 0.05 },
  JUNGLE: { kda: 0.15, winrate: 0.15, kp: 0.15, objective: 0.15, gold: 0.1, damage: 0.1, deaths: 0.1, recent: 0.1 },
  SUPPORT: { kp: 0.2, vision: 0.2, deaths: 0.15, objective: 0.15, kda: 0.1, winrate: 0.1, recent: 0.1 }
};

export function calculateKda(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(1, deaths);
}

export function recencyWeight(index: number, decayFactor = 8): number {
  return Math.exp(-index / decayFactor);
}

export function calculateRecentForm(matches: RecentChampionMatch[], decayFactor = 8): number {
  if (matches.length === 0) return 50;

  let weightedTotal = 0;
  let weightSum = 0;

  matches.forEach((match, index) => {
    const kda = calculateKda(match.kills, match.deaths, match.assists);
    const baseline = roleBaselines[match.role];
    const matchScore =
      normalizeRatio(kda, baseline.kda) * 0.25 +
      (match.won ? 100 : 35) * 0.2 +
      normalizeRatio(match.csPerMinute, baseline.cs) * 0.15 +
      normalizeRatio(match.damagePerMinute, baseline.damage) * 0.15 +
      normalizeRatio(match.goldPerMinute, baseline.gold) * 0.1 +
      normalizeInverse(match.deaths, 8) * 0.1 +
      normalizeRatio(match.visionScorePerMinute, baseline.vision) * 0.05;
    const weight = recencyWeight(index, decayFactor);
    weightedTotal += matchScore * weight;
    weightSum += weight;
  });

  return clamp(weightedTotal / weightSum);
}

export function scoreChampionPerformance(stats: PlayerChampionStats): ChampionPerformanceScore {
  const games = stats.games;
  const eligible = games >= 5;
  const kda = calculateKda(stats.kills, stats.deaths, stats.assists);
  const deathsPerGame = stats.deaths / Math.max(1, games);
  const winrate = stats.wins / Math.max(1, games);
  const baseline = roleBaselines[stats.role];
  const recent = calculateRecentForm(stats.recentMatches);

  const components: Record<string, number> = {
    kda: normalizeRatio(kda, baseline.kda),
    winrate: clamp(winrate * 100),
    cs: normalizeRatio(stats.csPerMinute, baseline.cs),
    damage: normalizeRatio(stats.damagePerMinute, baseline.damage),
    gold: normalizeRatio(stats.goldPerMinute, baseline.gold),
    deaths: normalizeInverse(deathsPerGame, 7),
    vision: normalizeRatio(stats.visionScorePerMinute, baseline.vision),
    kp: normalizeRatio(stats.killParticipation, baseline.kp),
    objective: normalizeRatio(stats.objectiveParticipation, baseline.objective),
    recent
  };

  const roleWeights = weights[stats.role];
  const rawScore = Object.entries(roleWeights).reduce((sum, [key, weight]) => {
    return sum + (components[key] ?? 50) * weight;
  }, 0);

  return {
    championId: stats.championId,
    championName: stats.championName,
    role: stats.role,
    score: eligible ? round(clamp(rawScore)) : 0,
    confidence: confidenceFromGames(games),
    eligible,
    games,
    components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(value)]))
  };
}

export function rankChampionPool(stats: PlayerChampionStats[]): ChampionPerformanceScore[] {
  return stats
    .map(scoreChampionPerformance)
    .filter((score) => score.eligible)
    .sort((a, b) => b.score - a.score);
}

function confidenceFromGames(games: number): Confidence {
  if (games >= 20) return "high";
  if (games >= 8) return "medium";
  return "low";
}

function normalizeRatio(value: number, expected: number): number {
  if (expected <= 0) return 50;
  return clamp((value / expected) * 75);
}

function normalizeInverse(value: number, badValue: number): number {
  return clamp(100 - (value / badValue) * 100);
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
