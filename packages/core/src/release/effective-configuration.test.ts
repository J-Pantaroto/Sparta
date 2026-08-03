import { describe, expect, it } from "vitest";
import type { CalibrationCandidate } from "../calibration/engine-candidate.js";
import {
  BASELINE_POST_AGGREGATION_RULES,
  buildEffectiveConfiguration,
  buildEffectiveConfigurationFromCandidate,
  canonicalConfigurationContent,
  computeExecutionRiskPenalty,
  engineWeightsFromConfiguration,
  validateEffectiveConfigurationStructure,
  type SupportedPostAggregationRules,
  type WeightableMetricKey
} from "./effective-configuration.js";

function fakeHash(canonical: string): string {
  let hash = 0;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = (hash * 31 + canonical.charCodeAt(index)) | 0;
  }
  return `h${hash}`;
}

function flatWeights(overrides: Partial<Record<WeightableMetricKey, number>> = {}) {
  const base: Record<WeightableMetricKey, number> = {
    PERSONAL_PERFORMANCE: 0.3,
    RECENT_FORM: 0.15,
    PERSONAL_MATCHUP: 0.1,
    BLIND_SAFETY: 0.1,
    ALLY_SYNERGY: 0.1,
    ENEMY_COMPOSITION_ANSWER: 0.1,
    TEAM_COMPOSITION: 0.1,
    META_STRENGTH: 0.05
  };
  return { ...base, ...overrides };
}

function config(overrides: Partial<Parameters<typeof buildEffectiveConfiguration>[0]> = {}) {
  return buildEffectiveConfiguration({
    version: "v1",
    metricWeights: flatWeights(),
    disabledMetrics: [],
    postAggregationRules: BASELINE_POST_AGGREGATION_RULES,
    source: { type: "RELEASE", releaseId: "release-1" },
    algorithmCompatibility: { recommendationEngine: "1.0.0" },
    computeHash: fakeHash,
    ...overrides
  });
}

describe("canonicalConfigurationContent / configHash", () => {
  it("mesmo conteúdo funcional produz o mesmo hash", () => {
    expect(config().configHash).toBe(config().configHash);
  });

  it("alterar um peso muda o configHash", () => {
    const original = config();
    const changed = config({ metricWeights: flatWeights({ BLIND_SAFETY: 0.5 }) });
    expect(changed.configHash).not.toBe(original.configHash);
  });

  it("alterar apenas a versão (rótulo) não muda o configHash", () => {
    const original = config();
    const renamed = config({ version: "outro-rotulo" });
    expect(renamed.configHash).toBe(original.configHash);
  });

  it("desligar uma métrica muda o hash mesmo com o mesmo peso declarado", () => {
    const original = config();
    const disabled = config({ disabledMetrics: ["BLIND_SAFETY"] });
    expect(disabled.configHash).not.toBe(original.configHash);
  });

  it("ordem de disabledMetrics não muda o hash (canonicalizado)", () => {
    const first = config({ disabledMetrics: ["BLIND_SAFETY", "META_STRENGTH"] });
    const second = config({ disabledMetrics: ["META_STRENGTH", "BLIND_SAFETY"] });
    expect(first.configHash).toBe(second.configHash);
  });

  it("ordem de algorithmCompatibility não muda o hash", () => {
    const first = config({ algorithmCompatibility: { a: "1", b: "2" } });
    const second = config({ algorithmCompatibility: { b: "2", a: "1" } });
    expect(first.configHash).toBe(second.configHash);
  });

  it("mudar um threshold pós-agregação muda o hash", () => {
    const original = config();
    const changed = config({
      postAggregationRules: { ...BASELINE_POST_AGGREGATION_RULES, primaryCount: 3 }
    });
    expect(changed.configHash).not.toBe(original.configHash);
  });

  it("canonicalConfigurationContent nunca inclui configHash nem version", () => {
    const built = config();
    const canonical = canonicalConfigurationContent(built);
    expect(canonical).not.toContain(built.configHash);
    expect(canonical).not.toContain("\"v1\"");
  });
});

