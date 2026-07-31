import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";
import type { Role } from "../types/domain.js";
import {
  CALIBRATION_LAB_VERSION,
  canonicalCandidateString,
  resolvePostAggregationThresholds,
  type CalibrationCandidate
} from "./engine-candidate.js";
import {
  applyCandidateToFrozen,
  candidateChangesPenaltyCurve,
  extractFrozenCandidate,
  reconstructBaseline,
  statusForExclusions,
  type ReplayExclusionReason,
  type ReplayStatus,
  type ReweightedCandidate
} from "./snapshot-replay.js";

/**
 * Comparação entre a linha de base histórica e uma configuração candidata.
 *
 * ## O que este módulo deliberadamente não faz
 *
 * Não emite veredito. **Estabilidade não é qualidade** e **mudança não é
 * melhoria**: um candidato subir de posição é deslocamento, não acerto. O que
 * o laboratório mede é quanto a ordenação se move, para onde, e em que
 * segmentos — a leitura sobre se isso é desejável é humana e acontece fora
 * daqui.
 *
 * Vitória, derrota e qualquer dado da partida não aparecem em nenhum tipo deste
 * arquivo. O cruzamento com revisão humana usa somente a avaliação
 * **pré-resultado** da Etapa 24, que por construção não conhece o desfecho.
 */

export const COMFORT_CATEGORIES: readonly string[] = ["comfort_pick", "safe_pick"];

/**
 * Categorias em que o motor classifica pelo contexto do draft. `best_matchup`
 * entra aqui porque só existe quando o adversário de rota foi revelado: é uma
 * leitura do draft, ainda que apoiada em histórico pessoal.
 */
export const STRATEGIC_CATEGORIES: readonly string[] = [
  "best_blind",
  "best_matchup",
  "best_teamfit",
  "strategic_option"
];

function categoryClass(category: string): "COMFORT" | "STRATEGIC" | "OTHER" {
  if (COMFORT_CATEGORIES.includes(category)) return "COMFORT";
  if (STRATEGIC_CATEGORIES.includes(category)) return "STRATEGIC";
  return "OTHER";
}

/** Avaliação humana pré-resultado, sem nenhum campo derivado do desfecho. */
export interface PreMatchReviewReference {
  reviewId: string;
  /** Escala qualitativa da Etapa 24; nunca convertida em número. */
  overallRating: "STRONG" | "ADEQUATE" | "WEAK" | "INSUFFICIENT_DATA" | "NOT_APPLICABLE";
  issueTags: string[];
}

export interface CalibrationRankingEntry {
  championId: number;
  championName: string;
  rank: number;
  group: "PRIMARY" | "ALTERNATIVE" | "NOT_RECOMMENDED";
  score: number;
  dataCoverage: number;
}

export interface CalibrationRanking {
  entries: CalibrationRankingEntry[];
  primaryChampionIds: number[];
  alternativeChampionIds: number[];
}

export interface ReplayCaseInput {
  draftSessionId: string;
  snapshotId: string;
  role: Role;
  /** Fatos do snapshot, quando o registro os informa. Nada é inferido. */
  patch?: string;
  queue?: string;
  /** ISO do instante do snapshot, usado só para segmentar por período. */
  capturedAt?: string;
  poolSize?: number;
  aggregationVersion: string;
  algorithmVersions: Record<string, string>;
  recommendations: readonly PersistedRecommendation[];
  /** Campeão efetivamente escolhido, quando o snapshot registrou a escolha. */
  selectedChampionId?: number;
  preMatchReview?: PreMatchReviewReference;
}

export interface CalibrationCaseComparison {
  draftSessionId: string;
  snapshotId: string;
  role: Role;
  patch?: string;
  queue?: string;

  replayStatus: ReplayStatus;
  exclusionReasons: ReplayExclusionReason[];

  baseline: CalibrationRanking;
  candidate: CalibrationRanking | null;

  topOnePreserved: boolean | null;
  topFiveOverlap: number | null;
  averageRankDisplacement: number | null;
  medianRankDisplacement: number | null;
  maxRankDisplacement: number | null;
  /** Jaccard entre os conjuntos recomendados; `null` sem comparação. */
  recommendedSetStability: number | null;

  promotedChampionIds: number[];
  demotedChampionIds: number[];
  enteredPrimaryChampionIds: number[];
  leftPrimaryChampionIds: number[];
  primaryToAlternativeChampionIds: number[];
  alternativeToPrimaryChampionIds: number[];
  comfortStrategicInversions: number | null;

