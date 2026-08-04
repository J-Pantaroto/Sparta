import { describe, expect, it } from "vitest";
import type { ChampionTag, DraftState, PlayerChampionStats } from "../types/domain.js";
import {
  REPLAY_BUNDLE_SCHEMA_VERSION,
  REPLAY_BUNDLE_SCHEMA_VERSION_V1,
  buildDependencyManifest,
  canonicalBundleContent,
  validateReplayInputBundle,
  type ReplayChampionContext,
  type ReplayInputBundle
} from "./replay-input-bundle.js";
import {
  replayRecommendationEngineV1,
  resolveBundleConfiguration,
  verifyReplayBundle,
  describeSnapshotReplayCapability
} from "./replay-verifier.js";
import {
  BASELINE_POST_AGGREGATION_RULES,
  buildEffectiveConfiguration,
  type EffectiveRecommendationConfiguration,
  type WeightableMetricKey
} from "../release/effective-configuration.js";
import * as engine from "../draft/recommendation-engine.js";
import { buildBaselineConfiguration } from "../draft/recommendation-engine.js";
import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";

/**
 * Replay autossuficiente para configurações promovidas (Etapa 27c).
 *
 * O caso que originou esta etapa: a ativação real da `release-etapa27b-v2`
 * produziu um snapshot que o replay não conseguiu reproduzir, porque o bundle
 * guardava só o `configHash` e a verificação reconstruía com a baseline.
 * Estes testes cobrem os dois lados — o bundle v2, que passa a carregar a
 * configuração inteira, e o bundle v1, que é classificado honestamente como
 * insuficiente em vez de gerar divergências enganosas.
 */

