import { describe, expect, it } from "vitest";
import type { ChampionTag, PlayerChampionStats } from "../types/domain.js";
import {
  REPLAY_BUNDLE_SCHEMA_VERSION,
  buildDependencyManifest,
  canonicalBundleContent,
  type ReplayChampionContext,
  type ReplayInputBundle
} from "../calibration/replay-input-bundle.js";
import { replayRecommendationEngineV1 } from "../calibration/replay-verifier.js";
import type { CalibrationRanking, CalibrationRankingEntry } from "../calibration/ranking-comparison.js";
import { BASELINE_POST_AGGREGATION_RULES, buildEffectiveConfiguration } from "./effective-configuration.js";
import { evaluateLaboratoryEquivalence } from "./laboratory-equivalence.js";

/** Hash determinístico e local, mesmo padrão de `replay-input-bundle.test.ts`. */
function fakeHash(canonical: string): string {
  let hash = 0;
  for (let i = 0; i < canonical.length; i += 1) {
    hash = (hash * 31 + canonical.charCodeAt(i)) | 0;
  }
  return `h${hash}`;
}

function stats(overrides: Partial<PlayerChampionStats> = {}): PlayerChampionStats {
  return {
    championId: 234,
    championName: "Viego",
    role: "JUNGLE",
    games: 12,
    wins: 7,
    kills: 6,
    deaths: 5,
    assists: 8,
    csPerMinute: 5.4,
    goldPerMinute: 380,
    damagePerMinute: 620,
    visionScorePerMinute: 0.6,
    killParticipation: 0.52,
    objectiveParticipation: null,
    coverage: {
      killParticipation: { sampleSize: 12, availableSampleSize: 12, status: "AVAILABLE" },
      objectiveParticipation: { sampleSize: 12, availableSampleSize: 0, status: "UNAVAILABLE" }
    },
    recentMatches: [],
    ...overrides
  };
}

function tag(overrides: Partial<ChampionTag> = {}): ChampionTag {
  return {
    championId: 234,
    championName: "Viego",
    roles: [],
    damageProfile: "AD",
    tags: ["Assassin"],
    blindSafety: 0.45,
    difficulty: 0.6,
    engage: 0.6,
    peel: 0.2,
    frontline: 0.3,
    pickoff: 0.7,
    waveclear: 0.5,
    scaling: 0.6,
    earlyPressure: 0.5,
    ...overrides
  } as ChampionTag;
}

function champion(
  championId: number,
  championName: string,
  roles: ReplayChampionContext["roles"],
  overrides: Partial<ReplayChampionContext> = {}
): ReplayChampionContext {
  return {
    championId,
    championName,
    roles,
    championTag: tag({ championId, championName }),
    capabilityProfile: null,
    sourceVersions: { dataDragon: "16.14.1" },
    unavailableReasons: [],
    ...overrides
  };
}

function bundle(snapshotId = "snap-1"): ReplayInputBundle {
  const base: Omit<ReplayInputBundle, "contentHash"> = {
    schemaVersion: REPLAY_BUNDLE_SCHEMA_VERSION,
    snapshotId,
    evaluatedAt: "2026-07-28T17:15:54.000Z",
    capturedAt: "2026-07-28T17:15:54.900Z",
    algorithmVersions: {
      recommendationEngine: "1.0.0",
      championTagDerivation: "champion-tag-derivation/1.0.0",
      executionRisk: "execution-risk/1.0.0",
      draftStrategy: "draft-strategy/1.0.0"
    },
    draft: {
      role: "JUNGLE",
      roleSource: "USER",
      pickOrder: 1,
      pool: [{ championId: 234, source: "PERSONAL_OBSERVED" }],
      allies: [],
      enemies: [],
      bannedChampionIds: []
    },
    player: {
      championStats: [stats()],
      matchups: [],
      unavailableReasons: []
    },
    candidates: [
      {
        championId: 234,
        championName: "Viego",
        role: "JUNGLE",
        poolSource: "PERSONAL_OBSERVED",
        enabled: true
      }
    ],
    referencedChampions: [champion(234, "Viego", ["CANDIDATE"])],
    activeParameters: {
      compositionRules: {
        minimumFrontline: 1,
        minimumEngage: 1,
        minimumWaveclear: 1,
        preferDamageBalance: true
      },
      compositionRulesVersion: "composition-rules/1.0.0",
      patchMetaAvailable: false
    },
    dependencyManifest: buildDependencyManifest({
      algorithmVersions: { recommendationEngine: "1.0.0" },
      availability: {}
    }),
    provenance: { sourceType: "CALCULATED", sourceId: "sparta", resource: "ReplayInputBundle" }
  };
  return { ...base, contentHash: fakeHash(canonicalBundleContent(base)) };
}

