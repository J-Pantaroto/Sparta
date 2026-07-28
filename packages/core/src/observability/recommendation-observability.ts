import type {
  DraftPostGameChoiceGroup,
  DraftPostGameSignalKey
} from "../postgame/draft-postgame-comparison.js";
import type { Role } from "../types/domain.js";
import type { AvailabilityStatus, DataProvenance } from "../types/provenance.js";

export const RECOMMENDATION_OBSERVABILITY_VERSION = "recommendation-observability/1.0.0";
export const RECOMMENDATION_OBSERVABILITY_BANDS_VERSION =
  "recommendation-observability-bands/1.0.0";
export const DEFAULT_VERSION_DISPLAY_SAMPLE_THRESHOLD = 5;

export type RecommendationSelectionGroup = DraftPostGameChoiceGroup;
export type ObservableAlgorithmDimension =
  "recommendationEngine" | "draftStrategy" | "executionRisk" | "postgameComparison";

export interface RecommendationObservation {
  draftSessionId: string;
  snapshotId: string | null;
  matchId: string;
  championId: number;
  role: Role;
  observedRole: Role | null;
  selectionGroup: RecommendationSelectionGroup;
  poolSource: string | null;
  originalRank: number | null;
  originalScore: number | null;
  originalCoverage: number | null;
  originalExecutionRisk: number | null;
  matchWon: boolean;
  positionMatched: boolean | null;
  patch: string | null;
  queueId: number | null;
  playedAt: string | null;
  algorithmVersions: Record<string, string>;
  postgameComparisonStatus: AvailabilityStatus;
  comparableSignalKeys: DraftPostGameSignalKey[];
  unavailableSignalKeys: DraftPostGameSignalKey[];
}

export interface LongitudinalReportFilters {
  playerId: string;
  from?: string;
  to?: string;
  patches?: string[];
  queueIds?: number[];
  roles?: Role[];
  championIds?: number[];
  selectionGroups?: RecommendationSelectionGroup[];
  algorithmVersions?: Record<string, string[]>;
}

export interface CountRatio {
  numerator: number;
  denominator: number;
  percentage: number | null;
}

export interface OutcomeCounts {
  sampleSize: number;
  wins: CountRatio;
  losses: CountRatio;
}

export interface SelectionGroupObservation {
  group: RecommendationSelectionGroup;
  selections: CountRatio;
  outcomes: OutcomeCounts;
}

export interface SelectionDistribution {
  sampleSize: number;
  groups: SelectionGroupObservation[];
}

export interface RankDistribution {
  sampleSize: number;
  unavailableCount: number;
  mean: number | null;
  median: number | null;
  ranks: Array<{ rank: number; selections: CountRatio; outcomes: OutcomeCounts }>;
}

export interface NumericBandObservation {
  id: string;
  label: string;
  minimum: number;
  maximum: number;
  includeMaximum: boolean;
  sampleSize: number;
  outcomes: OutcomeCounts;
}

export interface NumericBandDistribution {
  dimension: "SCORE" | "COVERAGE" | "EXECUTION_RISK";
  unit: "POINTS" | "RATIO";
  bandsVersion: string;
  availableSampleSize: number;
  unavailableCount: number;
  observations: NumericBandObservation[];
  limitation: string;
}

export interface DimensionBreakdownObservation {
  value: string;
  sampleSize: number;
  selections: CountRatio;
  outcomes: OutcomeCounts;
  positionDivergences?: CountRatio;
}

export interface AlgorithmMetricAvailability {
  metric: "SNAPSHOT" | "SCORE" | "COVERAGE" | "EXECUTION_RISK" | "POSITION" | "POSTGAME_REPORT";
  available: CountRatio;
}

export interface AlgorithmVersionObservation {
  dimension: string;
  version: string;
  sampleSize: number;
  observations: CountRatio;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  patches: string[];
  roles: Role[];
  selectionGroups: RecommendationSelectionGroup[];
  poolSources: string[];
  meanOriginalCoverage: number | null;
  originalCoverageRange: { minimum: number; maximum: number } | null;
  metricAvailability: AlgorithmMetricAvailability[];
}