function fakeHash(canonical: string): string {
  let hash = 0;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = (hash * 31 + canonical.charCodeAt(index)) | 0;
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

function champion(
  championId: number,
  championName: string,
  roles: ReplayChampionContext["roles"]
): ReplayChampionContext {
  return {
    championId,
    championName,
    roles,
    championTag: {
      championId,
      championName,
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
      earlyPressure: 0.5
    } as ChampionTag,
    capabilityProfile: null,
    sourceVersions: { dataDragon: "16.14.1" },
    unavailableReasons: []
  };
}

/** Cenário "lane inimiga revelada" — o mesmo da ativação real revertida. */
const draft: DraftState = {
  playerRole: "JUNGLE",
  playerRoleSource: "USER",
  pickOrder: 3,
  allies: [{ championId: 103, championName: "Ahri", team: "ally" }],
  enemies: [{ championId: 64, championName: "Lee Sin", team: "enemy" }],
  bannedChampionIds: [55, 91],
  enemyLaneChampionId: 64
};

function baselineConfiguration(): EffectiveRecommendationConfiguration {
  return buildBaselineConfiguration(draft, { computeHash: fakeHash });
}

/** Configuração de release: pesos uniformes, distintos dos da baseline. */
function releaseConfiguration(
  overrides: Partial<Record<WeightableMetricKey, number>> = {}
): EffectiveRecommendationConfiguration {
  return buildEffectiveConfiguration({
    version: "1.0.0",
    metricWeights: {
      PERSONAL_PERFORMANCE: 0.25,
      RECENT_FORM: 0.15,
      PERSONAL_MATCHUP: 0.1,
      BLIND_SAFETY: 0.1,
      ALLY_SYNERGY: 0.1,
      ENEMY_COMPOSITION_ANSWER: 0.1,
      TEAM_COMPOSITION: 0.2,
      META_STRENGTH: 0,
      ...overrides
    },
    disabledMetrics: [],
    postAggregationRules: BASELINE_POST_AGGREGATION_RULES,
    source: { type: "RELEASE", releaseId: "release-1" },
    algorithmCompatibility: { recommendationEngine: "1.0.0", aggregation: "1.0.0" },
    computeHash: fakeHash
  });
}

function bundle(overrides: Partial<ReplayInputBundle> = {}): ReplayInputBundle {
  const base = {
    schemaVersion: REPLAY_BUNDLE_SCHEMA_VERSION,
    effectiveRecommendationConfiguration: baselineConfiguration(),
    snapshotId: "snap-1",
    evaluatedAt: "2026-08-03T22:00:00.000Z",
    capturedAt: "2026-08-03T22:00:01.000Z",
    algorithmVersions: {
      recommendationEngine: "1.0.0",
      championTagDerivation: "champion-tag-derivation/1.0.0",
      executionRisk: "execution-risk/1.0.0",
      draftStrategy: "draft-strategy/1.0.0"
    },
    draft: {
      role: "JUNGLE" as const,
      roleSource: "USER" as const,
      pickOrder: 3,
      pool: [{ championId: 234, source: "PERSONAL_OBSERVED" as const }],
      allies: [{ championId: 103 }],
      enemies: [{ championId: 64 }],
      bannedChampionIds: [55, 91],
      directOpponentChampionId: 64
    },
    player: { championStats: [stats()], matchups: [], unavailableReasons: [] },
    candidates: [
      {
        championId: 234,
        championName: "Viego",
        role: "JUNGLE" as const,
        poolSource: "PERSONAL_OBSERVED" as const,
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
      availability: {}
    }),
    provenance: { sourceType: "CALCULATED" as const, sourceId: "sparta", resource: "ReplayInputBundle" },
    ...overrides
  } as Omit<ReplayInputBundle, "contentHash">;

  return { ...base, contentHash: fakeHash(canonicalBundleContent(base)) };
}

/** Snapshot persistido derivado do replay com a configuração informada. */
function snapshotFrom(
  input: ReplayInputBundle,
  configuration: EffectiveRecommendationConfiguration
): PersistedRecommendation[] {
  return replayRecommendationEngineV1(input, configuration).map((entry) => ({
    championId: entry.championId,
    championName: entry.championName,
    rank: entry.rank,
    group: entry.group,
    totalScore: entry.totalScore,
    dataCoverage: entry.dataCoverage,
    poolSource: "PERSONAL_OBSERVED" as const,
    personalGames: 12,
    metricDetails: Object.entries(entry.metricValues).map(([key, value]) => ({
      key,
      value,
      status: value === null ? "UNAVAILABLE" : "AVAILABLE"
    })) as never,
    effectiveWeights: {},
    category: "comfort_pick",
    reasons: [],
    warnings: [],
    limitations: []
  }));
}

describe("bundle v2: replay autossuficiente", () => {
  it("bundle v2 com baseline produz EXACT_REPLAY", () => {
    const current = bundle();
    const verification = verifyReplayBundle({
      bundle: current,
      snapshot: snapshotFrom(current, baselineConfiguration()),
      computeHash: fakeHash
    });

    expect(verification.status).toBe("EXACT_REPLAY");
    expect(verification.divergences).toEqual([]);
  });

  it("bundle v2 com release produz EXACT_REPLAY — o caso que reprovou na 27b", () => {
    const configuration = releaseConfiguration();
    const current = bundle({ effectiveRecommendationConfiguration: configuration });
    const verification = verifyReplayBundle({
      bundle: current,
      snapshot: snapshotFrom(current, configuration),
      computeHash: fakeHash
    });

    expect(verification.status).toBe("EXACT_REPLAY");
    expect(verification.divergences).toEqual([]);
  });

  it("replay de release NÃO usa selectWeights — e o resultado prova isso", () => {
    // Espiar `selectWeights` não provaria nada: `recommendFromPersonalPool` a
    // chama internamente, dentro do mesmo módulo, e um spy no namespace ESM
    // não intercepta isso. A prova que vale é a do resultado: se o replay
    // usasse `selectWeights`, ele produziria o ranking da BASELINE. Foi
    // exatamente esse sintoma que reprovou a ativação real.
    const configuration = releaseConfiguration();
    const current = bundle({ effectiveRecommendationConfiguration: configuration });

    const comRelease = replayRecommendationEngineV1(current, configuration);
    const comBaseline = replayRecommendationEngineV1(current, baselineConfiguration());

    // As duas configurações produzem resultados distintos...
    expect(comRelease.map((entry) => entry.totalScore)).not.toEqual(
      comBaseline.map((entry) => entry.totalScore)
    );
    // ...e o replay do bundle de release reproduz o da release, não o da baseline.
    const verification = verifyReplayBundle({
      bundle: current,
      snapshot: snapshotFrom(current, configuration),
      computeHash: fakeHash
    });
    expect(verification.status).toBe("EXACT_REPLAY");

    // A confirmação simétrica: alimentar o mesmo bundle com o snapshot da
    // baseline acusaria divergência — é o que a 27b fazia sem perceber.
    const contraBaseline = verifyReplayBundle({
      bundle: current,
      snapshot: snapshotFrom(current, baselineConfiguration()),
      computeHash: fakeHash
    });
    expect(contraBaseline.status).toBe("REPLAY_INTEGRITY_FAILED");
  });

  it("selectWeights continua exportada e é o que a baseline usa — não é código morto", () => {
    // Guarda contra o oposto do bug: o caminho da baseline não pode ter sido
    // desligado junto.
    expect(typeof engine.selectWeights).toBe("function");
    const pesos = engine.selectWeights(draft);
    expect(Object.values(pesos).reduce((total, value) => total + value, 0)).toBeCloseTo(1, 10);
  });

  it("a configuração resolvida é literalmente a embutida, não uma recalculada", () => {
    const configuration = releaseConfiguration();
    const resolved = resolveBundleConfiguration(
      bundle({ effectiveRecommendationConfiguration: configuration }),
      fakeHash
    );

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.origin).toBe("EMBEDDED");
    // Mesma referência: nada é reconstruído no caminho de verificação.
    expect(resolved.configuration).toBe(configuration);
  });

  it("baseline embutida é usada diretamente, sem depender das constantes atuais", () => {
    // Uma baseline embutida com peso deliberadamente diferente do que
    // `selectWeights` produziria hoje deve prevalecer: é ela que descreve o
    // que aconteceu, não a constante de hoje.
    const congelada = buildEffectiveConfiguration({
      version: "historica",
      metricWeights: {
        PERSONAL_PERFORMANCE: 1,
        RECENT_FORM: 0,
        PERSONAL_MATCHUP: 0,
        BLIND_SAFETY: 0,
        ALLY_SYNERGY: 0,
        ENEMY_COMPOSITION_ANSWER: 0,
        TEAM_COMPOSITION: 0,
        META_STRENGTH: 0
      },
      disabledMetrics: [],
      postAggregationRules: BASELINE_POST_AGGREGATION_RULES,
      source: { type: "BUILT_IN_BASELINE" },
      algorithmCompatibility: { recommendationEngine: "1.0.0" },
      computeHash: fakeHash
    });
    const current = bundle({ effectiveRecommendationConfiguration: congelada });

    const verification = verifyReplayBundle({
      bundle: current,
      snapshot: snapshotFrom(current, congelada),
      computeHash: fakeHash
    });

    expect(verification.status).toBe("EXACT_REPLAY");
  });

  it("métricas desligadas e regras pós-agregação são preservadas no round-trip", () => {
    const configuration = buildEffectiveConfiguration({
      version: "1.0.0",
      metricWeights: {
        PERSONAL_PERFORMANCE: 0.5,
        RECENT_FORM: 0.5,
        PERSONAL_MATCHUP: 0.1,
        BLIND_SAFETY: 0,
        ALLY_SYNERGY: 0,
        ENEMY_COMPOSITION_ANSWER: 0,
        TEAM_COMPOSITION: 0,
        META_STRENGTH: 0
      },
      disabledMetrics: ["PERSONAL_MATCHUP"],
      postAggregationRules: { ...BASELINE_POST_AGGREGATION_RULES, primaryCount: 2, alternativeCount: 1 },
      source: { type: "RELEASE", releaseId: "release-2" },
      algorithmCompatibility: { recommendationEngine: "1.0.0" },
      computeHash: fakeHash
    });
    const current = bundle({ effectiveRecommendationConfiguration: configuration });
    const resolved = resolveBundleConfiguration(current, fakeHash);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.configuration.disabledMetrics).toEqual(["PERSONAL_MATCHUP"]);
    expect(resolved.configuration.postAggregationRules.primaryCount).toBe(2);
    expect(resolved.configuration.postAggregationRules.alternativeCount).toBe(1);
  });
});

