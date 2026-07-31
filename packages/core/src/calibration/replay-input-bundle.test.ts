import { describe, expect, it } from "vitest";
import type { ChampionTag, PlayerChampionStats } from "../types/domain.js";
import {
  REPLAY_BUNDLE_SCHEMA_VERSION,
  buildDependencyManifest,
  canonicalBundleContent,
  validateReplayInputBundle,
  type ReplayChampionContext,
  type ReplayInputBundle
} from "./replay-input-bundle.js";
import {
  describeSnapshotReplayCapability,
  replayEngines,
  replayRecommendationEngineV1,
  verifyReplayBundle
} from "./replay-verifier.js";
import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";

/** Hash determinístico e local: o teste não precisa de `node:crypto`. */
function fakeHash(canonical: string): string {
  let hash = 0;
  for (let i = 0; i < canonical.length; i += 1) {
    hash = (hash * 31 + canonical.charCodeAt(i)) | 0;
  }
  return `h${hash}`;
}

function stats(overrides: Partial<PlayerChampionStats> = {}): PlayerChampionStats {
  return {
    championId: 234,
    championName: "Viego",
    role: "JUNGLE",
    games: 12,
    wins: 7,
    kills: 6,
    deaths: 5,
    assists: 8,
    csPerMinute: 5.4,
    goldPerMinute: 380,
    damagePerMinute: 620,
    visionScorePerMinute: 0.6,
    killParticipation: 0.52,
    objectiveParticipation: null,
    coverage: {
      killParticipation: { sampleSize: 12, availableSampleSize: 12, status: "AVAILABLE" },
      objectiveParticipation: { sampleSize: 12, availableSampleSize: 0, status: "UNAVAILABLE" }
    },
    recentMatches: [],
    ...overrides
  };
}

function tag(overrides: Partial<ChampionTag> = {}): ChampionTag {
  return {
    championId: 234,
    championName: "Viego",
    roles: [],
    damageProfile: "AD",
    tags: ["Assassin"],
    blindSafety: 0.45,
    difficulty: 0.6,
    engage: 0.6,
    peel: 0.2,
    frontline: 0.3,
    pickoff: 0.7,
    waveclear: 0.5,
    scaling: 0.6,
    earlyPressure: 0.5,
    ...overrides
  } as ChampionTag;
}

function champion(
  championId: number,
  championName: string,
  roles: ReplayChampionContext["roles"],
  overrides: Partial<ReplayChampionContext> = {}
): ReplayChampionContext {
  return {
    championId,
    championName,
    roles,
    championTag: tag({ championId, championName }),
    capabilityProfile: null,
    sourceVersions: { dataDragon: "16.14.1" },
    unavailableReasons: [],
    ...overrides
  };
}

function bundle(overrides: Partial<ReplayInputBundle> = {}): ReplayInputBundle {
  const base: Omit<ReplayInputBundle, "contentHash"> = {
    schemaVersion: REPLAY_BUNDLE_SCHEMA_VERSION,
    snapshotId: "snap-1",
    evaluatedAt: "2026-07-28T17:15:54.000Z",
    capturedAt: "2026-07-28T17:15:54.900Z",
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
      pool: [{ championId: 234, source: "PERSONAL_OBSERVED" }],
      allies: [{ championId: 103 }],
      enemies: [{ championId: 64 }],
      bannedChampionIds: [55, 91],
      directOpponentChampionId: 64
    },
    player: {
      championStats: [stats()],
      matchups: [],
      unavailableReasons: [{ input: "GLOBAL_MATCHUP", reason: "Fonte global indisponível." }]
    },
    candidates: [
      {
        championId: 234,
        championName: "Viego",
        role: "JUNGLE",
        poolSource: "PERSONAL_OBSERVED",
        enabled: true
      }
    ],
    referencedChampions: [
      champion(234, "Viego", ["CANDIDATE"]),
      champion(103, "Ahri", ["ALLY"]),
      champion(64, "Lee Sin", ["ENEMY", "DIRECT_OPPONENT"])
    ],
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
    dependencyManifest: buildDependencyManifest({
      algorithmVersions: { recommendationEngine: "1.0.0" },
      availability: { META_STRENGTH: { available: false, reason: "Fonte global indisponível." } }
    }),
    provenance: { sourceType: "CALCULATED", sourceId: "sparta", resource: "ReplayInputBundle" },
    ...overrides
  } as Omit<ReplayInputBundle, "contentHash">;

  return { ...base, contentHash: fakeHash(canonicalBundleContent(base)) };
}