describe("engineWeightsFromConfiguration", () => {
  it("mapeia as oito chaves públicas para as chaves internas do motor", () => {
    const weights = engineWeightsFromConfiguration(config());
    expect(weights).toEqual({
      personalPerformance: 0.3,
      recentForm: 0.15,
      matchup: 0.1,
      blindSafety: 0.1,
      allySynergy: 0.1,
      enemyDraftAnswer: 0.1,
      compositionFit: 0.1,
      meta: 0.05
    });
  });

  it("zera métricas desligadas mesmo com peso positivo declarado", () => {
    const weights = engineWeightsFromConfiguration(
      config({ disabledMetrics: ["PERSONAL_PERFORMANCE"] })
    );
    expect(weights.personalPerformance).toBe(0);
  });

  it("chave ausente do objeto de pesos nunca produz undefined/NaN", () => {
    const partial = config();
    const withMissingKey = {
      ...partial,
      metricWeights: (() => {
        const clone = { ...partial.metricWeights };
        delete (clone as Record<string, number>).META_STRENGTH;
        return clone;
      })()
    };
    const weights = engineWeightsFromConfiguration(withMissingKey);
    expect(weights.meta).toBe(0);
    expect(Number.isFinite(weights.meta)).toBe(true);
  });
});

describe("computeExecutionRiskPenalty", () => {
  const rules: Pick<SupportedPostAggregationRules, "executionRiskPenaltyStart" | "executionRiskMaxPenalty"> =
    { executionRiskPenaltyStart: 25, executionRiskMaxPenalty: 8 };

  it("risco abaixo do início da curva não penaliza", () => {
    expect(computeExecutionRiskPenalty(25, rules)).toBe(0);
    expect(computeExecutionRiskPenalty(10, rules)).toBe(0);
  });

  it("risco máximo (100) aplica o teto da penalização", () => {
    expect(computeExecutionRiskPenalty(100, rules)).toBe(8);
  });

  it("risco entre início e 100 é proporcional", () => {
    // (62.5 - 25) / (100 - 25) = 0.5 -> metade do teto
    expect(computeExecutionRiskPenalty(62.5, rules)).toBe(4);
  });

  it("thresholds reconfigurados mudam a penalização para o mesmo risco", () => {
    const stricter = { executionRiskPenaltyStart: 0, executionRiskMaxPenalty: 20 };
    expect(computeExecutionRiskPenalty(50, stricter)).toBeGreaterThan(
      computeExecutionRiskPenalty(50, rules)
    );
  });
});