describe("bundle v2: hash e adulteração", () => {
  it("configuração diferente altera o contentHash", () => {
    expect(bundle({ effectiveRecommendationConfiguration: releaseConfiguration() }).contentHash).not.toBe(
      bundle().contentHash
    );
  });

  it("alterar só capturedAt não altera o contentHash", () => {
    expect(bundle({ capturedAt: "2030-01-01T00:00:00.000Z" }).contentHash).toBe(bundle().contentHash);
  });

  it("adulterar um peso invalida o contentHash", () => {
    const current = bundle();
    const adulterado: ReplayInputBundle = {
      ...current,
      effectiveRecommendationConfiguration: {
        ...current.effectiveRecommendationConfiguration!,
        metricWeights: {
          ...current.effectiveRecommendationConfiguration!.metricWeights,
          PERSONAL_PERFORMANCE: 0.99
        }
      }
    };

    const result = validateReplayInputBundle(adulterado, { computeHash: fakeHash });
    expect(result.valid).toBe(false);
    expect(result.rejections.some((entry) => entry.code === "CONTENT_HASH_MISMATCH")).toBe(true);
    // E o hash da própria configuração também deixa de bater.
    expect(result.rejections.some((entry) => entry.code === "CONFIGURATION_HASH_MISMATCH")).toBe(true);
  });

  it("configHash divergente do conteúdo é rejeitado", () => {
    const current = bundle();
    const adulterado = {
      ...current,
      effectiveRecommendationConfiguration: {
        ...current.effectiveRecommendationConfiguration!,
        configHash: "hash-inventado"
      }
    } as ReplayInputBundle;

    const result = validateReplayInputBundle(adulterado, { computeHash: fakeHash });
    expect(result.rejections.some((entry) => entry.code === "CONFIGURATION_HASH_MISMATCH")).toBe(true);
  });

  it("configHash do bundle discordante do da configuração é rejeitado", () => {
    const current = bundle();
    const adulterado = {
      ...current,
      algorithmVersions: { ...current.algorithmVersions, recommendationConfiguration: "outro-hash" }
    } as ReplayInputBundle;

    const result = validateReplayInputBundle(adulterado, { computeHash: fakeHash });
    expect(
      result.rejections.some((entry) => entry.code === "CONFIGURATION_HASH_INCONSISTENT")
    ).toBe(true);
  });

  it("bundle v2 sem configuração é rejeitado com erro estruturado, não cai na baseline", () => {
    const current = bundle();
    const semConfig = { ...current };
    delete (semConfig as { effectiveRecommendationConfiguration?: unknown })
      .effectiveRecommendationConfiguration;

    const result = validateReplayInputBundle(semConfig as ReplayInputBundle, { computeHash: fakeHash });
    expect(result.rejections.some((entry) => entry.code === "MISSING_EFFECTIVE_CONFIGURATION")).toBe(
      true
    );

    const resolved = resolveBundleConfiguration(semConfig as ReplayInputBundle, fakeHash);
    expect(resolved.ok).toBe(false);
  });
});

