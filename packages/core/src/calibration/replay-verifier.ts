import { recommendFromPersonalPool } from "../draft/recommendation-engine.js";
import type { PersistedRecommendation } from "../draft/recommendation-snapshot.js";
import type { DraftPick, DraftState } from "../types/domain.js";
import type { RecommendationMetricKey } from "../types/recommendation-metric.js";
import type { EffectiveRecommendationConfiguration } from "../release/effective-configuration.js";
import {
  REPLAY_BUNDLE_SCHEMA_VERSION,
  validateReplayInputBundle,
  type BundleRejection,
  type ReplayInputBundle
} from "./replay-input-bundle.js";

/**
 * Verificador offline do `ReplayInputBundle`.
 *
 * Recebe **apenas** o bundle, o snapshot esperado e a implementação registrada.
 * Não existe parâmetro por onde um repositório, tabela mutável ou estado atual
 * pudesse entrar: a reconstrução usa exclusivamente o que foi congelado.
 *
 * Divergência é **relatada, nunca corrigida** — o resultado reconstruído não é
 * ajustado para coincidir com o persistido.
 */

/** Tolerância numérica da reconstrução, em pontos de score. */
export const REPLAY_VERIFICATION_TOLERANCE = 0.05;

/** Tolerância da cobertura, que vive na escala 0-1. */
export const REPLAY_COVERAGE_TOLERANCE = 1e-6;

export type ReplayVerificationStatus =
  | "EXACT_REPLAY"
  | "REPLAY_INTEGRITY_FAILED"
  | "UNSUPPORTED_BUNDLE_SCHEMA"
  | "UNSUPPORTED_ALGORITHM_VERSION"
  | "INVALID_BUNDLE"
  | "MISSING_DEPENDENCY";

export interface ReplayDivergence {
  championId?: number;
  field: string;
  expected: number | string | null;
  reconstructed: number | string | null;
  delta?: number;
}

export interface ReplayVerificationResult {
  status: ReplayVerificationStatus;
  divergences: ReplayDivergence[];
  rejections: BundleRejection[];
  missingDependencies: { metric: RecommendationMetricKey; reason: string }[];
  /** Implementação efetivamente usada, quando alguma foi selecionada. */
  replayImplementation?: string;
}

/** Assinatura de uma implementação de replay registrada por versão. */
export type ReplayImplementation = (
  bundle: ReplayInputBundle
) => { championId: number; championName: string; totalScore: number; dataCoverage: number; rank: number; group: "PRIMARY" | "ALTERNATIVE"; metricValues: Partial<Record<RecommendationMetricKey, number | null>> }[];

/**
 * Reconstrói `DraftState` a partir do bundle.
 *
 * `championName` de aliados e inimigos vem de `referencedChampions`: guardar o
 * nome duas vezes criaria duas cópias que poderiam divergir.
 *
 * Exportada (Etapa 27a) para `release/laboratory-equivalence.ts` reusar a
 * mesma reconstrução em vez de duplicá-la — mudança puramente aditiva, o
 * comportamento da 26a não muda.
 */
export function draftStateFrom(bundle: ReplayInputBundle): DraftState {
  const names = new Map(bundle.referencedChampions.map((entry) => [entry.championId, entry.championName]));
  const pick =
    (team: DraftPick["team"]) =>
    (entry: { championId: number; role?: DraftPick["role"] }): DraftPick => ({
      championId: entry.championId,
      championName: names.get(entry.championId) ?? "",
      team,
      ...(entry.role ? { role: entry.role } : {})
    });

  return {
    playerRole: bundle.draft.role,
    playerRoleSource: bundle.draft.roleSource,
    pickOrder: bundle.draft.pickOrder,
    allies: bundle.draft.allies.map(pick("ally")),
    enemies: bundle.draft.enemies.map(pick("enemy")),
    bannedChampionIds: [...bundle.draft.bannedChampionIds],
    ...(bundle.draft.directOpponentChampionId !== undefined
      ? { enemyLaneChampionId: bundle.draft.directOpponentChampionId }
      : {}),
    ...(bundle.draft.selectedChampionId !== undefined
      ? { selectedChampionId: bundle.draft.selectedChampionId }
      : {}),
    ...(bundle.draft.patch ? { patch: bundle.draft.patch } : {})
  };
}

