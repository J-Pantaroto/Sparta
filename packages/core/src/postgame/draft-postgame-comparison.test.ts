import { describe, expect, it } from "vitest";
import { aggregatePersonalLoadoutEvidence } from "../aggregation/personal-loadout-evidence.js";
import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";
import {
  buildDraftPostGameComparison,
  type DraftPostGameComparisonInput
} from "./draft-postgame-comparison.js";

function recommendation(overrides: Partial<PersistedRecommendation> = {}): PersistedRecommendation {
  return {
    championId: 234,
    championName: "Viego",
    rank: 2,
    group: "PRIMARY",
    totalScore: 71,
    dataCoverage: 0.82,
    poolSource: "PERSONAL_OBSERVED",
    personalGames: 8,
    metricDetails: [
      {
        key: "EXECUTION_RISK",
        value: 67,
        status: "AVAILABLE",
        confidence: null,
        explanation: "Execução moderadamente exigente.",
        provenance: { sourceType: "DERIVED", algorithmVersion: "execution-risk/1.0.0" }
      },
      {
        key: "PERSONAL_MATCHUP",
        value: 55,
        status: "AVAILABLE",
        confidence: 0.4,
        provenance: { sourceType: "CALCULATED", sampleSize: 2 }
      }
    ],
    effectiveWeights: {},
    category: "comfort_pick",
    reasons: [],
    warnings: [],
    limitations: [],
    ...overrides
  };
}

function input(
  overrides: Partial<DraftPostGameComparisonInput> = {}
): DraftPostGameComparisonInput {
  return {
    draftSessionId: "draft-1",
    matchId: "BR1_1",
    generatedAt: "2026-07-28T20:00:00.000Z",
    session: {
      role: "JUNGLE",
      roleSource: "LCU",
      patch: "16.14",
      queueId: 420,
      selectedChampionId: 234,
      knownDraft: {
        allies: [],
        enemies: [{ championId: 64, championName: "Lee Sin", role: "JUNGLE" }],
        bannedChampionIds: [],
        banSideKnown: false,
        directOpponentChampionId: 64,
        unknownAllyPicks: 4,
        unknownEnemyPicks: 4
      }
    },
    snapshot: {
      id: "snapshot-1",
      inputHash: "hash",
      createdAt: "2026-07-28T19:00:00.000Z",
      dataCoverage: 0.8,
      algorithmVersions: { recommendationEngine: "1.0.0" },
      recommendations: [recommendation()]
    },
    selectedChampionName: "Viego",
    observed: {
      championId: 234,
      championName: "Viego",
      won: false,
      observedRole: "JUNGLE",
      positionStatus: "AVAILABLE",
      kills: 3,
      deaths: 7,
      assists: 5,
      csPerMinute: 6.1,
      goldPerMinute: 380,
      damagePerMinute: 510,
      visionScorePerMinute: 0.7,
      killParticipation: 0,
      objectiveParticipation: 0,
      objectiveTakedowns: 0,
      teamObjectiveKills: 3,
      durationSeconds: 1800,
      queueId: 420,
      patch: "16.14"
    },
    timeline: {
      deathsBefore10: 2,
      deathsBefore15: 3,
      csAt10: 58,
      csAt15: 92,
      goldDiffAt15: -400
    },
    directOpponent: {
      championId: 64,
      championName: "Lee Sin",
      confirmed: true
    },
    ...overrides
  };
}

