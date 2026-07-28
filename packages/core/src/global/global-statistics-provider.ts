import {
  GLOBAL_STATISTICS_CONTRACT_VERSION,
  type GlobalBuildPartAvailability,
  type GlobalBuildStatistics,
  type GlobalChampionRoleQuery,
  type GlobalChampionRoleStatistics,
  type GlobalDatasetStatus,
  type GlobalDatasetStatusQuery,
  type GlobalMatchupQuery,
  type GlobalMatchupStatistics,
  type GlobalMetricKey,
  type GlobalRoleEligibility,
  type GlobalStatisticContext,
  type GlobalStatisticFilters,
  type GlobalStatisticProvenance,
  type GlobalStructuredMetric
} from "./global-statistics.js";

export const UNAVAILABLE_GLOBAL_STATISTICS_PROVIDER_ID = "sparta-unavailable";
export const UNAVAILABLE_GLOBAL_STATISTICS_ADAPTER_VERSION =
  "unavailable-global-statistics-provider/1.0.0";

export const GLOBAL_STATISTICS_UNAVAILABLE_REASON =
  "Nenhuma fonte global de estatísticas foi aprovada e configurada.";

export interface GlobalStatisticsProvider {
  readonly providerId: string;
  getChampionRoleStatistics(query: GlobalChampionRoleQuery): Promise<GlobalChampionRoleStatistics>;
  getMatchupStatistics(query: GlobalMatchupQuery): Promise<GlobalMatchupStatistics>;
  getBuildStatistics(query: GlobalChampionRoleQuery): Promise<GlobalBuildStatistics>;
  getRoleEligibility(query: GlobalChampionRoleQuery): Promise<GlobalRoleEligibility>;
  getDatasetStatus(query: GlobalDatasetStatusQuery): Promise<GlobalDatasetStatus>;
}

const ROLES = new Set(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);

function validateFilters(query: GlobalStatisticFilters): void {
  if (!query.patch.trim()) throw new Error("GLOBAL_STATISTICS_PATCH_REQUIRED");
  if (!ROLES.has(query.role)) throw new Error("GLOBAL_STATISTICS_ROLE_INVALID");
  if (!Number.isInteger(query.queueId) || query.queueId <= 0) {
    throw new Error("GLOBAL_STATISTICS_QUEUE_INVALID");
  }
  if (query.region !== null && !query.region.trim()) {
    throw new Error("GLOBAL_STATISTICS_REGION_INVALID");
  }
  if (query.tier !== null && !query.tier.trim()) {
    throw new Error("GLOBAL_STATISTICS_TIER_INVALID");
  }
}

function validateChampionId(championId: number, field: string): void {
  if (!Number.isInteger(championId) || championId <= 0) {
    throw new Error(`GLOBAL_STATISTICS_${field}_INVALID`);
  }
}

function filters(query: GlobalStatisticFilters): GlobalStatisticFilters {
  return {
    patch: query.patch,
    role: query.role,
    queueId: query.queueId,
    region: query.region,
    tier: query.tier
  };
}

function unavailableContext(query: GlobalStatisticFilters): GlobalStatisticContext {
  return {
    ...filters(query),
    sampleSize: 0,
    collectedAt: null,
    freshUntil: null,
    staleUntil: null,
    provider: UNAVAILABLE_GLOBAL_STATISTICS_PROVIDER_ID,
    providerDataset: null,
    adapterVersion: UNAVAILABLE_GLOBAL_STATISTICS_ADAPTER_VERSION
  };
}

function unavailableProvenance(context: GlobalStatisticContext): GlobalStatisticProvenance {
  return {
    provider: context.provider,
    providerDataset: context.providerDataset,
    adapterVersion: context.adapterVersion,
    filtersApplied: filters(context)
  };
}

function unavailableMetric(
  key: GlobalMetricKey,
  context: GlobalStatisticContext
): GlobalStructuredMetric<number> {
  return {
    key,
    value: null,
    status: "UNAVAILABLE",
    context,
    provenance: unavailableProvenance(context),
    unavailableReason: GLOBAL_STATISTICS_UNAVAILABLE_REASON
  };
}

function unavailablePart(): GlobalBuildPartAvailability {
  return {
    status: "UNAVAILABLE",
    sampleSize: 0,
    unavailableReason: GLOBAL_STATISTICS_UNAVAILABLE_REASON
  };
}

/**
 * Comportamento operacional padrão até uma fonte ser explicitamente
 * aprovada. Não lê ambiente, não usa cache e não realiza I/O.
 */
