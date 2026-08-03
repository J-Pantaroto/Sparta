import type { RecommendationReleaseArtifact } from "./release-artifact.js";
import type { ReleaseValidationResult } from "./release-validation.js";

/**
 * Máquina de estados do ciclo de vida de uma release (Etapa 27a).
 *
 * Só as regras de transição — nada aqui persiste nem executa ativação real
 * (isso é 27b). `ACTIVE`/`ROLLED_BACK` existem como **estados alcançáveis
 * pela máquina**, não como efeito colateral operacional: nenhuma função
 * deste módulo liga a release a nada, só diz se a transição de um estado
 * pro outro é permitida.
 */

export type ReleaseLifecycleStatus =
  | "DRAFT"
  | "VALIDATING"
  | "VALIDATION_FAILED"
  | "READY_FOR_ACTIVATION"
  | "ACTIVE"
  | "ROLLED_BACK"
  | "REJECTED";

/**
 * Grafo de transições permitidas.
 *
 * - `ROLLED_BACK` e `REJECTED` são terminais: nenhuma release volta a valer
 *   depois de rejeitada, e um rollback não "reativa" sozinho — uma nova
 *   tentativa é um artefato novo, não uma transição deste.
 * - `ACTIVE` só é alcançável a partir de `READY_FOR_ACTIVATION`: não existe
 *   atalho de `DRAFT`/`VALIDATING` direto pra ativa.
 * - `ROLLED_BACK` só é alcançável a partir de `ACTIVE`: não se "desfaz" uma
 *   release que nunca esteve no ar.
 */
const ALLOWED_TRANSITIONS: Record<ReleaseLifecycleStatus, readonly ReleaseLifecycleStatus[]> = {
  DRAFT: ["VALIDATING"],
  VALIDATING: ["VALIDATION_FAILED", "READY_FOR_ACTIVATION"],
  VALIDATION_FAILED: ["VALIDATING", "REJECTED"],
  READY_FOR_ACTIVATION: ["ACTIVE", "REJECTED"],
  ACTIVE: ["ROLLED_BACK"],
  ROLLED_BACK: [],
  REJECTED: []
};

export function canTransitionReleaseLifecycle(
  from: ReleaseLifecycleStatus,
  to: ReleaseLifecycleStatus
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalReleaseLifecycleStatus(status: ReleaseLifecycleStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

export type ReleaseTransitionRejectionReason =
  | "INVALID_TRANSITION"
  | "VALIDATION_NOT_PASSED"
  | "ARTIFACT_CHANGED";

export type ReleaseTransitionResult =
  | { ok: true; status: ReleaseLifecycleStatus }
  | {
      ok: false;
      reason: ReleaseTransitionRejectionReason;
      from: ReleaseLifecycleStatus;
      to: ReleaseLifecycleStatus;
    };

export interface TransitionReleaseLifecycleInput {
  from: ReleaseLifecycleStatus;
  to: ReleaseLifecycleStatus;
  /**
   * Exigido só na transição para `READY_FOR_ACTIVATION`: é a checagem que
   * garante "somente release válida chega lá" — sem `validation` ou com
   * `status !== "VALID"`, a transição é recusada, mesmo que o grafo permita.
   */
  validation?: ReleaseValidationResult;
  /**
   * Confere que o artefato não mudou desde a validação, quando os dois são
   * informados — hash diferente do que a validação avaliou é uma violação
   * de imutabilidade, não uma questão de estado.
   */
  artifact?: RecommendationReleaseArtifact;
  validatedArtifactHash?: string;
}

/**
 * Aplica uma transição. Pura: recebe o estado atual e devolve o novo estado
 * ou uma rejeição nomeada — não persiste nada.
 */
export function transitionReleaseLifecycle(
  input: TransitionReleaseLifecycleInput
): ReleaseTransitionResult {
  const { from, to } = input;

  if (
    input.artifact &&
    input.validatedArtifactHash !== undefined &&
    input.artifact.artifactHash !== input.validatedArtifactHash
  ) {
    return { ok: false, reason: "ARTIFACT_CHANGED", from, to };
  }

  if (!canTransitionReleaseLifecycle(from, to)) {
    return { ok: false, reason: "INVALID_TRANSITION", from, to };
  }

  if (to === "READY_FOR_ACTIVATION" && input.validation?.status !== "VALID") {
    return { ok: false, reason: "VALIDATION_NOT_PASSED", from, to };
  }

  return { ok: true, status: to };
}
