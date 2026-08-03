import { beforeEach, describe, expect, it, vi } from "vitest";

const { findActiveReleaseForAccountMock } = vi.hoisted(() => ({
  findActiveReleaseForAccountMock: vi.fn()
}));

vi.mock("./release-repository.js", () => ({
  findActiveReleaseForAccount: findActiveReleaseForAccountMock
}));

import { createHash } from "node:crypto";
import { BASELINE_POST_AGGREGATION_RULES, buildEffectiveConfiguration } from "@sparta/core";
import {
  invalidateActiveConfigurationCache,
  resetActiveConfigurationProviderForTests,
  resolveActiveConfiguration
} from "./active-configuration-provider.js";

const sha256 = (canonical: string) => createHash("sha256").update(canonical).digest("hex");

function configuration(version = "cand-v1") {
  return buildEffectiveConfiguration({
    version,
    metricWeights: {
      PERSONAL_PERFORMANCE: 0.4,
      RECENT_FORM: 0.1,
      PERSONAL_MATCHUP: 0.1,
      BLIND_SAFETY: 0.1,
      ALLY_SYNERGY: 0.1,
      ENEMY_COMPOSITION_ANSWER: 0.1,
      TEAM_COMPOSITION: 0.05,
      META_STRENGTH: 0.05
    },
    disabledMetrics: [],
    postAggregationRules: BASELINE_POST_AGGREGATION_RULES,
    source: { type: "RELEASE", releaseId: "release-1" },
    algorithmCompatibility: { recommendationEngine: "1.0.0" },
    computeHash: sha256
  });
}

function releaseRow(overrides: Partial<{ id: string; configuration: ReturnType<typeof configuration> }> = {}) {
  const config = overrides.configuration ?? configuration();
  return {
    id: overrides.id ?? "release-1",
    releaseVersion: "release-2026-08-03",
    candidateId: "candidate-lineage-1",
    configHash: config.configHash,
    artifact: { configuration: config }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetActiveConfigurationProviderForTests();
});

describe("resolveActiveConfiguration", () => {
  it("sem riotAccountId resolve pra baseline sem nenhuma consulta", async () => {
    const result = await resolveActiveConfiguration({});

    expect(result.source).toBe("BUILT_IN_BASELINE");
    expect(result.fallbackUsed).toBe(false);
    expect(findActiveReleaseForAccountMock).not.toHaveBeenCalled();
  });

  it("sem release ativa resolve pra baseline (configuration ausente de propósito)", async () => {
    findActiveReleaseForAccountMock.mockResolvedValue(null);

    const result = await resolveActiveConfiguration({ riotAccountId: "account-1" });

    expect(result.source).toBe("BUILT_IN_BASELINE");
    expect(result.configuration).toBeUndefined();
    expect(result.fallbackUsed).toBe(false);
  });

  it("com release ativa e hash íntegro, devolve a configuração da release", async () => {
    findActiveReleaseForAccountMock.mockResolvedValue(releaseRow());

    const result = await resolveActiveConfiguration({ riotAccountId: "account-1" });

    expect(result.source).toBe("RELEASE");
    if (result.source !== "RELEASE") throw new Error("esperava RELEASE");
    expect(result.configuration.configHash).toBe(configuration().configHash);
    expect(result.release.id).toBe("release-1");
    expect(result.cacheState).toBe("MISS");
  });

  it("segunda resolução dentro do TTL é cache HIT, sem nova consulta", async () => {
    findActiveReleaseForAccountMock.mockResolvedValue(releaseRow());

    await resolveActiveConfiguration({ riotAccountId: "account-1" });
    const second = await resolveActiveConfiguration({ riotAccountId: "account-1" });

    expect(second.cacheState).toBe("HIT");
    expect(findActiveReleaseForAccountMock).toHaveBeenCalledTimes(1);
  });

  it("invalidate força nova consulta na resolução seguinte", async () => {
    findActiveReleaseForAccountMock.mockResolvedValue(releaseRow());
    await resolveActiveConfiguration({ riotAccountId: "account-1" });

    invalidateActiveConfigurationCache("account-1");
    await resolveActiveConfiguration({ riotAccountId: "account-1" });

    expect(findActiveReleaseForAccountMock).toHaveBeenCalledTimes(2);
  });

  it("configHash adulterado nunca chega a ser usado — cai pra baseline com fallback registrado", async () => {
    const tampered = releaseRow();
    tampered.artifact.configuration = { ...tampered.artifact.configuration, configHash: "hash-errado" };
    findActiveReleaseForAccountMock.mockResolvedValue(tampered);

    const result = await resolveActiveConfiguration({ riotAccountId: "account-1" });

    expect(result.source).toBe("BUILT_IN_BASELINE");
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe("CONFIG_HASH_MISMATCH");
  });

  it("falha de banco sem última configuração conhecida cai pra baseline", async () => {
    findActiveReleaseForAccountMock.mockRejectedValue(new Error("conexão recusada"));

    const result = await resolveActiveConfiguration({ riotAccountId: "account-novo" });

    expect(result.source).toBe("BUILT_IN_BASELINE");
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe("DB_READ_FAILED_NO_LAST_KNOWN");
  });

  it("falha de banco com última configuração conhecida reaproveita ela, marcada como fallback", async () => {
    findActiveReleaseForAccountMock.mockResolvedValueOnce(releaseRow());
    await resolveActiveConfiguration({ riotAccountId: "account-1" });
    invalidateActiveConfigurationCache("account-1");

    findActiveReleaseForAccountMock.mockRejectedValueOnce(new Error("timeout"));
    const result = await resolveActiveConfiguration({ riotAccountId: "account-1" });

    expect(result.source).toBe("RELEASE");
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe("DB_READ_FAILED_USING_LAST_KNOWN");
    if (result.source === "RELEASE") {
      expect(result.configuration.configHash).toBe(configuration().configHash);
    }
  });

  it("contas diferentes têm cache independente", async () => {
    findActiveReleaseForAccountMock.mockImplementation(async (accountId: string) =>
      accountId === "account-1" ? releaseRow({ id: "release-1" }) : null
    );

    const first = await resolveActiveConfiguration({ riotAccountId: "account-1" });
    const second = await resolveActiveConfiguration({ riotAccountId: "account-2" });

    expect(first.source).toBe("RELEASE");
    expect(second.source).toBe("BUILT_IN_BASELINE");
  });
});
