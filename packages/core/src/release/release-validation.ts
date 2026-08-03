import {
  MAX_PROMOTION_STATUS,
  SUPPORTED_AGGREGATION_VERSIONS,
  validateCalibrationCandidate,
  type CalibrationCandidate,
  type CandidateRejection
} from "../calibration/engine-candidate.js";
import {
  canonicalConfigurationContent,
  validateEffectiveConfigurationStructure,
  type ConfigurationStructuralProblem
} from "./effective-configuration.js";
import { canonicalReleaseArtifactContent, type RecommendationReleaseArtifact } from "./release-artifact.js";
import {
  evaluateLaboratoryEquivalence,
  type LaboratoryEquivalenceCase,
  type LaboratoryEquivalenceResult
} from "./laboratory-equivalence.js";

/**
 * Validação pré-ativação de uma `RecommendationReleaseArtifact` (Etapa 27a).
 *
 * Puro: recebe tudo já carregado (candidata, status do experimento, casos
 * com bundle) e não consulta nada. Cada checagem é **independente e
 * nomeada** — divergência não é ajustada pra passar, e a primeira falha
 * detém a validação (rodar a equivalência com o motor é a checagem mais
 * cara, e não faz sentido pagar esse custo se a candidata já nem está no
 * estado certo).
 */

export type ReleaseValidationStatus =
  | "VALID"
  | "INVALID_CANDIDATE_STATE"
  | "EXPERIMENT_NOT_COMPLETED"
  | "CONFIG_HASH_MISMATCH"
  | "UNSUPPORTED_PARAMETER"
  | "INCOMPATIBLE_ENGINE_VERSION"
  | "ARTIFACT_HASH_MISMATCH"
  | "LABORATORY_RESULT_MISMATCH"
  | "NO_EXACT_REPLAY_CASES";

export interface ReleaseValidationResult {
  status: ReleaseValidationStatus;
  reason: string;
  candidateRejections?: CandidateRejection[];
  configurationProblems?: ConfigurationStructuralProblem[];
  laboratoryEquivalence?: LaboratoryEquivalenceResult;
}

export type ExperimentStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface ValidateReleaseArtifactInput {
  artifact: RecommendationReleaseArtifact;
  /** Candidata na revisão exata referenciada pelo artefato. */
  candidate: CalibrationCandidate;
  experimentStatus: ExperimentStatus;
  /** Casos do experimento com bundle disponível, para a equivalência de motor. */
  laboratoryCases: readonly LaboratoryEquivalenceCase[];
  computeHash: (canonical: string) => string;
}

/**
 * Valida o artefato de release. Não ativa nada — `VALID` é condição
 * necessária pra `READY_FOR_ACTIVATION` (`release-state-machine.ts`), nunca
 * suficiente por si: a transição de estado é decisão separada.
 */
export function validateReleaseArtifact(input: ValidateReleaseArtifactInput): ReleaseValidationResult {
  const { artifact, candidate } = input;

  if (candidate.status !== MAX_PROMOTION_STATUS) {
    return {
      status: "INVALID_CANDIDATE_STATE",
      reason: `A candidata precisa estar em ${MAX_PROMOTION_STATUS}; está em ${candidate.status}.`
    };
  }

  if (input.experimentStatus !== "COMPLETED") {
    return {
      status: "EXPERIMENT_NOT_COMPLETED",
      reason: `O experimento ${artifact.experimentId} precisa estar concluído; está em ${input.experimentStatus}.`
    };
  }

  const expectedConfigHash = input.computeHash(
    canonicalConfigurationContent(artifact.configuration)
  );
  if (expectedConfigHash !== artifact.configuration.configHash || artifact.configHash !== artifact.configuration.configHash) {
    return {
      status: "CONFIG_HASH_MISMATCH",
      reason: `O hash da configuração não corresponde ao conteúdo (esperado ${expectedConfigHash}).`
    };
  }

  const candidateValidation = validateCalibrationCandidate(candidate);
  const structuralValidation = validateEffectiveConfigurationStructure(artifact.configuration);
  if (!candidateValidation.valid || !structuralValidation.valid) {
    return {
      status: "UNSUPPORTED_PARAMETER",
      reason: "A candidata ou a configuração efetiva contém parâmetro não suportado.",
      candidateRejections: candidateValidation.rejections,
      configurationProblems: structuralValidation.problems
    };
  }

  const supportsAggregation =
    SUPPORTED_AGGREGATION_VERSIONS.includes(candidate.baselineAggregationVersion) &&
    artifact.compatibility.supportedAggregationVersions.includes(candidate.baselineAggregationVersion);
  if (!supportsAggregation) {
    return {
      status: "INCOMPATIBLE_ENGINE_VERSION",
      reason: `A agregação ${candidate.baselineAggregationVersion} não é reconhecida por este domínio de release.`
    };
  }

  const expectedArtifactHash = input.computeHash(
    canonicalReleaseArtifactContent(artifact)
  );
  if (expectedArtifactHash !== artifact.artifactHash) {
    return {
      status: "ARTIFACT_HASH_MISMATCH",
      reason: `O conteúdo do artefato não corresponde ao hash declarado (esperado ${expectedArtifactHash}).`
    };
  }

  const laboratoryEquivalence = evaluateLaboratoryEquivalence({
    configuration: artifact.configuration,
    cases: input.laboratoryCases
  });

  if (laboratoryEquivalence.status === "NO_EXACT_REPLAY_CASES") {
    return {
      status: "NO_EXACT_REPLAY_CASES",
      reason: "Nenhum caso do experimento tem bundle histórico disponível para reexecutar o motor.",
      laboratoryEquivalence
    };
  }

  if (laboratoryEquivalence.status === "MISMATCH") {
    return {
      status: "LABORATORY_RESULT_MISMATCH",
      reason:
        "O motor operacional, executado com a configuração da release, diverge do resultado persistido pelo laboratório.",
      laboratoryEquivalence
    };
  }

  return {
    status: "VALID",
    reason: "Release validada: candidata aprovada, experimento concluído, artefato íntegro e equivalente ao motor.",
    laboratoryEquivalence
  };
}