/**
 * Implementação de replay do motor atual.
 *
 * Chama exatamente `recommendFromPersonalPool`, a mesma função do caminho
 * operacional, alimentada só pelo bundle. `evaluatedAt` vem congelado — usar
 * `new Date()` aqui faria a recência do risco mudar a cada execução.
 *
 * `configuration` (Etapa 27a, opcional) permite rodar o mesmo bundle com uma
 * configuração de release em vez da baseline — usado por
 * `release/laboratory-equivalence.ts` para provar que o motor operacional,
 * alimentado por dado histórico real, reproduz o que o laboratório calculou
 * a partir de métricas congeladas. Omitido, o comportamento é exatamente o
 * de antes desta etapa.
 */
export function replayRecommendationEngineV1(
  bundle: ReplayInputBundle,
  configuration?: EffectiveRecommendationConfiguration
): ReturnType<ReplayImplementation> {
  const tags = bundle.referencedChampions
    .map((entry) => entry.championTag)
    .filter((tag): tag is NonNullable<typeof tag> => tag !== null);
  const capabilities = bundle.referencedChampions
    .map((entry) => entry.capabilityProfile)
    .filter((profile): profile is NonNullable<typeof profile> => profile !== null);

  const response = recommendFromPersonalPool({
    draft: draftStateFrom(bundle),
    candidates: bundle.candidates.map((candidate) => ({
      championId: candidate.championId,
      championName: candidate.championName,
      role: candidate.role,
      source: candidate.poolSource,
      enabled: candidate.enabled
    })),
    championStats: bundle.player.championStats,
    championTags: tags,
    capabilityProfiles: capabilities,
    matchups: bundle.player.matchups,
    compositionRules: bundle.activeParameters.compositionRules,
    patchMeta: null,
    evaluatedAt: bundle.evaluatedAt,
    ...(configuration ? { configuration } : {})
  });

  const collect = (
    entries: readonly (typeof response.primaryRecommendations)[number][],
    group: "PRIMARY" | "ALTERNATIVE"
  ) =>
    entries.map((entry) => ({
      championId: entry.championId,
      championName: entry.championName,
      totalScore: entry.totalScore,
      dataCoverage: entry.dataCoverage,
      rank: entry.rank,
      group,
      metricValues: Object.fromEntries(
        (entry.metricDetails ?? []).map((metric) => [metric.key, metric.value])
      ) as Partial<Record<RecommendationMetricKey, number | null>>
    }));

  return [
    ...collect(response.primaryRecommendations, "PRIMARY"),
    ...collect(response.alternatives, "ALTERNATIVE")
  ];
}

/**
 * Registro explícito de implementações por versão.
 *
 * Versão histórica ausente do registro **não** cai no motor atual: preservar a
 * versão declarada no snapshot e recusar é o que impede um replay silenciosamente
 * errado. Não é objetivo desta etapa preservar todas as versões antigas.
 */
export const replayEngines: Record<string, ReplayImplementation> = {
  "recommendation-engine/1.0.0": replayRecommendationEngineV1
};

/** Chave de registro a partir das versões declaradas no bundle. */
export function replayEngineKey(bundle: ReplayInputBundle): string {
  return `recommendation-engine/${bundle.algorithmVersions.recommendationEngine ?? "desconhecida"}`;
}

export interface VerifyReplayInput {
  bundle: ReplayInputBundle;
  /** Candidatos persistidos no snapshot que o bundle acompanha. */
  snapshot: readonly PersistedRecommendation[];
  /** Registro a consultar. Injetado para o teste poder simular versão ausente. */
  registry?: Record<string, ReplayImplementation>;
  computeHash?: (canonical: string) => string;
}

/**
 * Reconstrói métricas, cobertura, score, grupo e ranking a partir do bundle e
 * compara com o snapshot persistido.
 */
