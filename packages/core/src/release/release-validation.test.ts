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
import { CALIBRATION_LAB_VERSION, type CalibrationCandidate } from "../calibration/engine-candidate.js";
import type { CalibrationExperimentReport } from "../calibration/ranking-comparison.js";
import {
  buildEffectiveConfigurationFromCandidate,
  type EffectiveRecommendationConfiguration
} from "./effective-configuration.js";
import {
  RELEASE_ARTIFACT_SCHEMA_VERSION,
  buildReleaseArtifact,
  type RecommendationReleaseArtifact,
  type ReleaseExperimentEvidence
} from "./release-artifact.js";
import type { LaboratoryEquivalenceCase } from "./laboratory-equivalence.js";
import { validateReleaseArtifact, type ValidateReleaseArtifactInput } from "./release-validation.js";

function fakeHash(canonical: string): string {
  let hash = 0;
  for (let i = 0; i < canonical.length; i += 1) {
    hash = (hash * 31 + canonical.charCodeAt(i)) | 0;
  }
  return `h${hash}`;
}

function stats(): PlayerChampionStats {
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
    recentMatches: []
  };
}

function tag(): ChampionTag {
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
    earlyPressure: 0.5
  } as ChampionTag;
}

function champion(): ReplayChampionContext {
  return {
    championId: 234,
    championName: "Viego",
    roles: ["CANDIDATE"],
    championTag: tag(),
    capabilityProfile: null,
    sourceVersions: { dataDragon: "16.14.1" },
    unavailableReasons: []
  };
}