export class UnavailableGlobalStatisticsProvider implements GlobalStatisticsProvider {
  readonly providerId = UNAVAILABLE_GLOBAL_STATISTICS_PROVIDER_ID;

  async getChampionRoleStatistics(
    query: GlobalChampionRoleQuery
  ): Promise<GlobalChampionRoleStatistics> {
    validateFilters(query);
    validateChampionId(query.championId, "CHAMPION_ID");
    const context = unavailableContext(query);

    return {
      contractVersion: GLOBAL_STATISTICS_CONTRACT_VERSION,
      status: "UNAVAILABLE",
      championId: query.championId,
      role: query.role,
      winRate: unavailableMetric("GLOBAL_WIN_RATE", context),
      pickRate: unavailableMetric("GLOBAL_PICK_RATE", context),
      banRate: unavailableMetric("GLOBAL_BAN_RATE", context),
      context,
      limitations: [GLOBAL_STATISTICS_UNAVAILABLE_REASON]
    };
  }

  async getMatchupStatistics(query: GlobalMatchupQuery): Promise<GlobalMatchupStatistics> {
    validateFilters(query);
    validateChampionId(query.championId, "CHAMPION_ID");
    validateChampionId(query.opponentChampionId, "OPPONENT_CHAMPION_ID");
    const context = unavailableContext(query);

    return {
      contractVersion: GLOBAL_STATISTICS_CONTRACT_VERSION,
      status: "UNAVAILABLE",
      championId: query.championId,
      opponentChampionId: query.opponentChampionId,
      role: query.role,
      games: unavailableMetric("GLOBAL_GAMES", context),
      winRate: unavailableMetric("GLOBAL_WIN_RATE", context),
      goldDifferenceAt15: unavailableMetric("GLOBAL_GOLD_DIFFERENCE_AT_15", context),
      context,
      limitations: [GLOBAL_STATISTICS_UNAVAILABLE_REASON]
    };
  }

  async getBuildStatistics(query: GlobalChampionRoleQuery): Promise<GlobalBuildStatistics> {
    validateFilters(query);
    validateChampionId(query.championId, "CHAMPION_ID");
    const context = unavailableContext(query);

    return {
      contractVersion: GLOBAL_STATISTICS_CONTRACT_VERSION,
      status: "UNAVAILABLE",
      championId: query.championId,
      role: query.role,
      itemSets: [],
      runePages: [],
      summonerSpellSets: [],
      parts: {
        itemSets: unavailablePart(),
        runePages: unavailablePart(),
        summonerSpellSets: unavailablePart()
      },
      context,
      limitations: [GLOBAL_STATISTICS_UNAVAILABLE_REASON]
    };
  }

  async getRoleEligibility(query: GlobalChampionRoleQuery): Promise<GlobalRoleEligibility> {
    validateFilters(query);
    validateChampionId(query.championId, "CHAMPION_ID");
    const context = unavailableContext(query);

    return {
      contractVersion: GLOBAL_STATISTICS_CONTRACT_VERSION,
      status: "UNAVAILABLE",
      championId: query.championId,
      role: query.role,
      eligible: null,
      observedGames: unavailableMetric("GLOBAL_GAMES", context),
      roleShare: unavailableMetric("GLOBAL_ROLE_SHARE", context),
      stablePeriods: unavailableMetric("GLOBAL_STABLE_PERIODS", context),
      policy: {
        status: "NOT_CONFIGURED",
        minimumSampleSize: null,
        minimumRoleShare: null,
        minimumStablePeriods: null
      },
      context,
      limitations: [GLOBAL_STATISTICS_UNAVAILABLE_REASON]
    };
  }

  async getDatasetStatus(query: GlobalDatasetStatusQuery): Promise<GlobalDatasetStatus> {
    validateFilters(query);

    return {
      contractVersion: GLOBAL_STATISTICS_CONTRACT_VERSION,
      status: "UNAVAILABLE",
      provider: this.providerId,
      providerDataset: null,
      requestedContext: filters(query),
      sampleSize: 0,
      collectedAt: null,
      freshUntil: null,
      staleUntil: null,
      latestPatch: null,
      adapterVersion: UNAVAILABLE_GLOBAL_STATISTICS_ADAPTER_VERSION,
      unavailableReason: GLOBAL_STATISTICS_UNAVAILABLE_REASON
    };
  }
}

export const defaultGlobalStatisticsProvider: GlobalStatisticsProvider =
  new UnavailableGlobalStatisticsProvider();