export function verifyReplayBundle(input: VerifyReplayInput): ReplayVerificationResult {
  const { bundle } = input;
  const registry = input.registry ?? replayEngines;
  const empty = { divergences: [], rejections: [], missingDependencies: [] };

  if (bundle.schemaVersion !== REPLAY_BUNDLE_SCHEMA_VERSION) {
    return {
      ...empty,
      status: "UNSUPPORTED_BUNDLE_SCHEMA",
      rejections: [
        {
          code: "UNSUPPORTED_SCHEMA",
          detail: `Schema ${bundle.schemaVersion} não é reconhecido por ${REPLAY_BUNDLE_SCHEMA_VERSION}.`
        }
      ]
    };
  }

  const validation = validateReplayInputBundle(bundle, {
    ...(input.computeHash ? { computeHash: input.computeHash } : {})
  });
  if (!validation.valid) {
    return { ...empty, status: "INVALID_BUNDLE", rejections: validation.rejections };
  }

  const missingDependencies = bundle.dependencyManifest
    .filter((entry) => entry.available === false && entry.requiredBundleSections.length > 0)
    .map((entry) => ({
      metric: entry.metric,
      reason: entry.unavailableReason ?? "Dependência declarada indisponível no instante do draft."
    }));

  const key = replayEngineKey(bundle);
  const implementation = registry[key];
  if (!implementation) {
    return {
      ...empty,
      status: "UNSUPPORTED_ALGORITHM_VERSION",
      missingDependencies,
      rejections: [
        {
          code: "UNSUPPORTED_SCHEMA",
          detail: `Nenhuma implementação de replay registrada para ${key}.`
        }
      ]
    };
  }

  const reconstructed = implementation(bundle);
  const byChampion = new Map(reconstructed.map((entry) => [entry.championId, entry]));
  const divergences: ReplayDivergence[] = [];

  for (const persisted of input.snapshot) {
    const entry = byChampion.get(persisted.championId);
    if (!entry) {
      divergences.push({
        championId: persisted.championId,
        field: "presenca",
        expected: persisted.championName,
        reconstructed: null
      });
      continue;
    }

    const scoreDelta = Math.abs(entry.totalScore - persisted.totalScore);
    if (scoreDelta > REPLAY_VERIFICATION_TOLERANCE) {
      divergences.push({
        championId: persisted.championId,
        field: "totalScore",
        expected: persisted.totalScore,
        reconstructed: entry.totalScore,
        delta: scoreDelta
      });
    }

    const coverageDelta = Math.abs(entry.dataCoverage - persisted.dataCoverage);
    if (coverageDelta > REPLAY_COVERAGE_TOLERANCE) {
      divergences.push({
        championId: persisted.championId,
        field: "dataCoverage",
        expected: persisted.dataCoverage,
        reconstructed: entry.dataCoverage,
        delta: coverageDelta
      });
    }

    if (entry.rank !== persisted.rank) {
      divergences.push({
        championId: persisted.championId,
        field: "rank",
        expected: persisted.rank,
        reconstructed: entry.rank
      });
    }

    if (entry.group !== persisted.group) {
      divergences.push({
        championId: persisted.championId,
        field: "group",
        expected: persisted.group,
        reconstructed: entry.group
      });
    }

    for (const metric of persisted.metricDetails ?? []) {
      const value = entry.metricValues[metric.key];
      const expected = metric.value;
      if (expected === null || expected === undefined) {
        if (value !== null && value !== undefined) {
          divergences.push({
            championId: persisted.championId,
            field: `metric.${metric.key}`,
            expected: null,
            reconstructed: value
          });
        }
        continue;
      }
      if (value === null || value === undefined) {
        divergences.push({
          championId: persisted.championId,
          field: `metric.${metric.key}`,
          expected,
          reconstructed: null
        });
        continue;
      }
      const delta = Math.abs(value - expected);
      if (delta > REPLAY_VERIFICATION_TOLERANCE) {
        divergences.push({
          championId: persisted.championId,
          field: `metric.${metric.key}`,
          expected,
          reconstructed: value,
          delta
        });
      }
    }
  }

  if (divergences.length > 0) {
    return {
      status: "REPLAY_INTEGRITY_FAILED",
      divergences,
      rejections: [],
      missingDependencies,
      replayImplementation: key
    };
  }

  if (missingDependencies.length > 0 && input.snapshot.length === 0) {
    return {
      status: "MISSING_DEPENDENCY",
      divergences: [],
      rejections: [],
      missingDependencies,
      replayImplementation: key
    };
  }

  return {
    status: "EXACT_REPLAY",
    divergences: [],
    rejections: [],
    missingDependencies,
    replayImplementation: key
  };
}

