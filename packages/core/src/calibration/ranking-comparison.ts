import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";
import type { Role } from "../types/domain.js";
import {
  CALIBRATION_LAB_VERSION,
  type CandidatePromotionStatus,
  type RecommendationEngineCandidate
} from "./engine-candidate.js";
import {
  applyCandidateToFrozen,
  candidateChangesPenaltyCurve,
  extractFrozenCandidate,
  reconstructBaseline,
  type ReplayCaseStatus,
  type ReplayExclusion,
  type ReweightedCandidate
} from "./snapshot-replay.js";

/**
 * Comparação entre a linha de base histórica e uma configuração candidata.
 *
 * ## O que este módulo deliberadamente não faz
 *
 * Não emite veredito. Score maior **não** é tratado como melhoria: um candidato
 * subir de posição é deslocamento, não acerto. O que o laboratório mede é
 * quanto a ordenação se move, para onde, e em que segmentos — a leitura sobre
 * se isso é desejável é humana e acontece fora daqui.
 *
 * Vitória e derrota não aparecem em nenhum tipo deste arquivo. O cruzamento com
 * revisão humana usa somente a avaliação **pré-partida** da Etapa 24, que por
 * construção não conhece o resultado.
 */

/** Categorias em que o motor classifica por familiaridade do próprio jogador. */
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

/** Avaliação humana pré-partida, sem nenhum campo derivado do resultado. */
export interface PreMatchReviewReference {
  reviewId: string;
  overallRating: string;
  issueTags: string[];
}

export interface ReplayCaseInput {
  draftSessionId: string;
  snapshotId: string;
  role: Role;
  /** Patch declarado nas versões de catálogo do snapshot, quando conhecido. */
  patch?: string;
  aggregationVersion: string;
  recommendations: readonly PersistedRecommendation[];
  /** Campeão efetivamente escolhido, quando o snapshot registrou a escolha. */
  selectedChampionId?: number;
  preMatchReview?: PreMatchReviewReference;
}

export interface ChampionMovement {
  championId: number;
  championName: string;
  fromRank: number;
  toRank: number;
  fromScore: number;
  toScore: number;
}

export interface RealChoiceComparison {
  championId: number;
  /** Posição no ranking baseline; ausente se não era recomendado. */
  baselineRank?: number;
  candidateRank?: number;
  enteredRecommendations: boolean;
  leftRecommendations: boolean;
}

export interface RankingComparison {
  evaluatedCandidates: number;
  top1Preserved: boolean;
  /** Interseção entre os `primaryCount` primeiros de cada ordenação. */
  primaryOverlap: number;
  primaryOverlapRatio: number;
  meanRankDisplacement: number;
  maxRankDisplacement: number;
  promoted: ChampionMovement[];
  demoted: ChampionMovement[];
  enteredPrimary: ChampionMovement[];
  leftPrimary: ChampionMovement[];
  /** Pares comfort × estratégico cuja ordem relativa se inverteu. */
  comfortStrategicInversions: number;
  realChoice?: RealChoiceComparison;
}

export interface ReplayCaseResult {
  draftSessionId: string;
  snapshotId: string;
  role: Role;
  patch?: string;
  status: ReplayCaseStatus;
  exclusions: ReplayExclusion[];
  /** Cobertura histórica média do caso, preservada do snapshot. */
  baselineDataCoverage?: number;
  comparison?: RankingComparison;
  reweighted?: ReweightedCandidate[];
  preMatchReview?: PreMatchReviewReference;
}