describe("bundle v2: coerência de origem", () => {
  it("origem RELEASE sem releaseId é rejeitada", () => {
    const current = bundle();
    const invalido = {
      ...current,
      effectiveRecommendationConfiguration: {
        ...current.effectiveRecommendationConfiguration!,
        source: { type: "RELEASE" }
      }
    } as ReplayInputBundle;

    const result = validateReplayInputBundle(invalido, {});
    expect(
      result.rejections.some((entry) => entry.code === "CONFIGURATION_SOURCE_INCONSISTENT")
    ).toBe(true);
  });

  it("origem BUILT_IN_BASELINE com releaseId é rejeitada", () => {
    const current = bundle();
    const invalido = {
      ...current,
      effectiveRecommendationConfiguration: {
        ...current.effectiveRecommendationConfiguration!,
        source: { type: "BUILT_IN_BASELINE", releaseId: "release-x" }
      }
    } as ReplayInputBundle;

    const result = validateReplayInputBundle(invalido, {});
    expect(
      result.rejections.some((entry) => entry.code === "CONFIGURATION_SOURCE_INCONSISTENT")
    ).toBe(true);
  });

  it("agregação não suportada é rejeitada", () => {
    const current = bundle();
    const invalido = {
      ...current,
      effectiveRecommendationConfiguration: {
        ...current.effectiveRecommendationConfiguration!,
        algorithmCompatibility: { recommendationEngine: "1.0.0", aggregation: "9.9.9" }
      }
    } as ReplayInputBundle;

    const result = validateReplayInputBundle(invalido, {});
    expect(
      result.rejections.some((entry) => entry.code === "INCOMPATIBLE_CONFIGURATION_VERSION")
    ).toBe(true);
  });
});