describe("buildDraftPostGameComparison", () => {
  it("preserva ranking, score e grupo originais sem transformar derrota em julgamento", () => {
    const result = buildDraftPostGameComparison(input());

    expect(result.selectedChoice).toMatchObject({
      championId: 234,
      rank: 2,
      group: "PRIMARY",
      score: 71,
      coverage: 0.82
    });
    expect(JSON.stringify(result)).not.toMatch(/errad|corret|garant/i);
    expect(result.observedMatch.won).toBe(false);
  });

  it("mantém zero real de participação separado de ausência", () => {
    const result = buildDraftPostGameComparison(input());

    expect(result.observedMatch.killParticipation).toBe(0);
    expect(result.observedMatch.objectiveParticipation).toBe(0);
    expect(result.coverageDimensions.objectiveParticipationAvailable).toBe(true);
    expect(
      result.unavailableSignals.find((signal) => signal.key === "OBJECTIVE_PARTICIPATION")
        ?.unavailableReason
    ).toContain("snapshot não persistiu");
  });

  it("escolha fora do snapshot não recebe score nem posição retroativos", () => {
    const result = buildDraftPostGameComparison(
      input({
        snapshot: {
          ...input().snapshot!,
          recommendations: [recommendation({ championId: 64, championName: "Lee Sin" })]
        }
      })
    );

    expect(result.selectedChoice.group).toBe("NOT_IN_SNAPSHOT");
    expect(result.selectedChoice.rank).toBeUndefined();
    expect(result.selectedChoice.score).toBeUndefined();
    expect(result.coverageDimensions.selectedChampionInSnapshot).toBe(false);
  });

  it("alternativa preserva o grupo e ranking mesmo quando a partida termina em vitória", () => {
    const alternative = recommendation({ group: "ALTERNATIVE", rank: 6 });
    const result = buildDraftPostGameComparison(
      input({
        snapshot: { ...input().snapshot!, recommendations: [alternative] },
        observed: { ...input().observed, won: true }
      })
    );

    expect(result.selectedChoice).toMatchObject({
      group: "ALTERNATIVE",
      rank: 6
    });
    expect(JSON.stringify(result)).not.toMatch(/recomendação correta/i);
  });

  it("sem snapshot produz resumo observado e mantém comparações históricas indisponíveis", () => {
    const result = buildDraftPostGameComparison(input({ snapshot: undefined }));

    expect(result.observedMatch.kills).toBe(3);
    expect(result.coverageDimensions.snapshotAvailable).toBe(false);
    expect(result.selectedChoice.score).toBeUndefined();
    expect(
      result.unavailableSignals.some(
        (signal) =>
          signal.key === "FINAL_INVENTORY_HISTORY" &&
          signal.unavailableReason?.includes("snapshot histórico")
      )
    ).toBe(true);
  });

  it("divergência de posição reduz cobertura e bloqueia matchup da posição antiga", () => {
    const result = buildDraftPostGameComparison(
      input({
        observed: { ...input().observed, observedRole: "TOP" }
      })
    );

    expect(result.coverageDimensions.positionCompatible).toBe(false);
    expect(
      result.comparableSignals.find((signal) => signal.key === "POSITION_ALIGNMENT")?.statement
    ).toContain("diferente");
    expect(
      result.unavailableSignals.find((signal) => signal.key === "PERSONAL_MATCHUP_AND_RESULT")
        ?.unavailableReason
    ).toContain("posição observada diverge");
  });

  it("adversário não confirmado mantém matchup indisponível", () => {
    const result = buildDraftPostGameComparison(
      input({
        directOpponent: {
          championId: 64,
          championName: "Lee Sin",
          confirmed: false
        }
      })
    );

    expect(result.coverageDimensions.directOpponentConfirmed).toBe(false);
    expect(
      result.unavailableSignals.find((signal) => signal.key === "PERSONAL_MATCHUP_AND_RESULT")
        ?.unavailableReason
    ).toContain("não pôde ser confirmado");
  });

  it("timeline ausente gera comparação parcial sem inventar mortes precoces", () => {
    const result = buildDraftPostGameComparison(input({ timeline: undefined }));

    expect(result.status).toBe("PARTIAL");
    expect(result.observedMatch.deathsBefore10).toBeUndefined();
    expect(result.coverageDimensions.timelineAvailable).toBe(false);
    expect(
      result.unavailableSignals.find((signal) => signal.key === "EXECUTION_RISK_AND_EARLY_DEATHS")
        ?.unavailableReason
    ).toContain("timeline");
  });

  it("configuração inédita é descrita como primeira observação, nunca melhor ou pior", () => {
    const currentLoadout = {
      extractorVersion: "match-observation/1.0.0",
      matchId: "BR1_1",
      championId: 234,
      context: {
        platform: "BR1",
        startedAt: "2026-07-28T20:00:00.000Z",
        won: false
      },
      items: [
        {
          slot: 0,
          state: "PRESENT",
          itemId: 3078,
          enrichment: {
            status: "UNAVAILABLE",
            provenance: { sourceType: "OFFICIAL" }
          },
          provenance: { sourceType: "OBSERVED" }
        }
      ],
      runes: {
        status: "UNAVAILABLE",
        selections: [],
        fragments: [],
        provenance: { sourceType: "OBSERVED" }
      },
      summonerSpells: [],
      position: {
        normalizedRole: "JUNGLE",
        diverged: false,
        status: "AVAILABLE",
        observedProvenance: { sourceType: "OBSERVED" },
        normalizedProvenance: { sourceType: "CALCULATED" }
      }
    } as const;
    const historicalLoadout = aggregatePersonalLoadoutEvidence([], {
      championId: 234,
      role: "JUNGLE"
    });
    const result = buildDraftPostGameComparison(
      input({
        currentLoadout: currentLoadout as unknown as DraftPostGameComparisonInput["currentLoadout"],
        historicalLoadout
      })
    );
    const inventory = result.comparableSignals.find(
      (signal) => signal.key === "FINAL_INVENTORY_HISTORY"
    );

    expect(inventory?.statement).toContain("primeira observação");
    expect(inventory?.statement).not.toMatch(/melhor|pior/i);
  });

  it("mesmos inputs produzem o mesmo relatório funcional", () => {
    expect(buildDraftPostGameComparison(input())).toEqual(buildDraftPostGameComparison(input()));
  });
});
