import type { CacheMetadata } from "../types/cache.js";
import type { Role } from "../types/domain.js";
import type { AvailabilityStatus } from "../types/provenance.js";

export const GLOBAL_STATISTICS_CONTRACT_VERSION = "global-statistics-contract/1.0.0";

export type GlobalMetricKey =
  | "GLOBAL_GAMES"
  | "GLOBAL_WIN_RATE"
  | "GLOBAL_PICK_RATE"
  | "GLOBAL_BAN_RATE"
  | "GLOBAL_GOLD_DIFFERENCE_AT_15"
  | "GLOBAL_ROLE_SHARE"
  | "GLOBAL_STABLE_PERIODS";

/**
 * População exata pedida ao fornecedor. Região e elo são nulos quando a
 * consulta deliberadamente não os segmenta; nunca somem nem recebem um
 * rótulo inferido.
 */
export interface GlobalStatisticFilters {
  patch: string;
  role: Role;
  queueId: number;
  region: string | null;
  tier: string | null;
}

/**
 * Contexto interpretável de uma estatística global. `collectedAt: null` só é
 * válido quando a amostra está indisponível (`sampleSize: 0`).
 */
export interface GlobalStatisticContext extends GlobalStatisticFilters {
  sampleSize: number;
  collectedAt: string | null;
  freshUntil: string | null;
  staleUntil: string | null;
  provider: string;
  providerDataset: string | null;
  adapterVersion: string;
}

/**
 * A cópia em cache é transporte, não fonte. `provider` e `providerDataset`
 * continuam identificando a fonte epistemológica original.
 */
export interface GlobalStatisticProvenance {
  provider: string;
  providerDataset: string | null;
  adapterVersion: string;
  filtersApplied: GlobalStatisticFilters;
  cache?: CacheMetadata;
}

interface GlobalMetricBase<T> {
  key: GlobalMetricKey;
  value: T | null;
  context: GlobalStatisticContext;
  provenance: GlobalStatisticProvenance;
}

export type GlobalStructuredMetric<T> =
  | (GlobalMetricBase<T> & {
      status: Extract<AvailabilityStatus, "AVAILABLE" | "PARTIAL">;
      value: T;
      limitation?: string;
    })
  | (GlobalMetricBase<T> & {
      status: "STALE";
      staleReason: string;
    })
  | (GlobalMetricBase<T> & {
      status: "UNAVAILABLE";
      value: null;
      unavailableReason: string;
    });

export interface GlobalChampionRoleQuery extends GlobalStatisticFilters {
  championId: number;
}

export interface GlobalMatchupQuery extends GlobalChampionRoleQuery {
  opponentChampionId: number;
}

export type GlobalDatasetStatusQuery = GlobalStatisticFilters;

export interface GlobalChampionRoleStatistics {
  contractVersion: typeof GLOBAL_STATISTICS_CONTRACT_VERSION;
  status: AvailabilityStatus;
  championId: number;
  role: Role;
  winRate: GlobalStructuredMetric<number>;
  pickRate: GlobalStructuredMetric<number>;
  banRate: GlobalStructuredMetric<number>;
  context: GlobalStatisticContext;
  limitations: string[];
}

export interface GlobalMatchupStatistics {
  contractVersion: typeof GLOBAL_STATISTICS_CONTRACT_VERSION;
  status: AvailabilityStatus;
  championId: number;
  opponentChampionId: number;
  role: Role;
  games: GlobalStructuredMetric<number>;
  winRate: GlobalStructuredMetric<number>;
  goldDifferenceAt15: GlobalStructuredMetric<number>;
  context: GlobalStatisticContext;
  limitations: string[];
}

export interface GlobalItemSet {
  signature: string;
  itemIds: number[];
  games: GlobalStructuredMetric<number>;
  winRate: GlobalStructuredMetric<number>;
  context: GlobalStatisticContext;
}

export interface GlobalRunePage {
  signature: string;
  primaryStyleId: number;
  subStyleId: number;
  perkIds: number[];
  statPerkIds: number[];
  games: GlobalStructuredMetric<number>;
  winRate: GlobalStructuredMetric<number>;
  context: GlobalStatisticContext;
}

export interface GlobalSpellSet {
  signature: string;
  spellIds: [number, number];
  games: GlobalStructuredMetric<number>;
  winRate: GlobalStructuredMetric<number>;
  context: GlobalStatisticContext;
}

export interface GlobalBuildPartAvailability {
  status: AvailabilityStatus;
  sampleSize: number;
  unavailableReason?: string;
}

export interface GlobalBuildStatistics {
  contractVersion: typeof GLOBAL_STATISTICS_CONTRACT_VERSION;
  status: AvailabilityStatus;
  championId: number;
  role: Role;
  itemSets: GlobalItemSet[];
  runePages: GlobalRunePage[];
  summonerSpellSets: GlobalSpellSet[];
  parts: {
    itemSets: GlobalBuildPartAvailability;
    runePages: GlobalBuildPartAvailability;
    summonerSpellSets: GlobalBuildPartAvailability;
  };
  context: GlobalStatisticContext;
  limitations: string[];
}

/**
 * Os limiares são deliberadamente nulos nesta etapa. A política futura pode
 * combiná-los, mas nenhum deles é escolhido sem amostra real e aprovação.
 */
export interface GlobalRoleEligibilityPolicy {
  status: "NOT_CONFIGURED" | "CONFIGURED";
  minimumSampleSize: number | null;
  minimumRoleShare: number | null;
  minimumStablePeriods: number | null;
}

export interface GlobalRoleEligibility {
  contractVersion: typeof GLOBAL_STATISTICS_CONTRACT_VERSION;
  status: AvailabilityStatus;
  championId: number;
  role: Role;
  eligible: boolean | null;
  observedGames: GlobalStructuredMetric<number>;
  roleShare: GlobalStructuredMetric<number>;
  stablePeriods: GlobalStructuredMetric<number>;
  policy: GlobalRoleEligibilityPolicy;
  context: GlobalStatisticContext;
  limitations: string[];
}

export interface GlobalDatasetStatus {
  contractVersion: typeof GLOBAL_STATISTICS_CONTRACT_VERSION;
  status: AvailabilityStatus;
  provider: string;
  providerDataset: string | null;
  requestedContext: GlobalStatisticFilters;
  sampleSize: number;
  collectedAt: string | null;
  freshUntil: string | null;
  staleUntil: string | null;
  latestPatch: string | null;
  adapterVersion: string;
  unavailableReason?: string;
}

export function withGlobalMetricCache<T>(
  metric: GlobalStructuredMetric<T>,
  cache: CacheMetadata
): GlobalStructuredMetric<T> {
  return {
    ...metric,
    provenance: {
      ...metric.provenance,
      cache: { ...cache }
    }
  };
}
