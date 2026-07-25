import type { Confidence, PickRecommendation } from "../types/domain.js";
import type { DataProvenance } from "../types/provenance.js";
import { toConfidenceScore } from "../types/provenance.js";
import { availableMetric, type RecommendationMetric } from "../types/recommendation-metric.js";

/**
 * Adaptador ÚNICO entre os números que o motor calcula hoje
 * (`PickRecommendation.metrics`) e o contrato de métrica estruturada
 * (`RecommendationMetric`), que é o que a interface passa a consumir.
 *
 * Por que existe um adaptador em vez de trocar o tipo de uma vez: esta etapa
 * não pode mudar cálculo nenhum, e `metrics` continua sendo a entrada
 * numérica do `totalScore`. Manter os dois lados por enquanto é a transição
 * menos destrutiva — mas ela é **temporária e centralizada aqui**: quando o
 * motor passar a produzir métricas que podem estar ausentes (a etapa que
 * converte `meta` e `LANE_MATCHUP` em indisponíveis), este módulo deixa de
 * ser adaptador e passa a ser o produtor, e `metrics` sai de cena.
 *
 * Enquanto isso: nada aqui inventa proveniência. Métrica cuja origem ainda
 * não é declarável sai **sem** o campo `provenance`, que é diferente de sair
 * com uma origem chutada.
 */

/** Versão do algoritmo de recomendação, pra rastrear dado derivado por ele. */
export const RECOMMENDATION_ENGINE_VERSION = "1.0.0";

/** Deriva do histórico do próprio jogador já persistido pelo Sparta. */
const personalHistoryProvenance: DataProvenance = {
  sourceType: "CALCULATED",
  sourceId: "sparta",
  resource: "PlayerChampionStats",
  algorithmVersion: RECOMMENDATION_ENGINE_VERSION
};

/** Deriva dos atributos de classe do campeão (`ChampionTag`). */
const championTagProvenance: DataProvenance = {
  sourceType: "DERIVED",
  sourceId: "sparta",
  resource: "ChampionTag",
  algorithmVersion: RECOMMENDATION_ENGINE_VERSION
};

/**
 * Converte o bloco numérico atual em métricas estruturadas, uma por
 * candidato. Todas saem `AVAILABLE` de propósito: esta etapa preserva o
 * comportamento atual: os casos em que hoje o 50 na verdade significa
 * "não temos esse dado" (`META_STRENGTH` sempre, `LANE_MATCHUP` sem
 * histórico do confronto) só passam a declarar indisponibilidade na etapa
 * seguinte. Por isso essas duas saem sem `provenance`: dizer que vieram de
 * algum lugar seria inventar.
 *
 * `confidence` vem da confiança já calculada pelo motor para o candidato, e
 * só se aplica às métricas que dependem do histórico dele — as derivadas de
 * tabela de classe não têm confiança conhecida e ficam com `null`.
 */
export function toRecommendationMetrics(
  metrics: {
    personalPerformance: number;
    recentForm: number;
    matchup: number;
    blindSafety: number;
    allySynergy: number;
    enemyDraftAnswer: number;
    compositionFit: number;
    meta: number;
  },
  confidence: Confidence
): RecommendationMetric[] {
  const personalConfidence = toConfidenceScore(confidence);

  return [
    availableMetric({
      key: "PERSONAL_PERFORMANCE",
      value: metrics.personalPerformance,
      confidence: personalConfidence,
      provenance: personalHistoryProvenance
    }),
    availableMetric({
      key: "RECENT_FORM",
      value: metrics.recentForm,
      confidence: personalConfidence,
      provenance: personalHistoryProvenance
    }),
    availableMetric({ key: "LANE_MATCHUP", value: metrics.matchup }),
    availableMetric({
      key: "BLIND_SAFETY",
      value: metrics.blindSafety,
      provenance: championTagProvenance
    }),
    availableMetric({
      key: "ALLY_SYNERGY",
      value: metrics.allySynergy,
      provenance: championTagProvenance
    }),
    availableMetric({
      key: "ENEMY_COMPOSITION_ANSWER",
      value: metrics.enemyDraftAnswer,
      provenance: championTagProvenance
    }),
    availableMetric({
      key: "TEAM_COMPOSITION",
      value: metrics.compositionFit,
      provenance: championTagProvenance
    }),
    availableMetric({ key: "META_STRENGTH", value: metrics.meta })
  ];
}

/**
 * Entrada tolerante: uma recomendação que pode ter vindo de um backend
 * anterior ao contrato (ou de um cache gravado antes dele).
 */
type MaybeStructured = Pick<PickRecommendation, "metrics" | "confidence"> & {
  metricDetails?: RecommendationMetric[];
};

/**
 * Garante métricas estruturadas para uma recomendação recebida de fora do
 * processo.
 *
 * Existe por um motivo medido, não hipotético: o desktop e a API são
 * versionados e implantados separadamente, então o app pode estar falando
 * com um backend mais antigo — foi exatamente o que aconteceu ao validar
 * esta etapa contra a API em execução, e a tela inteira quebrou num
 * `metricDetails is not iterable`. A interface não pode depender de as duas
 * versões andarem juntas.
 *
 * Sem `metricDetails` E sem `metrics`, devolve lista vazia: não há o que
 * exibir, e inventar valor aqui seria o oposto do que este contrato existe
 * pra garantir.
 */
export function ensureRecommendationMetrics(recommendation: MaybeStructured): RecommendationMetric[] {
  if (Array.isArray(recommendation.metricDetails) && recommendation.metricDetails.length > 0) {
    return recommendation.metricDetails;
  }
  if (!recommendation.metrics) return [];
  return toRecommendationMetrics(recommendation.metrics, recommendation.confidence);
}
