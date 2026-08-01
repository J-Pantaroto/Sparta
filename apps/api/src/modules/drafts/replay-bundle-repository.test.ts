import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalBundleContent, type PersistedRecommendation, type ReplayInputBundle } from "@sparta/core";

const {
  draftSessionFindFirstMock,
  snapshotFindFirstMock,
  bundleUpdateMock
} = vi.hoisted(() => ({
  draftSessionFindFirstMock: vi.fn(),
  snapshotFindFirstMock: vi.fn(),
  bundleUpdateMock: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    draftSession: { findFirst: draftSessionFindFirstMock },
    recommendationSnapshot: { findFirst: snapshotFindFirstMock },
    replayInputBundleRecord: { update: bundleUpdateMock }
  }
}));

import {
  findReplayBundleSummary,
  findSessionReplayCapability,
  verifySnapshotReplay
} from "./replay-bundle-repository.js";

/**
 * Testa a camada de repositorio isolada de rota HTTP: confirma que
 * `describeCapability`/`computeReweightAvailability` recebem exatamente o
 * bundle e a verificacao persistidos, sem tocar em nenhuma tabela mutavel.
 */

function metric(
  key: string,
  value: number | null
): PersistedRecommendation["metricDetails"][number] {
  return { key: key as never, value, status: value === null ? "UNAVAILABLE" : "AVAILABLE", confidence: null };
}

/** Recomendacao congelada cujo score bate exatamente com a soma ponderada. */
function recommendation(overrides: Partial<PersistedRecommendation> = {}): PersistedRecommendation {
  return {
    championId: 234,
    championName: "Viego",
    rank: 1,
    group: "PRIMARY",
    totalScore: 50,
    dataCoverage: 1,
    poolSource: "PERSONAL_OBSERVED",
    personalGames: 12,
    metricDetails: [metric("PERSONAL_PERFORMANCE", 50)],
    effectiveWeights: { personalPerformance: 1 },
    category: "comfort_pick",
    reasons: [],
    warnings: [],
    limitations: [],
    ...overrides
  } as PersistedRecommendation;
}

const bundleContent = {
  schemaVersion: "replay-input-bundle/1.0.0",
  snapshotId: "snap-1",
  contentHash: "hash-abc",
  evaluatedAt: "2026-07-31T17:15:54.000Z",
  capturedAt: "2026-07-31T17:15:54.900Z",
  algorithmVersions: { recommendationEngine: "1.0.0" }
};

/**
 * Bundle estruturalmente válido e com hash real, para os testes que de fato
 * disparam `verifyReplayBundle` (a validação estrutural crasharia num bundle
 * incompleto ao iterar `referencedChampions`/`candidates` ausentes).
 */
function validBundle(): ReplayInputBundle {
  const base: Omit<ReplayInputBundle, "contentHash"> = {
    schemaVersion: "replay-input-bundle/1.0.0",
    snapshotId: "snap-1",
    evaluatedAt: "2026-07-31T17:15:54.000Z",
    capturedAt: "2026-07-31T17:15:54.900Z",
    algorithmVersions: {
      recommendationEngine: "1.0.0",
      championTagDerivation: "champion-tag-derivation/1.0.0",
      executionRisk: "execution-risk/1.0.0",
      draftStrategy: "draft-strategy/1.0.0"
    },
    draft: {
      role: "JUNGLE",
      roleSource: "USER",
      pickOrder: 1,
      pool: [],
      allies: [],
      enemies: [],
      bannedChampionIds: []
    },
    player: { championStats: [], matchups: [], unavailableReasons: [] },
    candidates: [],
    referencedChampions: [],
    activeParameters: {
      compositionRules: {
        minimumFrontline: 1,
        minimumEngage: 1,
        minimumWaveclear: 1,
        preferDamageBalance: true
      },
      compositionRulesVersion: "composition-rules/1.0.0",
      patchMetaAvailable: false
    },
    dependencyManifest: [],
    provenance: { sourceType: "CALCULATED", sourceId: "sparta", resource: "ReplayInputBundle" }
  };
  return { ...base, contentHash: createHash("sha256").update(canonicalBundleContent(base)).digest("hex") };
}