export interface AlgorithmVersionComparisonAvailability {
  dimension: string;
  status: AvailabilityStatus;
  versions: string[];
  displaySampleThreshold: number;
  reasons: string[];
  limitation: string;
}

export interface PostgameSignalFrequency {
  key: DraftPostGameSignalKey;
  comparable: CountRatio;
  unavailable: CountRatio;
}

export interface LongitudinalUnavailableDimension {
  dimension: string;
  unavailable: CountRatio;
  reasons: string[];
}

export interface LongitudinalRecommendationReport {
  status: AvailabilityStatus;
  filters: LongitudinalReportFilters;
  sampleSize: number;
  linkedSessionCount: number;
  availableComparisonCount: number;
  selectionDistribution: SelectionDistribution;
  rankDistribution: RankDistribution;
  outcomeDistribution: OutcomeCounts;
  positionDivergence: {
    comparableSampleSize: number;
    unavailableCount: number;
    divergences: CountRatio;
  };
  scoreBands: NumericBandDistribution;
  coverageBands: NumericBandDistribution;
  executionRiskBands: NumericBandDistribution;
  roleBreakdown: DimensionBreakdownObservation[];
  patchBreakdown: DimensionBreakdownObservation[];
  queueBreakdown: DimensionBreakdownObservation[];
  championBreakdown: DimensionBreakdownObservation[];
  algorithmVersionBreakdown: AlgorithmVersionObservation[];
  algorithmVersionComparisons: AlgorithmVersionComparisonAvailability[];
  postgameSignalFrequencies: PostgameSignalFrequency[];
  unavailableSignalCount: number;
  unavailableDimensions: LongitudinalUnavailableDimension[];
  mixedAlgorithmVersions: boolean;
  displaySampleThreshold: number;
  generatedAt: string;
  algorithmVersion: string;
  provenance: DataProvenance;
  limitation: string;
}

export interface BuildLongitudinalRecommendationReportInput {
  observations: RecommendationObservation[];
  filters: LongitudinalReportFilters;
  generatedAt: string;
  displaySampleThreshold?: number;
}

const GROUPS: RecommendationSelectionGroup[] = ["PRIMARY", "ALTERNATIVE", "NOT_IN_SNAPSHOT"];
const EXPECTED_ALGORITHM_DIMENSIONS: ObservableAlgorithmDimension[] = [
  "recommendationEngine",
  "draftStrategy",
  "executionRisk",
  "postgameComparison"
];
const SIGNAL_KEYS: DraftPostGameSignalKey[] = [
  "POSITION_ALIGNMENT",
  "CHAMPION_ALIGNMENT",
  "EXECUTION_RISK_AND_EARLY_DEATHS",
  "PERSONAL_MATCHUP_AND_RESULT",
  "OBJECTIVE_PARTICIPATION",
  "FINAL_INVENTORY_HISTORY",
  "RUNE_PAGE_HISTORY",
  "SUMMONER_SPELL_HISTORY",
  "PATCH_CONTEXT",
  "GLOBAL_MATCHUP",
  "GLOBAL_PATCH_IMPACT"
];
const LIMITATION =
  "Resultados observados descrevem o histórico disponível e não demonstram que a recomendação causou vitória ou derrota.";
const BAND_LIMITATION =
  "As faixas são agrupamentos determinísticos de leitura, não classes calibradas, probabilidades ou thresholds do motor.";

function uniqueSorted<T extends string | number>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) =>
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), "en")
  );
}

function countRatio(numerator: number, denominator: number): CountRatio {
  return {
    numerator,
    denominator,
    percentage: denominator === 0 ? null : Math.round((numerator / denominator) * 1000) / 10
  };
}

function outcomes(observations: RecommendationObservation[]): OutcomeCounts {
  const wins = observations.filter((observation) => observation.matchWon).length;
  return {
    sampleSize: observations.length,
    wins: countRatio(wins, observations.length),
    losses: countRatio(observations.length - wins, observations.length)
  };
}

