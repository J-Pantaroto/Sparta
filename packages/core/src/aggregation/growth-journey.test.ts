import { describe, expect, it } from "vitest";
import { computeGrowthJourney, computeWeaknessTrends } from "./growth-journey.js";
import type { PlayerWeakness, PostGameAnalysis } from "../types/domain.js";

function weakness(code: string): PlayerWeakness {
  return { code, label: `Label ${code}`, detail: "detail", severity: "medium", confidence: "low" };
}

function report(codes: string[]): PostGameAnalysis {
  return {
    matchId: "m",
    expectedPlan: "plan",
    executionSummary: "summary",
    pickAssessment: "assessment",
    strengths: [],
    weaknesses: codes.map(weakness),
    tips: [],
    metrics: {
      kills: 5,
      deaths: 5,
      assists: 5,
      csPerMinute: 6,
      goldPerMinute: 400,
      damagePerMinute: 500,
      visionScorePerMinute: 1
    }
  };
}

function reports(count: number, codes: string[]): PostGameAnalysis[] {
  return Array.from({ length: count }, () => report(codes));
}

describe("computeWeaknessTrends", () => {
  it("retorna vazio sem relatorios", () => {
    expect(computeWeaknessTrends([])).toEqual([]);
  });

  it("marca stable/low quando blockA nao atinge o piso minimo", () => {
    const history = reports(2, ["morre_demais"]);
    const trends = computeWeaknessTrends(history);
    expect(trends).toHaveLength(1);
    expect(trends[0].trend).toBe("stable");
    expect(trends[0].confidence).toBe("low");
    expect(trends[0].hasComparison).toBe(false);
  });

  it("marca stable quando blockB nao atinge o piso minimo, mesmo com confidence mais alta", () => {
    const history = [...reports(10, ["morre_demais"]), ...reports(2, ["morre_demais"])];
    const trends = computeWeaknessTrends(history);
    expect(trends[0].trend).toBe("stable");
    expect(trends[0].confidence).toBe("medium");
    expect(trends[0].hasComparison).toBe(false);
  });

  it("marca resolved quando o codigo sai completamente do bloco recente", () => {
    const history = [...reports(10, []), ...reports(10, ["morre_demais"])];
    const trends = computeWeaknessTrends(history);
    const trend = trends.find((t) => t.code === "morre_demais");
    expect(trend?.trend).toBe("resolved");
    expect(trend?.recentRate).toBe(0);
    expect(trend?.previousRate).toBe(100);
  });

  it("marca new quando o codigo so aparece no bloco recente", () => {
    const history = [...reports(10, ["farm_abaixo"]), ...reports(10, [])];
    const trends = computeWeaknessTrends(history);
    const trend = trends.find((t) => t.code === "farm_abaixo");
    expect(trend?.trend).toBe("new");
    expect(trend?.recentRate).toBe(100);
    expect(trend?.previousRate).toBe(0);
  });

  it("marca improving quando a taxa cai o suficiente sem zerar", () => {
    const blockA = [...reports(6, []), ...reports(4, ["morre_demais"])]; // 40% recente
    const blockB = [...reports(1, []), ...reports(9, ["morre_demais"])]; // 90% anterior
    const trends = computeWeaknessTrends([...blockA, ...blockB]);
    const trend = trends.find((t) => t.code === "morre_demais");
    expect(trend?.trend).toBe("improving");
  });

  it("marca worsening quando a taxa sobe o suficiente", () => {
    const blockA = [...reports(1, []), ...reports(9, ["morre_demais"])]; // 90% recente
    const blockB = [...reports(6, []), ...reports(4, ["morre_demais"])]; // 40% anterior
    const trends = computeWeaknessTrends([...blockA, ...blockB]);
    const trend = trends.find((t) => t.code === "morre_demais");
    expect(trend?.trend).toBe("worsening");
  });

  it("marca stable quando a diferenca fica abaixo do threshold", () => {
    const blockA = [...reports(5, []), ...reports(5, ["morre_demais"])]; // 50% recente
    const blockB = [...reports(6, []), ...reports(4, ["morre_demais"])]; // 40% anterior
    const trends = computeWeaknessTrends([...blockA, ...blockB]);
    const trend = trends.find((t) => t.code === "morre_demais");
    expect(trend?.trend).toBe("stable");
  });

  it("eleva confidence para high com 20+ relatorios nos blocos", () => {
    const blockA = reports(10, ["morre_demais"]);
    const blockB = reports(10, ["morre_demais"]);
    const trends = computeWeaknessTrends([...blockA, ...blockB]);
    expect(trends[0].confidence).toBe("high");
    expect(trends[0].hasComparison).toBe(true);
  });

  it("ordena por magnitude de mudanca decrescente", () => {
    // grande_mudanca: 80% recente vs 20% anterior (diff 60); pequena_mudanca: 50% recente vs 90% anterior (diff 40)
    const blockA = [
      ...Array.from({ length: 5 }, () => report(["grande_mudanca", "pequena_mudanca"])),
      ...Array.from({ length: 3 }, () => report(["grande_mudanca"])),
      ...Array.from({ length: 2 }, () => report([]))
    ];
    const blockB = [
      ...Array.from({ length: 2 }, () => report(["grande_mudanca", "pequena_mudanca"])),
      ...Array.from({ length: 7 }, () => report(["pequena_mudanca"])),
      ...Array.from({ length: 1 }, () => report([]))
    ];
    const trends = computeWeaknessTrends([...blockA, ...blockB]);
    expect(trends[0].code).toBe("grande_mudanca");
  });
});

describe("computeGrowthJourney", () => {
  it("agrega weaknessTrends e o total de relatorios analisados", () => {
    const history = reports(5, ["morre_demais"]);
    const journey = computeGrowthJourney(history);
    expect(journey.matchesAnalyzed).toBe(5);
    expect(journey.weaknessTrends).toHaveLength(1);
  });
});
