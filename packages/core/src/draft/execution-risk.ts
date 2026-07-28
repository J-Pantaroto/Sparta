import {
  HIGH_CONFIDENCE_GAMES,
  confidenceFromGames
} from "../scoring/champion-performance.js";
import type { ChampionDifficultyEvidence } from "../types/champion-difficulty.js";
import type { PlayerChampionStats, Role } from "../types/domain.js";
import type { DataProvenance } from "../types/provenance.js";
import {
  availableMetric,
  unavailableMetric,
  type RecommendationMetric
} from "../types/recommendation-metric.js";
import { toConfidenceScore } from "../types/provenance.js";

export const CHAMPION_DIFFICULTY_NORMALIZATION_VERSION =
  "champion-difficulty-normalization/1.0.0";
export const PERSONAL_FAMILIARITY_VERSION = "personal-familiarity/1.0.0";
export const EXECUTION_RISK_VERSION = "execution-risk/1.0.0";

/**
 * A recência responde por uma parte menor da familiaridade. Sessenta dias é
 * o fator de decaimento exponencial: depois desse intervalo a contribuição
 * de recência vale aproximadamente 37% do valor inicial.
 */
export const FAMILIARITY_RECENCY_WEIGHT = 0.2;
export const FAMILIARITY_RECENCY_DECAY_DAYS = 60;

/**
 * A familiaridade pode reduzir até 65% do risco base da dificuldade. Assim,
 * dificuldade alta nunca é apagada por completo, e evidência pessoal não se
 * transforma numa afirmação de domínio.
 */
export const MAX_FAMILIARITY_RISK_RELIEF = 0.65;

/** Penalização limitada: risco até 25 não altera o score; o teto é 8 pontos. */
export const EXECUTION_RISK_PENALTY_START = 25;
export const EXECUTION_RISK_MAX_PENALTY = 8;