describe("bundle v1: compatibilidade sem backfill", () => {
  /** Bundle v1 tal como a Etapa 26b gravava: sem configuração embutida. */
  function bundleV1(algorithmVersions: Record<string, string> = {}): ReplayInputBundle {
    const current = bundle();
    const base = {
      ...current,
      schemaVersion: REPLAY_BUNDLE_SCHEMA_VERSION_V1,
      algorithmVersions: { ...current.algorithmVersions, ...algorithmVersions }
    } as Omit<ReplayInputBundle, "contentHash">;
    delete (base as { effectiveRecommendationConfiguration?: unknown })
      .effectiveRecommendationConfiguration;
    return { ...base, contentHash: fakeHash(canonicalBundleContent(base)) } as ReplayInputBundle;
  }

  it("v1 anterior à 27b (sem configHash) continua reproduzível pela baseline do cenário", () => {
    const current = bundleV1();
    const resolved = resolveBundleConfiguration(current, fakeHash);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.origin).toBe("DERIVED_BASELINE_V1");

    const verification = verifyReplayBundle({
      bundle: current,
      snapshot: snapshotFrom(current, resolved.configuration),
      computeHash: fakeHash
    });
    expect(verification.status).toBe("EXACT_REPLAY");
    expect(verification.divergences).toEqual([]);
  });

  it("v1 de baseline (configHash bate com a baseline do cenário) continua reproduzível", () => {
    const current = bundleV1({ recommendationConfiguration: baselineConfiguration().configHash });
    const resolved = resolveBundleConfiguration(current, fakeHash);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.origin).toBe("DERIVED_BASELINE_V1");
  });

  it("v1 de release devolve MISSING_EFFECTIVE_CONFIGURATION, não divergências", () => {
    const current = bundleV1({ recommendationConfiguration: releaseConfiguration().configHash });

    const verification = verifyReplayBundle({
      bundle: current,
      // Snapshot produzido pela release: é o cenário real da ativação revertida.
      snapshot: snapshotFrom(current, releaseConfiguration()),
      computeHash: fakeHash
    });

    expect(verification.status).toBe("MISSING_EFFECTIVE_CONFIGURATION");
    // O ponto central: NÃO roda a baseline e NÃO reporta divergências conhecidas.
    expect(verification.divergences).toEqual([]);
  });

  it("v1 de release é apresentado com a frase honesta, sem chamar o registro de corrompido", () => {
    const current = bundleV1({ recommendationConfiguration: releaseConfiguration().configHash });
    const verification = verifyReplayBundle({
      bundle: current,
      snapshot: snapshotFrom(current, releaseConfiguration()),
      computeHash: fakeHash
    });

    const report = describeSnapshotReplayCapability({
      bundle: current,
      verification,
      reweightAvailable: true
    });

    expect(report.capability).toBe("FULL_DERIVATION_REPLAY_MISSING_CONFIGURATION");
    expect(report.reason).toBe(
      "Replay completo indisponível: esta versão preservou o identificador da configuração, mas não seus parâmetros efetivos."
    );
    // A reponderação da Etapa 25 continua disponível como fallback declarado.
    expect(report.reweightAvailable).toBe(true);
  });

  it("bundle v1 não recebe backfill: o contentHash dele continua o mesmo", () => {
    const current = bundleV1();
    // Recanonicalizar hoje tem que produzir exatamente o hash gravado — se a
    // v2 tivesse mudado a serialização da v1, todo bundle já persistido
    // passaria a falhar na verificação de integridade.
    expect(fakeHash(canonicalBundleContent(current))).toBe(current.contentHash);
    expect(current.effectiveRecommendationConfiguration).toBeUndefined();
    expect(validateReplayInputBundle(current, { computeHash: fakeHash }).valid).toBe(true);
  });
});

