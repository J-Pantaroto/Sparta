import { describe, expect, it } from "vitest";
import type { PlayerProfileMatchInput } from "./player-profile-overview.js";
import { buildPlayerProfileAnalytics } from "./player-profile-overview.js";

function match(overrides: Partial<PlayerProfileMatchInput> = {}): PlayerProfileMatchInput {
  return {
    matchId: "BR1_1",
    championId: 234,
    championName: "Viego",
    role: "JUNGLE",
    won: true,
    kills: 5,
    deaths: 2,
    assists: 7,
    csPerMinute: 5.5,
    goldPerMinute: 390,
    damagePerMinute: 560,
    visionScorePerMinute: 1,
    killParticipation: 0.6,
    objectiveParticipation: 0.5,
    observedAt: "2026-08-05T12:00:00.000Z",
    ...overrides
  };
}

describe("perfil analítico do jogador", () => {
  it("mantém métricas indisponíveis quando não há partidas", () => {
    const overview = buildPlayerProfileAnalytics([]);

    expect(overview.recentPerformance.sampleSize).toBe(0);
    expect(overview.recentPerformance.winRate).toBeNull();
    expect(overview.recentPerformance.metrics.every((metric) => metric.value === null)).toBe(true);
    expect(overview.performanceTrend).toEqual([]);
    expect(overview.topChampions).toEqual([]);
    expect(overview.roleProfile.primaryRole).toBeNull();
  });

  it("preserva participação zero observada em vez de torná-la ausente", () => {
    const overview = buildPlayerProfileAnalytics([
      match({ killParticipation: 0, objectiveParticipation: 0 })
    ]);

    expect(
      overview.recentPerformance.metrics.find((entry) => entry.key === "OBJECTIVES")
    ).toMatchObject({
      value: 0,
      status: "AVAILABLE",
      availableSampleSize: 1
    });
    expect(
      overview.recentPerformance.metrics.find((entry) => entry.key === "TEAM_IMPACT")
    ).toMatchObject({
      value: 0,
      status: "AVAILABLE"
    });
  });

  it("separa cobertura parcial de participação em objetivos", () => {
    const overview = buildPlayerProfileAnalytics([
      match(),
      match({ matchId: "BR1_2", objectiveParticipation: null })
    ]);

    expect(
      overview.recentPerformance.metrics.find((entry) => entry.key === "OBJECTIVES")
    ).toMatchObject({
      status: "PARTIAL",
      sampleSize: 2,
      availableSampleSize: 1,
      coverage: 0.5
    });
  });

  it("ordena campeões por partidas e marca amostra pequena", () => {
    const overview = buildPlayerProfileAnalytics([
      match({ matchId: "1", championId: 61, championName: "Orianna", role: "MID" }),
      match({ matchId: "2", championId: 61, championName: "Orianna", role: "MID" }),
      match({ matchId: "3", championId: 234, championName: "Viego" })
    ]);

    expect(overview.topChampions.map((entry) => entry.championName)).toEqual(["Orianna", "Viego"]);
    expect(overview.topChampions[0]).toMatchObject({ games: 2, sampleStatus: "SMALL" });
    expect(overview.roleProfile.primaryRole).toBe("MID");
  });

  it("ordena a tendência pelo instante real sem criar pontos para data ausente", () => {
    const overview = buildPlayerProfileAnalytics([
      match({ matchId: "new", observedAt: "2026-08-06T12:00:00.000Z" }),
      match({ matchId: "missing", observedAt: undefined }),
      match({ matchId: "old", observedAt: "2026-08-01T12:00:00.000Z" })
    ]);

    expect(overview.performanceTrend.map((entry) => entry.matchId)).toEqual(["old", "new"]);
  });

  it("produz insights somente quando a amostra por campeão é elegível", () => {
    const small = buildPlayerProfileAnalytics([match()]);
    const eligible = buildPlayerProfileAnalytics(
      Array.from({ length: 5 }, (_, index) =>
        match({
          matchId: `BR1_${index}`,
          kills: 12,
          deaths: 1,
          assists: 10,
          observedAt: `2026-08-0${index + 1}T12:00:00.000Z`
        })
      )
    );

    expect(small.strengths).toEqual([]);
    expect(small.improvementAreas).toEqual([]);
    expect(eligible.strengths.length).toBeGreaterThan(0);
    expect(eligible.strengths[0]).toMatchObject({
      sampleSize: 5,
      ruleVersion: "player-profile-overview/1.0.0"
    });
  });
});
