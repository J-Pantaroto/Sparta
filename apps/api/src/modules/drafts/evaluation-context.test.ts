import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  REPLAY_BUNDLE_SCHEMA_VERSION,
  validateReplayInputBundle,
  verifyReplayBundle,
  type DraftState,
  type PlayerChampionStats
} from "@sparta/core";
import { buildReplayBundle, runEngine, type EvaluationContext } from "./evaluation-context.js";

/** Mesma funcao de hash do backend, na forma que o validador espera. */
const sha256 = (canonical: string) => createHash("sha256").update(canonical).digest("hex");

function stats(): PlayerChampionStats {
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
    recentMatches: []
  };
}

const draft: DraftState = {
  playerRole: "JUNGLE",
  playerRoleSource: "USER",
  pickOrder: 1,
  allies: [{ championId: 103, championName: "Ahri", team: "ally" }],
  enemies: [{ championId: 64, championName: "Lee Sin", team: "enemy" }],
  bannedChampionIds: [55, 91],
  enemyLaneChampionId: 64
};

function context(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return Object.freeze({
    evaluatedAt: "2026-07-31T12:00:00.000Z",
    riotAccountId: "account-1",
    role: "JUNGLE" as const,
    draft,
    pool: [
      {
        championId: 234,
        championName: "Viego",
        role: "JUNGLE" as const,
        source: "PERSONAL_OBSERVED" as const,
        enabled: true
      }
    ],
    championStats: [stats()],
    championTags: [],
    capabilityProfiles: [],
    matchups: [],
    algorithmVersions: {
      recommendationEngine: "1.0.0",
      championTagDerivation: "champion-tag-derivation/1.0.0",
      executionRisk: "execution-risk/1.0.0",
      draftStrategy: "draft-strategy/1.0.0",
      threatResponseModel: "threat-response/1.0.0"
    },
    unavailableReasons: [],
    ...overrides
  }) as EvaluationContext;
}

describe("contexto único de avaliação", () => {
  it("o bundle carrega exatamente o `evaluatedAt` que o motor usou", () => {
    const ctx = context();
    const bundle = buildReplayBundle({ context: ctx, snapshotId: "snap-1" });

    expect(bundle.evaluatedAt).toBe(ctx.evaluatedAt);
  });

  it("preserva o perfil de aliados, inimigos e adversário direto, não só do candidato", () => {
    const bundle = buildReplayBundle({ context: context(), snapshotId: "snap-1" });
    const byId = new Map(bundle.referencedChampions.map((entry) => [entry.championId, entry]));

    expect(byId.get(234)?.roles).toEqual(["CANDIDATE"]);
    expect(byId.get(103)?.roles).toEqual(["ALLY"]);
    expect(byId.get(64)?.roles).toEqual(["ENEMY", "DIRECT_OPPONENT"]);
  });

  it("o mesmo campeão em dois papéis aparece uma única vez", () => {
    const bundle = buildReplayBundle({ context: context(), snapshotId: "snap-1" });
    const ids = bundle.referencedChampions.map((entry) => entry.championId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("`capturedAt` não altera o hash; `evaluatedAt` altera", () => {
    const ctx = context();
    const a = buildReplayBundle({ context: ctx, snapshotId: "s", capturedAt: "2026-07-31T12:00:01.000Z" });
    const b = buildReplayBundle({ context: ctx, snapshotId: "s", capturedAt: "2027-01-01T00:00:00.000Z" });
    const outro = buildReplayBundle({
      context: context({ evaluatedAt: "2026-08-01T00:00:00.000Z" }),
      snapshotId: "s"
    });

    expect(a.contentHash).toBe(b.contentHash);
    expect(outro.contentHash).not.toBe(a.contentHash);
  });

  it("alteração posterior das estatísticas muda o hash do bundle novo, não do já construído", () => {
    const original = buildReplayBundle({ context: context(), snapshotId: "s" });
    const depois = buildReplayBundle({
      context: context({ championStats: [{ ...stats(), games: 99 }] }),
      snapshotId: "s"
    });

    expect(depois.contentHash).not.toBe(original.contentHash);
    // O bundle já construído continua íntegro contra o próprio conteúdo.
    expect(validateReplayInputBundle(original, { computeHash: sha256 }).valid).toBe(true);
  });

  it("o bundle produzido é válido pelo contrato da Etapa 26a", () => {
    const result = validateReplayInputBundle(buildReplayBundle({ context: context(), snapshotId: "s" }));

    expect(result.valid).toBe(true);
    expect(result.rejections).toEqual([]);
  });

  it("bundle adulterado falha na validação de hash", () => {
    const bundle = buildReplayBundle({ context: context(), snapshotId: "s" });
    const adulterado = { ...bundle, evaluatedAt: "2030-01-01T00:00:00.000Z" };

    const result = validateReplayInputBundle(adulterado, { computeHash: sha256 });
    expect(result.rejections.some((entry) => entry.code === "CONTENT_HASH_MISMATCH")).toBe(true);
    // O bundle intacto passa com a mesma funcao de hash.
    expect(validateReplayInputBundle(bundle, { computeHash: sha256 }).valid).toBe(true);
  });

  it("declara o schema versionado", () => {
    expect(buildReplayBundle({ context: context(), snapshotId: "s" }).schemaVersion).toBe(
      REPLAY_BUNDLE_SCHEMA_VERSION
    );
  });

  it("não carrega puuid, credencial nem dado pós-partida", () => {
    const serialized = JSON.stringify(buildReplayBundle({ context: context(), snapshotId: "s" }));
    for (const forbidden of ["puuid", "token", "apiKey", "lockfile", "timeline", "postGame"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("o replay reconstrói o resultado do motor sem consultar nada", () => {
    const ctx = context();
    const engine = runEngine(ctx);
    const bundle = buildReplayBundle({ context: ctx, snapshotId: "snap-1" });

    const snapshot = [...engine.primaryRecommendations, ...engine.alternatives].map(
      (entry, index) => ({
        championId: entry.championId,
        championName: entry.championName,
        rank: entry.rank,
        group:
          index < engine.primaryRecommendations.length
            ? ("PRIMARY" as const)
            : ("ALTERNATIVE" as const),
        totalScore: entry.totalScore,
        dataCoverage: entry.dataCoverage,
        poolSource: entry.poolSource,
        personalGames: entry.personalGames,
        metricDetails: entry.metricDetails ?? [],
        effectiveWeights: entry.effectiveWeights ?? {},
        category: entry.category,
        reasons: [],
        warnings: [],
        limitations: []
      })
    );

    const verification = verifyReplayBundle({ bundle, snapshot });
    expect(verification.status).toBe("EXACT_REPLAY");
    expect(verification.divergences).toEqual([]);
  });
});
