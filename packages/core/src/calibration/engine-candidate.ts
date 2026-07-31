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

/** Chaves de peso do motor, na ordem em que ele as compõe. */
export const CANDIDATE_WEIGHT_KEYS = [
  "personalPerformance",
  "recentForm",
  "matchup",
  "blindSafety",
  "allySynergy",
  "enemyDraftAnswer",
  "compositionFit",
  "meta"
] as const;

export type CandidateWeightKey = (typeof CANDIDATE_WEIGHT_KEYS)[number];

/**
 * Métrica congelada correspondente a cada chave de peso. Confirmado em
 * `toRecommendationMetrics`: nos casos com análise estratégica,
 * `metrics.enemyDraftAnswer` e `metrics.compositionFit` são literalmente o
 * `value` da métrica estruturada, então o número é o mesmo.
 */
export const WEIGHT_KEY_TO_METRIC: Record<CandidateWeightKey, RecommendationMetricKey> = {
  personalPerformance: "PERSONAL_PERFORMANCE",
  recentForm: "RECENT_FORM",
  matchup: "PERSONAL_MATCHUP",
  blindSafety: "BLIND_SAFETY",
  allySynergy: "ALLY_SYNERGY",
  enemyDraftAnswer: "ENEMY_COMPOSITION_ANSWER",
  compositionFit: "TEAM_COMPOSITION",
  meta: "META_STRENGTH"
};

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
}

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
  ...CANDIDATE_WEIGHT_KEYS.map((key) => ({
    parameter: `weights.${key}`,
    capability: "EXACT_REWEIGHT" as const,
    description: `Peso do sinal ${WEIGHT_KEY_TO_METRIC[key]}, aplicado sobre a métrica congelada.`
  })),
  ...CANDIDATE_WEIGHT_KEYS.map((key) => ({
    parameter: `metricEnabled.${key}`,
    capability: "EXACT_REWEIGHT" as const,
    description: `Inclui ou exclui ${WEIGHT_KEY_TO_METRIC[key]} do score; equivale a reponderação.`
  })),
  {
    parameter: "primaryCount",
    capability: "EXACT_POST_AGGREGATION",
    description: "Quantos candidatos formam o grupo PRIMARY depois da ordenação."
  },
  {
    parameter: "alternativeCount",
    capability: "EXACT_POST_AGGREGATION",
    description: "Quantos candidatos formam o grupo ALTERNATIVE depois da ordenação."
  },
  {
    parameter: "minimumScoreToRecommend",
    capability: "EXACT_POST_AGGREGATION",
    description: "Piso de score aplicado ao resultado final, sem alterar como o score é formado."
  },
  {
    parameter: "minimumDataCoverageToRecommend",
    capability: "EXACT_POST_AGGREGATION",
    description: "Piso de cobertura aplicado ao resultado final; a cobertura já está congelada."
  },
  {
    parameter: "executionRiskPenaltyStart",
    capability: "EXACT_POST_AGGREGATION",
    description: "Início da curva de penalização sobre o risco de execução já congelado."
  },
  {
    parameter: "executionRiskMaxPenalty",
    capability: "EXACT_POST_AGGREGATION",
    description: "Teto da penalização subtraída do score, sobre o risco já congelado."
  },
  {
    parameter: "minGamesForRanking",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Elegibilidade do candidato por número de partidas.",
    missingHistoricalInputs: ["PlayerChampionStats.games no instante do draft"]
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
    parameter: "recentFormDecayFactor",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Decaimento da forma recente, aplicado antes de a métrica ser congelada.",
    missingHistoricalInputs: ["Histórico de partidas no instante do draft"]
  },
  {
    parameter: "matchupShrinkageK",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Encolhimento do matchup pessoal rumo ao neutro conforme a amostra.",
    missingHistoricalInputs: ["MatchParticipant do confronto no instante do draft"]
  },
  {
    parameter: "championTagDimensionWeights",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Derivação das dimensões de ChampionTag usadas por vários sinais.",
    missingHistoricalInputs: ["ChampionTag vigente no instante do draft"]
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
    parameter: "poolSourcePriority",
    capability: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
    description: "Precedência entre pool observado e inclusão manual na formação do pool.",
    missingHistoricalInputs: ["PlayerChampionPoolEntry vigente no instante do draft"]
  },
  {
    parameter: "globalMetaWeightSource",
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

/** Regras aplicadas depois da agregação, todas reproduzíveis sobre o congelado. */
export interface PostAggregationRules {
  primaryCount: number;
  alternativeCount: number;
  minimumScoreToRecommend: number;
  minimumDataCoverageToRecommend: number;
  executionRiskPenaltyStart: number;
  executionRiskMaxPenalty: number;
}

/**
 * Espelha o comportamento operacional atual do motor. Serve de linha de base
 * declarada — não é lido pelo motor nem altera nada em produção.
 */
export const OPERATIONAL_POST_AGGREGATION: PostAggregationRules = {
  primaryCount: 5,
  alternativeCount: 3,
  minimumScoreToRecommend: 0,
  minimumDataCoverageToRecommend: 0,
  executionRiskPenaltyStart: 25,
  executionRiskMaxPenalty: 8
};

export interface RecommendationEngineCandidate {
  /** Identificador legível da configuração, definido por quem a criou. */
  name: string;
  labVersion: string;
  /** Versão da agregação histórica que esta configuração sabe reproduzir. */
  supportedAggregationVersion: string;
  /** Pesos brutos, antes da normalização por disponibilidade. */
  weights: Record<CandidateWeightKey, number>;
  /** Sinal desligado sai do score; equivale a peso zero, mas fica explícito. */
  metricEnabled: Record<CandidateWeightKey, boolean>;
  postAggregation: PostAggregationRules;
  /** Parâmetros extras propostos; qualquer um não reproduzível derruba a validação. */
  extraParameters?: Record<string, number | string | boolean>;
  notes?: string;
}

/**
 * Status de promoção. O maior valor expressável é `APPROVED_FOR_FUTURE_RELEASE`
 * — não existe estado que signifique "em produção", de propósito: promover
 * exigiria uma decisão fora deste laboratório.
 */
export type CandidatePromotionStatus =
  | "DRAFT"
  | "EVALUATED"
  | "REJECTED"
  | "APPROVED_FOR_FUTURE_RELEASE";

export const MAX_PROMOTION_STATUS: CandidatePromotionStatus = "APPROVED_FOR_FUTURE_RELEASE";

export type CandidateRejectionCode =
  | "UNKNOWN_PARAMETER"
  | "REQUIRES_HISTORICAL_DERIVATION_INPUT"
  | "UNSUPPORTED_PARAMETER"
  | "INVALID_WEIGHT"
  | "INVALID_POST_AGGREGATION"
  | "NO_ENABLED_METRIC"
  | "UNSUPPORTED_AGGREGATION_VERSION";

export interface CandidateRejection {
  code: CandidateRejectionCode;
  parameter: string;
  reason: string;
  capability?: ReplayCapability;
  missingHistoricalInputs?: string[];
}

export interface CandidateValidationResult {
  valid: boolean;
  rejections: CandidateRejection[];
  /** Parâmetros aceitos, com a capacidade que os tornou aceitáveis. */
  accepted: { parameter: string; capability: ReplayCapability }[];
}

/** Versões de agregação que o laboratório sabe reconstruir. */
export const SUPPORTED_AGGREGATION_VERSIONS: readonly string[] = ["1.0.0"];

function invalidNumber(value: unknown): boolean {
  return typeof value !== "number" || !Number.isFinite(value);
}

/**
 * Valida a configuração candidata **antes** de qualquer execução.
 *
 * A rejeição é feita aqui, e não durante o replay, por uma razão prática: rodar
 * um experimento inteiro para depois marcar todos os casos como impossíveis
 * gastaria trabalho e produziria um relatório que parece um resultado. A
 * configuração que depende de dado histórico ausente não é executada.
 */
export function validateEngineCandidate(
  candidate: RecommendationEngineCandidate
): CandidateValidationResult {
  const rejections: CandidateRejection[] = [];
  const accepted: { parameter: string; capability: ReplayCapability }[] = [];

  if (!SUPPORTED_AGGREGATION_VERSIONS.includes(candidate.supportedAggregationVersion)) {
    rejections.push({
      code: "UNSUPPORTED_AGGREGATION_VERSION",
      parameter: "supportedAggregationVersion",
      reason: `Versão de agregação ${candidate.supportedAggregationVersion} não é reconstruível por ${CALIBRATION_LAB_VERSION}.`
    });
  }

  const weightKeys = Object.keys(candidate.weights ?? {});
  for (const key of weightKeys) {
    const parameter = `weights.${key}`;
    const entry = findReplayCapability(parameter);
    if (!entry) {
      rejections.push({
        code: "UNKNOWN_PARAMETER",
        parameter,
        reason: `Chave de peso desconhecida: ${key}.`
      });
      continue;
    }
    const value = candidate.weights[key as CandidateWeightKey];
    if (invalidNumber(value) || value < 0) {
      rejections.push({
        code: "INVALID_WEIGHT",
        parameter,
        reason: "Peso deve ser um número finito maior ou igual a zero."
      });
      continue;
    }
    accepted.push({ parameter, capability: entry.capability });
  }

  for (const key of CANDIDATE_WEIGHT_KEYS) {
    if (!(key in (candidate.weights ?? {}))) {
      rejections.push({
        code: "INVALID_WEIGHT",
        parameter: `weights.${key}`,
        reason: "Peso ausente. A configuração precisa declarar os oito sinais, mesmo com zero."
      });
    }
    if (typeof candidate.metricEnabled?.[key] !== "boolean") {
      rejections.push({
        code: "INVALID_WEIGHT",
        parameter: `metricEnabled.${key}`,
        reason: "Inclusão do sinal precisa ser declarada explicitamente."
      });
    } else {
      accepted.push({ parameter: `metricEnabled.${key}`, capability: "EXACT_REWEIGHT" });
    }
  }

  const enabledWithWeight = CANDIDATE_WEIGHT_KEYS.filter(
    (key) => candidate.metricEnabled?.[key] === true && (candidate.weights?.[key] ?? 0) > 0
  );
  if (enabledWithWeight.length === 0) {
    rejections.push({
      code: "NO_ENABLED_METRIC",
      parameter: "weights",
      reason: "Nenhum sinal habilitado com peso positivo; não há score a comparar."
    });
  }

  const post = candidate.postAggregation;
  const postChecks: { parameter: keyof PostAggregationRules; min: number; max: number }[] = [
    { parameter: "primaryCount", min: 1, max: 20 },
    { parameter: "alternativeCount", min: 0, max: 20 },
    { parameter: "minimumScoreToRecommend", min: 0, max: 100 },
    { parameter: "minimumDataCoverageToRecommend", min: 0, max: 1 },
    { parameter: "executionRiskPenaltyStart", min: 0, max: 100 },
    { parameter: "executionRiskMaxPenalty", min: 0, max: 100 }
  ];
  for (const check of postChecks) {
    const value = post?.[check.parameter];
    if (invalidNumber(value) || (value as number) < check.min || (value as number) > check.max) {
      rejections.push({
        code: "INVALID_POST_AGGREGATION",
        parameter: `postAggregation.${check.parameter}`,
        reason: `Valor precisa ser um número finito entre ${check.min} e ${check.max}.`
      });
    } else {
      accepted.push({
        parameter: String(check.parameter),
        capability: "EXACT_POST_AGGREGATION"
      });
    }
  }

  for (const parameter of Object.keys(candidate.extraParameters ?? {})) {
    const entry = findReplayCapability(parameter);
    if (!entry) {
      rejections.push({
        code: "UNKNOWN_PARAMETER",
        parameter,
        reason: "Parâmetro não consta no registro de capacidade de replay."
      });
      continue;
    }
    if (entry.capability === "REQUIRES_HISTORICAL_DERIVATION_INPUT") {
      rejections.push({
        code: "REQUIRES_HISTORICAL_DERIVATION_INPUT",
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
    accepted.push({ parameter, capability: entry.capability });
  }

  return { valid: rejections.length === 0, rejections, accepted };
}

/**
 * Serialização estável da configuração. O hash em si fica na Etapa 25b, que
 * roda na API e tem `node:crypto` — `packages/core` também roda no renderer.
 */
export function canonicalCandidateString(candidate: RecommendationEngineCandidate): string {
  const orderedExtra = Object.entries(candidate.extraParameters ?? {}).sort(([left], [right]) =>
    left.localeCompare(right, "en")
  );
  return JSON.stringify({
    labVersion: candidate.labVersion,
    supportedAggregationVersion: candidate.supportedAggregationVersion,
    weights: CANDIDATE_WEIGHT_KEYS.map((key) => [key, candidate.weights[key] ?? 0]),
    metricEnabled: CANDIDATE_WEIGHT_KEYS.map((key) => [key, candidate.metricEnabled[key] === true]),
    postAggregation: [
      candidate.postAggregation.primaryCount,
      candidate.postAggregation.alternativeCount,
      candidate.postAggregation.minimumScoreToRecommend,
      candidate.postAggregation.minimumDataCoverageToRecommend,
      candidate.postAggregation.executionRiskPenaltyStart,
      candidate.postAggregation.executionRiskMaxPenalty
    ],
    extraParameters: orderedExtra
  });
}