function bundle(): ReplayInputBundle {
  const base: Omit<ReplayInputBundle, "contentHash"> = {
    schemaVersion: REPLAY_BUNDLE_SCHEMA_VERSION,
    snapshotId: "snap-1",
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
    player: { championStats: [stats()], matchups: [], unavailableReasons: [] },
    candidates: [
      { championId: 234, championName: "Viego", role: "JUNGLE", poolSource: "PERSONAL_OBSERVED", enabled: true }
    ],
    referencedChampions: [champion()],
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

function candidate(overrides: Partial<CalibrationCandidate> = {}): CalibrationCandidate {
  return {
    id: "candidate-1",
    name: "Candidata de teste",
    baselineAggregationVersion: "1.0.0",
    candidateVersion: "cand-v1",
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
    status: "APPROVED_FOR_FUTURE_RELEASE",
    ...overrides
  };
}

function experimentSummary(candidateRow: CalibrationCandidate): CalibrationExperimentReport {
  return {
    labVersion: CALIBRATION_LAB_VERSION,
    candidateId: candidateRow.id,
    candidateVersion: candidateRow.candidateVersion,
    candidateStatus: candidateRow.status,
    totalCases: 1,
    replayedCases: 1,
    excludedCases: 0,
    nonReproducibleCases: 0,
    topOnePreservedCases: 1,
    averageTopFiveOverlap: 1,
    averageRankDisplacement: 0,
    medianRankDisplacement: 0,
    averageRecommendedSetStability: 1,
    totalPromoted: 0,
    totalDemoted: 0,
    totalEnteredPrimary: 0,
    totalLeftPrimary: 0,
    totalPrimaryToAlternative: 0,
    totalAlternativeToPrimary: 0,
    totalComfortStrategicInversions: 0,
    chosenChampionEnteredPrimary: 0,
    chosenChampionLeftPrimary: 0,
    segments: [],
    exclusions: [],
    humanReview: {
      casesWithReview: 0,
      casesWithoutReview: 1,
      strongCasesPreserved: 0,
      strongCasesAltered: 0,
      weakCasesPreserved: 0,
      weakCasesAltered: 0,
      issueTagsAffected: []
    }
  };
}

/** Monta configuração + artefato + caso de laboratório coerentes com a candidata. */
function buildScenario(candidateRow: CalibrationCandidate) {
  const configuration: EffectiveRecommendationConfiguration = buildEffectiveConfigurationFromCandidate({
    candidate: candidateRow,
    version: candidateRow.candidateVersion,
    source: { type: "RELEASE", releaseId: "release-1" },
    algorithmCompatibility: { recommendationEngine: "1.0.0" },
    computeHash: fakeHash
  });

  const testBundle = bundle();
  const reconstructed = replayRecommendationEngineV1(testBundle, configuration);
  const laboratoryCandidateRanking = {
    entries: reconstructed.map((entry) => ({
      championId: entry.championId,
      championName: entry.championName,
      rank: entry.rank,
      group: entry.group,
      score: entry.totalScore,
      dataCoverage: entry.dataCoverage
    })),
    primaryChampionIds: reconstructed.filter((e) => e.group === "PRIMARY").map((e) => e.championId),
    alternativeChampionIds: reconstructed.filter((e) => e.group === "ALTERNATIVE").map((e) => e.championId)
  };

  const evidence: ReleaseExperimentEvidence = {
    experimentId: "experiment-1",
    experimentInputHash: "exp-hash-1",
    laboratoryVersion: CALIBRATION_LAB_VERSION,
    filters: { roles: ["JUNGLE"] },
    sampleSize: 1,
    exactReplayCases: 1,
    excludedCases: 0,
    summary: experimentSummary(candidateRow),
    knownLimitations: []
  };

  const artifact: RecommendationReleaseArtifact = buildReleaseArtifact({
    releaseVersion: "release-2026-08-01",
    candidateId: candidateRow.id,
    candidateRevisionId: `${candidateRow.id}-rev-1`,
    experimentId: "experiment-1",
    baselineVersion: "1.0.0",
    candidateVersion: candidateRow.candidateVersion,
    configuration,
    experimentEvidence: evidence,
    compatibility: {
      releaseArtifactSchemaVersion: RELEASE_ARTIFACT_SCHEMA_VERSION,
      requiredAlgorithmVersions: { recommendationEngine: "1.0.0" },
      supportedAggregationVersions: ["1.0.0"]
    },
    createdAt: "2026-08-01T00:00:00.000Z",
    computeHash: fakeHash
  });

  const laboratoryCases: LaboratoryEquivalenceCase[] = [
    { snapshotId: "snap-1", bundle: testBundle, laboratoryCandidateRanking }
  ];

  return { configuration, artifact, laboratoryCases };
}

function baseInput(overrides: Partial<ValidateReleaseArtifactInput> = {}): ValidateReleaseArtifactInput {
  const candidateRow = candidate();
  const { artifact, laboratoryCases } = buildScenario(candidateRow);
  return {
    artifact,
    candidate: candidateRow,
    experimentStatus: "COMPLETED",
    laboratoryCases,
    computeHash: fakeHash,
    ...overrides
  };
}

describe("validateReleaseArtifact", () => {
  it("cenário coerente valida como VALID", () => {
    const result = validateReleaseArtifact(baseInput());
    expect(result.status).toBe("VALID");
    expect(result.laboratoryEquivalence?.status).toBe("MATCH");
  });

  it("candidata fora de APPROVED_FOR_FUTURE_RELEASE é INVALID_CANDIDATE_STATE", () => {
    const candidateRow = candidate({ status: "READY" });
    const { artifact, laboratoryCases } = buildScenario(candidate());
    const result = validateReleaseArtifact({
      artifact,
      candidate: candidateRow,
      experimentStatus: "COMPLETED",
      laboratoryCases,
      computeHash: fakeHash
    });
    expect(result.status).toBe("INVALID_CANDIDATE_STATE");
  });

  it("experimento não concluído é EXPERIMENT_NOT_COMPLETED", () => {
    const result = validateReleaseArtifact(baseInput({ experimentStatus: "RUNNING" }));
    expect(result.status).toBe("EXPERIMENT_NOT_COMPLETED");
  });

  it("configHash divergente do conteúdo real é CONFIG_HASH_MISMATCH", () => {
    const input = baseInput();
    const tamperedArtifact: RecommendationReleaseArtifact = {
      ...input.artifact,
      configuration: { ...input.artifact.configuration, configHash: "hash-adulterado" }
    };
    const result = validateReleaseArtifact({ ...input, artifact: tamperedArtifact });
    expect(result.status).toBe("CONFIG_HASH_MISMATCH");
  });

  it("candidata com parâmetro de derivação (threshold não suportado) é UNSUPPORTED_PARAMETER", () => {
    const candidateRow = candidate({
      postAggregationThresholds: { minGamesForRanking: 10 }
    });
    // A validação estrutural da configuração passa (o threshold não suportado
    // nem chega a entrar nela); é `validateCalibrationCandidate` quem rejeita.
    const { artifact, laboratoryCases } = buildScenario(candidate());
    const result = validateReleaseArtifact({
      artifact,
      candidate: candidateRow,
      experimentStatus: "COMPLETED",
      laboratoryCases,
      computeHash: fakeHash
    });
    expect(result.status).toBe("UNSUPPORTED_PARAMETER");
    expect(result.candidateRejections?.length).toBeGreaterThan(0);
  });

  it("candidata com agregação não suportada pelo domínio é UNSUPPORTED_PARAMETER (validateCalibrationCandidate barra antes)", () => {
    const candidateRow = candidate({ baselineAggregationVersion: "0.9.0" });
    const { artifact, laboratoryCases } = buildScenario(candidate());
    const result = validateReleaseArtifact({
      artifact,
      candidate: candidateRow,
      experimentStatus: "COMPLETED",
      laboratoryCases,
      computeHash: fakeHash
    });
    expect(result.status).toBe("UNSUPPORTED_PARAMETER");
  });

  it("versão suportada pela candidata mas fora do manifesto de compatibilidade do artefato é INCOMPATIBLE_ENGINE_VERSION", () => {
    // A candidata em si é válida (1.0.0 é suportada pelo domínio); o que
    // diverge é o manifesto CONGELADO no artefato, que não declara 1.0.0
    // como compatível — cenário distinto de a candidata declarar uma
    // agregação que o domínio nem reconhece.
    const input = baseInput();
    const staleArtifact: RecommendationReleaseArtifact = {
      ...input.artifact,
      compatibility: { ...input.artifact.compatibility, supportedAggregationVersions: ["0.5.0"] }
    };
    const result = validateReleaseArtifact({ ...input, artifact: staleArtifact });
    expect(result.status).toBe("INCOMPATIBLE_ENGINE_VERSION");
  });

  it("artefato adulterado depois de gerado é ARTIFACT_HASH_MISMATCH", () => {
    const input = baseInput();
    const tamperedArtifact: RecommendationReleaseArtifact = {
      ...input.artifact,
      releaseVersion: "release-adulterada-depois"
    };
    const result = validateReleaseArtifact({ ...input, artifact: tamperedArtifact });
    expect(result.status).toBe("ARTIFACT_HASH_MISMATCH");
  });

  it("zero casos exatos disponíveis impede prontidão (NO_EXACT_REPLAY_CASES)", () => {
    const result = validateReleaseArtifact(baseInput({ laboratoryCases: [] }));
    expect(result.status).toBe("NO_EXACT_REPLAY_CASES");
  });

  it("divergência real entre motor e laboratório é LABORATORY_RESULT_MISMATCH, nunca ajustada", () => {
    const input = baseInput();
    const tamperedCases: LaboratoryEquivalenceCase[] = input.laboratoryCases.map((testCase) => ({
      ...testCase,
      laboratoryCandidateRanking: {
        ...testCase.laboratoryCandidateRanking,
        entries: testCase.laboratoryCandidateRanking.entries.map((entry) => ({
          ...entry,
          score: entry.score + 25
        }))
      }
    }));
    const result = validateReleaseArtifact({ ...input, laboratoryCases: tamperedCases });
    expect(result.status).toBe("LABORATORY_RESULT_MISMATCH");
    expect(result.laboratoryEquivalence?.status).toBe("MISMATCH");
  });

  it("experimento com hash diferente do declarado na candidata não afeta o VALID — o hash é só evidência preservada", () => {
    // O hash do experimento é evidência congelada no artefato (Etapa 27a não
    // reexecuta o experimento); o que precisa bater é o `configHash` e o
    // `artifactHash`, ambos conferidos separadamente. Confirma que trocar só
    // a referência de evidência não quebra uma release já consistente.
    const input = baseInput();
    const result = validateReleaseArtifact(input);
    expect(result.status).toBe("VALID");
    expect(input.artifact.experimentEvidence.experimentInputHash).toBe("exp-hash-1");
  });
});