function normalizeFilters(filters: LongitudinalReportFilters): LongitudinalReportFilters {
  return {
    playerId: filters.playerId,
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.patches?.length ? { patches: uniqueSorted(filters.patches) } : {}),
    ...(filters.queueIds?.length ? { queueIds: uniqueSorted(filters.queueIds) } : {}),
    ...(filters.roles?.length ? { roles: uniqueSorted(filters.roles) as Role[] } : {}),
    ...(filters.championIds?.length ? { championIds: uniqueSorted(filters.championIds) } : {}),
    ...(filters.selectionGroups?.length
      ? { selectionGroups: uniqueSorted(filters.selectionGroups) as RecommendationSelectionGroup[] }
      : {}),
    ...(filters.algorithmVersions
      ? {
          algorithmVersions: Object.fromEntries(
            Object.entries(filters.algorithmVersions)
              .filter(([, versions]) => versions.length > 0)
              .sort(([left], [right]) => left.localeCompare(right, "en"))
              .map(([dimension, versions]) => [dimension, uniqueSorted(versions)])
          )
        }
      : {})
  };
}

export function filterRecommendationObservations(
  observations: RecommendationObservation[],
  rawFilters: LongitudinalReportFilters
): RecommendationObservation[] {
  const filters = normalizeFilters(rawFilters);
  return observations
    .filter((observation) => {
      if (filters.from && (!observation.playedAt || observation.playedAt < filters.from))
        return false;
      if (filters.to && (!observation.playedAt || observation.playedAt > filters.to)) return false;
      if (filters.patches && (!observation.patch || !filters.patches.includes(observation.patch))) {
        return false;
      }
      if (
        filters.queueIds &&
        (observation.queueId === null || !filters.queueIds.includes(observation.queueId))
      ) {
        return false;
      }
      if (filters.roles && !filters.roles.includes(observation.role)) return false;
      if (filters.championIds && !filters.championIds.includes(observation.championId))
        return false;
      if (
        filters.selectionGroups &&
        !filters.selectionGroups.includes(observation.selectionGroup)
      ) {
        return false;
      }
      if (
        filters.algorithmVersions &&
        Object.entries(filters.algorithmVersions).some(
          ([dimension, versions]) =>
            !observation.algorithmVersions[dimension] ||
            !versions.includes(observation.algorithmVersions[dimension])
        )
      ) {
        return false;
      }
      return true;
    })
    .sort(
      (left, right) =>
        (left.playedAt ?? "").localeCompare(right.playedAt ?? "", "en") ||
        left.draftSessionId.localeCompare(right.draftSessionId, "en")
    );
}

function selectionDistribution(observations: RecommendationObservation[]): SelectionDistribution {
  return {
    sampleSize: observations.length,
    groups: GROUPS.map((group) => {
      const selected = observations.filter((observation) => observation.selectionGroup === group);
      return {
        group,
        selections: countRatio(selected.length, observations.length),
        outcomes: outcomes(selected)
      };
    })
  };
}

function rankDistribution(observations: RecommendationObservation[]): RankDistribution {
  const available = observations.filter(
    (observation): observation is RecommendationObservation & { originalRank: number } =>
      observation.originalRank !== null
  );
  const ranks = available.map((observation) => observation.originalRank).sort((a, b) => a - b);
  const middle = Math.floor(ranks.length / 2);
  const median =
    ranks.length === 0
      ? null
      : ranks.length % 2 === 0
        ? (ranks[middle - 1] + ranks[middle]) / 2
        : ranks[middle];
  return {
    sampleSize: available.length,
    unavailableCount: observations.length - available.length,
    mean:
      ranks.length === 0
        ? null
        : Math.round((ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length) * 100) / 100,
    median,
    ranks: uniqueSorted(ranks).map((rank) => {
      const atRank = available.filter((observation) => observation.originalRank === rank);
      return {
        rank,
        selections: countRatio(atRank.length, available.length),
        outcomes: outcomes(atRank)
      };
    })
  };
}

interface BandDefinition {
  id: string;
  label: string;
  minimum: number;
  maximum: number;
  includeMaximum: boolean;
}

