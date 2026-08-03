import type {
  CalibrationExperimentFilters,
  CalibrationExperimentReport
} from "../calibration/ranking-comparison.js";
import type { EffectiveRecommendationConfiguration } from "./effective-configuration.js";

/**
 * `RecommendationReleaseArtifact` — o que uma configuração aprovada no
 * laboratório vira ao se tornar candidata a release operacional (Etapa 27a).
 *
 * O artefato congela tudo que prova a origem e a evidência da release:
 * revisão exata da candidata, configuração completa, experimento usado (com
 * filtros, amostra e resumo) e as versões de algoritmo compatíveis. Depois
 * de criado, é imutável — uma edição posterior na candidata (Etapa 25b já
 * modela revisão como linha nova, nunca sobrescrita) não pode alterar um
 * artefato já construído, porque o artefato referencia a revisão exata
 * (`candidateRevisionId`), não a candidata "atual".
 *
 * Nenhum campo aqui é de interface (nome amigável, descrição visual) nem de
 * operação (ativação, data de ativação) — isso é 27b.
 */

export const RELEASE_ARTIFACT_SCHEMA_VERSION = "recommendation-release-artifact/1.0.0";

/**
 * Evidência do experimento que sustenta a release: identidade, filtros,
 * amostra e o resumo já produzido por `summarizeCalibrationExperiment`
 * (Etapa 25b) — reaproveitado inteiro, não reconstruído aqui.
 */
export interface ReleaseExperimentEvidence {
  experimentId: string;
  /** Hash do input do experimento (candidata + snapshots + filtros + versões). */
  experimentInputHash: string;
  laboratoryVersion: string;
  filters: CalibrationExperimentFilters;
  sampleSize: number;
  exactReplayCases: number;
  excludedCases: number;
  summary: CalibrationExperimentReport;
  /** Limitações conhecidas, em texto — amostra pequena, segmento sem cobertura etc. */
  knownLimitations: string[];
}

export interface ReleaseCompatibilityManifest {
  releaseArtifactSchemaVersion: string;
  /** Versões de algoritmo que esta release exige para ser aplicada. */
  requiredAlgorithmVersions: Record<string, string>;
  supportedAggregationVersions: readonly string[];
}

export interface RecommendationReleaseArtifact {
  artifactSchemaVersion: string;
  releaseVersion: string;

  candidateId: string;
  candidateRevisionId: string;
  experimentId: string;

  baselineVersion: string;
  candidateVersion: string;

  configuration: EffectiveRecommendationConfiguration;
  /** Espelho de `configuration.configHash` — conveniência de leitura. */
  configHash: string;
  artifactHash: string;

  experimentEvidence: ReleaseExperimentEvidence;
  compatibility: ReleaseCompatibilityManifest;

  /** Metadado puro: fora do `artifactHash`. */
  createdAt: string;
}

function sortedRecord(record: Record<string, string>): [string, string][] {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right, "en"));
}

function canonicalFilters(filters: CalibrationExperimentFilters): unknown {
  return {
    roles: [...new Set(filters.roles ?? [])].sort(),
    patches: [...new Set(filters.patches ?? [])].sort(),
    queues: [...new Set(filters.queues ?? [])].sort(),
    from: filters.from ?? null,
    to: filters.to ?? null,
    minimumPoolSize: filters.minimumPoolSize ?? null,
    minimumBaselineCoverage: filters.minimumBaselineCoverage ?? null,
    engineVersions: [...new Set(filters.engineVersions ?? [])].sort(),
    preMatchRatings: [...new Set(filters.preMatchRatings ?? [])].sort(),
    issueTags: [...new Set(filters.issueTags ?? [])].sort()
  };
}

/**
 * Serialização canônica do conteúdo funcional da release, usada pelo
 * `artifactHash`. Fora: `createdAt` (metadado), qualquer campo de
 * apresentação (o contrato não tem nenhum) e ordem acidental de mapas e
 * conjuntos — `sortedRecord`/`[...new Set(...)].sort()` neutralizam as duas.
 */