  /** Detalhe por candidato: original, reconstruído, candidato e motivos. */
  candidates: ReweightedCandidate[];

  chosenChampion: ChosenChampionComparison | null;
  preMatchReview?: PreMatchReviewReference;
  algorithmVersions: Record<string, string>;
}

export interface ChosenChampionComparison {
  championId: number;
  baselineRank: number | null;
  candidateRank: number | null;
  baselineGroup: "PRIMARY" | "ALTERNATIVE" | "NOT_RECOMMENDED" | null;
  candidateGroup: "PRIMARY" | "ALTERNATIVE" | "NOT_RECOMMENDED" | null;
  enteredPrimary: boolean;
  leftPrimary: boolean;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return Math.round(value * 100) / 100;
}

function jaccard(left: readonly number[], right: readonly number[]): number | null {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return null;
  const intersection = [...a].filter((id) => b.has(id)).length;
  return Math.round((intersection / union.size) * 100) / 100;
}

function emptyRanking(): CalibrationRanking {
  return { entries: [], primaryChampionIds: [], alternativeChampionIds: [] };
}

function baselineRanking(reweighted: readonly ReweightedCandidate[]): CalibrationRanking {
  const entries = [...reweighted]
    .sort((left, right) => left.baselineRank - right.baselineRank)
    .map((entry) => ({
      championId: entry.championId,
      championName: entry.championName,
      rank: entry.baselineRank,
      group: entry.baselineGroup,
      score: entry.baselineScore,
      dataCoverage: entry.baselineDataCoverage
    }));
  return {
    entries,
    primaryChampionIds: entries.filter((e) => e.group === "PRIMARY").map((e) => e.championId),
    alternativeChampionIds: entries
      .filter((e) => e.group === "ALTERNATIVE")
      .map((e) => e.championId)
  };
}

/**
 * Ordenação candidata. Usa o mesmo desempate do motor (score decrescente,
 * depois `championId` crescente), então a ordem em que os candidatos chegam
 * não altera nem o score nem o ranking.
 */
function candidateRanking(
  reweighted: readonly ReweightedCandidate[],
  thresholds: Record<string, number>
): CalibrationRanking {
  const primaryCount = thresholds.primaryCount ?? 5;
  const alternativeCount = thresholds.alternativeCount ?? 3;
  const minimumScore = thresholds.minimumScoreToRecommend ?? 0;
  const minimumCoverage = thresholds.minimumDataCoverageToRecommend ?? 0;

  const ordered = [...reweighted].sort(
    (left, right) =>
      right.candidateScore - left.candidateScore || left.championId - right.championId
  );

  const eligible = ordered.filter(
    (entry) =>
      entry.candidateScore >= minimumScore && entry.candidateDataCoverage >= minimumCoverage
  );
  const primary = new Set(eligible.slice(0, primaryCount).map((entry) => entry.championId));
  const alternative = new Set(
    eligible.slice(primaryCount, primaryCount + alternativeCount).map((entry) => entry.championId)
  );

  const entries = ordered.map((entry, index) => ({
    championId: entry.championId,
    championName: entry.championName,
    rank: index + 1,
    group: primary.has(entry.championId)
      ? ("PRIMARY" as const)
      : alternative.has(entry.championId)
        ? ("ALTERNATIVE" as const)
        : ("NOT_RECOMMENDED" as const),
    score: entry.candidateScore,
    dataCoverage: entry.candidateDataCoverage
  }));

  return {
    entries,
    primaryChampionIds: entries.filter((e) => e.group === "PRIMARY").map((e) => e.championId),
    alternativeChampionIds: entries
      .filter((e) => e.group === "ALTERNATIVE")
      .map((e) => e.championId)
  };
}

