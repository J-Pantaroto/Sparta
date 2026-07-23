import { describe, expect, it } from "vitest";
import {
  calculateKda,
  calculateRecentForm,
  DEATHS_BAD_VALUE,
  recencyWeight,
  roleBaselines,
  scoreChampionPerformance,
  weights
} from "./champion-performance.js";
import type { PlayerChampionStats, RecentChampionMatch, Role } from "../types/domain.js";

const baseStats: PlayerChampionStats = {
  championId: 61,
  championName: "Orianna",
  role: "MID",
  games: 6,
  wins: 4,
  kills: 42,
  deaths: 18,
  assists: 55,
  csPerMinute: 8,
  goldPerMinute: 430,
  damagePerMinute: 780,
  visionScorePerMinute: 0.9,
  killParticipation: 0.62,
  objectiveParticipation: 0.42,
  recentMatches: []
};

describe("champion performance score", () => {
  it("calculates KDA without division by zero", () => {
    expect(calculateKda(10, 0, 5)).toBe(15);
  });

  it("weights recent matches more than older matches", () => {
    expect(recencyWeight(0)).toBeGreaterThan(recencyWeight(8));
  });

  it("allows a strong 6-game champion to score while keeping medium or low confidence", () => {
    const result = scoreChampionPerformance(baseStats);
    expect(result.eligible).toBe(true);
    expect(result.score).toBeGreaterThan(60);
    expect(result.confidence).toBe("low");
  });

  it("does not reward volume directly", () => {
    const lowImpact = scoreChampionPerformance({
      ...baseStats,
      championId: 157,
      championName: "Yasuo",
      games: 60,
      wins: 27,
      kills: 160,
      deaths: 260,
      assists: 190,
      csPerMinute: 6,
      damagePerMinute: 520
    });
    const highImpact = scoreChampionPerformance(baseStats);
    expect(highImpact.score).toBeGreaterThan(lowImpact.score);
    expect(lowImpact.confidence).toBe("high");
  });

  it("has weights summing to 1.0 per role (invariante estrutural)", () => {
    for (const role of Object.keys(weights) as Role[]) {
      const total = Object.values(weights[role]).reduce((sum, weight) => sum + weight, 0);
      expect(total).toBeCloseTo(1.0, 5);
    }
  });

  it("gives recencyWeight(8) ~= 1/e, pinning the ~8-game half-life", () => {
    expect(recencyWeight(8)).toBeCloseTo(Math.exp(-1), 5);
  });

  it("uses the same DEATHS_BAD_VALUE in scoreChampionPerformance and calculateRecentForm", () => {
    const statsAtBadValue: PlayerChampionStats = {
      ...baseStats,
      deaths: DEATHS_BAD_VALUE * baseStats.games
    };
    expect(scoreChampionPerformance(statsAtBadValue).components.deaths).toBe(0);

    // kills/assists zerados pra isolar o componente de mortes do componente
    // de kda (que tambem depende de deaths) - assim a unica variavel entre
    // os dois matches abaixo e o proprio valor de mortes.
    const perfectMatch: RecentChampionMatch = {
      matchId: "isolated-deaths-1",
      championId: 1,
      role: "MID",
      won: true,
      kills: 0,
      deaths: 0,
      assists: 0,
      csPerMinute: roleBaselines.MID.cs,
      goldPerMinute: roleBaselines.MID.gold,
      damagePerMinute: roleBaselines.MID.damage,
      visionScorePerMinute: roleBaselines.MID.vision,
      killParticipation: roleBaselines.MID.kp,
      objectiveParticipation: roleBaselines.MID.objective
    };

    const scoreWithNoDeaths = calculateRecentForm([perfectMatch]);
    const scoreWithBadDeaths = calculateRecentForm([{ ...perfectMatch, deaths: DEATHS_BAD_VALUE }]);

    // Peso do componente de mortes em calculateRecentForm e 0.1; normalizeInverse
    // vai de 100 (0 mortes) a 0 (DEATHS_BAD_VALUE mortes) - a diferenca esperada
    // e exatamente 0.1 * 100 = 10 pontos, provando que calculateRecentForm usa
    // o mesmo DEATHS_BAD_VALUE que scoreChampionPerformance/normalizeInverse.
    expect(scoreWithNoDeaths - scoreWithBadDeaths).toBeCloseTo(10, 5);
  });
});
