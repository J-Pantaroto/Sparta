import type { RecommendationMetricKey } from "../types/recommendation-metric.js";

/**
 * Contrato das configurações candidatas do laboratório offline de calibração.
 *
 * ## Por que nem todo parâmetro do motor pode ser calibrado aqui
 *
 * O snapshot histórico (Etapa 16) preserva as **métricas já calculadas** de cada
 * candidato, os pesos efetivos e o score. Ele **não** preserva o estado de
 * `PlayerChampionStats`, `ChampionTag`, capacidades ou agregados de matchup como
 * estavam no instante do draft — essas tabelas são recalculadas a cada sync e
 * sobrescritas.
 *
 * Logo, só é reproduzível o que opera **depois** das métricas congeladas.
 * Recalcular uma derivação com o dado de hoje leria um histórico maior do que o
 * jogador tinha naquele draft: é vazamento temporal, e produz uma comparação
 * que parece válida e não é. Por isso a capacidade de replay é uma propriedade
 * declarada de cada parâmetro, verificada na validação, e não uma observação
 * feita caso a caso durante a execução.
 *
 * Este módulo é puro: não conhece resultado de partida, KDA, timeline, build,
 * observação posterior nem revisão pós-resultado. Vitória e derrota não existem
 * neste contrato — não há campo onde pudessem entrar.
 */

export const CALIBRATION_LAB_VERSION = "calibration-lab/1.0.0";

/** Versões da agregação histórica que o laboratório sabe reconstruir. */
export const SUPPORTED_AGGREGATION_VERSIONS: readonly string[] = ["1.0.0"];

/**
 * Chaves internas de peso do motor, na ordem em que ele as compõe, e a métrica
 * congelada correspondente.
 *
 * Confirmado em `toRecommendationMetrics`: nos casos com análise estratégica,
 * `metrics.enemyDraftAnswer` e `metrics.compositionFit` são literalmente o
 * `value` da métrica estruturada, então o número é o mesmo.
 */
export const ENGINE_WEIGHT_KEYS = [
  "personalPerformance",
  "recentForm",
  "matchup",
  "blindSafety",
  "allySynergy",
  "enemyDraftAnswer",
  "compositionFit",
  "meta"
] as const;

export type EngineWeightKey = (typeof ENGINE_WEIGHT_KEYS)[number];

export const WEIGHT_KEY_TO_METRIC: Record<EngineWeightKey, RecommendationMetricKey> = {
  personalPerformance: "PERSONAL_PERFORMANCE",
  recentForm: "RECENT_FORM",
  matchup: "PERSONAL_MATCHUP",
  blindSafety: "BLIND_SAFETY",
  allySynergy: "ALLY_SYNERGY",
  enemyDraftAnswer: "ENEMY_COMPOSITION_ANSWER",
  compositionFit: "TEAM_COMPOSITION",
  meta: "META_STRENGTH"
};

export const METRIC_TO_WEIGHT_KEY = Object.fromEntries(
  ENGINE_WEIGHT_KEYS.map((key) => [WEIGHT_KEY_TO_METRIC[key], key])
) as Partial<Record<RecommendationMetricKey, EngineWeightKey>>;

/** Métricas que participam do score e, portanto, podem receber peso candidato. */
export const WEIGHTABLE_METRIC_KEYS: readonly RecommendationMetricKey[] =
  ENGINE_WEIGHT_KEYS.map((key) => WEIGHT_KEY_TO_METRIC[key]);

/**
 * Capacidade real de reprodução de um parâmetro a partir do snapshot histórico.
 *
 * Os quatro valores não são graus da mesma escala: os dois primeiros são
 * reproduzíveis, o terceiro depende de dado que não existe, e o quarto não é
 * avaliável nem em princípio nesta versão.
 */
export type ReplayCapability =
  /** Altera apenas pesos sobre métricas já congeladas no snapshot. */
  | "EXACT_REWEIGHT"
  /** Altera regras aplicadas depois das métricas, sem mudar sua derivação. */
  | "EXACT_POST_AGGREGATION"
  /** Depende de input histórico não preservado (stats, tags, capacidades…). */
  | "REQUIRES_HISTORICAL_DERIVATION_INPUT"
  /** Fora do que este laboratório consegue avaliar. */
  | "UNSUPPORTED";