function tenPointBands(unit: "POINTS" | "RATIO"): BandDefinition[] {
  return Array.from({ length: 10 }, (_, index) => {
    const minimum = unit === "POINTS" ? index * 10 : index / 10;
    const maximum = unit === "POINTS" ? (index + 1) * 10 : (index + 1) / 10;
    const displayMinimum = unit === "POINTS" ? minimum : minimum * 100;
    const displayMaximum = unit === "POINTS" ? maximum : maximum * 100;
    return {
      id: `${unit.toLowerCase()}:${index}`,
      label:
        index === 9
          ? `${displayMinimum} a ${displayMaximum}`
          : `${displayMinimum} a ${displayMaximum - (unit === "POINTS" ? 0.1 : 0.1)}`,
      minimum,
      maximum,
      includeMaximum: index === 9
    };
  });
}

function numericBands(
  observations: RecommendationObservation[],
  dimension: NumericBandDistribution["dimension"],
  selector: (observation: RecommendationObservation) => number | null,
  unit: NumericBandDistribution["unit"]
): NumericBandDistribution {
  const definitions = tenPointBands(unit);
  const validMaximum = unit === "POINTS" ? 100 : 1;
  const available = observations.filter((observation) => {
    const value = selector(observation);
    return value !== null && Number.isFinite(value) && value >= 0 && value <= validMaximum;
  });
  return {
    dimension,
    unit,
    bandsVersion: RECOMMENDATION_OBSERVABILITY_BANDS_VERSION,
    availableSampleSize: available.length,
    unavailableCount: observations.length - available.length,
    observations: definitions.map((definition) => {
      const inBand = available.filter((observation) => {
        const value = selector(observation) as number;
        return (
          value >= definition.minimum &&
          (value < definition.maximum ||
            (definition.includeMaximum && value === definition.maximum))
        );
      });
      return {
        ...definition,
        sampleSize: inBand.length,
        outcomes: outcomes(inBand)
      };
    }),
    limitation: BAND_LIMITATION
  };
}

function breakdown(
  observations: RecommendationObservation[],
  selector: (observation: RecommendationObservation) => string | null
): DimensionBreakdownObservation[] {
  const values = uniqueSorted(
    observations.map(selector).filter((value): value is string => value !== null)
  );
  return values.map((value) => {
    const selected = observations.filter((observation) => selector(observation) === value);
    const positionComparable = selected.filter(
      (observation) => observation.positionMatched !== null
    );
    const divergences = positionComparable.filter(
      (observation) => observation.positionMatched === false
    ).length;
    return {
      value,
      sampleSize: selected.length,
      selections: countRatio(selected.length, observations.length),
      outcomes: outcomes(selected),
      ...(positionComparable.length > 0
        ? { positionDivergences: countRatio(divergences, positionComparable.length) }
        : {})
    };
  });
}

function metricAvailability(
  observations: RecommendationObservation[]
): AlgorithmMetricAvailability[] {
  const checks: Array<
    [AlgorithmMetricAvailability["metric"], (value: RecommendationObservation) => boolean]
  > = [
    ["SNAPSHOT", (value) => value.snapshotId !== null],
    ["SCORE", (value) => value.originalScore !== null],
    ["COVERAGE", (value) => value.originalCoverage !== null],
    ["EXECUTION_RISK", (value) => value.originalExecutionRisk !== null],
    ["POSITION", (value) => value.positionMatched !== null],
    ["POSTGAME_REPORT", (value) => value.postgameComparisonStatus !== "UNAVAILABLE"]
  ];
  return checks.map(([metric, check]) => ({
    metric,
    available: countRatio(observations.filter(check).length, observations.length)
  }));
}

