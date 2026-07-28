import { describe, expect, it } from "vitest";
import { availableCoverage } from "../types/stat-coverage.js";
import type { PlayerChampionStats } from "../types/domain.js";
import {
  assessExecutionRisk,
  CHAMPION_DIFFICULTY_NORMALIZATION_VERSION,
  createChampionDifficultyEvidence,
  normalizeChampionDifficulty
} from "./execution-risk.js";

function stats(overrides: Partial<PlayerChampionStats> = {}): PlayerChampionStats {
  return {
    championId: 61,
    championName: "Candidato",
    role: "MID",
    games: 20,
    wins: 10,
    kills: 100,
    deaths: 50,
    assists: 120,
    csPerMinute: 7,
    goldPerMinute: 420,
    damagePerMinute: 700,
    visionScorePerMinute: 0.8,
    killParticipation: 0.55,
    objectiveParticipation: 0.4,
    coverage: {
      killParticipation: availableCoverage(20),
      objectiveParticipation: availableCoverage(20)
    },
    recentMatches: [
      {
        matchId: "BR1_1",
        championId: 61,
        role: "MID",
        won: true,
        kills: 5,
        deaths: 2,
        assists: 7,
        csPerMinute: 7,
        goldPerMinute: 420,
        damagePerMinute: 700,
        visionScorePerMinute: 0.8,
        killParticipation: 0.55,
        objectiveParticipation: 0.4,
        observedAt: "2026-07-27T12:00:00.000Z"
      }
    ],
    ...overrides
  };
}

describe("dificuldade geral do catálogo", () => {
  it("preserva valor original, versão, algoritmo e proveniência", () => {
    const evidence = createChampionDifficultyEvidence(8, {
      patch: "16.14.1",
      locale: "pt_BR"
    });
    const result = assessExecutionRisk({
      difficulty: evidence,
      role: "MID",
      evaluatedAt: "2026-07-28T12:00:00.000Z"
    });

    expect(normalizeChampionDifficulty(8)).toBe(80);
    expect(evidence).toMatchObject({
      originalValue: 8,
      normalizedValue: 80,
      normalizationAlgorithmVersion:
        CHAMPION_DIFFICULTY_NORMALIZATION_VERSION,
      provenance: {
        sourceType: "OFFICIAL",
        patch: "16.14.1",
        resource: "champion.json#info.difficulty"
      }
    });
    expect(result.difficultyMetric.sourceValue).toMatchObject({
      value: 8,
      scale: { min: 0, max: 10 },
      provenance: { sourceType: "OFFICIAL" }
    });
    expect(result.difficultyMetric.provenance?.sourceType).toBe("CALCULATED");
  });

  it("mantém dificuldade e risco indisponíveis sem campo oficial", () => {
    const result = assessExecutionRisk({ role: "MID", stats: stats() });

    expect(result.difficultyMetric.value).toBeNull();
    expect(result.riskMetric.value).toBeNull();
    expect(result.scorePenalty).toBe(0);
  });
});

describe("risco pessoal de execução", () => {
  const hard = createChampionDifficultyEvidence(10)!;
  const easy = createChampionDifficultyEvidence(2)!;
  const evaluatedAt = "2026-07-28T12:00:00.000Z";

  it("reduz o risco de campeão difícil quando há experiência suficiente e recente", () => {
    const withoutHistory = assessExecutionRisk({
      difficulty: hard,
      role: "MID",
      evaluatedAt
    });
    const experienced = assessExecutionRisk({
      difficulty: hard,
      stats: stats(),
      role: "MID",
      evaluatedAt
    });

    expect(withoutHistory.familiarityMetric.value).toBeNull();
    expect(withoutHistory.riskMetric.value).toBe(100);
    expect(experienced.riskMetric.value).toBeLessThan(
      withoutHistory.riskMetric.value!
    );
    expect(experienced.scorePenalty).toBeLessThan(
      withoutHistory.scorePenalty
    );
  });

  it("campeão simples sem histórico tem risco menor que difícil sem histórico", () => {
    const simple = assessExecutionRisk({
      difficulty: easy,
      role: "MID",
      evaluatedAt
    });
    const difficult = assessExecutionRisk({
      difficulty: hard,
      role: "MID",
      evaluatedAt
    });

    expect(simple.riskMetric.value).toBeLessThan(difficult.riskMetric.value!);
  });

  it("não usa vitórias nem desempenho para recalcular risco", () => {
    const highWinRate = assessExecutionRisk({
      difficulty: hard,
      stats: stats({ wins: 20 }),
      role: "MID",
      evaluatedAt
    });
    const lowWinRate = assessExecutionRisk({
      difficulty: hard,
      stats: stats({ wins: 0 }),
      role: "MID",
      evaluatedAt
    });

    expect(highWinRate.riskMetric).toEqual(lowWinRate.riskMetric);
    expect(highWinRate.scorePenalty).toBe(lowWinRate.scorePenalty);
  });

  it("usa amostra sem inventar recência quando datas não existem", () => {
    const result = assessExecutionRisk({
      difficulty: hard,
      stats: stats({ recentMatches: [] }),
      role: "MID",
      evaluatedAt
    });

    expect(result.familiarityMetric.status).toBe("PARTIAL");
    expect(result.riskMetric.status).toBe("PARTIAL");
    expect(result.familiarityMetric.explanation).toMatch(/data.*indisponível/i);
  });
});