export interface ReplayCapabilityEntry {
  parameter: string;
  capability: ReplayCapability;
  /** O que o parâmetro muda, em uma frase. */
  description: string;
  /**
   * Inputs históricos ausentes que impedem a reprodução. Só existe para
   * `REQUIRES_HISTORICAL_DERIVATION_INPUT` — nomear a dependência é o que
   * permite dizer *por que* o parâmetro foi recusado.
   */
  missingHistoricalInputs?: string[];
  /** Faixa aceita, quando o parâmetro é um threshold numérico reproduzível. */
  range?: { min: number; max: number };
}

/**
 * Thresholds estritamente pós-agregação: atuam sobre um resultado já formado,
 * sem tocar em como qualquer métrica foi produzida.
 */
export const POST_AGGREGATION_THRESHOLDS: readonly ReplayCapabilityEntry[] = [
  {
    parameter: "primaryCount",
    capability: "EXACT_POST_AGGREGATION",
    description: "Quantos dos candidatos já presentes no snapshot formam o grupo PRIMARY.",
    range: { min: 1, max: 20 }
  },
  {
    parameter: "alternativeCount",
    capability: "EXACT_POST_AGGREGATION",
    description: "Quantos dos candidatos restantes formam o grupo ALTERNATIVE.",
    range: { min: 0, max: 20 }
  },
  {
    parameter: "minimumScoreToRecommend",
    capability: "EXACT_POST_AGGREGATION",
    description: "Piso de score aplicado ao resultado final, sem alterar como o score é formado.",
    range: { min: 0, max: 100 }
  },
  {
    parameter: "minimumDataCoverageToRecommend",
    capability: "EXACT_POST_AGGREGATION",
    description: "Piso de cobertura aplicado ao resultado final; a cobertura já está congelada.",
    range: { min: 0, max: 1 }
  },
  {
    parameter: "executionRiskPenaltyStart",
    capability: "EXACT_POST_AGGREGATION",
    description: "Início da curva de penalização sobre o risco de execução já congelado.",
    range: { min: 0, max: 100 }
  },
  {
    parameter: "executionRiskMaxPenalty",
    capability: "EXACT_POST_AGGREGATION",
    description: "Teto da penalização subtraída do score, sobre o risco já congelado.",
    range: { min: 0, max: 100 }
  }
];

/**
 * Registro explícito de capacidade por parâmetro.
 *
 * A distinção mais fina do registro está no risco de execução: a curva de
 * penalização (`executionRiskPenaltyStart`, `executionRiskMaxPenalty`) é
 * aplicada a um valor de risco que **está congelado** no snapshot, então é
 * pós-agregação; já `maxFamiliarityRiskRelief` muda como esse risco é
 * produzido a partir de partidas e recência, e portanto exige o histórico
 * ausente. Tratar os três como "thresholds de risco" apagaria essa diferença.
 */