function configuration() {
  return buildEffectiveConfiguration({
    version: "v1",
    metricWeights: {
      PERSONAL_PERFORMANCE: 0.4,
      RECENT_FORM: 0.1,
      PERSONAL_MATCHUP: 0.1,
      BLIND_SAFETY: 0.1,
      ALLY_SYNERGY: 0.1,
      ENEMY_COMPOSITION_ANSWER: 0.1,
      TEAM_COMPOSITION: 0.05,
      META_STRENGTH: 0.05
    },
    disabledMetrics: [],
    postAggregationRules: BASELINE_POST_AGGREGATION_RULES,
    source: { type: "RELEASE", releaseId: "release-1" },
    algorithmCompatibility: { recommendationEngine: "1.0.0" },
    computeHash: fakeHash
  });
}

/** Ranking "do laboratório" construído a partir do próprio motor — garante um caso MATCH real. */
function laboratoryRankingFromEngine(testBundle: ReplayInputBundle, testConfiguration = configuration()): CalibrationRanking {
  const reconstructed = replayRecommendationEngineV1(testBundle, testConfiguration);
  const entries: CalibrationRankingEntry[] = reconstructed.map((entry) => ({
    championId: entry.championId,
    championName: entry.championName,
    rank: entry.rank,
    group: entry.group,
    score: entry.totalScore,
    dataCoverage: entry.dataCoverage
  }));
  return {
    entries,
    primaryChampionIds: entries.filter((e) => e.group === "PRIMARY").map((e) => e.championId),
    alternativeChampionIds: entries.filter((e) => e.group === "ALTERNATIVE").map((e) => e.championId)
  };
}