describe("independência de fontes externas", () => {
  it("o replay v2 depende só do bundle: a mesma entrada dá sempre o mesmo resultado", () => {
    // `verifyReplayBundle` recebe bundle, snapshot e (opcionalmente) hash e
    // registro — não existe parâmetro por onde uma release, um provider, um
    // repositório ou um cache pudessem entrar. A prova concreta abaixo é a
    // determinística: nada fora dos argumentos influencia o resultado.
    const configuration = releaseConfiguration();
    const current = bundle({ effectiveRecommendationConfiguration: configuration });
    const snapshot = snapshotFrom(current, configuration);

    const primeira = verifyReplayBundle({ bundle: current, snapshot, computeHash: fakeHash });
    const segunda = verifyReplayBundle({ bundle: current, snapshot, computeHash: fakeHash });

    expect(primeira.status).toBe("EXACT_REPLAY");
    expect(segunda).toEqual(primeira);
  });

  it("uma release com os MESMOS pesos, mas id diferente, não altera o replay do bundle", () => {
    // Reproduz "a release foi substituída lá fora": o bundle continua sendo a
    // única fonte, então o resultado não se mexe.
    const configuration = releaseConfiguration();
    const current = bundle({ effectiveRecommendationConfiguration: configuration });
    const snapshot = snapshotFrom(current, configuration);

    const substituta = buildEffectiveConfiguration({
      version: "1.0.0",
      metricWeights: configuration.metricWeights,
      disabledMetrics: [...configuration.disabledMetrics],
      postAggregationRules: configuration.postAggregationRules,
      source: { type: "RELEASE", releaseId: "outra-release" },
      algorithmCompatibility: configuration.algorithmCompatibility,
      computeHash: fakeHash
    });
    // O id entra na canonicalização, então a substituta tem outro configHash…
    expect(substituta.configHash).not.toBe(configuration.configHash);
    // …e mesmo assim o replay do bundle original segue exato, porque ele não
    // olha para nenhuma release — só para o que carrega.
    expect(verifyReplayBundle({ bundle: current, snapshot, computeHash: fakeHash }).status).toBe(
      "EXACT_REPLAY"
    );
  });

  it("o caminho de replay não importa banco, rede, cache nem provider", async () => {
    // Verificação estrutural: o que garante "sem I/O" é o grafo de imports,
    // não o comportamento em uma execução. `process.cwd()` é a raiz do
    // pacote quando o vitest roda.
    const { readFile } = await import("node:fs/promises");
    const arquivos = [
      "src/calibration/replay-verifier.ts",
      "src/calibration/replay-input-bundle.ts"
    ];
    for (const arquivo of arquivos) {
      const fonte = await readFile(`${process.cwd()}/${arquivo}`, "utf8");
      const imports = fonte.match(/from\s+"[^"]+"/g) ?? [];
      for (const declaracao of imports) {
        expect(declaracao).not.toMatch(/prisma|pg|redis|axios|node:http|node:net|provider/i);
      }
      // Todo import é relativo ao próprio core: nenhuma dependência externa.
      for (const declaracao of imports) {
        expect(declaracao).toMatch(/from\s+"\.{1,2}\//);
      }
    }
  });
});