export const REPLAY_CAPABILITY_REGISTRY: readonly ReplayCapabilityEntry[] = [
  ...ENGINE_WEIGHT_KEYS.map((key) => ({
    parameter: `metricWeights.${WEIGHT_KEY_TO_METRIC[key]}`,
    capability: "EXACT_REWEIGHT" as const,
    description: `Peso do sinal ${WEIGHT_KEY_TO_METRIC[key]}, aplicado sobre a métrica congelada.`
  })),
  ...ENGINE_WEIGHT_KEYS.map((key) => ({
    parameter: `disabledMetrics.${WEIGHT_KEY_TO_METRIC[key]}`,
    capability: "EXACT_REWEIGHT" as const,
    description: `Exclui ${WEIGHT_KEY_TO_METRIC[key]} do score; equivale a zerar seu peso.`
  })),
  ...POST_AGGREGATION_THRESHOLDS,
  {
    parameter: "minGamesForRanking",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Elegibilidade do candidato por número de partidas.",
    missingHistoricalInputs: ["PlayerChampionStats.games no instante do draft"]
  },
  {
    parameter: "poolFormation",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Formação do pool e precedência entre observado e inclusão manual.",
    missingHistoricalInputs: ["PlayerChampionPoolEntry vigente no instante do draft"]
  },
  {
    parameter: "snapshotCandidateCount",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Quantidade de candidatos avaliados; o snapshot congela quem foi avaliado.",
    missingHistoricalInputs: [
      "PlayerChampionPoolEntry vigente no instante do draft",
      "PlayerChampionStats no instante do draft"
    ]
  },
  {
    parameter: "metricAvailabilityOverride",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Disponibilidade histórica dos sinais; ela é fato do snapshot, não parâmetro.",
    missingHistoricalInputs: ["Fontes que determinaram a disponibilidade no instante do draft"]
  },
  {
    parameter: "personalPerformanceFormula",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Fórmula do desempenho pessoal, aplicada antes de a métrica ser congelada.",
    missingHistoricalInputs: ["PlayerChampionStats no instante do draft"]
  },
  {
    parameter: "recentFormDecayFactor",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Decaimento da forma recente, aplicado antes de a métrica ser congelada.",
    missingHistoricalInputs: ["Histórico de partidas no instante do draft"]
  },
  {
    parameter: "maxFamiliarityRiskRelief",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Quanto a familiaridade alivia o risco antes de o risco ser congelado.",
    missingHistoricalInputs: [
      "PlayerChampionStats.games no instante do draft",
      "PlayerChampionStats.recentMatches no instante do draft"
    ]
  },
  {
    parameter: "executionRiskDerivation",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Como o risco de execução é produzido, antes de virar métrica congelada.",
    missingHistoricalInputs: [
      "Champion.officialDifficulty vigente no instante do draft",
      "PlayerChampionStats no instante do draft"
    ]
  },
  {
    parameter: "matchupShrinkageK",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Encolhimento do matchup pessoal rumo ao neutro conforme a amostra.",
    missingHistoricalInputs: ["MatchParticipant do confronto no instante do draft"]
  },
  {
    parameter: "championTagDerivation",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Derivação das dimensões de ChampionTag usadas por vários sinais.",
    missingHistoricalInputs: ["ChampionTag vigente no instante do draft"]
  },
  {
    parameter: "capabilityExtraction",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Extração das capacidades por habilidade usadas pela análise estratégica.",
    missingHistoricalInputs: ["ChampionCapabilityProfile vigente no instante do draft"]
  },
  {
    parameter: "strategyDimensionWeights",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Peso das dimensões estratégicas dentro da análise 5x5.",
    missingHistoricalInputs: [
      "ChampionCapabilityProfile vigente no instante do draft",
      "ChampionTag vigente no instante do draft"
    ]
  },
  {
    parameter: "provenancePolicy",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Política de fonte e proveniência que decidiu o que era utilizável no draft.",
    missingHistoricalInputs: ["Catálogos e fontes vigentes no instante do draft"]
  },
  {
    parameter: "globalMetaSource",
    capability: "UNSUPPORTED",
    description:
      "Depende de fonte global de meta, que permanece indisponível por decisão registrada."
  },
  {
    parameter: "useMatchResultAsLabel",
    capability: "UNSUPPORTED",
    description:
      "Vitória e derrota não são rótulo de recomendação correta; não existe caminho para avaliar."
  }
];

const REGISTRY_BY_PARAMETER = new Map(
  REPLAY_CAPABILITY_REGISTRY.map((entry) => [entry.parameter, entry])
);

export function findReplayCapability(parameter: string): ReplayCapabilityEntry | undefined {
  return REGISTRY_BY_PARAMETER.get(parameter);
}

export function isReplayableCapability(capability: ReplayCapability): boolean {
  return capability === "EXACT_REWEIGHT" || capability === "EXACT_POST_AGGREGATION";
}

/**
 * Valores pós-agregação equivalentes ao comportamento operacional atual. Servem
 * de linha de base declarada — nada aqui é lido pelo motor nem altera produção.
 */
export const OPERATIONAL_POST_AGGREGATION_THRESHOLDS: Readonly<Record<string, number>> = {
  primaryCount: 5,
  alternativeCount: 3,
  minimumScoreToRecommend: 0,
  minimumDataCoverageToRecommend: 0,
  executionRiskPenaltyStart: 25,
  executionRiskMaxPenalty: 8
};

export type CalibrationCandidateStatus =
  | "DRAFT"
  | "READY"
  | "EVALUATED"
  | "REJECTED"
  | "APPROVED_FOR_FUTURE_RELEASE";

