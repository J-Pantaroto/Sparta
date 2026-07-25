import type { AvailabilityStatus, ConfidenceScore, DataProvenance } from "./provenance.js";

/**
 * Contrato central de uma MÉTRICA de recomendação.
 *
 * Cada métrica é independente e carrega a própria disponibilidade, confiança
 * e proveniência — inclusive dentro de um mesmo candidato. Duas métricas do
 * mesmo campeão podem legitimamente ter origens diferentes (uma OBSERVED do
 * histórico, outra DERIVED de uma tabela de classe), e dois candidatos
 * podem ter disponibilidades diferentes pra mesma métrica (um tem histórico
 * de confronto, o outro não).
 */

/**
 * Identificador estável de cada métrica.
 *
 * Conceitos que **não** podem ser fundidos, e por quê:
 *
 * - `PERSONAL_MATCHUP` vs `GLOBAL_MATCHUP` — o primeiro é o histórico do
 *   próprio jogador naquele confronto; o segundo é a taxa observada no meta
 *   em geral. Um jogador pode ir bem num confronto estatisticamente ruim.
 * - `LANE_MATCHUP` — chave legada de transporte. O motor não a produz; a
 *   compatibilidade a migra para `PERSONAL_MATCHUP` indisponível se faltar
 *   proveniência suficiente.
 * - `PATCH_OFFICIAL_CHANGE` vs `PATCH_IMPACT` vs `META_STRENGTH` — o
 *   primeiro é fato publicado pela Riot (o campeão foi alterado); o segundo
 *   é leitura sobre esse fato (a alteração ajuda ou atrapalha); o terceiro é
 *   o que as partidas mostram depois. Fato, interpretação e observação.
 * - `CHAMPION_DIFFICULTY` vs `EXECUTION_RISK` — dificuldade é do campeão pra
 *   qualquer um; risco de execução é desse campeão pra ESTE jogador.
 * - `PERSONAL_PERFORMANCE` vs `PERSONAL_EXPERIENCE` — desempenho é quão bem
 *   joga; experiência é quanto já jogou. Amostra pequena com bom desempenho
 *   não é a mesma coisa que amostra grande com desempenho médio.
 * - `ALLY_SYNERGY` vs `TEAM_COMPOSITION` vs `ENEMY_COMPOSITION_ANSWER` —
 *   encaixe com quem já foi escolhido, adequação ao draft 5x5 completo, e
 *   resposta ao time inimigo. São três perguntas distintas.
 *
 * A lista é aberta: métricas de build/runa e de pré/pós-game entram aqui
 * quando forem implementadas, sem alterar o contrato.
 */
export type RecommendationMetricKey =
  | "PERSONAL_PERFORMANCE"
  | "PERSONAL_EXPERIENCE"
  | "RECENT_FORM"
  | "PERSONAL_MATCHUP"
  | "GLOBAL_MATCHUP"
  | "LANE_MATCHUP"
  | "BLIND_SAFETY"
  | "ALLY_SYNERGY"
  | "TEAM_COMPOSITION"
  | "ENEMY_COMPOSITION_ANSWER"
  | "CHAMPION_DIFFICULTY"
  | "EXECUTION_RISK"
  | "PATCH_OFFICIAL_CHANGE"
  | "PATCH_IMPACT"
  | "META_STRENGTH";

export interface RecommendationMetric {
  key: RecommendationMetricKey;
  /**
   * Valor 0-100, ou `null` quando não há valor. **Nunca** preencher com 0 ou
   * 50 pra representar ausência — é exatamente o problema que este contrato
   * existe pra resolver.
   */
  value: number | null;
  status: AvailabilityStatus;
  /** `null` quando a confiança não é conhecida (≠ confiança baixa). */
  confidence: ConfidenceScore | null;
  provenance?: DataProvenance;
  /** Explicação curta exibível ao jogador. */
  explanation?: string;
  /** Só faz sentido com status UNAVAILABLE. */
  unavailableReason?: string;
  /** Só faz sentido com status STALE. */
  staleReason?: string;
}

interface AvailableMetricInput {
  key: RecommendationMetricKey;
  value: number;
  confidence?: ConfidenceScore;
  provenance?: DataProvenance;
  explanation?: string;
  /** Amostra/entrada incompleta - usável, mas com ressalva. */
  partial?: boolean;
}

/**
 * Métrica com valor real. `50` aqui é um cálculo que deu neutro, e o status
 * `AVAILABLE` é o que o separa de uma ausência.
 */
export function availableMetric(input: AvailableMetricInput): RecommendationMetric {
  return {
    key: input.key,
    value: input.value,
    status: input.partial ? "PARTIAL" : "AVAILABLE",
    confidence: input.confidence ?? null,
    ...(input.provenance ? { provenance: input.provenance } : {}),
    ...(input.explanation ? { explanation: input.explanation } : {})
  };
}

/**
 * Métrica sem dado. O valor é forçado a `null` pelo próprio construtor -
 * não há caminho que produza uma métrica indisponível com número.
 */
export function unavailableMetric(
  key: RecommendationMetricKey,
  unavailableReason: string,
  provenance?: DataProvenance
): RecommendationMetric {
  return {
    key,
    value: null,
    status: "UNAVAILABLE",
    confidence: null,
    ...(provenance ? { provenance } : {}),
    unavailableReason
  };
}

interface StaleMetricInput {
  key: RecommendationMetricKey;
  /** Último valor conhecido. `null` quando nem isso sobrou. */
  value: number | null;
  staleReason: string;
  confidence?: ConfidenceScore;
  provenance?: DataProvenance;
}

/** Métrica com valor antigo. Nunca deve ser exibida como informação atual. */
export function staleMetric(input: StaleMetricInput): RecommendationMetric {
  return {
    key: input.key,
    value: input.value,
    status: "STALE",
    confidence: input.confidence ?? null,
    ...(input.provenance ? { provenance: input.provenance } : {}),
    staleReason: input.staleReason
  };
}

/** `true` quando a métrica tem número exibível como barra/valor. */
export function hasDisplayableValue(metric: RecommendationMetric): boolean {
  return metric.value !== null && metric.status !== "UNAVAILABLE";
}
