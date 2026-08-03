import { describe, expect, it } from "vitest";
import {
  canTransitionReleaseLifecycle,
  isTerminalReleaseLifecycleStatus,
  transitionReleaseLifecycle,
  type ReleaseLifecycleStatus
} from "./release-state-machine.js";
import type { ReleaseValidationResult } from "./release-validation.js";

const ALL_STATUSES: ReleaseLifecycleStatus[] = [
  "DRAFT",
  "VALIDATING",
  "VALIDATION_FAILED",
  "READY_FOR_ACTIVATION",
  "ACTIVE",
  "ROLLED_BACK",
  "REJECTED"
];

function validResult(): ReleaseValidationResult {
  return { status: "VALID", reason: "ok" };
}

function invalidResult(): ReleaseValidationResult {
  return { status: "LABORATORY_RESULT_MISMATCH", reason: "diverge" };
}

describe("canTransitionReleaseLifecycle", () => {
  it("DRAFT só avança para VALIDATING", () => {
    expect(canTransitionReleaseLifecycle("DRAFT", "VALIDATING")).toBe(true);
    for (const status of ALL_STATUSES.filter((s) => s !== "VALIDATING")) {
      expect(canTransitionReleaseLifecycle("DRAFT", status)).toBe(false);
    }
  });

  it("só READY_FOR_ACTIVATION alcança ACTIVE", () => {
    for (const status of ALL_STATUSES) {
      const allowed = canTransitionReleaseLifecycle(status, "ACTIVE");
      expect(allowed).toBe(status === "READY_FOR_ACTIVATION");
    }
  });

  it("só ACTIVE alcança ROLLED_BACK — rollback nunca parte de quem nunca esteve ativo", () => {
    for (const status of ALL_STATUSES) {
      const allowed = canTransitionReleaseLifecycle(status, "ROLLED_BACK");
      expect(allowed).toBe(status === "ACTIVE");
    }
  });

  it("REJECTED e ROLLED_BACK são terminais", () => {
    expect(isTerminalReleaseLifecycleStatus("REJECTED")).toBe(true);
    expect(isTerminalReleaseLifecycleStatus("ROLLED_BACK")).toBe(true);
    for (const target of ALL_STATUSES) {
      expect(canTransitionReleaseLifecycle("REJECTED", target)).toBe(false);
      expect(canTransitionReleaseLifecycle("ROLLED_BACK", target)).toBe(false);
    }
  });
});

describe("transitionReleaseLifecycle", () => {
  it("release validada chega a READY_FOR_ACTIVATION", () => {
    const result = transitionReleaseLifecycle({
      from: "VALIDATING",
      to: "READY_FOR_ACTIVATION",
      validation: validResult()
    });
    expect(result).toEqual({ ok: true, status: "READY_FOR_ACTIVATION" });
  });

  it("release não validada (ou sem validação) não chega a READY_FOR_ACTIVATION", () => {
    const semValidacao = transitionReleaseLifecycle({ from: "VALIDATING", to: "READY_FOR_ACTIVATION" });
    expect(semValidacao).toEqual({
      ok: false,
      reason: "VALIDATION_NOT_PASSED",
      from: "VALIDATING",
      to: "READY_FOR_ACTIVATION"
    });

    const invalida = transitionReleaseLifecycle({
      from: "VALIDATING",
      to: "READY_FOR_ACTIVATION",
      validation: invalidResult()
    });
    expect(invalida.ok).toBe(false);
    if (!invalida.ok) expect(invalida.reason).toBe("VALIDATION_NOT_PASSED");
  });

  it("READY_FOR_ACTIVATION não significa ativa — é preciso uma transição própria", () => {
    const result = transitionReleaseLifecycle({
      from: "VALIDATING",
      to: "READY_FOR_ACTIVATION",
      validation: validResult()
    });
    expect(result.ok && result.status).toBe("READY_FOR_ACTIVATION");
    expect(result.ok && (result.status as string)).not.toBe("ACTIVE");
  });

  it("release rejeitada não pode ser ativada", () => {
    const result = transitionReleaseLifecycle({ from: "REJECTED", to: "ACTIVE" });
    expect(result).toEqual({ ok: false, reason: "INVALID_TRANSITION", from: "REJECTED", to: "ACTIVE" });
  });

  it("transição fora do grafo é bloqueada", () => {
    const result = transitionReleaseLifecycle({ from: "DRAFT", to: "ACTIVE" });
    expect(result).toEqual({ ok: false, reason: "INVALID_TRANSITION", from: "DRAFT", to: "ACTIVE" });
  });

  it("rollback só parte de ACTIVE", () => {
    const fromReady = transitionReleaseLifecycle({ from: "READY_FOR_ACTIVATION", to: "ROLLED_BACK" });
    expect(fromReady.ok).toBe(false);

    const fromActive = transitionReleaseLifecycle({ from: "ACTIVE", to: "ROLLED_BACK" });
    expect(fromActive).toEqual({ ok: true, status: "ROLLED_BACK" });
  });

  it("recusa a transição se o artefato mudou desde a validação (hash diferente)", () => {
    const artifact = { artifactHash: "hash-atual" } as never;
    const result = transitionReleaseLifecycle({
      from: "VALIDATING",
      to: "READY_FOR_ACTIVATION",
      validation: validResult(),
      artifact,
      validatedArtifactHash: "hash-diferente"
    });
    expect(result).toEqual({
      ok: false,
      reason: "ARTIFACT_CHANGED",
      from: "VALIDATING",
      to: "READY_FOR_ACTIVATION"
    });
  });

  it("aceita quando o hash do artefato bate com o validado", () => {
    const artifact = { artifactHash: "hash-atual" } as never;
    const result = transitionReleaseLifecycle({
      from: "VALIDATING",
      to: "READY_FOR_ACTIVATION",
      validation: validResult(),
      artifact,
      validatedArtifactHash: "hash-atual"
    });
    expect(result).toEqual({ ok: true, status: "READY_FOR_ACTIVATION" });
  });

  it("VALIDATION_FAILED pode voltar para VALIDATING (nova tentativa) ou ir para REJECTED", () => {
    expect(canTransitionReleaseLifecycle("VALIDATION_FAILED", "VALIDATING")).toBe(true);
    expect(canTransitionReleaseLifecycle("VALIDATION_FAILED", "REJECTED")).toBe(true);
  });
});