/**
 * Maior promoção que o laboratório expressa. Não existe estado que signifique
 * "em produção", de propósito: promover exigiria uma decisão fora daqui.
 */
export const MAX_PROMOTION_STATUS: CalibrationCandidateStatus = "APPROVED_FOR_FUTURE_RELEASE";

export interface CalibrationCandidate {
  id: string;
  name: string;
  description?: string;

  /** Versão da agregação histórica que esta configuração declara reproduzir. */
  baselineAggregationVersion: string;
  /** Versão da própria configuração candidata. */
  candidateVersion: string;

  /** Pesos brutos por métrica congelada, antes da normalização. */
  metricWeights: Partial<Record<RecommendationMetricKey, number>>;
  /** Sinais congelados excluídos do score; equivale a zerar o peso. */
  disabledMetrics?: RecommendationMetricKey[];
  /** Somente thresholds estritamente pós-agregação. */
  postAggregationThresholds?: Record<string, number>;

  status: CalibrationCandidateStatus;
}

export type CandidateRejectionCode =
  | "UNKNOWN_METRIC"
  | "NON_WEIGHTABLE_METRIC"
  | "NEGATIVE_WEIGHT"
  | "NON_FINITE_VALUE"
  | "NO_AVAILABLE_COMPONENT"
  | "UNSUPPORTED_THRESHOLD"
  | "THRESHOLD_OUT_OF_RANGE"
  | "DERIVATION_PARAMETER"
  | "UNSUPPORTED_PARAMETER"
  | "UNCLASSIFIED_PARAMETER"
  | "UNSUPPORTED_AGGREGATION_VERSION";

export interface CandidateRejection {
  code: CandidateRejectionCode;
  parameter: string;
  reason: string;
  capability?: ReplayCapability;
  missingHistoricalInputs?: string[];
}

export interface AcceptedParameter {
  parameter: string;
  capability: ReplayCapability;
}

