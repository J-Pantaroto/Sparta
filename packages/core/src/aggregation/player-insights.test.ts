import { describe, expect, it } from "vitest";
import { computeRecentForm, derivePlayerStrengthsWeaknesses } from "./player-insights.js";
import type { MatchParticipationRecord } from "./player-champion-stats.js";
import type { PlayerChampionStats, Role } from "../types/domain.js";

function buildMatch(index: number, overrides: Partial<MatchParticipationRecord> = {}): MatchParticipationRecord {
  return {
    matchId: `match-${index}`,
    championId: 61,
    role: "MID",
    won: true,
    kills: 6,
    deaths: 3,
    assists: 6,
    csPerMinute: 7.7,
    goldPerMinute: 430,
    damagePerMinute: 760,
    visionScorePerMinute: 0.85,
    killParticipation: 0.56,
    objectiveParticipation: 0.38,
    ...overrides
  };
}

function goodMatch(index: number): MatchParticipationRecord {
  return buildMatch(index, {
    won: true,
    kills: 9,
    deaths: 1,
    assists: 9,
    csPerMinute: 10,
    goldPerMinute: 520,
    damagePerMinute: 950,
    visionScorePerMinute: 1.1
  });
}

function badMatch(index: number): MatchParticipationRecord {
  return buildMatch(index, {
    won: false,
    kills: 1,
    deaths: 8,
    assists: 1,
    csPerMinute: 4,
    goldPerMinute: 260,
    damagePerMinute: 320,
    visionScorePerMinute: 0.3
  });
}

describe("computeRecentForm", () => {
  it("returns neutral defaults and low confidence for an empty history", () => {
    const result = computeRecentForm([]);
    expect(result).toEqual({ last10Score: 50, last20Score: 50, last50Score: 50, trend: "stable", confidence: "low" });
  });

  it("reports low/medium/high confidence at the 8 and 20 game boundaries", () => {
    const sevenGames = Array.from({ length: 7 }, (_, i) => buildMatch(i));
    const eightGames = Array.from({ length: 8 }, (_, i) => buildMatch(i));
    const twentyGames = Array.from({ length: 20 }, (_, i) => buildMatch(i));

    expect(computeRecentForm(sevenGames).confidence).toBe("low");
    expect(computeRecentForm(eightGames).confidence).toBe("medium");
    expect(computeRecentForm(twentyGames).confidence).toBe("high");
  });

  it("detects an improving trend when the most recent 10 games are clearly better than the previous 10", () => {
    const history = [
      ...Array.from({ length: 10 }, (_, i) => goodMatch(i)),
      ...Array.from({ length: 10 }, (_, i) => badMatch(i + 10))
    ];
    expect(computeRecentForm(history).trend).toBe("improving");
  });

  it("detects a declining trend when the most recent 10 games are clearly worse than the previous 10", () => {
    const history = [
      ...Array.from({ length: 10 }, (_, i) => badMatch(i)),
      ...Array.from({ length: 10 }, (_, i) => goodMatch(i + 10))
    ];
    expect(computeRecentForm(history).trend).toBe("declining");
  });

  it("falls back to stable when the previous block has fewer than 3 games, even with a big swing", () => {
    const history = [
      ...Array.from({ length: 10 }, (_, i) => goodMatch(i)),
      ...Array.from({ length: 2 }, (_, i) => badMatch(i + 10))
    ];
    expect(computeRecentForm(history).trend).toBe("stable");
  });
});

function buildStats(role: Role, overrides: Partial<PlayerChampionStats> = {}): PlayerChampionStats {
  return {
    championId: 61,
    championName: "Orianna",
    role,
    games: 20,
    wins: 10,
    kills: 68,
    deaths: 60,
    assists: 68,
    csPerMinute: role === "SUPPORT" ? 1.2 : 7.7,
    goldPerMinute: role === "SUPPORT" ? 270 : 430,
    damagePerMinute: role === "SUPPORT" ? 360 : 760,
    visionScorePerMinute: role === "SUPPORT" ? 2.2 : 0.85,
    killParticipation: role === "SUPPORT" ? 0.64 : 0.56,
    objectiveParticipation: role === "SUPPORT" ? 0.5 : 0.38,
    recentMatches: [],
    ...overrides
  };
}

describe("derivePlayerStrengthsWeaknesses", () => {
  it("returns empty arrays when no champion has enough games", () => {
    const result = derivePlayerStrengthsWeaknesses([buildStats("MID", { games: 3, wins: 2 })]);
    expect(result).toEqual({ strengths: [], weaknesses: [] });
  });

  it("flags strengths for a champion pool performing well above baseline, capped at 3", () => {
    const stats = buildStats("MID", {
      games: 20,
      wins: 15,
      kills: 200,
      deaths: 20,
      assists: 200,
      csPerMinute: 12,
      goldPerMinute: 600,
      damagePerMinute: 1200,
      visionScorePerMinute: 1.5,
      killParticipation: 0.7,
      objectiveParticipation: 0.5
    });
    const result = derivePlayerStrengthsWeaknesses([stats]);
    expect(result.strengths.length).toBeLessThanOrEqual(3);
    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.weaknesses).toEqual([]);
    for (const strength of result.strengths) {
      expect(strength.confidence).toBe("high");
    }
  });

  it("flags weaknesses (with severity) for a champion pool performing well below baseline", () => {
    const stats = buildStats("MID", {
      games: 20,
      wins: 4,
      kills: 20,
      deaths: 140,
      assists: 20,
      csPerMinute: 3,
      goldPerMinute: 250,
      damagePerMinute: 300,
      visionScorePerMinute: 0.3,
      killParticipation: 0.2,
      objectiveParticipation: 0.1
    });
    const result = derivePlayerStrengthsWeaknesses([stats]);
    expect(result.weaknesses.length).toBeGreaterThan(0);
    expect(result.weaknesses.some((weakness) => weakness.code === "morre_demais")).toBe(true);
    for (const weakness of result.weaknesses) {
      expect(["low", "medium", "high"]).toContain(weakness.severity);
    }
  });

  it("does not flag cs as a weakness for a support-only player playing at the support baseline", () => {
    const stats = buildStats("SUPPORT");
    const result = derivePlayerStrengthsWeaknesses([stats]);
    const codes = [...result.strengths, ...result.weaknesses].map((signal) => signal.code);
    expect(codes).not.toContain("farm_abaixo");
    expect(codes).not.toContain("farm_consistente");
  });

  it("excludes kill participation / objective participation when the value is exactly 0 (missing Riot challenges data)", () => {
    const withoutChallenges = buildStats("MID", { killParticipation: 0, objectiveParticipation: 0 });
    const result = derivePlayerStrengthsWeaknesses([withoutChallenges]);
    const codes = [...result.strengths, ...result.weaknesses].map((signal) => signal.code);
    expect(codes).not.toContain("boa_participacao_abates");
    expect(codes).not.toContain("baixa_participacao_abates");
    expect(codes).not.toContain("contribui_objetivos");
    expect(codes).not.toContain("baixa_contribuicao_objetivos");
  });

  it("does not let a zero-kp champion drag down the weighted average of a champion with real kp data", () => {
    const withData = buildStats("MID", { championId: 61, killParticipation: 0.8, games: 20 });
    const withoutData = buildStats("MID", { championId: 157, championName: "Yasuo", killParticipation: 0, games: 20 });
    const result = derivePlayerStrengthsWeaknesses([withData, withoutData]);
    expect(result.strengths.some((strength) => strength.code === "boa_participacao_abates")).toBe(true);
  });
});
