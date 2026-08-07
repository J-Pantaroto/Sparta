import { describe, expect, it } from "vitest";
import { compareMatchToRecentHistory, MIN_RECENT_HISTORY_SAMPLE } from "./match-vs-recent-history.js";
import type { PerformanceTrendPoint } from "../profile/player-profile-overview.js";

function point(overrides: Partial<PerformanceTrendPoint> & { matchId: string; observedAt: string }): PerformanceTrendPoint {
  return {
    performanceIndex: 60,
    kda: 3,
    objectiveParticipation: 0.5,
    csPerMinute: 6,
    visionScorePerMinute: 1,
    won: true,
    ...overrides
  };
}

describe("compareMatchToRecentHistory", () => {
  it("fica UNAVAILABLE quando a partida alvo não está no histórico", () => {
    const result = compareMatchToRecentHistory(
      [point({ matchId: "a", observedAt: "2026-08-01T00:00:00Z" })],
      "nope"
    );
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.metrics).toEqual([]);
    expect(result.unavailableReason).toBeTruthy();
  });

  it("compara com a média das partidas estritamente anteriores quando há amostra suficiente", () => {
    expect(MIN_RECENT_HISTORY_SAMPLE).toBe(3);
    const points: PerformanceTrendPoint[] = [
      point({ matchId: "p1", observedAt: "2026-08-01T00:00:00Z", csPerMinute: 4 }),
      point({ matchId: "p2", observedAt: "2026-08-02T00:00:00Z", csPerMinute: 6 }),
      point({ matchId: "p3", observedAt: "2026-08-03T00:00:00Z", csPerMinute: 8 }),
      point({ matchId: "target", observedAt: "2026-08-04T00:00:00Z", csPerMinute: 9 })
    ];

    const result = compareMatchToRecentHistory(points, "target");

    expect(result.status).toBe("AVAILABLE");
    expect(result.priorSampleSize).toBe(3);
    const cs = result.metrics.find((metric) => metric.metric === "csPerMinute");
    expect(cs?.status).toBe("AVAILABLE");
    expect(cs?.matchValue).toBe(9);
    expect(cs?.recentAverage).toBe(6);
    expect(cs?.sampleSize).toBe(3);
  });

  it("nunca inclui a própria partida nem partidas futuras na média (evita vazamento temporal)", () => {
    const points: PerformanceTrendPoint[] = [
      point({ matchId: "p1", observedAt: "2026-08-01T00:00:00Z", csPerMinute: 100 }),
      point({ matchId: "p2", observedAt: "2026-08-02T00:00:00Z", csPerMinute: 100 }),
      point({ matchId: "p3", observedAt: "2026-08-03T00:00:00Z", csPerMinute: 100 }),
      point({ matchId: "target", observedAt: "2026-08-04T00:00:00Z", csPerMinute: 1 }),
      // Mesmo timestamp da alvo não conta como "anterior" (>= não é <).
      point({ matchId: "same-instant", observedAt: "2026-08-04T00:00:00Z", csPerMinute: 1000 }),
      // Partida futura nunca deve vazar pra dentro da média "recente".
      point({ matchId: "future", observedAt: "2026-08-05T00:00:00Z", csPerMinute: 1000 })
    ];

    const result = compareMatchToRecentHistory(points, "target");

    expect(result.priorSampleSize).toBe(3);
    const cs = result.metrics.find((metric) => metric.metric === "csPerMinute");
    expect(cs?.recentAverage).toBe(100);
  });

  it("fica UNAVAILABLE por métrica quando a amostra anterior é insuficiente", () => {
    const points: PerformanceTrendPoint[] = [
      point({ matchId: "p1", observedAt: "2026-08-01T00:00:00Z" }),
      point({ matchId: "target", observedAt: "2026-08-02T00:00:00Z" })
    ];

    const result = compareMatchToRecentHistory(points, "target");

    expect(result.status).toBe("AVAILABLE");
    for (const metric of result.metrics) {
      expect(metric.status).toBe("UNAVAILABLE");
      expect(metric.recentAverage).toBeNull();
      expect(metric.unavailableReason).toBeTruthy();
    }
  });

  it("separa participação em objetivos ausente (null) de zero real, sem contar ausência na amostra", () => {
    const points: PerformanceTrendPoint[] = [
      point({ matchId: "p1", observedAt: "2026-08-01T00:00:00Z", objectiveParticipation: null }),
      point({ matchId: "p2", observedAt: "2026-08-02T00:00:00Z", objectiveParticipation: 0 }),
      point({ matchId: "p3", observedAt: "2026-08-03T00:00:00Z", objectiveParticipation: 0.4 }),
      point({ matchId: "p4", observedAt: "2026-08-04T00:00:00Z", objectiveParticipation: 0.2 }),
      point({ matchId: "target", observedAt: "2026-08-05T00:00:00Z", objectiveParticipation: null })
    ];

    const result = compareMatchToRecentHistory(points, "target");

    const objective = result.metrics.find((metric) => metric.metric === "objectiveParticipation");
    // Só 3 dos 4 pontos anteriores tem valor real (p1 é null e é excluído da amostra).
    expect(objective?.sampleSize).toBe(3);
    expect(objective?.status).toBe("AVAILABLE");
    expect(objective?.recentAverage).toBe(0.2);
    // A própria partida-alvo não tem o dado - matchValue é null, nunca 0 fabricado.
    expect(objective?.matchValue).toBeNull();
  });
});