describe("evaluateLaboratoryEquivalence", () => {
  it("motor real reproduzindo o resultado do laboratório vira MATCH", () => {
    const testBundle = bundle();
    const testConfiguration = configuration();
    const laboratoryCandidateRanking = laboratoryRankingFromEngine(testBundle, testConfiguration);

    const result = evaluateLaboratoryEquivalence({
      configuration: testConfiguration,
      cases: [{ snapshotId: "snap-1", bundle: testBundle, laboratoryCandidateRanking }]
    });

    expect(result.status).toBe("MATCH");
    expect(result.caseResults).toHaveLength(1);
    expect(result.caseResults[0].status).toBe("MATCH");
    expect(result.caseResults[0].divergences).toEqual([]);
  });

  it("divergência de score real vira MISMATCH, relatada e não corrigida", () => {
    const testBundle = bundle();
    const testConfiguration = configuration();
    const laboratoryCandidateRanking = laboratoryRankingFromEngine(testBundle, testConfiguration);
    // Adultera o score que "o laboratório" teria persistido.
    laboratoryCandidateRanking.entries[0].score += 15;

    const result = evaluateLaboratoryEquivalence({
      configuration: testConfiguration,
      cases: [{ snapshotId: "snap-1", bundle: testBundle, laboratoryCandidateRanking }]
    });

    expect(result.status).toBe("MISMATCH");
    const divergence = result.caseResults[0].divergences.find((d) => d.field === "score");
    expect(divergence).toBeDefined();
    expect(divergence?.delta).toBeGreaterThan(0);
    // Não corrige: o valor "esperado" continua sendo o adulterado, não o real.
    expect(divergence?.expected).toBe(laboratoryCandidateRanking.entries[0].score);
  });

  it("candidato ausente no motor reconstruído gera divergência de presença", () => {
    const testBundle = bundle();
    const testConfiguration = configuration();
    const laboratoryCandidateRanking: CalibrationRanking = {
      entries: [
        {
          championId: 9999,
          championName: "Campeão Inexistente",
          rank: 1,
          group: "PRIMARY",
          score: 50,
          dataCoverage: 1
        }
      ],
      primaryChampionIds: [9999],
      alternativeChampionIds: []
    };

    const result = evaluateLaboratoryEquivalence({
      configuration: testConfiguration,
      cases: [{ snapshotId: "snap-1", bundle: testBundle, laboratoryCandidateRanking }]
    });

    expect(result.status).toBe("MISMATCH");
    expect(result.caseResults[0].divergences[0]).toMatchObject({
      field: "presenca",
      championId: 9999,
      reconstructed: null
    });
  });

  it("candidato NOT_RECOMMENDED do laboratório não gera divergência de presença", () => {
    const testBundle = bundle();
    const testConfiguration = configuration();
    const laboratoryCandidateRanking: CalibrationRanking = {
      entries: [
        {
          championId: 555,
          championName: "Fora do corte",
          rank: 8,
          group: "NOT_RECOMMENDED",
          score: 10,
          dataCoverage: 1
        }
      ],
      primaryChampionIds: [],
      alternativeChampionIds: []
    };

    const result = evaluateLaboratoryEquivalence({
      configuration: testConfiguration,
      cases: [{ snapshotId: "snap-1", bundle: testBundle, laboratoryCandidateRanking }]
    });

    // Nenhuma divergência: o motor nunca devolve NOT_RECOMMENDED, então esse
    // candidato é ignorado na comparação, não tratado como ausência.
    expect(result.status).toBe("MATCH");
  });

  it("nenhum caso comparável vira NO_EXACT_REPLAY_CASES", () => {
    const result = evaluateLaboratoryEquivalence({ configuration: configuration(), cases: [] });
    expect(result.status).toBe("NO_EXACT_REPLAY_CASES");
  });

  it("bundle com snapshotId divergente do caso não é comparável (NOT_REPLAYABLE) e não conta como MATCH nem derruba os demais", () => {
    const testBundle = bundle("snap-real");
    const testConfiguration = configuration();
    const laboratoryCandidateRanking = laboratoryRankingFromEngine(testBundle, testConfiguration);

    const result = evaluateLaboratoryEquivalence({
      configuration: testConfiguration,
      cases: [
        { snapshotId: "snap-outro", bundle: testBundle, laboratoryCandidateRanking }
      ]
    });

    expect(result.status).toBe("NO_EXACT_REPLAY_CASES");
    expect(result.caseResults[0].status).toBe("NOT_REPLAYABLE");
  });

  it("um caso MISMATCH não é escondido por outros casos MATCH", () => {
    const goodBundle = bundle("snap-good");
    const badBundle = bundle("snap-bad");
    const testConfiguration = configuration();
    const goodRanking = laboratoryRankingFromEngine(goodBundle, testConfiguration);
    const badRanking = laboratoryRankingFromEngine(badBundle, testConfiguration);
    badRanking.entries[0].rank += 1;
    badRanking.entries[0].score += 20;

    const result = evaluateLaboratoryEquivalence({
      configuration: testConfiguration,
      cases: [
        { snapshotId: "snap-good", bundle: goodBundle, laboratoryCandidateRanking: goodRanking },
        { snapshotId: "snap-bad", bundle: badBundle, laboratoryCandidateRanking: badRanking }
      ]
    });

    expect(result.status).toBe("MISMATCH");
    expect(result.caseResults.find((c) => c.snapshotId === "snap-good")?.status).toBe("MATCH");
    expect(result.caseResults.find((c) => c.snapshotId === "snap-bad")?.status).toBe("MISMATCH");
  });
});