export interface CandidateValidationResult {
  valid: boolean;
  rejections: CandidateRejection[];
  accepted: AcceptedParameter[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Valida a configuração candidata **antes** de qualquer execução.
 *
 * A rejeição acontece aqui, e não durante o replay, por uma razão prática:
 * rodar um experimento inteiro para depois marcar todos os casos como
 * impossíveis gastaria trabalho e produziria um relatório que parece um
 * resultado. Configuração inválida também **não é normalizada em silêncio** —
 * peso negativo ou threshold fora de faixa vira rejeição, nunca um valor
 * corrigido por conta própria.
 */
export function validateCalibrationCandidate(
  candidate: CalibrationCandidate
): CandidateValidationResult {
  const rejections: CandidateRejection[] = [];
  const accepted: AcceptedParameter[] = [];

  if (!SUPPORTED_AGGREGATION_VERSIONS.includes(candidate.baselineAggregationVersion)) {
    rejections.push({
      code: "UNSUPPORTED_AGGREGATION_VERSION",
      parameter: "baselineAggregationVersion",
      reason: `A agregação ${candidate.baselineAggregationVersion} não é reconstruível por ${CALIBRATION_LAB_VERSION}.`
    });
  }

  const disabled = new Set(candidate.disabledMetrics ?? []);
  for (const metric of disabled) {
    const parameter = `disabledMetrics.${metric}`;
    const entry = findReplayCapability(parameter);
    if (!entry) {
      rejections.push({
        code: WEIGHTABLE_METRIC_KEYS.includes(metric) ? "UNCLASSIFIED_PARAMETER" : "NON_WEIGHTABLE_METRIC",
        parameter,
        reason: `${metric} não participa do score congelado; desligá-la não é reponderação.`
      });
      continue;
    }
    accepted.push({ parameter, capability: entry.capability });
  }

  let positiveAvailableWeights = 0;
  for (const [rawMetric, value] of Object.entries(candidate.metricWeights ?? {})) {
    const metric = rawMetric as RecommendationMetricKey;
    const parameter = `metricWeights.${metric}`;
    const entry = findReplayCapability(parameter);
    if (!entry) {
      rejections.push({
        code: METRIC_TO_WEIGHT_KEY[metric] ? "UNCLASSIFIED_PARAMETER" : "UNKNOWN_METRIC",
        parameter,
        reason: `${metric} não é uma métrica ponderável do score congelado.`
      });
      continue;
    }
    if (!isFiniteNumber(value)) {
      rejections.push({
        code: "NON_FINITE_VALUE",
        parameter,
        reason: "Peso precisa ser um número finito."
      });
      continue;
    }
    if (value < 0) {
      rejections.push({
        code: "NEGATIVE_WEIGHT",
        parameter,
        reason: "Peso não pode ser negativo."
      });
      continue;
    }
    accepted.push({ parameter, capability: entry.capability });
    if (value > 0 && !disabled.has(metric)) positiveAvailableWeights += 1;
  }

  if (positiveAvailableWeights === 0) {
    rejections.push({
      code: "NO_AVAILABLE_COMPONENT",
      parameter: "metricWeights",
      reason: "Nenhuma métrica habilitada com peso positivo; não há score a comparar."
    });
  }

  for (const [parameter, value] of Object.entries(candidate.postAggregationThresholds ?? {})) {
    const entry = findReplayCapability(parameter);
    if (!entry) {
      rejections.push({
        code: "UNSUPPORTED_THRESHOLD",
        parameter,
        reason: "Threshold não consta no registro de capacidade de replay."
      });
      continue;
    }
    if (entry.capability === "REQUIRES_HISTORICAL_DERIVATION_INPUT") {
      rejections.push({
        code: "DERIVATION_PARAMETER",
        parameter,
        reason: `${entry.description} O snapshot histórico não preserva os inputs necessários.`,
        capability: entry.capability,
        missingHistoricalInputs: [...(entry.missingHistoricalInputs ?? [])]
      });
      continue;
    }
    if (entry.capability === "UNSUPPORTED") {
      rejections.push({
        code: "UNSUPPORTED_PARAMETER",
        parameter,
        reason: entry.description,
        capability: entry.capability
      });
      continue;
    }
    if (entry.capability !== "EXACT_POST_AGGREGATION") {
      rejections.push({
        code: "UNSUPPORTED_THRESHOLD",
        parameter,
        reason: "Somente thresholds estritamente pós-agregação são aceitos aqui.",
        capability: entry.capability
      });
      continue;
    }
    if (!isFiniteNumber(value)) {
      rejections.push({
        code: "NON_FINITE_VALUE",
        parameter,
        reason: "Threshold precisa ser um número finito."
      });
      continue;
    }
    if (entry.range && (value < entry.range.min || value > entry.range.max)) {
      rejections.push({
        code: "THRESHOLD_OUT_OF_RANGE",
        parameter,
        reason: `Valor precisa estar entre ${entry.range.min} e ${entry.range.max}.`
      });
      continue;
    }
    accepted.push({ parameter, capability: entry.capability });
  }

  return { valid: rejections.length === 0, rejections, accepted };
}

/** Thresholds efetivos: os declarados pela candidata sobre os operacionais. */
export function resolvePostAggregationThresholds(
  candidate: CalibrationCandidate
): Record<string, number> {
  return { ...OPERATIONAL_POST_AGGREGATION_THRESHOLDS, ...(candidate.postAggregationThresholds ?? {}) };
}

/**
 * Serialização estável da configuração. `id`, `name`, `description` e `status`
 * ficam de fora: nenhum deles altera o resultado do experimento, e incluí-los
 * faria uma configuração renomeada parecer diferente.
 */
export function canonicalCandidateString(candidate: CalibrationCandidate): string {
  const thresholds = resolvePostAggregationThresholds(candidate);
  return JSON.stringify({
    labVersion: CALIBRATION_LAB_VERSION,
    baselineAggregationVersion: candidate.baselineAggregationVersion,
    candidateVersion: candidate.candidateVersion,
    metricWeights: WEIGHTABLE_METRIC_KEYS.map((metric) => [
      metric,
      candidate.metricWeights?.[metric] ?? 0
    ]),
    disabledMetrics: [...new Set(candidate.disabledMetrics ?? [])].sort((left, right) =>
      left.localeCompare(right, "en")
    ),
    postAggregationThresholds: Object.entries(thresholds).sort(([left], [right]) =>
      left.localeCompare(right, "en")
    )
  });
}
