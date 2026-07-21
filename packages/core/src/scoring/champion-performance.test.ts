import { describe, expect, it } from "vitest";
import { calculateKda, recencyWeight, scoreChampionPerformance } from "./champion-performance.js";
import type { PlayerChampionStats } from "../types/domain.js";

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
});
