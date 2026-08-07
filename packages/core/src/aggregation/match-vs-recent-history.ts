import { round } from "../scoring/dimension-signals.js";
import type { PerformanceTrendPoint } from "../profile/player-profile-overview.js";

/**
 * Piso de amostra abaixo do qual a média histórica não é calculada - mesmo
 * raciocínio de `MIN_BLOCK_REPORTS` em growth-journey.ts: com poucos pontos,
 * 1 partida oscila a média o bastante pra a comparação enganar mais do que
 * ajudar.
 */
export const MIN_RECENT_HISTORY_SAMPLE = 3;

export type MatchVsRecentHistoryMetricKey =
  | "performanceIndex"
  | "kda"
  | "csPerMinute"
  | "visionScorePerMinute"
  | "objectiveParticipation";

export interface MatchVsRecentHistoryMetric {
  metric: MatchVsRecentHistoryMetricKey;
  status: "AVAILABLE" | "UNAVAILABLE";
  /** Valor observado nesta partida. `null` quando a própria partida não tem o dado (nunca 0 fabricado). */
  matchValue: number | null;
  /** Média das partidas estritamente anteriores. `null` quando `status` é `UNAVAILABLE`. */
  recentAverage: number | null;
  /** Quantas partidas anteriores tinham valor pra esta métrica especificamente. */
  sampleSize: number;
  unavailableReason?: string;
}

export interface MatchVsRecentHistoryComparison {
  matchId: string;
  status: "AVAILABLE" | "UNAVAILABLE";
  /** Quantas partidas estritamente anteriores (por `observedAt`) entraram na comparação. */
  priorSampleSize: number;
  metrics: MatchVsRecentHistoryMetric[];
  unavailableReason?: string;
}

const METRIC_KEYS: MatchVsRecentHistoryMetricKey[] = [
  "performanceIndex",
  "kda",
  "csPerMinute",
  "visionScorePerMinute",
  "objectiveParticipation"
];

function metricValue(point: PerformanceTrendPoint, metric: MatchVsRecentHistoryMetricKey): number | null {
  return point[metric];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * Compara uma partida específica com a média das partidas do próprio
 * jogador estritamente anteriores a ela (por `observedAt`) - nunca inclui a
 * partida alvo nem qualquer partida mais nova na média, pra não vazar
 * informação do futuro (ou da própria partida) pra dentro de "sua média
 * recente". Pura: `points` já deve vir de `buildPlayerProfileAnalytics`.
 */
export function compareMatchToRecentHistory(
  points: readonly PerformanceTrendPoint[],
  matchId: string
): MatchVsRecentHistoryComparison {
  const target = points.find((point) => point.matchId === matchId);
  if (!target) {
    return {
      matchId,
      status: "UNAVAILABLE",
      priorSampleSize: 0,
      metrics: [],
      unavailableReason: "Partida não encontrada no histórico de tendência do jogador."
    };
  }

  const prior = points.filter((point) => point.observedAt < target.observedAt);

  const metrics: MatchVsRecentHistoryMetric[] = METRIC_KEYS.map((metric) => {
    const priorValues = prior
      .map((point) => metricValue(point, metric))
      .filter((value): value is number => value !== null);
    const matchValue = metricValue(target, metric);

    if (priorValues.length < MIN_RECENT_HISTORY_SAMPLE) {
      return {
        metric,
        status: "UNAVAILABLE",
        matchValue,
        recentAverage: null,
        sampleSize: priorValues.length,
        unavailableReason: `Histórico insuficiente para comparar (mínimo ${MIN_RECENT_HISTORY_SAMPLE} partidas anteriores com este dado).`
      };
    }

    return {
      metric,
      status: "AVAILABLE",
      matchValue,
      recentAverage: average(priorValues),
      sampleSize: priorValues.length
    };
  });

  return {
    matchId,
    status: "AVAILABLE",
    priorSampleSize: prior.length,
    metrics
  };
}