describe("contentHash", () => {
  it("mesmo conteúdo funcional produz o mesmo hash", () => {
    expect(bundle().contentHash).toBe(bundle().contentHash);
  });

  it("capturedAt não muda o hash", () => {
    expect(bundle({ capturedAt: "2027-01-01T00:00:00.000Z" }).contentHash).toBe(
      bundle().contentHash
    );
  });

  it("evaluatedAt muda o hash: ele alimenta a recência do risco", () => {
    expect(bundle({ evaluatedAt: "2026-07-29T00:00:00.000Z" }).contentHash).not.toBe(
      bundle().contentHash
    );
  });

  it("alteração de estatística pessoal muda o hash", () => {
    expect(
      bundle({ player: { ...bundle().player, championStats: [stats({ games: 13 })] } }).contentHash
    ).not.toBe(bundle().contentHash);
  });

  it("alteração da tag de um aliado muda o hash", () => {
    const alterado = bundle().referencedChampions.map((entry) =>
      entry.championId === 103
        ? { ...entry, championTag: tag({ championId: 103, championName: "Ahri", engage: 0.95 }) }
        : entry
    );
    expect(bundle({ referencedChampions: alterado }).contentHash).not.toBe(bundle().contentHash);
  });

  it("alteração da capacidade de um inimigo muda o hash", () => {
    const alterado = bundle().referencedChampions.map((entry) =>
      entry.championId === 64
        ? {
            ...entry,
            capabilityProfile: {
              championId: 64,
              championName: "Lee Sin",
              algorithmVersion: "champion-capability-extraction/1.0.0"
            } as never
          }
        : entry
    );
    expect(bundle({ referencedChampions: alterado }).contentHash).not.toBe(bundle().contentHash);
  });

  it("ordem acidental de arrays-conjunto não muda o hash", () => {
    const invertido = bundle({
      referencedChampions: [...bundle().referencedChampions].reverse(),
      draft: {
        ...bundle().draft,
        bannedChampionIds: [91, 55]
      }
    });
    expect(invertido.contentHash).toBe(bundle().contentHash);
  });

  it("ordem de chaves de objeto não muda o hash", () => {
    const reordenado = bundle({
      algorithmVersions: {
        draftStrategy: "draft-strategy/1.0.0",
        executionRisk: "execution-risk/1.0.0",
        championTagDerivation: "champion-tag-derivation/1.0.0",
        recommendationEngine: "1.0.0"
      }
    });
    expect(reordenado.contentHash).toBe(bundle().contentHash);
  });

  it("recentMatches é semanticamente ordenado e não é reordenado", () => {
    const primeiro = stats({
      recentMatches: [
        { matchId: "A", championId: 234, role: "JUNGLE", won: true } as never,
        { matchId: "B", championId: 234, role: "JUNGLE", won: false } as never
      ]
    });
    const invertido = stats({
      recentMatches: [
        { matchId: "B", championId: 234, role: "JUNGLE", won: false } as never,
        { matchId: "A", championId: 234, role: "JUNGLE", won: true } as never
      ]
    });
    expect(
      bundle({ player: { ...bundle().player, championStats: [primeiro] } }).contentHash
    ).not.toBe(bundle({ player: { ...bundle().player, championStats: [invertido] } }).contentHash);
  });

  it("mudança de aliado, inimigo ou pool muda o hash", () => {
    const comAliado = bundle({
      draft: { ...bundle().draft, allies: [{ championId: 103 }, { championId: 222 }] },
      referencedChampions: [...bundle().referencedChampions, champion(222, "Jinx", ["ALLY"])]
    });
    const comPool = bundle({
      draft: {
        ...bundle().draft,
        pool: [
          { championId: 234, source: "PERSONAL_OBSERVED" },
          { championId: 104, source: "USER_PROVIDED" }
        ]
      }
    });
    expect(comAliado.contentHash).not.toBe(bundle().contentHash);
    expect(comPool.contentHash).not.toBe(bundle().contentHash);
  });
});