function orderCandidates(entries: readonly ReweightedCandidate[]): ReweightedCandidate[] {
  // Mesmo desempate do motor: score decrescente, depois championId crescente.
  return [...entries].sort(
    (left, right) =>
      right.candidateScore - left.candidateScore || left.championId - right.championId
  );
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

/**
 * Replay de um caso histórico completo.
 *
 * Todo candidato do snapshot precisa passar na reconstrução do baseline. Basta
 * um falhar para o caso inteiro sair da amostra: comparar um ranking em que
 * parte das posições não é reproduzível produziria deslocamentos que não são da
 * configuração candidata.
 */
export function replaySnapshotCase(input: {
  caseInput: ReplayCaseInput;
  candidate: RecommendationEngineCandidate;
}): ReplayCaseResult {
  const { caseInput, candidate } = input;
  const base = {
    draftSessionId: caseInput.draftSessionId,
    snapshotId: caseInput.snapshotId,
    role: caseInput.role,
    ...(caseInput.patch ? { patch: caseInput.patch } : {}),
    ...(caseInput.preMatchReview ? { preMatchReview: caseInput.preMatchReview } : {})
  };

  if (caseInput.recommendations.length === 0) {
    return {
      ...base,
      status: "REPLAY_IMPOSSIBLE",
      exclusions: [
        {
          code: "NO_FROZEN_METRICS",
          reason: "O snapshot não preserva nenhum candidato.",
          missingHistoricalInput: "RecommendationSnapshot.recommendations"
        }
      ]
    };
  }

  const frozen = caseInput.recommendations.map(extractFrozenCandidate);
  const exclusions: ReplayExclusion[] = [];
  let status: ReplayCaseStatus = "EXACT_REPLAY";
  const changesPenalty = candidateChangesPenaltyCurve(candidate);

  for (const entry of frozen) {
    const reconstruction = reconstructBaseline({
      frozen: entry,
      aggregationVersion: caseInput.aggregationVersion
    });
    if (reconstruction.status !== "EXACT_REPLAY") {
      status = reconstruction.status;
      exclusions.push(...reconstruction.exclusions);
      continue;
    }
    if (changesPenalty && reconstruction.penaltyReconstruction === "ABSENT_AND_ZERO") {
      status = "REPLAY_INTEGRITY_FAILED";
      exclusions.push({
        code: "PENALTY_NOT_REPRODUCIBLE",
        reason: `A configuração altera a curva de penalização, e ${entry.championName} não tem risco de execução congelado.`,
        missingHistoricalInput: "RecommendationMetric EXECUTION_RISK"
      });
    }
  }

  if (exclusions.length > 0) {
    return { ...base, status, exclusions };
  }

  const reweighted = frozen.map((entry) => applyCandidateToFrozen({ frozen: entry, candidate }));
  const baselineOrder = [...frozen].sort((left, right) => left.rank - right.rank);
  const candidateOrder = orderCandidates(reweighted);

  const candidateRankById = new Map(
    candidateOrder.map((entry, index) => [entry.championId, index + 1])
  );
  const baselineRankById = new Map(baselineOrder.map((entry) => [entry.championId, entry.rank]));

  const primaryCount = Math.min(candidate.postAggregation.primaryCount, baselineOrder.length);
  const baselinePrimary = new Set(
    baselineOrder.slice(0, primaryCount).map((entry) => entry.championId)
  );
  const candidatePrimary = new Set(
    candidateOrder.slice(0, primaryCount).map((entry) => entry.championId)
  );

  const movements: ChampionMovement[] = reweighted.map((entry) => ({
    championId: entry.championId,
    championName: entry.championName,
    fromRank: baselineRankById.get(entry.championId) ?? entry.baselineRank,
    toRank: candidateRankById.get(entry.championId) ?? entry.baselineRank,
    fromScore: entry.baselineScore,
    toScore: entry.candidateScore
  }));

  const displacements = movements.map((movement) => Math.abs(movement.toRank - movement.fromRank));
  const overlap = [...candidatePrimary].filter((id) => baselinePrimary.has(id)).length;

  let inversions = 0;
  for (let i = 0; i < movements.length; i += 1) {
    for (let j = i + 1; j < movements.length; j += 1) {
      const left = movements[i];
      const right = movements[j];
      const leftClass = categoryClass(
        reweighted.find((entry) => entry.championId === left.championId)?.category ?? ""
      );
      const rightClass = categoryClass(
        reweighted.find((entry) => entry.championId === right.championId)?.category ?? ""
      );
      if (leftClass === "OTHER" || rightClass === "OTHER" || leftClass === rightClass) continue;
      const beforeLeftAhead = left.fromRank < right.fromRank;
      const afterLeftAhead = left.toRank < right.toRank;
      if (beforeLeftAhead !== afterLeftAhead) inversions += 1;
    }
  }

  const selectedChampionId = caseInput.selectedChampionId;
  const realChoice: RealChoiceComparison | undefined =
    selectedChampionId === undefined
      ? undefined
      : (() => {
          const baselineRank = baselineRankById.get(selectedChampionId);
          const candidateRank = candidateRankById.get(selectedChampionId);
          const inBaselinePrimary = baselinePrimary.has(selectedChampionId);
          const inCandidatePrimary = candidatePrimary.has(selectedChampionId);
          return {
            championId: selectedChampionId,
            ...(baselineRank !== undefined ? { baselineRank } : {}),
            ...(candidateRank !== undefined ? { candidateRank } : {}),
            enteredRecommendations: !inBaselinePrimary && inCandidatePrimary,
            leftRecommendations: inBaselinePrimary && !inCandidatePrimary
          };
        })();

  const baselineDataCoverage =
    Math.round(
      (frozen.reduce((sum, entry) => sum + entry.persistedDataCoverage, 0) / frozen.length) * 1000
    ) / 1000;

  return {
    ...base,
    status: "EXACT_REPLAY",
    exclusions: [],
    baselineDataCoverage,
    reweighted,
    comparison: {
      evaluatedCandidates: movements.length,
      top1Preserved: baselineOrder[0]?.championId === candidateOrder[0]?.championId,
      primaryOverlap: overlap,
      primaryOverlapRatio: primaryCount === 0 ? 0 : Math.round((overlap / primaryCount) * 100) / 100,
      meanRankDisplacement: mean(displacements),
      maxRankDisplacement: displacements.length === 0 ? 0 : Math.max(...displacements),
      promoted: movements.filter((movement) => movement.toRank < movement.fromRank),
      demoted: movements.filter((movement) => movement.toRank > movement.fromRank),
      enteredPrimary: movements.filter(
        (movement) =>
          !baselinePrimary.has(movement.championId) && candidatePrimary.has(movement.championId)
      ),
      leftPrimary: movements.filter(
        (movement) =>
          baselinePrimary.has(movement.championId) && !candidatePrimary.has(movement.championId)
      ),
      comfortStrategicInversions: inversions,
      ...(realChoice ? { realChoice } : {})
    }
  };
}

export interface SegmentSummary {
  segment: string;
  value: string;
  cases: number;
  top1PreservedRate: number;
  meanRankDisplacement: number;
  meanPrimaryOverlapRatio: number;
}

export interface ExclusionSummary {
  code: string;
  cases: number;
  missingHistoricalInputs: string[];
}

export interface CalibrationExperimentSummary {
  labVersion: string;
  candidateName: string;
  promotionStatus: CandidatePromotionStatus;
  totalCases: number;
  replayedCases: number;
  excludedCases: number;
  /** Só sobre os casos reproduzidos; casos excluídos nunca entram na média. */
  top1PreservedRate: number;
  meanRankDisplacement: number;
  meanPrimaryOverlapRatio: number;
  totalComfortStrategicInversions: number;
  realChoiceEntered: number;
  realChoiceLeft: number;
  segments: SegmentSummary[];
  exclusions: ExclusionSummary[];
  /** Casos reproduzidos que têm avaliação humana pré-partida associada. */
  casesWithPreMatchReview: number;
}

function summarizeSegment(
  segment: string,
  value: string,
  results: readonly ReplayCaseResult[]
): SegmentSummary {
  const comparisons = results
    .map((result) => result.comparison)
    .filter((comparison): comparison is RankingComparison => comparison !== undefined);
  return {
    segment,
    value,
    cases: comparisons.length,
    top1PreservedRate:
      comparisons.length === 0
        ? 0
        : Math.round(
            (comparisons.filter((comparison) => comparison.top1Preserved).length /
              comparisons.length) *
              100
          ) / 100,
    meanRankDisplacement: mean(comparisons.map((comparison) => comparison.meanRankDisplacement)),
    meanPrimaryOverlapRatio: mean(comparisons.map((comparison) => comparison.primaryOverlapRatio))
  };
}

/** Faixa de cobertura, para segmentar sem fingir precisão que a amostra não tem. */
export function coverageBand(coverage: number): string {
  if (coverage >= 0.9) return "0.9-1.0";
  if (coverage >= 0.7) return "0.7-0.9";
  if (coverage >= 0.5) return "0.5-0.7";
  return "<0.5";
}

/**
 * Agrega os casos de um experimento.
 *
 * O status de promoção nunca é derivado dos números: ele entra como parâmetro e
 * o valor máximo que o tipo aceita é `APPROVED_FOR_FUTURE_RELEASE`. Não existe
 * caminho, neste módulo, que promova uma configuração a partir de um resultado.
 */
export function summarizeCalibrationExperiment(input: {
  candidate: RecommendationEngineCandidate;
  results: readonly ReplayCaseResult[];
  promotionStatus?: CandidatePromotionStatus;
}): CalibrationExperimentSummary {
  const replayed = input.results.filter(
    (result) => result.status === "EXACT_REPLAY" && result.comparison !== undefined
  );
  const excluded = input.results.filter((result) => result.status !== "EXACT_REPLAY");
  const comparisons = replayed.map((result) => result.comparison as RankingComparison);

  const exclusionsByCode = new Map<string, { cases: number; inputs: Set<string> }>();
  for (const result of excluded) {
    for (const exclusion of result.exclusions) {
      const current = exclusionsByCode.get(exclusion.code) ?? { cases: 0, inputs: new Set() };
      current.cases += 1;
      if (exclusion.missingHistoricalInput) current.inputs.add(exclusion.missingHistoricalInput);
      exclusionsByCode.set(exclusion.code, current);
    }
  }

  const segments: SegmentSummary[] = [];
  const byRole = new Map<string, ReplayCaseResult[]>();
  const byPatch = new Map<string, ReplayCaseResult[]>();
  const byCoverage = new Map<string, ReplayCaseResult[]>();
  for (const result of replayed) {
    byRole.set(result.role, [...(byRole.get(result.role) ?? []), result]);
    const patch = result.patch ?? "não informado";
    byPatch.set(patch, [...(byPatch.get(patch) ?? []), result]);
    const band = coverageBand(result.baselineDataCoverage ?? 0);
    byCoverage.set(band, [...(byCoverage.get(band) ?? []), result]);
  }
  for (const [value, results] of [...byRole.entries()].sort()) {
    segments.push(summarizeSegment("role", value, results));
  }
  for (const [value, results] of [...byPatch.entries()].sort()) {
    segments.push(summarizeSegment("patch", value, results));
  }
  for (const [value, results] of [...byCoverage.entries()].sort()) {
    segments.push(summarizeSegment("dataCoverage", value, results));
  }

  return {
    labVersion: CALIBRATION_LAB_VERSION,
    candidateName: input.candidate.name,
    promotionStatus: input.promotionStatus ?? "EVALUATED",
    totalCases: input.results.length,
    replayedCases: replayed.length,
    excludedCases: excluded.length,
    top1PreservedRate:
      comparisons.length === 0
        ? 0
        : Math.round(
            (comparisons.filter((comparison) => comparison.top1Preserved).length /
              comparisons.length) *
              100
          ) / 100,
    meanRankDisplacement: mean(comparisons.map((comparison) => comparison.meanRankDisplacement)),
    meanPrimaryOverlapRatio: mean(comparisons.map((comparison) => comparison.primaryOverlapRatio)),
    totalComfortStrategicInversions: comparisons.reduce(
      (sum, comparison) => sum + comparison.comfortStrategicInversions,
      0
    ),
    realChoiceEntered: comparisons.filter(
      (comparison) => comparison.realChoice?.enteredRecommendations === true
    ).length,
    realChoiceLeft: comparisons.filter(
      (comparison) => comparison.realChoice?.leftRecommendations === true
    ).length,
    segments,
    exclusions: [...exclusionsByCode.entries()]
      .map(([code, entry]) => ({
        code,
        cases: entry.cases,
        missingHistoricalInputs: [...entry.inputs].sort()
      }))
      .sort((left, right) => right.cases - left.cases || left.code.localeCompare(right.code, "en")),
    casesWithPreMatchReview: replayed.filter((result) => result.preMatchReview !== undefined).length
  };
}

/**
 * Serialização estável do experimento inteiro (configuração + casos + filtros).
 * Mudar a candidata ou os filtros muda esta string e, na Etapa 25b, produz um
 * experimento novo em vez de sobrescrever o anterior.
 */
export function canonicalExperimentInputString(input: {
  candidateHashInput: string;
  snapshotIds: readonly string[];
  filters: Record<string, string | number | boolean>;
}): string {
  return JSON.stringify({
    labVersion: CALIBRATION_LAB_VERSION,
    candidate: input.candidateHashInput,
    snapshotIds: [...input.snapshotIds].sort(),
    filters: Object.entries(input.filters).sort(([left], [right]) => left.localeCompare(right, "en"))
  });
}