/**
 * Capacidade de replay de um snapshot (Etapa 26b completa os cinco estados).
 *
 * `REWEIGHT_ONLY` e `FULL_DERIVATION_REPLAY_UNAVAILABLE` cobrem ausência de
 * bundle ou de dependência histórica — a Etapa 25 continua reponderando o
 * congelado quando possível. `FULL_DERIVATION_REPLAY_INVALID` é distinto de
 * "indisponível": o bundle existe e foi verificado, mas não passou (violação
 * estrutural ou divergência entre reconstruído e persistido) — um sinal de
 * problema real, não de ausência. `FULL_DERIVATION_REPLAY_UNSUPPORTED_VERSION`
 * é sobre a versão declarada, não sobre o conteúdo.
 */
export type SnapshotReplayCapability =
  | "REWEIGHT_ONLY"
  | "FULL_DERIVATION_REPLAY_AVAILABLE"
  | "FULL_DERIVATION_REPLAY_UNAVAILABLE"
  | "FULL_DERIVATION_REPLAY_INVALID"
  | "FULL_DERIVATION_REPLAY_UNSUPPORTED_VERSION";

export interface SnapshotReplayCapabilityReport {
  capability: SnapshotReplayCapability;
  reason: string;
  /**
   * Se a reponderação da Etapa 25 continua possível, independente da
   * capacidade acima — informação que se perderia se fosse só o `capability`.
   */
  reweightAvailable: boolean;
  bundleSchemaVersion?: string;
  contentHash?: string;
  capturedAt?: string;
  algorithmVersions?: Record<string, string>;
  verificationStatus?: ReplayVerificationStatus;
  missingDependencies: { metric: RecommendationMetricKey; reason: string }[];
}

/**
 * Classifica um snapshot. Snapshot anterior à captura prospectiva não é
 * corrompido nem preenchido retroativamente: ele simplesmente não tinha os
 * inputs preservados, e isso é dito com essas palavras.
 */
export function describeSnapshotReplayCapability(input: {
  bundle?: ReplayInputBundle | null;
  verification?: ReplayVerificationResult | null;
  /** `true` quando a Etapa 25 consegue reconstruir a agregação congelada. */
  reweightAvailable: boolean;
}): SnapshotReplayCapabilityReport {
  if (!input.bundle) {
    return {
      capability: input.reweightAvailable ? "REWEIGHT_ONLY" : "FULL_DERIVATION_REPLAY_UNAVAILABLE",
      reason: "Os inputs de derivação não eram preservados nesta versão.",
      reweightAvailable: input.reweightAvailable,
      missingDependencies: []
    };
  }

  const common = {
    bundleSchemaVersion: input.bundle.schemaVersion,
    contentHash: input.bundle.contentHash,
    capturedAt: input.bundle.capturedAt,
    algorithmVersions: { ...input.bundle.algorithmVersions },
    reweightAvailable: input.reweightAvailable,
    missingDependencies: input.verification?.missingDependencies ?? []
  };

  if (!input.verification) {
    return {
      ...common,
      capability: "FULL_DERIVATION_REPLAY_UNAVAILABLE",
      reason: "Bundle presente, mas a integridade ainda não foi verificada."
    };
  }

  const status = input.verification.status;

  if (status === "EXACT_REPLAY") {
    return {
      ...common,
      capability: "FULL_DERIVATION_REPLAY_AVAILABLE",
      reason: "Replay completo disponível.",
      verificationStatus: status
    };
  }

  if (status === "UNSUPPORTED_ALGORITHM_VERSION" || status === "UNSUPPORTED_BUNDLE_SCHEMA") {
    return {
      ...common,
      capability: "FULL_DERIVATION_REPLAY_UNSUPPORTED_VERSION",
      reason:
        status === "UNSUPPORTED_ALGORITHM_VERSION"
          ? "Versão histórica do motor não suportada."
          : "Schema do bundle não suportado por esta versão.",
      verificationStatus: status
    };
  }

  if (status === "INVALID_BUNDLE" || status === "REPLAY_INTEGRITY_FAILED") {
    return {
      ...common,
      capability: "FULL_DERIVATION_REPLAY_INVALID",
      reason:
        status === "INVALID_BUNDLE"
          ? "O bundle não passou na validação estrutural."
          : "O replay reconstruído diverge do resultado persistido.",
      verificationStatus: status
    };
  }

  // MISSING_DEPENDENCY: dependência histórica ausente, não violação nem versão.
  return {
    ...common,
    capability: input.reweightAvailable
      ? "REWEIGHT_ONLY"
      : "FULL_DERIVATION_REPLAY_UNAVAILABLE",
    reason: "Dependência histórica ausente no bundle.",
    verificationStatus: status
  };
}