describe("validateReplayInputBundle", () => {
  it("aceita um bundle completo e coerente", () => {
    const result = validateReplayInputBundle(bundle(), { computeHash: fakeHash });
    expect(result.valid).toBe(true);
    expect(result.rejections).toEqual([]);
  });

  it("rejeita schema desconhecido sem seguir validando", () => {
    const result = validateReplayInputBundle({ ...bundle(), schemaVersion: "outro/9.9.9" });
    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0]?.code).toBe("UNSUPPORTED_SCHEMA");
  });

  it("rejeita campeão do draft sem perfil embutido", () => {
    const semPerfil = bundle({
      referencedChampions: bundle().referencedChampions.filter((e) => e.championId !== 64)
    });
    const result = validateReplayInputBundle(semPerfil);
    expect(result.rejections.some((r) => r.code === "MISSING_CHAMPION_PROFILE")).toBe(true);
  });

  it("rejeita candidato ausente do contexto de campeões", () => {
    const result = validateReplayInputBundle(
      bundle({ referencedChampions: bundle().referencedChampions.filter((e) => e.championId !== 234) })
    );
    expect(result.rejections.some((r) => r.code === "CANDIDATE_NOT_REFERENCED")).toBe(true);
  });

  it("rejeita papel inconsistente", () => {
    const result = validateReplayInputBundle(
      bundle({
        referencedChampions: bundle().referencedChampions.map((e) =>
          e.championId === 234 ? { ...e, roles: ["ALLY" as const] } : e
        )
      })
    );
    expect(result.rejections.some((r) => r.code === "INCONSISTENT_ROLE")).toBe(true);
  });

  it("rejeita campeão duplicado", () => {
    const result = validateReplayInputBundle(
      bundle({ referencedChampions: [...bundle().referencedChampions, champion(234, "Viego", ["CANDIDATE"])] })
    );
    expect(result.rejections.some((r) => r.code === "DUPLICATE_CHAMPION")).toBe(true);
  });

  it("rejeita evaluatedAt inválido", () => {
    const result = validateReplayInputBundle(bundle({ evaluatedAt: "ontem" }));
    expect(result.rejections.some((r) => r.code === "INVALID_EVALUATED_AT")).toBe(true);
  });

  it("rejeita versão obrigatória ausente", () => {
    const result = validateReplayInputBundle(
      bundle({ algorithmVersions: { recommendationEngine: "1.0.0" } })
    );
    expect(result.rejections.filter((r) => r.code === "MISSING_ALGORITHM_VERSION").length).toBe(3);
  });

  it("rejeita parâmetro não finito", () => {
    const result = validateReplayInputBundle(
      bundle({
        activeParameters: {
          ...bundle().activeParameters,
          compositionRules: {
            ...bundle().activeParameters.compositionRules,
            minimumFrontline: Number.POSITIVE_INFINITY
          }
        }
      })
    );
    expect(result.rejections.some((r) => r.code === "NON_FINITE_PARAMETER")).toBe(true);
  });

  it("rejeita conteúdo cujo hash não corresponde ao declarado", () => {
    const result = validateReplayInputBundle(
      { ...bundle(), contentHash: "h-errado" },
      { computeHash: fakeHash }
    );
    expect(result.rejections.some((r) => r.code === "CONTENT_HASH_MISMATCH")).toBe(true);
  });

  it("não completa dado ausente: a validação só relata", () => {
    const original = bundle({
      referencedChampions: bundle().referencedChampions.filter((e) => e.championId !== 64)
    });
    const copia = JSON.parse(JSON.stringify(original));
    validateReplayInputBundle(original);
    expect(original).toEqual(copia);
  });
});