export function canonicalReleaseArtifactContent(
  artifact: Omit<RecommendationReleaseArtifact, "createdAt" | "artifactHash">
): string {
  return JSON.stringify({
    artifactSchemaVersion: artifact.artifactSchemaVersion,
    releaseVersion: artifact.releaseVersion,
    candidateId: artifact.candidateId,
    candidateRevisionId: artifact.candidateRevisionId,
    experimentId: artifact.experimentId,
    baselineVersion: artifact.baselineVersion,
    candidateVersion: artifact.candidateVersion,
    // O conteúdo funcional da configuração já está no próprio configHash —
    // incluí-lo aqui de novo (em vez de recanonicalizar o objeto inteiro)
    // evita duas fontes de canonicalização divergentes para o mesmo dado.
    configHash: artifact.configHash,
    experimentEvidence: {
      experimentId: artifact.experimentEvidence.experimentId,
      experimentInputHash: artifact.experimentEvidence.experimentInputHash,
      laboratoryVersion: artifact.experimentEvidence.laboratoryVersion,
      filters: canonicalFilters(artifact.experimentEvidence.filters),
      sampleSize: artifact.experimentEvidence.sampleSize,
      exactReplayCases: artifact.experimentEvidence.exactReplayCases,
      excludedCases: artifact.experimentEvidence.excludedCases,
      // O resumo entra pela identidade dele (id/versão/contagens), não pelo
      // JSON completo do relatório: os totais de exclusão/segmento já
      // dependem de `sampleSize`/`exactReplayCases`, incluídos acima; o
      // relatório inteiro é preservado no artefato só como evidência de
      // leitura, e recanonicalizá-lo inflaria o hash sem mudar o que ele
      // representa (mesma release para a mesma amostra e o mesmo resultado).
      summaryLabVersion: artifact.experimentEvidence.summary.labVersion,
      summaryCandidateStatus: artifact.experimentEvidence.summary.candidateStatus,
      knownLimitations: [...artifact.experimentEvidence.knownLimitations].sort((left, right) =>
        left.localeCompare(right, "en")
      )
    },
    compatibility: {
      releaseArtifactSchemaVersion: artifact.compatibility.releaseArtifactSchemaVersion,
      requiredAlgorithmVersions: sortedRecord(artifact.compatibility.requiredAlgorithmVersions),
      supportedAggregationVersions: [...artifact.compatibility.supportedAggregationVersions].sort()
    }
  });
}

/**
 * Monta o artefato e calcula `artifactHash`. `computeHash` é injetado pelo
 * mesmo motivo de sempre: `packages/core` roda no renderer.
 */
export function buildReleaseArtifact(
  input: Omit<RecommendationReleaseArtifact, "artifactSchemaVersion" | "artifactHash" | "configHash"> & {
    computeHash: (canonical: string) => string;
  }
): RecommendationReleaseArtifact {
  const withoutHash: Omit<RecommendationReleaseArtifact, "artifactHash"> = {
    artifactSchemaVersion: RELEASE_ARTIFACT_SCHEMA_VERSION,
    releaseVersion: input.releaseVersion,
    candidateId: input.candidateId,
    candidateRevisionId: input.candidateRevisionId,
    experimentId: input.experimentId,
    baselineVersion: input.baselineVersion,
    candidateVersion: input.candidateVersion,
    configuration: input.configuration,
    configHash: input.configuration.configHash,
    experimentEvidence: input.experimentEvidence,
    compatibility: input.compatibility,
    createdAt: input.createdAt
  };
  const forHash: Omit<RecommendationReleaseArtifact, "createdAt" | "artifactHash"> = {
    artifactSchemaVersion: withoutHash.artifactSchemaVersion,
    releaseVersion: withoutHash.releaseVersion,
    candidateId: withoutHash.candidateId,
    candidateRevisionId: withoutHash.candidateRevisionId,
    experimentId: withoutHash.experimentId,
    baselineVersion: withoutHash.baselineVersion,
    candidateVersion: withoutHash.candidateVersion,
    configuration: withoutHash.configuration,
    configHash: withoutHash.configHash,
    experimentEvidence: withoutHash.experimentEvidence,
    compatibility: withoutHash.compatibility
  };
  return {
    ...withoutHash,
    artifactHash: input.computeHash(canonicalReleaseArtifactContent(forHash))
  };
}