function versionBreakdown(
  observations: RecommendationObservation[]
): AlgorithmVersionObservation[] {
  const dimensions = uniqueSorted([
    ...EXPECTED_ALGORITHM_DIMENSIONS,
    ...observations.flatMap((observation) => Object.keys(observation.algorithmVersions))
  ]);
  return dimensions.flatMap((dimension) => {
    const versions = uniqueSorted(
      observations
        .map((observation) => observation.algorithmVersions[dimension])
        .filter((version): version is string => !!version)
    );
    return versions.map((version) => {
      const selected = observations.filter(
        (observation) => observation.algorithmVersions[dimension] === version
      );
      const coverages = selected
        .map((observation) => observation.originalCoverage)
        .filter((coverage): coverage is number => coverage !== null)
        .sort((left, right) => left - right);
      return {
        dimension,
        version,
        sampleSize: selected.length,
        observations: countRatio(selected.length, observations.length),
        firstSeenAt:
          selected.map((entry) => entry.playedAt).find((value): value is string => !!value) ?? null,
        lastSeenAt:
          [...selected]
            .reverse()
            .map((entry) => entry.playedAt)
            .find((value): value is string => !!value) ?? null,
        patches: uniqueSorted(
          selected
            .map((observation) => observation.patch)
            .filter((value): value is string => !!value)
        ),
        roles: uniqueSorted(selected.map((observation) => observation.role)) as Role[],
        selectionGroups: uniqueSorted(
          selected.map((observation) => observation.selectionGroup)
        ) as RecommendationSelectionGroup[],
        poolSources: uniqueSorted(
          selected
            .map((observation) => observation.poolSource)
            .filter((value): value is string => !!value)
        ),
        meanOriginalCoverage:
          coverages.length === 0
            ? null
            : Math.round(
                (coverages.reduce((sum, coverage) => sum + coverage, 0) / coverages.length) * 1000
              ) / 1000,
        originalCoverageRange:
          coverages.length === 0
            ? null
            : { minimum: coverages[0], maximum: coverages[coverages.length - 1] },
        metricAvailability: metricAvailability(selected)
      };
    });
  });
}

function intersection<T>(sets: Set<T>[]): Set<T> {
  if (sets.length === 0) return new Set();
  return new Set([...sets[0]].filter((value) => sets.every((set) => set.has(value))));
}

function versionComparisons(
  observations: RecommendationObservation[],
  breakdowns: AlgorithmVersionObservation[],
  displaySampleThreshold: number
): AlgorithmVersionComparisonAvailability[] {
  const dimensions = uniqueSorted(breakdowns.map((entry) => entry.dimension));
  return dimensions.map((dimension) => {
    const versions = breakdowns.filter((entry) => entry.dimension === dimension);
    const reasons: string[] = [];
    if (versions.length < 2)
      reasons.push("Apenas uma versão está representada nos filtros atuais.");
    if (versions.some((entry) => entry.sampleSize < displaySampleThreshold)) {
      reasons.push(
        `Ao menos uma versão tem menos de ${displaySampleThreshold} observações; este é apenas um limite de exibição.`
      );
    }
    const sizes = versions.map((entry) => entry.sampleSize).filter((size) => size > 0);
    if (sizes.length > 1 && Math.max(...sizes) / Math.min(...sizes) > 4) {
      reasons.push("Os tamanhos das amostras por versão são muito diferentes.");
    }
    if (
      versions.length > 1 &&
      intersection(versions.map((entry) => new Set(entry.patches))).size === 0
    ) {
      reasons.push("As versões não possuem patch em comum.");
    }
    if (
      versions.length > 1 &&
      intersection(versions.map((entry) => new Set(entry.roles))).size === 0
    ) {
      reasons.push("As versões não possuem posição em comum.");
    }
    if (
      versions.length > 1 &&
      intersection(versions.map((entry) => new Set(entry.selectionGroups))).size === 0
    ) {
      reasons.push("As versões não possuem grupo de escolha em comum.");
    }
    if (versions.length > 1 && versions.some((entry) => entry.poolSources.length === 0)) {
      reasons.push("A origem do pool não está disponível em todas as versões.");
    } else if (
      versions.length > 1 &&
      intersection(versions.map((entry) => new Set(entry.poolSources))).size === 0
    ) {
      reasons.push("As versões foram observadas em origens de pool diferentes.");
    }
    const coverageRates = versions.map(
      (entry) =>
        entry.metricAvailability.find((metric) => metric.metric === "COVERAGE")?.available
          .percentage
    );
    if (
      coverageRates.length > 1 &&
      coverageRates.some((rate) => rate === null) !== coverageRates.every((rate) => rate === null)
    ) {
      reasons.push("A disponibilidade de cobertura mudou entre as versões.");
    }
    const numericCoverageRates = coverageRates.filter((rate): rate is number => rate !== null);
    if (
      numericCoverageRates.length > 1 &&
      Math.max(...numericCoverageRates) - Math.min(...numericCoverageRates) > 25
    ) {
      reasons.push("A proporção de observações com cobertura mudou entre as versões.");
    }
    const coverageRanges = versions
      .map((entry) => entry.originalCoverageRange)
      .filter(
        (range): range is NonNullable<AlgorithmVersionObservation["originalCoverageRange"]> =>
          range !== null
      );
    if (
      coverageRanges.length === versions.length &&
      coverageRanges.length > 1 &&
      Math.max(...coverageRanges.map((range) => range.minimum)) >
        Math.min(...coverageRanges.map((range) => range.maximum))
    ) {
      reasons.push("As faixas de cobertura histórica das versões não se sobrepõem.");
    }
    return {
      dimension,
      status: reasons.length === 0 ? "AVAILABLE" : "UNAVAILABLE",
      versions: versions.map((entry) => entry.version),
      displaySampleThreshold,
      reasons,
      limitation:
        reasons.length === 0
          ? "Os contextos possuem sobreposição para leitura descritiva; isso não atribui diferenças à qualidade do algoritmo."
          : "Os contextos não sustentam comparação direta entre versões."
    };
  });
}