function excludedCase(
  caseInput: ReplayCaseInput,
  exclusions: ReplayExclusionReason[],
  baseline: CalibrationRanking
): CalibrationCaseComparison {
  return {
    draftSessionId: caseInput.draftSessionId,
    snapshotId: caseInput.snapshotId,
    role: caseInput.role,
    ...(caseInput.patch ? { patch: caseInput.patch } : {}),
    ...(caseInput.queue ? { queue: caseInput.queue } : {}),
    replayStatus: statusForExclusions(exclusions),
    exclusionReasons: exclusions,
    baseline,
    candidate: null,
    topOnePreserved: null,
    topFiveOverlap: null,
    averageRankDisplacement: null,
    medianRankDisplacement: null,
    maxRankDisplacement: null,
    recommendedSetStability: null,
    promotedChampionIds: [],
    demotedChampionIds: [],
    enteredPrimaryChampionIds: [],
    leftPrimaryChampionIds: [],
    primaryToAlternativeChampionIds: [],
    alternativeToPrimaryChampionIds: [],
    comfortStrategicInversions: null,
    candidates: [],
    chosenChampion: null,
    ...(caseInput.preMatchReview ? { preMatchReview: caseInput.preMatchReview } : {}),
    algorithmVersions: { ...caseInput.algorithmVersions }
  };
}

/**
 * Replay de um caso histórico completo.
 *
 * Todo candidato do snapshot precisa passar na reconstrução do baseline. Basta
 * um falhar para o caso inteiro sair da comparação: um ranking em que parte das
 * posições não é reproduzível produziria deslocamentos que não são da
 * configuração candidata.
 */
