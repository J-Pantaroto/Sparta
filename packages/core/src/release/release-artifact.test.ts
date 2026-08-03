import { describe, expect, it } from "vitest";
import { CALIBRATION_LAB_VERSION } from "../calibration/engine-candidate.js";
import type { CalibrationExperimentReport } from "../calibration/ranking-comparison.js";
import { BASELINE_POST_AGGREGATION_RULES, buildEffectiveConfiguration } from "./effective-configuration.js";
import {
  buildReleaseArtifact,
  canonicalReleaseArtifactContent,
  RELEASE_ARTIFACT_SCHEMA_VERSION,
  type RecommendationReleaseArtifact,
  type ReleaseExperimentEvidence
} from "./release-artifact.js";

function fakeHash(canonical: string): string {
  let hash = 0;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = (hash * 31 + canonical.charCodeAt(index)) | 0;
  }
  return `h${hash}`;
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

function experimentSummary(): CalibrationExperimentReport {
  return {
    labVersion: CALIBRATION_LAB_VERSION,
    candidateId: "candidate-1",
    candidateVersion: "cand-v1",
    candidateStatus: "APPROVED_FOR_FUTURE_RELEASE",
    totalCases: 10,
    replayedCases: 9,
    excludedCases: 1,
    nonReproducibleCases: 1,
    topOnePreservedCases: 7,
    averageTopFiveOverlap: 0.8,
    averageRankDisplacement: 0.5,
    medianRankDisplacement: 0,
    averageRecommendedSetStability: 0.9,
    totalPromoted: 2,
    totalDemoted: 1,
    totalEnteredPrimary: 1,
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
      casesWithoutReview: 9,
      strongCasesPreserved: 0,
      strongCasesAltered: 0,
      weakCasesPreserved: 0,
      weakCasesAltered: 0,
      issueTagsAffected: []
    }
  };
}

function evidence(overrides: Partial<ReleaseExperimentEvidence> = {}): ReleaseExperimentEvidence {
  return {
    experimentId: "experiment-1",
    experimentInputHash: "exp-hash-1",
    laboratoryVersion: CALIBRATION_LAB_VERSION,
    filters: { roles: ["JUNGLE"] },
    sampleSize: 10,
    exactReplayCases: 9,
    excludedCases: 1,
    summary: experimentSummary(),
    knownLimitations: ["Amostra pequena para SUPPORT"],
    ...overrides
  };
}

function artifactInput(
  overrides: Partial<Omit<RecommendationReleaseArtifact, "artifactSchemaVersion" | "artifactHash" | "configHash">> = {}
) {
  return {
    releaseVersion: "release-2026-08-01",
    candidateId: "candidate-1",
    candidateRevisionId: "candidate-1-rev-3",
    experimentId: "experiment-1",
    baselineVersion: "1.0.0",
    candidateVersion: "cand-v1",
    configuration: configuration(),
    experimentEvidence: evidence(),
    compatibility: {
      releaseArtifactSchemaVersion: RELEASE_ARTIFACT_SCHEMA_VERSION,
      requiredAlgorithmVersions: { recommendationEngine: "1.0.0" },
      supportedAggregationVersions: ["1.0.0"]
    },
    createdAt: "2026-08-01T00:00:00.000Z",
    computeHash: fakeHash,
    ...overrides
  };
}

describe("buildReleaseArtifact / artifactHash", () => {
  it("mesmo conteúdo funcional produz o mesmo artifactHash", () => {
    expect(buildReleaseArtifact(artifactInput()).artifactHash).toBe(
      buildReleaseArtifact(artifactInput()).artifactHash
    );
  });

  it("configHash do artefato espelha configuration.configHash", () => {
    const artifact = buildReleaseArtifact(artifactInput());
    expect(artifact.configHash).toBe(artifact.configuration.configHash);
  });

  it("alterar um peso da configuração muda o artifactHash", () => {
    const original = buildReleaseArtifact(artifactInput());
    const changedConfig = buildEffectiveConfiguration({
      version: "v1",
      metricWeights: {
        PERSONAL_PERFORMANCE: 0.9,
        RECENT_FORM: 0,
        PERSONAL_MATCHUP: 0,
        BLIND_SAFETY: 0,
        ALLY_SYNERGY: 0,
        ENEMY_COMPOSITION_ANSWER: 0,
        TEAM_COMPOSITION: 0,
        META_STRENGTH: 0.1
      },
      disabledMetrics: [],
      postAggregationRules: BASELINE_POST_AGGREGATION_RULES,
      source: { type: "RELEASE", releaseId: "release-1" },
      algorithmCompatibility: { recommendationEngine: "1.0.0" },
      computeHash: fakeHash
    });
    const changed = buildReleaseArtifact(artifactInput({ configuration: changedConfig }));
    expect(changed.artifactHash).not.toBe(original.artifactHash);
  });

  it("createdAt (data de criação) não entra no artifactHash", () => {
    const first = buildReleaseArtifact(artifactInput({ createdAt: "2026-08-01T00:00:00.000Z" }));
    const later = buildReleaseArtifact(artifactInput({ createdAt: "2026-09-15T12:30:00.000Z" }));
    expect(later.artifactHash).toBe(first.artifactHash);
  });

  it("filtros do experimento em ordem diferente não mudam o artifactHash", () => {
    const first = buildReleaseArtifact(
      artifactInput({ experimentEvidence: evidence({ filters: { roles: ["JUNGLE", "MID"] } }) })
    );
    const second = buildReleaseArtifact(
      artifactInput({ experimentEvidence: evidence({ filters: { roles: ["MID", "JUNGLE"] } }) })
    );
    expect(second.artifactHash).toBe(first.artifactHash);
  });

  it("mudar o candidateRevisionId muda o artifactHash — revisão errada não pode passar por igual", () => {
    const original = buildReleaseArtifact(artifactInput());
    const otherRevision = buildReleaseArtifact(
      artifactInput({ candidateRevisionId: "candidate-1-rev-4" })
    );
    expect(otherRevision.artifactHash).not.toBe(original.artifactHash);
  });

  it("artefato adulterado (campo alterado sem recalcular o hash) é detectável recomputando", () => {
    const artifact = buildReleaseArtifact(artifactInput());
    const tampered: RecommendationReleaseArtifact = {
      ...artifact,
      releaseVersion: "release-adulterada"
    };
    const recomputed = fakeHash(canonicalReleaseArtifactContent(tampered));
    expect(recomputed).not.toBe(tampered.artifactHash);
  });
});
