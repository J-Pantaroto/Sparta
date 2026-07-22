import type { CompositionRules } from "@sparta/core";

/**
 * Thresholds de composicao de time usados pelo recommendation engine
 * (packages/core/src/draft/recommendation-engine.ts). Nao e dado mock -
 * sao constantes de produto (heuristicas iniciais de MVP), so estavam
 * co-localizadas com mock-data.ts por conveniencia do scaffolding inicial.
 */
export const compositionRules: CompositionRules = {
  minimumFrontline: 35,
  minimumEngage: 35,
  minimumWaveclear: 35,
  preferDamageBalance: true
};