export function replaySnapshotCase(input: {
  caseInput: ReplayCaseInput;
  candidate: CalibrationCandidate;
}): CalibrationCaseComparison {
  const { caseInput, candidate } = input;

  if (caseInput.recommendations.length === 0) {
    return excludedCase(
      caseInput,
      [
        {
          code: "NO_FROZEN_METRICS",
          reason: "O snapshot não preserva nenhum candidato.",
          missingHistoricalInput: "RecommendationSnapshot.recommendations"
        }
      ],
      emptyRanking()
    );
  }

  const frozen = caseInput.recommendations.map(extractFrozenCandidate);
  const exclusions: ReplayExclusionReason[] = [];
  const reconstructedById = new Map<number, number>();
  const changesPenalty = candidateChangesPenaltyCurve(candidate);

  for (const entry of frozen) {
    const reconstruction = reconstructBaseline({
      frozen: entry,
      aggregationVersion: caseInput.aggregationVersion
    });
    if (reconstruction.status !== "EXACT_REPLAY") {
      exclusions.push(...reconstruction.exclusions);
      continue;
    }
    if (changesPenalty && reconstruction.penaltyReconstruction === "ABSENT_AND_PROVEN_ZERO") {
      exclusions.push({
        code: "PENALTY_NOT_REPRODUCIBLE",
        reason: `A configuração altera a curva de penalização, e ${entry.championName} não tem risco de execução congelado.`,
        championId: entry.championId,
        missingHistoricalInput: "RecommendationMetric EXECUTION_RISK"
      });
      continue;
    }
    reconstructedById.set(entry.championId, reconstruction.reconstructedScore as number);
  }

  if (exclusions.length > 0) {
    const partial = frozen.map((entry) =>
      applyCandidateToFrozen({
        frozen: entry,
        candidate,
        reconstructedScore: reconstructedById.get(entry.championId) ?? entry.persistedTotalScore
      })
    );
    return excludedCase(caseInput, exclusions, baselineRanking(partial));
  }

  const reweighted = frozen.map((entry) =>
    applyCandidateToFrozen({
      frozen: entry,
      candidate,
      reconstructedScore: reconstructedById.get(entry.championId) as number
    })
  );

  const thresholds = resolvePostAggregationThresholds(candidate);
  const baseline = baselineRanking(reweighted);
  const candidateRank = candidateRanking(reweighted, thresholds);

  const baselineByChampion = new Map(baseline.entries.map((entry) => [entry.championId, entry]));
  const candidateByChampion = new Map(
    candidateRank.entries.map((entry) => [entry.championId, entry])
  );

  const displacements: number[] = [];
  const promoted: number[] = [];
  const demoted: number[] = [];
  for (const entry of baseline.entries) {
    const after = candidateByChampion.get(entry.championId);
    if (!after) continue;
    const delta = after.rank - entry.rank;
    displacements.push(Math.abs(delta));
    if (delta < 0) promoted.push(entry.championId);
    if (delta > 0) demoted.push(entry.championId);
  }

  const baselinePrimary = new Set(baseline.primaryChampionIds);
  const candidatePrimary = new Set(candidateRank.primaryChampionIds);
  const baselineAlternative = new Set(baseline.alternativeChampionIds);
  const candidateAlternative = new Set(candidateRank.alternativeChampionIds);

  const topFive = (ranking: CalibrationRanking) =>
    ranking.entries.slice(0, Math.min(5, ranking.entries.length)).map((entry) => entry.championId);
  const baselineTopFive = topFive(baseline);
  const candidateTopFive = topFive(candidateRank);

  const categoryById = new Map(reweighted.map((entry) => [entry.championId, entry.category]));
  let inversions = 0;
  for (let i = 0; i < baseline.entries.length; i += 1) {
    for (let j = i + 1; j < baseline.entries.length; j += 1) {
      const left = baseline.entries[i];
      const right = baseline.entries[j];
      const leftClass = categoryClass(categoryById.get(left.championId) ?? "");
      const rightClass = categoryClass(categoryById.get(right.championId) ?? "");
      if (leftClass === "OTHER" || rightClass === "OTHER" || leftClass === rightClass) continue;
      const afterLeft = candidateByChampion.get(left.championId);
      const afterRight = candidateByChampion.get(right.championId);
      if (!afterLeft || !afterRight) continue;
      if (left.rank < right.rank !== afterLeft.rank < afterRight.rank) inversions += 1;
    }
  }

  const selectedChampionId = caseInput.selectedChampionId;
  const chosenChampion: ChosenChampionComparison | null =
    selectedChampionId === undefined
      ? null
      : {
          championId: selectedChampionId,
          baselineRank: baselineByChampion.get(selectedChampionId)?.rank ?? null,
          candidateRank: candidateByChampion.get(selectedChampionId)?.rank ?? null,
          baselineGroup: baselineByChampion.get(selectedChampionId)?.group ?? null,
          candidateGroup: candidateByChampion.get(selectedChampionId)?.group ?? null,
          enteredPrimary:
            !baselinePrimary.has(selectedChampionId) && candidatePrimary.has(selectedChampionId),
          leftPrimary:
            baselinePrimary.has(selectedChampionId) && !candidatePrimary.has(selectedChampionId)
        };

  return {
    draftSessionId: caseInput.draftSessionId,
    snapshotId: caseInput.snapshotId,
    role: caseInput.role,
    ...(caseInput.patch ? { patch: caseInput.patch } : {}),
    ...(caseInput.queue ? { queue: caseInput.queue } : {}),
    replayStatus: "EXACT_REPLAY",
    exclusionReasons: [],
    baseline,
    candidate: candidateRank,
    topOnePreserved: baseline.entries[0]?.championId === candidateRank.entries[0]?.championId,
    topFiveOverlap: baselineTopFive.filter((id) => candidateTopFive.includes(id)).length,
    averageRankDisplacement: mean(displacements),
    medianRankDisplacement: median(displacements),
    maxRankDisplacement: displacements.length === 0 ? null : Math.max(...displacements),
    recommendedSetStability: jaccard(baseline.primaryChampionIds, candidateRank.primaryChampionIds),
    promotedChampionIds: promoted,
    demotedChampionIds: demoted,
    enteredPrimaryChampionIds: [...candidatePrimary].filter((id) => !baselinePrimary.has(id)),
    leftPrimaryChampionIds: [...baselinePrimary].filter((id) => !candidatePrimary.has(id)),
    primaryToAlternativeChampionIds: [...baselinePrimary].filter((id) =>
      candidateAlternative.has(id)
    ),
    alternativeToPrimaryChampionIds: [...baselineAlternative].filter((id) =>
      candidatePrimary.has(id)
    ),
    comfortStrategicInversions: inversions,
    candidates: reweighted,
    chosenChampion,
    ...(caseInput.preMatchReview ? { preMatchReview: caseInput.preMatchReview } : {}),
    algorithmVersions: { ...caseInput.algorithmVersions }
  };
}

/** Um caso reproduzido cuja ordenação mudou de alguma forma observável. */
function rankingChanged(comparison: CalibrationCaseComparison): boolean {
  return (
    comparison.topOnePreserved === false ||
    (comparison.averageRankDisplacement ?? 0) > 0 ||
    comparison.enteredPrimaryChampionIds.length > 0 ||
    comparison.leftPrimaryChampionIds.length > 0
  );
}

export interface SegmentSummary {
  dimension: string;
  value: string;
  cases: number;
  topOnePreservedCases: number;
  averageRankDisplacement: number | null;
  medianRankDisplacement: number | null;
  averageRecommendedSetStability: number | null;
}