describe("validateEffectiveConfigurationStructure", () => {
  it("configuração bem formada é válida", () => {
    expect(validateEffectiveConfigurationStructure(config()).valid).toBe(true);
  });

  it("peso negativo é rejeitado", () => {
    const result = validateEffectiveConfigurationStructure(
      config({ metricWeights: flatWeights({ BLIND_SAFETY: -0.1 }) })
    );
    expect(result.valid).toBe(false);
    expect(result.problems).toContainEqual({ code: "NEGATIVE_WEIGHT", metric: "BLIND_SAFETY" });
  });

  it("nenhum peso positivo disponível é rejeitado", () => {
    const allZero = flatWeights({
      PERSONAL_PERFORMANCE: 0,
      RECENT_FORM: 0,
      PERSONAL_MATCHUP: 0,
      BLIND_SAFETY: 0,
      ALLY_SYNERGY: 0,
      ENEMY_COMPOSITION_ANSWER: 0,
      TEAM_COMPOSITION: 0,
      META_STRENGTH: 0
    });
    const result = validateEffectiveConfigurationStructure(config({ metricWeights: allZero }));
    expect(result.valid).toBe(false);
    expect(result.problems).toContainEqual({ code: "NO_POSITIVE_WEIGHT" });
  });

  it("todo o peso positivo desligado também conta como nenhum peso disponível", () => {
    const onlyOnePositive = flatWeights({
      PERSONAL_PERFORMANCE: 1,
      RECENT_FORM: 0,
      PERSONAL_MATCHUP: 0,
      BLIND_SAFETY: 0,
      ALLY_SYNERGY: 0,
      ENEMY_COMPOSITION_ANSWER: 0,
      TEAM_COMPOSITION: 0,
      META_STRENGTH: 0
    });
    const result = validateEffectiveConfigurationStructure(
      config({ metricWeights: onlyOnePositive, disabledMetrics: ["PERSONAL_PERFORMANCE"] })
    );
    expect(result.valid).toBe(false);
    expect(result.problems).toContainEqual({ code: "NO_POSITIVE_WEIGHT" });
  });

  it("threshold fora da faixa é rejeitado", () => {
    const result = validateEffectiveConfigurationStructure(
      config({ postAggregationRules: { ...BASELINE_POST_AGGREGATION_RULES, primaryCount: 0 } })
    );
    expect(result.valid).toBe(false);
    expect(result.problems).toContainEqual({ code: "RULE_OUT_OF_RANGE", rule: "primaryCount" });
  });

  it("threshold não finito é rejeitado", () => {
    const result = validateEffectiveConfigurationStructure(
      config({
        postAggregationRules: {
          ...BASELINE_POST_AGGREGATION_RULES,
          minimumScoreToRecommend: Number.NaN
        }
      })
    );
    expect(result.valid).toBe(false);
    expect(result.problems).toContainEqual({ code: "NON_FINITE_RULE", rule: "minimumScoreToRecommend" });
  });
});

describe("buildEffectiveConfigurationFromCandidate", () => {
  function candidate(overrides: Partial<CalibrationCandidate> = {}): CalibrationCandidate {
    return {
      id: "candidate-1",
      name: "Candidata de teste",
      baselineAggregationVersion: "1.0.0",
      candidateVersion: "cand-v1",
      metricWeights: { PERSONAL_PERFORMANCE: 0.6, BLIND_SAFETY: 0.4 },
      status: "APPROVED_FOR_FUTURE_RELEASE",
      ...overrides
    };
  }

  it("preenche métricas ausentes com zero", () => {
    const result = buildEffectiveConfigurationFromCandidate({
      candidate: candidate(),
      version: "v1",
      source: { type: "RELEASE", releaseId: "release-1" },
      algorithmCompatibility: {},
      computeHash: fakeHash
    });
    expect(result.metricWeights.RECENT_FORM).toBe(0);
    expect(result.metricWeights.PERSONAL_PERFORMANCE).toBe(0.6);
    expect(result.metricWeights.BLIND_SAFETY).toBe(0.4);
  });

  it("resolve os thresholds pós-agregação: operacionais + o que a candidata sobrescreveu", () => {
    const result = buildEffectiveConfigurationFromCandidate({
      candidate: candidate({ postAggregationThresholds: { primaryCount: 3 } }),
      version: "v1",
      source: { type: "RELEASE", releaseId: "release-1" },
      algorithmCompatibility: {},
      computeHash: fakeHash
    });
    expect(result.postAggregationRules.primaryCount).toBe(3);
    expect(result.postAggregationRules.alternativeCount).toBe(
      BASELINE_POST_AGGREGATION_RULES.alternativeCount
    );
  });

  it("filtra disabledMetrics para só as métricas ponderáveis", () => {
    const result = buildEffectiveConfigurationFromCandidate({
      candidate: candidate({ disabledMetrics: ["BLIND_SAFETY"] }),
      version: "v1",
      source: { type: "RELEASE", releaseId: "release-1" },
      algorithmCompatibility: {},
      computeHash: fakeHash
    });
    expect(result.disabledMetrics).toEqual(["BLIND_SAFETY"]);
  });
});