function signalFrequencies(
  observations: RecommendationObservation[],
  availableComparisonCount: number
): PostgameSignalFrequency[] {
  return SIGNAL_KEYS.map((key) => ({
    key,
    comparable: countRatio(
      observations.filter((observation) => observation.comparableSignalKeys.includes(key)).length,
      availableComparisonCount
    ),
    unavailable: countRatio(
      observations.filter((observation) => observation.unavailableSignalKeys.includes(key)).length,
      availableComparisonCount
    )
  })).filter((entry) => entry.comparable.numerator > 0 || entry.unavailable.numerator > 0);
}

function unavailableDimensions(
  observations: RecommendationObservation[]
): LongitudinalUnavailableDimension[] {
  const dimensions: Array<{
    dimension: string;
    missing: (observation: RecommendationObservation) => boolean;
    reason: string;
  }> = [
    {
      dimension: "SNAPSHOT",
      missing: (value) => value.snapshotId === null,
      reason: "A sessão vinculada não possui snapshot vigente no lock-in."
    },
    {
      dimension: "RANK",
      missing: (value) => value.originalRank === null,
      reason: "A escolha não estava no snapshot ou o snapshot não existe."
    },
    {
      dimension: "SCORE",
      missing: (value) => value.originalScore === null,
      reason: "Nenhum score histórico foi registrado para esta escolha."
    },
    {
      dimension: "COVERAGE",
      missing: (value) => value.originalCoverage === null,
      reason: "Nenhuma cobertura histórica foi registrada para esta escolha."
    },
    {
      dimension: "EXECUTION_RISK",
      missing: (value) => value.originalExecutionRisk === null,
      reason: "A versão histórica não registrou risco de execução para esta escolha."
    },
    {
      dimension: "OBSERVED_POSITION",
      missing: (value) => value.positionMatched === null,
      reason: "A posição observada não está disponível."
    },
    {
      dimension: "PATCH",
      missing: (value) => value.patch === null,
      reason: "O patch da partida não foi resolvido."
    },
    {
      dimension: "PLAYED_AT",
      missing: (value) => value.playedAt === null,
      reason: "A data da partida não foi observada no Match-V5 persistido."
    },
    {
      dimension: "QUEUE",
      missing: (value) => value.queueId === null,
      reason: "A fila da partida não foi resolvida."
    },
    {
      dimension: "POSTGAME_COMPARISON",
      missing: (value) => value.postgameComparisonStatus === "UNAVAILABLE",
      reason: "O relatório comparativo pós-game ainda não está disponível."
    }
  ];
  return dimensions
    .map(({ dimension, missing, reason }) => {
      const count = observations.filter(missing).length;
      return {
        dimension,
        unavailable: countRatio(count, observations.length),
        reasons: count > 0 ? [reason] : []
      };
    })
    .filter((entry) => entry.unavailable.numerator > 0);
}