export interface ExclusionSummary {
  code: string;
  cases: number;
  missingHistoricalInputs: string[];
}

/**
 * Contagens de revisão humana pré-resultado. São contagens, não nota: a escala
 * qualitativa da Etapa 24 nunca vira número agregado.
 */
export interface HumanReviewSummary {
  casesWithReview: number;
  casesWithoutReview: number;
  strongCasesPreserved: number;
  strongCasesAltered: number;
  weakCasesPreserved: number;
  weakCasesAltered: number;
  issueTagsAffected: { tag: string; casesAltered: number; casesTotal: number }[];
}

export interface CalibrationExperimentReport {
  labVersion: string;
  candidateId: string;
  candidateVersion: string;
  candidateStatus: CalibrationCandidate["status"];

  totalCases: number;
  replayedCases: number;
  excludedCases: number;
  nonReproducibleCases: number;

  topOnePreservedCases: number;
  averageTopFiveOverlap: number | null;
  averageRankDisplacement: number | null;
  medianRankDisplacement: number | null;
  averageRecommendedSetStability: number | null;
  totalPromoted: number;
  totalDemoted: number;
  totalEnteredPrimary: number;
  totalLeftPrimary: number;
  totalPrimaryToAlternative: number;
  totalAlternativeToPrimary: number;
  totalComfortStrategicInversions: number;
  chosenChampionEnteredPrimary: number;
  chosenChampionLeftPrimary: number;

  segments: SegmentSummary[];
  exclusions: ExclusionSummary[];
  humanReview: HumanReviewSummary;
}

/** Faixa de cobertura, para segmentar sem fingir precisão que a amostra não tem. */
export function coverageBand(coverage: number): string {
  if (coverage >= 0.9) return "0.9-1.0";
  if (coverage >= 0.7) return "0.7-0.9";
  if (coverage >= 0.5) return "0.5-0.7";
  return "<0.5";
}

/** Faixa de tamanho de pool, mesma razão da faixa de cobertura. */
export function poolSizeBand(size: number): string {
  if (size >= 15) return "15+";
  if (size >= 10) return "10-14";
  if (size >= 5) return "5-9";
  return "<5";
}

/** Período mensal derivado do instante do snapshot, sem inventar granularidade. */
export function periodBand(capturedAt: string): string {
  return capturedAt.slice(0, 7);
}

function summarizeSegment(
  dimension: string,
  value: string,
  comparisons: readonly CalibrationCaseComparison[]
): SegmentSummary {
  return {
    dimension,
    value,
    cases: comparisons.length,
    topOnePreservedCases: comparisons.filter((entry) => entry.topOnePreserved === true).length,
    averageRankDisplacement: mean(
      comparisons
        .map((entry) => entry.averageRankDisplacement)
        .filter((value): value is number => value !== null)
    ),
    medianRankDisplacement: median(
      comparisons
        .map((entry) => entry.medianRankDisplacement)
        .filter((value): value is number => value !== null)
    ),
    averageRecommendedSetStability: mean(
      comparisons
        .map((entry) => entry.recommendedSetStability)
        .filter((value): value is number => value !== null)
    )
  };
}

/** Chaves de segmentação de um caso. Ausência não vira valor inventado. */
function segmentKeys(
  comparison: CalibrationCaseComparison,
  caseInput: ReplayCaseInput
): { dimension: string; value: string }[] {
  const keys: { dimension: string; value: string }[] = [{ dimension: "role", value: comparison.role }];
  if (comparison.patch) keys.push({ dimension: "patch", value: comparison.patch });
  if (comparison.queue) keys.push({ dimension: "queue", value: comparison.queue });
  if (caseInput.capturedAt) {
    keys.push({ dimension: "period", value: periodBand(caseInput.capturedAt) });
  }
  if (typeof caseInput.poolSize === "number") {
    keys.push({ dimension: "poolSize", value: poolSizeBand(caseInput.poolSize) });
  }
  const coverage = comparison.baseline.entries[0]?.dataCoverage;
  if (typeof coverage === "number") {
    keys.push({ dimension: "baselineDataCoverage", value: coverageBand(coverage) });
  }
  if (comparison.chosenChampion?.baselineGroup) {
    keys.push({
      dimension: "chosenChampionGroup",
      value: comparison.chosenChampion.baselineGroup
    });
  }
  const engineVersion = comparison.algorithmVersions.recommendationEngine;
  if (engineVersion) keys.push({ dimension: "engineVersion", value: engineVersion });
  if (comparison.preMatchReview) {
    keys.push({ dimension: "preMatchRating", value: comparison.preMatchReview.overallRating });
    for (const tag of [...new Set(comparison.preMatchReview.issueTags)].sort()) {
      keys.push({ dimension: "issueTag", value: tag });
    }
  }
  return keys;
}