describe("findSessionReplayCapability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve null quando a sessão não pertence à conta", async () => {
    draftSessionFindFirstMock.mockResolvedValue(null);
    const result = await findSessionReplayCapability("conta-1", "sessao-de-outro");
    expect(result).toBeNull();
    expect(snapshotFindFirstMock).not.toHaveBeenCalled();
  });

  it("sessão sem snapshot fica indisponível, nunca corrompida", async () => {
    draftSessionFindFirstMock.mockResolvedValue({ id: "sessao-1" });
    snapshotFindFirstMock.mockResolvedValue(null);

    const result = await findSessionReplayCapability("conta-1", "sessao-1");

    expect(result).toEqual({
      sessionId: "sessao-1",
      snapshotId: null,
      capability: "FULL_DERIVATION_REPLAY_UNAVAILABLE",
      reason: "Nenhum snapshot foi registrado para esta sessão.",
      reweightAvailable: false,
      missingDependencies: []
    });
  });

  it("snapshot sem bundle mas reponderável fica REWEIGHT_ONLY", async () => {
    draftSessionFindFirstMock.mockResolvedValue({ id: "sessao-1" });
    snapshotFindFirstMock.mockResolvedValue({
      id: "snap-1",
      algorithmVersionsJson: { recommendationEngine: "1.0.0" },
      recommendations: [{ detailJson: recommendation() }],
      replayBundle: null
    });

    const result = await findSessionReplayCapability("conta-1", "sessao-1");

    expect(result?.snapshotId).toBe("snap-1");
    expect(result?.capability).toBe("REWEIGHT_ONLY");
    expect(result?.reweightAvailable).toBe(true);
  });

  it("snapshot com bundle mas ainda sem verificação fica indisponível até verificar", async () => {
    draftSessionFindFirstMock.mockResolvedValue({ id: "sessao-1" });
    snapshotFindFirstMock.mockResolvedValue({
      id: "snap-1",
      algorithmVersionsJson: { recommendationEngine: "1.0.0" },
      recommendations: [{ detailJson: recommendation() }],
      replayBundle: { contentJson: bundleContent, lastVerification: null }
    });

    const result = await findSessionReplayCapability("conta-1", "sessao-1");

    expect(result?.capability).toBe("FULL_DERIVATION_REPLAY_UNAVAILABLE");
    expect(result?.reason).toBe("Bundle presente, mas a integridade ainda não foi verificada.");
    expect(result?.bundleSchemaVersion).toBe("replay-input-bundle/1.0.0");
  });

  it("snapshot com verificação exata armazenada fica disponível sem reverificar", async () => {
    draftSessionFindFirstMock.mockResolvedValue({ id: "sessao-1" });
    snapshotFindFirstMock.mockResolvedValue({
      id: "snap-1",
      algorithmVersionsJson: { recommendationEngine: "1.0.0" },
      recommendations: [{ detailJson: recommendation() }],
      replayBundle: {
        contentJson: bundleContent,
        lastVerification: {
          status: "EXACT_REPLAY",
          divergences: [],
          rejections: [],
          missingDependencies: []
        }
      }
    });

    const result = await findSessionReplayCapability("conta-1", "sessao-1");

    expect(result?.capability).toBe("FULL_DERIVATION_REPLAY_AVAILABLE");
    // GET não deve rodar verificação nova: só leu o que já estava persistido.
    expect(bundleUpdateMock).not.toHaveBeenCalled();
  });
});

describe("findReplayBundleSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve null quando o snapshot não pertence à conta", async () => {
    snapshotFindFirstMock.mockResolvedValue(null);
    const result = await findReplayBundleSummary("conta-1", "snap-de-outro");
    expect(result).toBeNull();
  });

  it("nunca inclui o contentJson do bundle no resumo", async () => {
    snapshotFindFirstMock.mockResolvedValue({
      id: "snap-1",
      algorithmVersionsJson: { recommendationEngine: "1.0.0" },
      recommendations: [{ detailJson: recommendation() }],
      replayBundle: {
        contentJson: { ...bundleContent, draft: { role: "JUNGLE" }, player: { championStats: [] } },
        contentBytes: 2048,
        evaluatedAt: new Date("2026-07-31T17:15:54.000Z"),
        createdAt: new Date("2026-07-31T17:15:55.000Z"),
        lastVerification: null
      }
    });

    const result = await findReplayBundleSummary("conta-1", "snap-1");

    expect(result?.hasBundle).toBe(true);
    expect(result?.contentBytes).toBe(2048);
    expect(result).not.toHaveProperty("contentJson");
    expect(JSON.stringify(result)).not.toContain("championStats");
  });
});

describe("verifySnapshotReplay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("NOT_FOUND quando o snapshot não pertence à conta", async () => {
    snapshotFindFirstMock.mockResolvedValue(null);
    const result = await verifySnapshotReplay("conta-1", "snap-de-outro");
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("NO_BUNDLE quando o snapshot não tem bundle preservado", async () => {
    snapshotFindFirstMock.mockResolvedValue({
      id: "snap-1",
      algorithmVersionsJson: { recommendationEngine: "1.0.0" },
      recommendations: [{ detailJson: recommendation() }],
      replayBundle: null
    });
    const result = await verifySnapshotReplay("conta-1", "snap-1");
    expect(result).toEqual({ ok: false, reason: "NO_BUNDLE" });
    expect(bundleUpdateMock).not.toHaveBeenCalled();
  });

  it("reconstrói de verdade a partir do bundle, persiste o resultado e relata divergência real sem corrigir", async () => {
    // Bundle sem nenhum candidato: o motor reconstruído não vai encontrar o
    // campeão 234 do snapshot persistido — divergência real, não um crash.
    snapshotFindFirstMock.mockResolvedValue({
      id: "snap-1",
      algorithmVersionsJson: { recommendationEngine: "1.0.0" },
      recommendations: [{ detailJson: recommendation() }],
      replayBundle: { contentJson: validBundle(), lastVerification: null }
    });
    bundleUpdateMock.mockResolvedValue({});

    const result = await verifySnapshotReplay("conta-1", "snap-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // O campeão 234 do snapshot não existe entre os candidatos reconstruídos
    // (pool vazio no bundle) — divergência de presença, relatada e não corrigida.
    expect(result.result.status).toBe("REPLAY_INTEGRITY_FAILED");
    expect(result.result.divergences[0]?.field).toBe("presenca");
    expect(result.report.capability).toBe("FULL_DERIVATION_REPLAY_INVALID");

    expect(bundleUpdateMock).toHaveBeenCalledTimes(1);
    const call = bundleUpdateMock.mock.calls[0][0];
    expect(call.where).toEqual({ snapshotId: "snap-1" });
    // A gravação é só o resultado da verificação, nunca o bundle/snapshot em si.
    expect(call.data.lastVerification).toHaveProperty("status", "REPLAY_INTEGRITY_FAILED");
    expect(call.data.lastVerification).toHaveProperty("verifiedAt");
  });
});