export function buildLongitudinalRecommendationReport(
  input: BuildLongitudinalRecommendationReportInput
): LongitudinalRecommendationReport {
  const filters = normalizeFilters(input.filters);
  const observations = filterRecommendationObservations(input.observations, filters);
  const displaySampleThreshold =
    input.displaySampleThreshold ?? DEFAULT_VERSION_DISPLAY_SAMPLE_THRESHOLD;
  const comparisonObservations = observations.filter(
    (observation) => observation.postgameComparisonStatus !== "UNAVAILABLE"
  );
  const versions = versionBreakdown(observations);
  const unavailable = unavailableDimensions(observations);
  const positionComparable = observations.filter(
    (observation) => observation.positionMatched !== null
  );
  const positionDivergences = positionComparable.filter(
    (observation) => observation.positionMatched === false
  ).length;
  const unavailableSignalCount = comparisonObservations.reduce(
    (total, observation) => total + observation.unavailableSignalKeys.length,
    0
  );
  const versionCountsByDimension = new Map<string, Set<string>>();
  for (const entry of versions) {
    const set = versionCountsByDimension.get(entry.dimension) ?? new Set<string>();
    set.add(entry.version);
    versionCountsByDimension.set(entry.dimension, set);
  }

  return {
    status:
      observations.length === 0
        ? "UNAVAILABLE"
        : unavailable.length > 0 || unavailableSignalCount > 0
          ? "PARTIAL"
          : "AVAILABLE",
    filters,
    sampleSize: observations.length,
    linkedSessionCount: observations.length,
    availableComparisonCount: comparisonObservations.length,
    selectionDistribution: selectionDistribution(observations),
    rankDistribution: rankDistribution(observations),
    outcomeDistribution: outcomes(observations),
    positionDivergence: {
      comparableSampleSize: positionComparable.length,
      unavailableCount: observations.length - positionComparable.length,
      divergences: countRatio(positionDivergences, positionComparable.length)
    },
    scoreBands: numericBands(observations, "SCORE", (value) => value.originalScore, "POINTS"),
    coverageBands: numericBands(
      observations,
      "COVERAGE",
      (value) => value.originalCoverage,
      "RATIO"
    ),
    executionRiskBands: numericBands(
      observations,
      "EXECUTION_RISK",
      (value) => value.originalExecutionRisk,
      "POINTS"
    ),
    roleBreakdown: breakdown(observations, (value) => value.role),
    patchBreakdown: breakdown(observations, (value) => value.patch),
    queueBreakdown: breakdown(observations, (value) =>
      value.queueId === null ? null : String(value.queueId)
    ),
    championBreakdown: breakdown(observations, (value) => String(value.championId)),
    algorithmVersionBreakdown: versions,
    algorithmVersionComparisons: versionComparisons(observations, versions, displaySampleThreshold),
    postgameSignalFrequencies: signalFrequencies(observations, comparisonObservations.length),
    unavailableSignalCount,
    unavailableDimensions: unavailable,
    mixedAlgorithmVersions: [...versionCountsByDimension.values()].some((set) => set.size > 1),
    displaySampleThreshold,
    generatedAt: input.generatedAt,
    algorithmVersion: RECOMMENDATION_OBSERVABILITY_VERSION,
    provenance: {
      sourceType: "CALCULATED",
      sourceId: "sparta",
      resource: "DraftSession+RecommendationSnapshot+Match+DraftPostGameComparisonRevision",
      sampleSize: observations.length,
      collectedAt: input.generatedAt,
      algorithmVersion: RECOMMENDATION_OBSERVABILITY_VERSION,
      status:
        observations.length === 0
          ? "UNAVAILABLE"
          : unavailable.length > 0 || unavailableSignalCount > 0
            ? "PARTIAL"
            : "AVAILABLE"
    },
    limitation: LIMITATION
  };
}