/**
 * Agrega os casos de um experimento.
 *
 * O status da configuração nunca é derivado dos números: ele vem da própria
 * candidata, e o valor máximo que o tipo aceita é `APPROVED_FOR_FUTURE_RELEASE`.
 * Não existe caminho, neste módulo, que promova uma configuração a partir de um
 * resultado.
 */
export function summarizeCalibrationExperiment(input: {
  candidate: CalibrationCandidate;
  cases: readonly { caseInput: ReplayCaseInput; comparison: CalibrationCaseComparison }[];
}): CalibrationExperimentReport {
  const replayed = input.cases.filter(({ comparison }) => comparison.replayStatus === "EXACT_REPLAY");
  const excluded = input.cases.filter(({ comparison }) => comparison.replayStatus !== "EXACT_REPLAY");
  const comparisons = replayed.map(({ comparison }) => comparison);

  const exclusionsByCode = new Map<string, { cases: number; inputs: Set<string> }>();
  for (const { comparison } of excluded) {
    const seen = new Set<string>();
    for (const exclusion of comparison.exclusionReasons) {
      const current = exclusionsByCode.get(exclusion.code) ?? { cases: 0, inputs: new Set() };
      if (!seen.has(exclusion.code)) {
        current.cases += 1;
        seen.add(exclusion.code);
      }
      if (exclusion.missingHistoricalInput) current.inputs.add(exclusion.missingHistoricalInput);
      exclusionsByCode.set(exclusion.code, current);
    }
  }

  const bySegment = new Map<string, { dimension: string; value: string; cases: CalibrationCaseComparison[] }>();
  for (const { caseInput, comparison } of replayed) {
    for (const key of segmentKeys(comparison, caseInput)) {
      const id = `${key.dimension} ${key.value}`;
      const bucket = bySegment.get(id) ?? { dimension: key.dimension, value: key.value, cases: [] };
      bucket.cases.push(comparison);
      bySegment.set(id, bucket);
    }
  }

  const tagBuckets = new Map<string, { altered: number; total: number }>();
  let strongPreserved = 0;
  let strongAltered = 0;
  let weakPreserved = 0;
  let weakAltered = 0;
  let withReview = 0;
  for (const comparison of comparisons) {
    const review = comparison.preMatchReview;
    if (!review) continue;
    withReview += 1;
    const changed = rankingChanged(comparison);
    if (review.overallRating === "STRONG") {
      if (changed) strongAltered += 1;
      else strongPreserved += 1;
    }
    if (review.overallRating === "WEAK") {
      if (changed) weakAltered += 1;
      else weakPreserved += 1;
    }
    for (const tag of new Set(review.issueTags)) {
      const bucket = tagBuckets.get(tag) ?? { altered: 0, total: 0 };
      bucket.total += 1;
      if (changed) bucket.altered += 1;
      tagBuckets.set(tag, bucket);
    }
  }

  const sum = (pick: (entry: CalibrationCaseComparison) => number) =>
    comparisons.reduce((total, entry) => total + pick(entry), 0);

  return {
    labVersion: CALIBRATION_LAB_VERSION,
    candidateId: input.candidate.id,
    candidateVersion: input.candidate.candidateVersion,
    candidateStatus: input.candidate.status,

    totalCases: input.cases.length,
    replayedCases: replayed.length,
    excludedCases: excluded.length,
    nonReproducibleCases: excluded.length,

    topOnePreservedCases: comparisons.filter((entry) => entry.topOnePreserved === true).length,
    averageTopFiveOverlap: mean(
      comparisons.map((entry) => entry.topFiveOverlap).filter((v): v is number => v !== null)
    ),
    averageRankDisplacement: mean(
      comparisons
        .map((entry) => entry.averageRankDisplacement)
        .filter((v): v is number => v !== null)
    ),
    medianRankDisplacement: median(
      comparisons
        .map((entry) => entry.medianRankDisplacement)
        .filter((v): v is number => v !== null)
    ),
    averageRecommendedSetStability: mean(
      comparisons
        .map((entry) => entry.recommendedSetStability)
        .filter((v): v is number => v !== null)
    ),
    totalPromoted: sum((entry) => entry.promotedChampionIds.length),
    totalDemoted: sum((entry) => entry.demotedChampionIds.length),
    totalEnteredPrimary: sum((entry) => entry.enteredPrimaryChampionIds.length),
    totalLeftPrimary: sum((entry) => entry.leftPrimaryChampionIds.length),
    totalPrimaryToAlternative: sum((entry) => entry.primaryToAlternativeChampionIds.length),
    totalAlternativeToPrimary: sum((entry) => entry.alternativeToPrimaryChampionIds.length),
    totalComfortStrategicInversions: sum((entry) => entry.comfortStrategicInversions ?? 0),
    chosenChampionEnteredPrimary: comparisons.filter(
      (entry) => entry.chosenChampion?.enteredPrimary === true
    ).length,
    chosenChampionLeftPrimary: comparisons.filter(
      (entry) => entry.chosenChampion?.leftPrimary === true
    ).length,

    segments: [...bySegment.values()]
      .sort(
        (left, right) =>
          left.dimension.localeCompare(right.dimension, "en") ||
          left.value.localeCompare(right.value, "en")
      )
      .map((bucket) => summarizeSegment(bucket.dimension, bucket.value, bucket.cases)),
    exclusions: [...exclusionsByCode.entries()]
      .map(([code, entry]) => ({
        code,
        cases: entry.cases,
        missingHistoricalInputs: [...entry.inputs].sort()
      }))
      .sort((left, right) => right.cases - left.cases || left.code.localeCompare(right.code, "en")),
    humanReview: {
      casesWithReview: withReview,
      casesWithoutReview: comparisons.length - withReview,
      strongCasesPreserved: strongPreserved,
      strongCasesAltered: strongAltered,
      weakCasesPreserved: weakPreserved,
      weakCasesAltered: weakAltered,
      issueTagsAffected: [...tagBuckets.entries()]
        .map(([tag, bucket]) => ({ tag, casesAltered: bucket.altered, casesTotal: bucket.total }))
        .sort((left, right) => left.tag.localeCompare(right.tag, "en"))
    }
  };
}

