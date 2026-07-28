import { describe, expect, it, vi } from "vitest";
import type { MatchupData } from "../types/domain.js";
import {
  GLOBAL_STATISTICS_CONTRACT_VERSION,
  withGlobalMetricCache,
  type GlobalChampionRoleQuery
} from "./global-statistics.js";
import {
  GLOBAL_STATISTICS_UNAVAILABLE_REASON,
  UnavailableGlobalStatisticsProvider,
  defaultGlobalStatisticsProvider
} from "./global-statistics-provider.js";

const query: GlobalChampionRoleQuery = {
  championId: 61,
  patch: "16.14",
  role: "MID",
  queueId: 420,
  region: null,
  tier: null
};

describe("UnavailableGlobalStatisticsProvider", () => {
  it("mantém todos os recursos estruturadamente indisponíveis sem zero ou 50", async () => {
    const provider = new UnavailableGlobalStatisticsProvider();
    const [champion, matchup, builds, eligibility, dataset] = await Promise.all([
      provider.getChampionRoleStatistics(query),
      provider.getMatchupStatistics({ ...query, opponentChampionId: 103 }),
      provider.getBuildStatistics(query),
      provider.getRoleEligibility(query),
      provider.getDatasetStatus(query)
    ]);

    expect(champion).toMatchObject({
      contractVersion: GLOBAL_STATISTICS_CONTRACT_VERSION,
      status: "UNAVAILABLE",
      championId: 61,
      role: "MID",
      context: {
        patch: "16.14",
        role: "MID",
        queueId: 420,
        region: null,
        tier: null,
        sampleSize: 0,
        collectedAt: null,
        providerDataset: null
      }
    });
    expect([champion.winRate.value, champion.pickRate.value, champion.banRate.value]).toEqual([
      null,
      null,
      null
    ]);
    expect([matchup.games.value, matchup.winRate.value, matchup.goldDifferenceAt15.value]).toEqual([
      null,
      null,
      null
    ]);
    expect(builds).toMatchObject({
      status: "UNAVAILABLE",
      itemSets: [],
      runePages: [],
      summonerSpellSets: [],
      parts: {
        itemSets: { status: "UNAVAILABLE", sampleSize: 0 },
        runePages: { status: "UNAVAILABLE", sampleSize: 0 },
        summonerSpellSets: { status: "UNAVAILABLE", sampleSize: 0 }
      }
    });
    expect(eligibility).toMatchObject({
      status: "UNAVAILABLE",
      eligible: null,
      policy: {
        status: "NOT_CONFIGURED",
        minimumSampleSize: null,
        minimumRoleShare: null,
        minimumStablePeriods: null
      }
    });
    expect(dataset).toMatchObject({
      status: "UNAVAILABLE",
      sampleSize: 0,
      collectedAt: null,
      latestPatch: null,
      unavailableReason: GLOBAL_STATISTICS_UNAVAILABLE_REASON
    });
  });

  it("não realiza chamadas externas nem lê credenciais", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const originalKeys = Object.keys(process.env);

    await defaultGlobalStatisticsProvider.getChampionRoleStatistics(query);
    await defaultGlobalStatisticsProvider.getMatchupStatistics({
      ...query,
      opponentChampionId: 103
    });
    await defaultGlobalStatisticsProvider.getBuildStatistics(query);
    await defaultGlobalStatisticsProvider.getRoleEligibility(query);
    await defaultGlobalStatisticsProvider.getDatasetStatus(query);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(Object.keys(process.env)).toEqual(originalKeys);
    fetchSpy.mockRestore();
  });

  it("preserva patch, posição, fila, região e elo sem combinar contextos", async () => {
    const provider = new UnavailableGlobalStatisticsProvider();
    const firstInput = { ...query };
    const first = await provider.getChampionRoleStatistics(firstInput);
    const second = await provider.getChampionRoleStatistics({
      ...query,
      patch: "16.13",
      role: "SUPPORT",
      region: "BR1",
      tier: "DIAMOND"
    });

    expect(firstInput).toEqual(query);
    expect(first.context).toMatchObject({
      patch: "16.14",
      role: "MID",
      region: null,
      tier: null
    });
    expect(second.context).toMatchObject({
      patch: "16.13",
      role: "SUPPORT",
      region: "BR1",
      tier: "DIAMOND"
    });
    expect(second.winRate.provenance.filtersApplied).toEqual({
      patch: "16.13",
      role: "SUPPORT",
      queueId: 420,
      region: "BR1",
      tier: "DIAMOND"
    });
  });

  it("não aceita matchup pessoal como evidência global", async () => {
    const personalMatchup: MatchupData = {
      championId: 61,
      enemyChampionId: 103,
      role: "MID",
      score: 80,
      sampleSize: 12,
      confidence: "high"
    };
    const provider = new UnavailableGlobalStatisticsProvider();

    const result = await provider.getMatchupStatistics({
      ...query,
      opponentChampionId: personalMatchup.enemyChampionId
    });

    expect(result.status).toBe("UNAVAILABLE");
    expect(result.winRate.value).toBeNull();
    expect(result.context.sampleSize).toBe(0);
    expect(result.context.provider).not.toBe("personal-matchup");
  });

  it("cache acrescenta transporte sem substituir fornecedor e dataset", async () => {
    const provider = new UnavailableGlobalStatisticsProvider();
    const result = await provider.getChampionRoleStatistics(query);
    const cached = withGlobalMetricCache(result.winRate, {
      state: "STALE",
      collectedAt: "2026-07-28T12:00:00.000Z",
      freshUntil: "2026-07-28T13:00:00.000Z",
      staleUntil: "2026-07-29T12:00:00.000Z",
      servedAsFallback: true,
      fallbackReason: "UPSTREAM_UNAVAILABLE"
    });

    expect(cached.provenance.provider).toBe(result.winRate.provenance.provider);
    expect(cached.provenance.providerDataset).toBe(result.winRate.provenance.providerDataset);
    expect(cached.provenance.cache).toMatchObject({
      state: "STALE",
      servedAsFallback: true
    });
  });

  it("é determinístico e recusa contexto global incompleto ou inválido", async () => {
    const provider = new UnavailableGlobalStatisticsProvider();

    await expect(provider.getChampionRoleStatistics(query)).resolves.toEqual(
      await provider.getChampionRoleStatistics(query)
    );
    await expect(provider.getChampionRoleStatistics({ ...query, patch: " " })).rejects.toThrow(
      "GLOBAL_STATISTICS_PATCH_REQUIRED"
    );
    await expect(provider.getChampionRoleStatistics({ ...query, queueId: 0 })).rejects.toThrow(
      "GLOBAL_STATISTICS_QUEUE_INVALID"
    );
    await expect(provider.getChampionRoleStatistics({ ...query, region: "" })).rejects.toThrow(
      "GLOBAL_STATISTICS_REGION_INVALID"
    );
    await expect(provider.getChampionRoleStatistics({ ...query, championId: -1 })).rejects.toThrow(
      "GLOBAL_STATISTICS_CHAMPION_ID_INVALID"
    );
  });
});