describe("contrato", () => {
  it("não tem campo para dado pós-partida", () => {
    const serialized = JSON.stringify(bundle()).toLowerCase();
    for (const forbidden of ["timeline", "postgame", "matchresult", "\"won\":true,\"kda\""]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("não carrega identificador pessoal nem credencial", () => {
    const serialized = JSON.stringify(bundle()).toLowerCase();
    for (const forbidden of ["puuid", "token", "apikey", "lockfile", "authorization"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("o manifesto nomeia as seções necessárias por métrica", () => {
    const manifest = bundle().dependencyManifest;
    const strategic = manifest.find((entry) => entry.metric === "TEAM_COMPOSITION");
    expect(strategic?.requiredBundleSections).toContain("referencedChampions");
    expect(strategic?.requiredBundleSections).toContain("draft");
    const risk = manifest.find((entry) => entry.metric === "EXECUTION_RISK");
    expect(risk?.requiredInputs).toContain("evaluatedAt");
  });

  it("registra indisponibilidade declarada com motivo", () => {
    const meta = bundle().dependencyManifest.find((entry) => entry.metric === "META_STRENGTH");
    expect(meta?.available).toBe(false);
    expect(meta?.unavailableReason).toBe("Fonte global indisponível.");
  });
});

describe("verifyReplayBundle", () => {
  /** Snapshot derivado do próprio bundle: é o que a 26b vai persistir junto. */
  function snapshotOf(input = bundle()): PersistedRecommendation[] {
    return replayRecommendationEngineV1(input).map((entry) => ({
      championId: entry.championId,
      championName: entry.championName,
      rank: entry.rank,
      group: entry.group,
      totalScore: entry.totalScore,
      dataCoverage: entry.dataCoverage,
      poolSource: "PERSONAL_OBSERVED",
      personalGames: 12,
      metricDetails: Object.entries(entry.metricValues).map(([key, value]) => ({
        key: key as never,
        value: value ?? null,
        status: value === null || value === undefined ? "UNAVAILABLE" : "AVAILABLE",
        confidence: null
      })),
      effectiveWeights: {},
      category: "comfort_pick",
      reasons: [],
      warnings: [],
      limitations: []
    }));
  }

  it("bundle válido reproduz o snapshot", () => {
    const result = verifyReplayBundle({
      bundle: bundle(),
      snapshot: snapshotOf(),
      computeHash: fakeHash
    });
    expect(result.status).toBe("EXACT_REPLAY");
    expect(result.divergences).toEqual([]);
    expect(result.replayImplementation).toBe("recommendation-engine/1.0.0");
  });

  it("é determinístico: o mesmo bundle produz o mesmo resultado", () => {
    const snapshot = snapshotOf();
    expect(verifyReplayBundle({ bundle: bundle(), snapshot })).toEqual(
      verifyReplayBundle({ bundle: bundle(), snapshot })
    );
  });

  it("alteração posterior de estatística pessoal não muda o replay do bundle original", () => {
    const snapshot = snapshotOf();
    // O "banco" mudou; o bundle não. O replay continua reproduzindo o snapshot.
    const outroEstado = bundle({
      player: { ...bundle().player, championStats: [stats({ games: 99, wins: 99 })] }
    });
    expect(verifyReplayBundle({ bundle: bundle(), snapshot }).status).toBe("EXACT_REPLAY");
    expect(verifyReplayBundle({ bundle: outroEstado, snapshot }).status).toBe(
      "REPLAY_INTEGRITY_FAILED"
    );
  });

  it("alteração posterior de tag de aliado não muda o replay do bundle original", () => {
    const snapshot = snapshotOf();
    const outroEstado = bundle({
      referencedChampions: bundle().referencedChampions.map((entry) =>
        entry.championId === 103
          ? { ...entry, championTag: tag({ championId: 103, championName: "Ahri", engage: 0.01, frontline: 0.01 }) }
          : entry
      )
    });
    expect(verifyReplayBundle({ bundle: bundle(), snapshot }).status).toBe("EXACT_REPLAY");
    expect(verifyReplayBundle({ bundle: outroEstado, snapshot }).status).toBe(
      "REPLAY_INTEGRITY_FAILED"
    );
  });

  it("divergência é relatada, não corrigida", () => {
    const snapshot = snapshotOf().map((entry) => ({ ...entry, totalScore: entry.totalScore + 9 }));
    const result = verifyReplayBundle({ bundle: bundle(), snapshot });
    expect(result.status).toBe("REPLAY_INTEGRITY_FAILED");
    const divergence = result.divergences.find((entry) => entry.field === "totalScore");
    expect(divergence?.expected).not.toBe(divergence?.reconstructed);
    expect(divergence?.delta).toBeGreaterThan(0);
  });

  it("versão desconhecida não cai no motor atual", () => {
    const result = verifyReplayBundle({
      bundle: bundle({
        algorithmVersions: { ...bundle().algorithmVersions, recommendationEngine: "0.9.0" }
      }),
      snapshot: snapshotOf()
    });
    expect(result.status).toBe("UNSUPPORTED_ALGORITHM_VERSION");
    expect(result.divergences).toEqual([]);
    expect(result.replayImplementation).toBeUndefined();
  });

  it("schema desconhecido é recusado antes de qualquer reconstrução", () => {
    const result = verifyReplayBundle({
      bundle: { ...bundle(), schemaVersion: "replay-input-bundle/9.9.9" },
      snapshot: snapshotOf()
    });
    expect(result.status).toBe("UNSUPPORTED_BUNDLE_SCHEMA");
  });

  it("bundle inválido não é reconstruído", () => {
    const result = verifyReplayBundle({
      bundle: bundle({
        referencedChampions: bundle().referencedChampions.filter((e) => e.championId !== 64)
      }),
      snapshot: snapshotOf()
    });
    expect(result.status).toBe("INVALID_BUNDLE");
    expect(result.divergences).toEqual([]);
  });

  it("o registro é explícito: sem entrada, sem execução", () => {
    expect(Object.keys(replayEngines)).toEqual(["recommendation-engine/1.0.0"]);
    const result = verifyReplayBundle({
      bundle: bundle(),
      snapshot: snapshotOf(),
      registry: {}
    });
    expect(result.status).toBe("UNSUPPORTED_ALGORITHM_VERSION");
  });
});

describe("describeSnapshotReplayCapability", () => {
  it("snapshot sem bundle fica em reponderação, não corrompido", () => {
    const report = describeSnapshotReplayCapability({ bundle: null, reweightAvailable: true });
    expect(report.capability).toBe("REWEIGHT_ONLY");
    expect(report.reason).toBe("Os inputs de derivação não eram preservados nesta versão.");
  });

  it("snapshot sem bundle e sem reponderação fica indisponível", () => {
    const report = describeSnapshotReplayCapability({ bundle: null, reweightAvailable: false });
    expect(report.capability).toBe("FULL_DERIVATION_REPLAY_UNAVAILABLE");
  });

  it("bundle verificado habilita replay completo", () => {
    const current = bundle();
    const verification = verifyReplayBundle({
      bundle: current,
      snapshot: replayRecommendationEngineV1(current).map((entry) => ({
        championId: entry.championId,
        championName: entry.championName,
        rank: entry.rank,
        group: entry.group,
        totalScore: entry.totalScore,
        dataCoverage: entry.dataCoverage,
        poolSource: "PERSONAL_OBSERVED",
        personalGames: 12,
        metricDetails: [],
        effectiveWeights: {},
        category: "comfort_pick",
        reasons: [],
        warnings: [],
        limitations: []
      }))
    });
    const report = describeSnapshotReplayCapability({
      bundle: current,
      verification,
      reweightAvailable: true
    });
    expect(report.capability).toBe("FULL_DERIVATION_REPLAY_AVAILABLE");
    expect(report.reason).toBe("Replay completo disponível.");
    expect(report.contentHash).toBe(current.contentHash);
  });

  it("versão não suportada é dita com essas palavras", () => {
    const report = describeSnapshotReplayCapability({
      bundle: bundle(),
      verification: {
        status: "UNSUPPORTED_ALGORITHM_VERSION",
        divergences: [],
        rejections: [],
        missingDependencies: []
      },
      reweightAvailable: true
    });
    expect(report.capability).toBe("REWEIGHT_ONLY");
    expect(report.reason).toBe("Versão histórica do motor não suportada.");
  });
});