interface ChampionDifficultySourceInput {
  patch?: string;
  locale?: string;
  resource?: string;
  collectedAt?: string;
  status?: DataProvenance["status"];
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Normalização linear e reversível da escala oficial 0-10 para 0-100. */
export function normalizeChampionDifficulty(originalValue: number): number | null {
  if (!Number.isFinite(originalValue) || originalValue < 0 || originalValue > 10) {
    return null;
  }
  return round(originalValue * 10);
}

export function createChampionDifficultyEvidence(
  originalValue: number,
  source: ChampionDifficultySourceInput = {}
): ChampionDifficultyEvidence | undefined {
  const normalizedValue = normalizeChampionDifficulty(originalValue);
  if (normalizedValue === null) return undefined;

  return {
    originalValue,
    originalScale: { min: 0, max: 10 },
    normalizedValue,
    normalizationAlgorithmVersion: CHAMPION_DIFFICULTY_NORMALIZATION_VERSION,
    provenance: {
      sourceType: "OFFICIAL",
      sourceId: "riot-data-dragon",
      resource: source.resource ?? "champion.json#info.difficulty",
      patch: source.patch,
      locale: source.locale,
      collectedAt: source.collectedAt,
      status: source.status ?? "AVAILABLE"
    }
  };
}

export interface ExecutionRiskAssessment {
  difficultyMetric: RecommendationMetric;
  familiarityMetric: RecommendationMetric;
  riskMetric: RecommendationMetric;
  /** Pontos subtraídos do score base. Zero quando o risco está indisponível. */
  scorePenalty: number;
}

function latestObservedAt(stats: PlayerChampionStats | undefined): number | undefined {
  if (!stats) return undefined;
  const timestamps = stats.recentMatches
    .map((match) => match.observedAt)
    .filter((value): value is string => typeof value === "string")
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  return timestamps.length > 0 ? Math.max(...timestamps) : undefined;
}

function recencyEvidenceScore(
  stats: PlayerChampionStats,
  evaluatedAt: string | undefined
): number | undefined {
  const latest = latestObservedAt(stats);
  const reference = evaluatedAt ? Date.parse(evaluatedAt) : Number.NaN;
  if (latest === undefined || !Number.isFinite(reference)) return undefined;

  const elapsedDays = Math.max(0, reference - latest) / (24 * 60 * 60 * 1000);
  return round(
    100 * Math.exp(-elapsedDays / FAMILIARITY_RECENCY_DECAY_DAYS)
  );
}

function buildFamiliarityMetric(
  stats: PlayerChampionStats | undefined,
  role: Role,
  evaluatedAt: string | undefined
): { metric: RecommendationMetric; valueForRisk: number } {
  if (!stats || stats.games <= 0) {
    return {
      metric: unavailableMetric(
        "PERSONAL_EXPERIENCE",
        "Sem partidas observadas com este campeão nesta posição."
      ),
      // Zero é usado apenas internamente porque a ausência de experiência
      // foi observada (`sampleSize: 0` no risco), não como métrica fictícia.
      valueForRisk: 0
    };
  }

  const sampleScore = clamp((stats.games / HIGH_CONFIDENCE_GAMES) * 100);
  const recencyScore = recencyEvidenceScore(stats, evaluatedAt);
  const hasRecency = recencyScore !== undefined;
  const familiarity = hasRecency
    ? sampleScore * (1 - FAMILIARITY_RECENCY_WEIGHT) +
      recencyScore * FAMILIARITY_RECENCY_WEIGHT
    : sampleScore;

  return {
    metric: availableMetric({
      key: "PERSONAL_EXPERIENCE",
      value: round(familiarity),
      confidence: toConfidenceScore(confidenceFromGames(stats.games)),
      partial: !hasRecency,
      provenance: {
        sourceType: "CALCULATED",
        sourceId: "sparta",
        resource: "PlayerChampionStats.recentMatches",
        position: role,
        sampleSize: stats.games,
        algorithmVersion: PERSONAL_FAMILIARITY_VERSION
      },
      explanation: hasRecency
        ? `${stats.games} partida(s) observada(s) nesta posição; experiência recente disponível.`
        : `${stats.games} partida(s) observada(s) nesta posição; data da experiência recente indisponível.`
    }),
    valueForRisk: round(familiarity)
  };
}

function riskPenalty(risk: number): number {
  if (risk <= EXECUTION_RISK_PENALTY_START) return 0;
  const proportion =
    (risk - EXECUTION_RISK_PENALTY_START) /
    (100 - EXECUTION_RISK_PENALTY_START);
  return round(clamp(proportion, 0, 1) * EXECUTION_RISK_MAX_PENALTY);
}

function difficultyLabel(value: number): string {
  if (value >= 70) return "elevada";
  if (value <= 30) return "baixa";
  return "moderada";
}

export function assessExecutionRisk(input: {
  difficulty?: ChampionDifficultyEvidence;
  stats?: PlayerChampionStats;
  role: Role;
  evaluatedAt?: string;
}): ExecutionRiskAssessment {
  const familiarity = buildFamiliarityMetric(
    input.stats,
    input.role,
    input.evaluatedAt
  );
  const source = input.difficulty;

  if (!source) {
    return {
      difficultyMetric: unavailableMetric(
        "CHAMPION_DIFFICULTY",
        "Dificuldade indisponível no catálogo utilizado."
      ),
      familiarityMetric: familiarity.metric,
      riskMetric: unavailableMetric(
        "EXECUTION_RISK",
        "O risco pessoal não pode ser estimado sem a dificuldade do catálogo."
      ),
      scorePenalty: 0
    };
  }

  const difficultyMetric = availableMetric({
    key: "CHAMPION_DIFFICULTY",
    value: source.normalizedValue,
    provenance: {
      sourceType: "CALCULATED",
      sourceId: "sparta",
      resource: "ChampionDifficulty",
      patch: source.provenance.patch,
      locale: source.provenance.locale,
      algorithmVersion: source.normalizationAlgorithmVersion,
      status: source.provenance.status
    },
    sourceValue: {
      value: source.originalValue,
      scale: source.originalScale,
      provenance: source.provenance
    },
    explanation:
      `Valor original ${source.originalValue}/10 da Data Dragon; ` +
      `normalizado linearmente pelo Sparta para ${source.normalizedValue}/100.`
  });

  const risk = round(
    source.normalizedValue *
      (1 -
        MAX_FAMILIARITY_RISK_RELIEF *
          (familiarity.valueForRisk / 100))
  );
  const games = input.stats?.games ?? 0;
  const penalty = riskPenalty(risk);
  const familiarityIsPartial = familiarity.metric.status === "PARTIAL";
  const explanation =
    games === 0
      ? `Dificuldade geral ${difficultyLabel(source.normalizedValue)} e nenhuma partida observada nesta posição. Penalização limitada: ${penalty} ponto(s).`
      : `Risco pessoal estimado com dificuldade ${difficultyLabel(source.normalizedValue)} e ${games} partida(s) observada(s) nesta posição. Penalização limitada: ${penalty} ponto(s).`;

  return {
    difficultyMetric,
    familiarityMetric: familiarity.metric,
    riskMetric: availableMetric({
      key: "EXECUTION_RISK",
      value: risk,
      partial: familiarityIsPartial,
      provenance: {
        sourceType: "DERIVED",
        sourceId: "sparta",
        resource: "ExecutionRisk",
        position: input.role,
        sampleSize: games,
        algorithmVersion: EXECUTION_RISK_VERSION
      },
      explanation
    }),
    scorePenalty: penalty
  };
}
