import type { Confidence, MatchupData, PickRecommendation, Role } from "../types/domain.js";
import type { DataProvenance } from "../types/provenance.js";
import { toConfidenceScore } from "../types/provenance.js";
import {
  availableMetric,
  unavailableMetric,
  type RecommendationMetric
} from "../types/recommendation-metric.js";
import type { ExecutionRiskAssessment } from "./execution-risk.js";
import type { DraftStrategicAnalysis } from "./draft-strategic-analysis.js";

/**
 * Adaptador ÚNICO entre os números que o motor calcula hoje
 * (`PickRecommendation.metrics`) e o contrato de métrica estruturada
 * (`RecommendationMetric`), que é o que a interface passa a consumir.
 *
 * Por que existe um adaptador em vez de trocar o tipo de uma vez: esta etapa
 * preserva a transição: `metrics` continua como entrada numérica do score,
 * enquanto este módulo é o produtor central de disponibilidade,
 * proveniência e compatibilidade legada das métricas estruturadas.
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
 * Converte o bloco de score em métricas estruturadas, uma por candidato.
 * `PERSONAL_MATCHUP` só recebe valor quando há um agregado do histórico do
 * próprio jogador. `GLOBAL_MATCHUP` e `META_STRENGTH` ficam explicitamente
 * indisponíveis até existirem fontes externas reais para cada conceito.
 */
export function toRecommendationMetrics(
  metrics: PickRecommendation["metrics"],
  confidence: Confidence | undefined,
  context: {
    personalMatchup?: MatchupData;
    playerRole?: Role;
    enemyLaneKnown?: boolean;
    executionRisk?: ExecutionRiskAssessment;
    strategicAnalysis?: DraftStrategicAnalysis;
  } = {}
): RecommendationMetric[] {
  const personalConfidence = confidence === undefined ? undefined : toConfidenceScore(confidence);
  const personalMatchup = context.personalMatchup;
  const personalMatchupMetric = personalMatchup
    ? availableMetric({
        key: "PERSONAL_MATCHUP",
        value: personalMatchup.score,
        confidence: toConfidenceScore(personalMatchup.confidence),
        provenance: {
          sourceType: "CALCULATED",
          sourceId: "sparta",
          resource: "MatchParticipant",
          position: context.playerRole ?? personalMatchup.role,
          sampleSize: personalMatchup.sampleSize,
          algorithmVersion: RECOMMENDATION_ENGINE_VERSION
        },
        explanation: `Calculado a partir de ${personalMatchup.sampleSize ?? 0} partida(s) do seu histórico neste confronto.`
      })
    : unavailableMetric(
        "PERSONAL_MATCHUP",
        context.enemyLaneKnown
          ? "Sem partidas registradas neste confronto."
          : "O adversário da posição ainda não foi identificado."
      );

  return [
    metrics.personalPerformance === null
      ? unavailableMetric("PERSONAL_PERFORMANCE", "Sem histórico pessoal suficiente nesta posição.")
      : availableMetric({
          key: "PERSONAL_PERFORMANCE",
          value: metrics.personalPerformance,
          confidence: personalConfidence,
          provenance: personalHistoryProvenance
        }),
    metrics.recentForm === null
      ? unavailableMetric("RECENT_FORM", "Sem histórico pessoal suficiente nesta posição.")
      : availableMetric({
          key: "RECENT_FORM",
          value: metrics.recentForm,
          confidence: personalConfidence,
          provenance: personalHistoryProvenance
        }),
    personalMatchupMetric,
    unavailableMetric("GLOBAL_MATCHUP", "Dados globais de matchup ainda não estão disponíveis."),
    metrics.blindSafety === null
      ? unavailableMetric("BLIND_SAFETY", "Sem perfil estratégico disponível para este campeão.")
      : availableMetric({
          key: "BLIND_SAFETY",
          value: metrics.blindSafety,
          provenance: championTagProvenance
        }),
    metrics.allySynergy === null
      ? unavailableMetric("ALLY_SYNERGY", "Sem perfil estratégico disponível para este campeão.")
      : availableMetric({
          key: "ALLY_SYNERGY",
          value: metrics.allySynergy,
          provenance: championTagProvenance
        }),
    context.strategicAnalysis?.enemyResponseScore ??
      (metrics.enemyDraftAnswer === null
        ? unavailableMetric(
            "ENEMY_COMPOSITION_ANSWER",
            "Sem perfil estratégico disponível para este campeão."
          )
        : availableMetric({
            key: "ENEMY_COMPOSITION_ANSWER",
            value: metrics.enemyDraftAnswer,
            provenance: championTagProvenance
          })),
    context.strategicAnalysis?.teamCompositionScore ??
      (metrics.compositionFit === null
        ? unavailableMetric(
            "TEAM_COMPOSITION",
            "Sem perfil estratégico disponível para este campeão."
          )
        : availableMetric({
            key: "TEAM_COMPOSITION",
            value: metrics.compositionFit,
            provenance: championTagProvenance
          })),
    unavailableMetric(
      "META_STRENGTH",
      "Dados estatísticos do meta deste patch ainda não estão disponíveis."
    ),
    context.executionRisk?.familiarityMetric ??
      unavailableMetric(
        "PERSONAL_EXPERIENCE",
        "A resposta não informa evidência pessoal para esta posição."
      ),
    context.executionRisk?.difficultyMetric ??
      unavailableMetric("CHAMPION_DIFFICULTY", "A resposta não informa a dificuldade do catálogo."),
    context.executionRisk?.riskMetric ??
      unavailableMetric("EXECUTION_RISK", "A resposta não informa risco pessoal de execução.")
  ];
}

/**
 * Entrada tolerante: uma recomendação que pode ter vindo de um backend
 * anterior ao contrato (ou de um cache gravado antes dele).
 */
type MaybeStructured = Pick<PickRecommendation, "metrics"> & {
  confidence?: Confidence;
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
export function ensureRecommendationMetrics(
  recommendation: MaybeStructured
): RecommendationMetric[] {
  if (Array.isArray(recommendation.metricDetails) && recommendation.metricDetails.length > 0) {
    const normalized = recommendation.metricDetails.map((metric) =>
      metric.key === "LANE_MATCHUP"
        ? unavailableMetric(
            "PERSONAL_MATCHUP",
            "Dados legados de matchup não têm proveniência suficiente."
          )
        : metric
    );
    const required: {
      key: RecommendationMetric["key"];
      reason: string;
    }[] = [
      {
        key: "TEAM_COMPOSITION",
        reason: "A resposta anterior não informa análise estruturada de composição."
      },
      {
        key: "ENEMY_COMPOSITION_ANSWER",
        reason: "A resposta anterior não informa análise estruturada das ameaças inimigas."
      },
      {
        key: "PERSONAL_EXPERIENCE",
        reason: "A resposta anterior não informa evidência pessoal estruturada."
      },
      {
        key: "CHAMPION_DIFFICULTY",
        reason: "A resposta anterior não informa a dificuldade do catálogo."
      },
      {
        key: "EXECUTION_RISK",
        reason: "A resposta anterior não informa risco pessoal de execução."
      }
    ];
    for (const entry of required) {
      if (!normalized.some((metric) => metric.key === entry.key)) {
        normalized.push(unavailableMetric(entry.key, entry.reason));
      }
    }
    return normalized;
  }
  if (!recommendation.metrics) return [];
  return toRecommendationMetrics(recommendation.metrics, recommendation.confidence);
}