/** Filtros do experimento. Arrays são canonicalizados antes de entrar no hash. */
export interface CalibrationExperimentFilters {
  roles?: readonly string[];
  patches?: readonly string[];
  queues?: readonly string[];
  from?: string;
  to?: string;
  minimumPoolSize?: number;
  minimumBaselineCoverage?: number;
  engineVersions?: readonly string[];
  preMatchRatings?: readonly string[];
  issueTags?: readonly string[];
}

function canonicalList(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort((left, right) => left.localeCompare(right, "en"));
}

/**
 * Serialização estável do experimento inteiro (configuração + snapshots +
 * filtros + versões). Ordem acidental de arrays, instante de geração, campos
 * visuais e identificadores irrelevantes ficam de fora — o mesmo input
 * funcional produz a mesma string e, portanto, o mesmo relatório.
 *
 * O hash em si fica na Etapa 25b, que roda na API e tem `node:crypto`;
 * `packages/core` também roda no renderer.
 */
export function canonicalExperimentInputString(input: {
  candidate: CalibrationCandidate;
  snapshotIds: readonly string[];
  filters?: CalibrationExperimentFilters;
  algorithmVersions?: Record<string, string>;
}): string {
  const filters = input.filters ?? {};
  return JSON.stringify({
    labVersion: CALIBRATION_LAB_VERSION,
    candidate: canonicalCandidateString(input.candidate),
    snapshotIds: canonicalList(input.snapshotIds),
    filters: {
      roles: canonicalList(filters.roles),
      patches: canonicalList(filters.patches),
      queues: canonicalList(filters.queues),
      from: filters.from ?? null,
      to: filters.to ?? null,
      minimumPoolSize: filters.minimumPoolSize ?? null,
      minimumBaselineCoverage: filters.minimumBaselineCoverage ?? null,
      engineVersions: canonicalList(filters.engineVersions),
      preMatchRatings: canonicalList(filters.preMatchRatings),
      issueTags: canonicalList(filters.issueTags)
    },
    algorithmVersions: Object.entries(input.algorithmVersions ?? {}).sort(([left], [right]) =>
      left.localeCompare(right, "en")
    )
  });
}
