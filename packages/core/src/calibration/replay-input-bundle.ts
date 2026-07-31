import type {
  ChampionTag,
  CompositionRules,
  MatchupData,
  PlayerChampionStats,
  Role
} from "../types/domain.js";
import type { ChampionCapabilityProfile } from "../types/champion-capability.js";
import type { PlayerChampionPoolSource } from "../types/player-champion-pool.js";
import type { DataProvenance } from "../types/provenance.js";
import type { RecommendationMetricKey } from "../types/recommendation-metric.js";

/**
 * `ReplayInputBundle` — captura **prospectiva** dos inputs de derivação.
 *
 * ## Por que ele existe
 *
 * A Etapa 25 provou que o snapshot permite reponderar métricas já congeladas,
 * mas não reproduzir como elas foram **produzidas**: `PlayerChampionStats`,
 * `ChampionTag`, capacidades e agregados de matchup são recalculados a cada
 * sync e sobrescritos. Sem preservar esses inputs no instante do draft, testar
 * um threshold de derivação exigiria ler o dado de hoje — vazamento temporal.
 *
 * O bundle guarda, junto de cada snapshot **novo**, exatamente o que o motor
 * consultou naquele instante. Snapshots anteriores continuam sem bundle: este
 * módulo **nunca** reconstrói o passado a partir do estado atual.
 *
 * ## O que a auditoria da Etapa 26 mudou no desenho
 *
 * 1. **Não basta o candidato.** `analyzeTeamComposition` e `analyzeDraftStrategy`
 *    leem tags e capacidades de aliados e inimigos também. `referencedChampions`
 *    cobre todo campeão consultado, com o papel explícito.
 * 2. **`evaluatedAt` é input, não metadado.** `assessExecutionRisk` o usa para
 *    medir recência, então ele entra no `contentHash` — senão o replay mudaria
 *    de resultado a cada dia. `capturedAt` é o oposto: metadado, fora do hash.
 * 3. **Catálogo não é endereçável por conteúdo.** Tags e capacidades vivem em
 *    linhas mutáveis semeadas de arquivos regeneráveis; não passam no critério
 *    de artefato imutável. Por isso os campos normalizados são **embutidos**,
 *    não referenciados.
 *
 * ## O que nunca entra
 *
 * Resultado da partida, Match-V5 da partida ainda não jogada, timeline, KDA,
 * build utilizada, relatório pós-game e revisão pós-resultado não têm campo
 * neste contrato. Também não entram credenciais, tokens, lockfile, payload
 * bruto da Riot ou do LCU, nem identificador pessoal desnecessário — o bundle
 * não carrega `puuid`.
 */

export const REPLAY_BUNDLE_SCHEMA_VERSION = "replay-input-bundle/1.0.0";

/** Papel do campeão dentro da análise que consultou o perfil dele. */
export type ReplayChampionRole = "CANDIDATE" | "ALLY" | "ENEMY" | "DIRECT_OPPONENT";

export interface ReplayDraftContext {
  role: Role;
  roleSource: "LCU" | "USER";
  /** Ordem de pick: escalar funcional (`<= 1` significa blind pick no motor). */
  pickOrder: number;
  queueId?: number;
  patch?: string;
  /** Pool efetivamente avaliado, com origem por entrada. */
  pool: { championId: number; source: PlayerChampionPoolSource }[];
  allies: { championId: number; role?: Role }[];
  enemies: { championId: number; role?: Role }[];
  bannedChampionIds: number[];
  directOpponentChampionId?: number;
  selectedChampionId?: number;
}

/**
 * Dados pessoais que a derivação consumiu. Sem `puuid`: a identidade do jogador
 * não participa de nenhum cálculo, e guardá-la seria dado pessoal sem uso.
 */
export interface ReplayPlayerContext {
  /** Estatísticas por campeão e posição, como estavam no instante do draft. */
  championStats: PlayerChampionStats[];
  /** Agregado de matchup já calculado, com amostra e confiança preservadas. */
  matchups: MatchupData[];
  /** Por que um input pessoal não estava disponível. */
  unavailableReasons: { input: string; reason: string }[];
}

/**
 * Perfil de um campeão consultado. Um campeão aparece **uma vez**, com todos os
 * papéis que exerceu — duplicar por papel inflaria o bundle e criaria duas
 * cópias que poderiam divergir.
 */
export interface ReplayChampionContext {
  championId: number;
  championName: string;
  roles: ReplayChampionRole[];
  /** Campos normalizados de `ChampionTag`, embutidos (inclui dificuldade oficial). */
  championTag: ChampionTag | null;
  capabilityProfile: ChampionCapabilityProfile | null;
  /** Origem declarada das duas fontes acima, quando conhecida. */
  sourceVersions: Record<string, string>;
  unavailableReasons: { input: string; reason: string }[];
}

/** Parâmetros ativos da derivação naquele instante. */
export interface ReplayActiveParameters {
  /**
   * Regras de composição embutidas. A versão só identifica o conjunto se ele
   * vier junto — por isso o conteúdo é preservado, e a versão é rótulo.
   */
  compositionRules: CompositionRules;
  compositionRulesVersion: string;
  /** `PatchMetaData` permanece indisponível (Etapa 18); registrado como fato. */
  patchMetaAvailable: boolean;
}

export interface ReplayDependencyManifest {
  metric: RecommendationMetricKey;
  derivationVersion: string;
  /** Inputs exigidos pela derivação desta métrica. */
  requiredInputs: string[];
  /** Partes do bundle necessárias para reproduzi-la. */
  requiredBundleSections: ("draft" | "player" | "referencedChampions" | "activeParameters")[];
  activeParameters: string[];
  available: boolean;
  unavailableReason?: string;
}

export interface ReplayInputBundle {
  schemaVersion: string;
  snapshotId: string;

  /** Instante da avaliação. **Entra** no hash: alimenta a recência do risco. */
  evaluatedAt: string;
  /** Instante da captura. **Não** entra no hash: é metadado. */
  capturedAt: string;

  contentHash: string;
  algorithmVersions: Record<string, string>;

  draft: ReplayDraftContext;
  player: ReplayPlayerContext;
  candidates: ReplayCandidateContext[];
  referencedChampions: ReplayChampionContext[];

  activeParameters: ReplayActiveParameters;
  dependencyManifest: ReplayDependencyManifest[];
  provenance: DataProvenance;
}

export interface ReplayCandidateContext {
  championId: number;
  championName: string;
  role: Role;
  poolSource: PlayerChampionPoolSource;
  /** `false` quando o pool tinha a entrada desabilitada no instante do draft. */
  enabled: boolean;
}

/* ------------------------------------------------------------------ */
/* Canonicalização                                                     */
/* ------------------------------------------------------------------ */

function sortedEntries<T>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right, "en"));
}

function byChampionId<T extends { championId: number }>(list: readonly T[]): T[] {
  return [...list].sort((left, right) => left.championId - right.championId);
}

/**
 * Serialização canônica do conteúdo funcional.
 *
 * ## O que é ordenado e o que não é
 *
 * Pool, aliados, inimigos, bans, candidatos e campeões referenciados são
 * **conjuntos**: o motor os desduplica, agrega por média ou indexa por id, e a
 * ordenação final dos candidatos é por score com desempate por `championId`
 * (verificado por teste na Etapa 25a). Ordená-los por `championId` é seguro.
 *
 * `pickOrder` é escalar e permanece intocado — ele muda a tabela de pesos.
 * `recentMatches` dentro de `PlayerChampionStats` **não** é reordenado: a forma
 * recente pondera por índice, então ali a ordem é semântica.
 *
 * `capturedAt` e o próprio `contentHash` ficam de fora por definição.
 */
export function canonicalBundleContent(
  bundle: Omit<ReplayInputBundle, "contentHash">
): string {
  return JSON.stringify({
    schemaVersion: bundle.schemaVersion,
    snapshotId: bundle.snapshotId,
    evaluatedAt: bundle.evaluatedAt,
    algorithmVersions: sortedEntries(bundle.algorithmVersions),
    draft: {
      role: bundle.draft.role,
      roleSource: bundle.draft.roleSource,
      pickOrder: bundle.draft.pickOrder,
      queueId: bundle.draft.queueId ?? null,
      patch: bundle.draft.patch ?? null,
      pool: byChampionId(bundle.draft.pool).map((entry) => [entry.championId, entry.source]),
      allies: byChampionId(bundle.draft.allies).map((entry) => [
        entry.championId,
        entry.role ?? null
      ]),
      enemies: byChampionId(bundle.draft.enemies).map((entry) => [
        entry.championId,
        entry.role ?? null
      ]),
      bannedChampionIds: [...new Set(bundle.draft.bannedChampionIds)].sort((a, b) => a - b),
      directOpponentChampionId: bundle.draft.directOpponentChampionId ?? null,
      selectedChampionId: bundle.draft.selectedChampionId ?? null
    },
    player: {
      championStats: [...bundle.player.championStats]
        .sort(
          (left, right) =>
            left.championId - right.championId || left.role.localeCompare(right.role, "en")
        )
        // `recentMatches` preserva a ordem: a forma recente pondera por índice.
        .map((stats) => stableStringify(stats)),
      matchups: [...bundle.player.matchups]
        .sort(
          (left, right) =>
            left.championId - right.championId ||
            left.enemyChampionId - right.enemyChampionId ||
            left.role.localeCompare(right.role, "en")
        )
        .map((entry) => stableStringify(entry)),
      unavailableReasons: [...bundle.player.unavailableReasons]
        .map((entry) => `${entry.input}|${entry.reason}`)
        .sort((left, right) => left.localeCompare(right, "en"))
    },
    candidates: byChampionId(bundle.candidates).map((entry) => [
      entry.championId,
      entry.championName,
      entry.role,
      entry.poolSource,
      entry.enabled
    ]),
    referencedChampions: byChampionId(bundle.referencedChampions).map((entry) => [
      entry.championId,
      entry.championName,
      [...entry.roles].sort((left, right) => left.localeCompare(right, "en")),
      entry.championTag ? stableStringify(entry.championTag) : null,
      entry.capabilityProfile ? stableStringify(entry.capabilityProfile) : null,
      sortedEntries(entry.sourceVersions),
      [...entry.unavailableReasons]
        .map((reason) => `${reason.input}|${reason.reason}`)
        .sort((left, right) => left.localeCompare(right, "en"))
    ]),
    activeParameters: {
      compositionRules: stableStringify(bundle.activeParameters.compositionRules),
      compositionRulesVersion: bundle.activeParameters.compositionRulesVersion,
      patchMetaAvailable: bundle.activeParameters.patchMetaAvailable
    },
    dependencyManifest: [...bundle.dependencyManifest]
      .sort((left, right) => left.metric.localeCompare(right.metric, "en"))
      .map((entry) => [
        entry.metric,
        entry.derivationVersion,
        [...entry.requiredInputs].sort((a, b) => a.localeCompare(b, "en")),
        [...entry.requiredBundleSections].sort((a, b) => a.localeCompare(b, "en")),
        [...entry.activeParameters].sort((a, b) => a.localeCompare(b, "en")),
        entry.available,
        entry.unavailableReason ?? null
      ])
  });
}

/**
 * `JSON.stringify` com chaves ordenadas em qualquer profundidade. Arrays
 * preservam a ordem — só a ordem **acidental de objeto** é neutralizada.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeKeys(value));
}

function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, entry]) => [key, normalizeKeys(entry)])
    );
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Validação                                                           */
/* ------------------------------------------------------------------ */

export type BundleRejectionCode =
  | "UNSUPPORTED_SCHEMA"
  | "MISSING_CHAMPION_PROFILE"
  | "CANDIDATE_NOT_REFERENCED"
  | "INCONSISTENT_ROLE"
  | "INVALID_EVALUATED_AT"
  | "MISSING_ALGORITHM_VERSION"
  | "NON_FINITE_PARAMETER"
  | "DUPLICATE_CHAMPION"
  | "DEPENDENCY_WITHOUT_INPUTS"
  | "CONTENT_HASH_MISMATCH";

export interface BundleRejection {
  code: BundleRejectionCode;
  detail: string;
  championId?: number;
  metric?: RecommendationMetricKey;
}

export interface BundleValidationResult {
  valid: boolean;
  rejections: BundleRejection[];
}

/** Versões de algoritmo que todo bundle precisa declarar. */
export const REQUIRED_ALGORITHM_VERSIONS = [
  "recommendationEngine",
  "championTagDerivation",
  "executionRisk",
  "draftStrategy"
] as const;

/**
 * Valida o bundle sem consultar nada externo.
 *
 * `computeHash` é injetado porque `packages/core` também roda no renderer e não
 * pode depender de `node:crypto`. Sem ele, a verificação de hash é pulada e
 * declarada — nunca dada como aprovada em silêncio.
 */
export function validateReplayInputBundle(
  bundle: ReplayInputBundle,
  options: { computeHash?: (canonical: string) => string } = {}
): BundleValidationResult {
  const rejections: BundleRejection[] = [];

  if (bundle.schemaVersion !== REPLAY_BUNDLE_SCHEMA_VERSION) {
    rejections.push({
      code: "UNSUPPORTED_SCHEMA",
      detail: `Schema ${bundle.schemaVersion} não é reconhecido por ${REPLAY_BUNDLE_SCHEMA_VERSION}.`
    });
    return { valid: false, rejections };
  }

  if (!bundle.evaluatedAt || Number.isNaN(Date.parse(bundle.evaluatedAt))) {
    rejections.push({
      code: "INVALID_EVALUATED_AT",
      detail: "`evaluatedAt` precisa ser um instante ISO válido: ele alimenta a recência."
    });
  }

  for (const key of REQUIRED_ALGORITHM_VERSIONS) {
    if (!bundle.algorithmVersions?.[key]) {
      rejections.push({
        code: "MISSING_ALGORITHM_VERSION",
        detail: `Versão obrigatória ausente: ${key}.`
      });
    }
  }

  const seen = new Set<number>();
  for (const champion of bundle.referencedChampions) {
    if (seen.has(champion.championId)) {
      rejections.push({
        code: "DUPLICATE_CHAMPION",
        detail: "O mesmo campeão aparece duas vezes; papéis devem ser acumulados numa entrada.",
        championId: champion.championId
      });
    }
    seen.add(champion.championId);
    if (champion.roles.length === 0) {
      rejections.push({
        code: "INCONSISTENT_ROLE",
        detail: "Campeão referenciado sem nenhum papel declarado.",
        championId: champion.championId
      });
    }
  }

  const referenced = new Map(bundle.referencedChampions.map((entry) => [entry.championId, entry]));

  for (const candidate of bundle.candidates) {
    const profile = referenced.get(candidate.championId);
    if (!profile) {
      rejections.push({
        code: "CANDIDATE_NOT_REFERENCED",
        detail: "Candidato avaliado sem perfil em `referencedChampions`.",
        championId: candidate.championId
      });
      continue;
    }
    if (!profile.roles.includes("CANDIDATE")) {
      rejections.push({
        code: "INCONSISTENT_ROLE",
        detail: "Candidato avaliado cujo perfil não declara o papel CANDIDATE.",
        championId: candidate.championId
      });
    }
  }

  const draftChampionIds = [
    ...bundle.draft.allies.map((entry) => entry.championId),
    ...bundle.draft.enemies.map((entry) => entry.championId),
    ...(bundle.draft.directOpponentChampionId !== undefined
      ? [bundle.draft.directOpponentChampionId]
      : [])
  ];
  for (const championId of new Set(draftChampionIds)) {
    if (!referenced.has(championId)) {
      rejections.push({
        code: "MISSING_CHAMPION_PROFILE",
        detail:
          "Campeão do draft sem perfil embutido; sem ele a análise estratégica não é reproduzível.",
        championId
      });
    }
  }

  const rules = bundle.activeParameters?.compositionRules;
  for (const [key, value] of Object.entries(rules ?? {})) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      rejections.push({
        code: "NON_FINITE_PARAMETER",
        detail: `Regra de composição não finita: ${key}.`
      });
    }
  }

  for (const dependency of bundle.dependencyManifest) {
    if (!dependency.available) continue;
    const missing = dependency.requiredBundleSections.filter((section) => {
      if (section === "player") return bundle.player === undefined;
      if (section === "referencedChampions") return bundle.referencedChampions.length === 0;
      if (section === "activeParameters") return bundle.activeParameters === undefined;
      return bundle.draft === undefined;
    });
    if (missing.length > 0) {
      rejections.push({
        code: "DEPENDENCY_WITHOUT_INPUTS",
        detail: `Métrica declarada disponível sem as seções ${missing.join(", ")}.`,
        metric: dependency.metric
      });
    }
  }

  if (options.computeHash) {
    const expected = options.computeHash(canonicalBundleContent(bundle));
    if (expected !== bundle.contentHash) {
      rejections.push({
        code: "CONTENT_HASH_MISMATCH",
        detail: `Conteúdo não corresponde ao hash declarado (esperado ${expected}).`
      });
    }
  }

  return { valid: rejections.length === 0, rejections };
}

/**
 * Manifesto de dependências do motor atual. Declarado a partir do grafo real
 * medido na auditoria da Etapa 26 — não é uma lista aspiracional.
 */
export function buildDependencyManifest(input: {
  algorithmVersions: Record<string, string>;
  availability: Partial<Record<RecommendationMetricKey, { available: boolean; reason?: string }>>;
}): ReplayDependencyManifest[] {
  const version = (key: string) => input.algorithmVersions[key] ?? "desconhecida";
  const state = (metric: RecommendationMetricKey) =>
    input.availability[metric] ?? { available: true };

  const entry = (
    metric: RecommendationMetricKey,
    derivationVersion: string,
    requiredInputs: string[],
    requiredBundleSections: ReplayDependencyManifest["requiredBundleSections"],
    activeParameters: string[]
  ): ReplayDependencyManifest => {
    const current = state(metric);
    return {
      metric,
      derivationVersion,
      requiredInputs,
      requiredBundleSections,
      activeParameters,
      available: current.available,
      ...(current.reason ? { unavailableReason: current.reason } : {})
    };
  };

  return [
    entry(
      "PERSONAL_PERFORMANCE",
      version("recommendationEngine"),
      ["PlayerChampionStats"],
      ["player"],
      ["weights", "MIN_GAMES_FOR_RANKING"]
    ),
    entry(
      "RECENT_FORM",
      version("recommendationEngine"),
      ["PlayerChampionStats.recentMatches"],
      ["player"],
      ["recencyDecayFactor"]
    ),
    entry(
      "PERSONAL_MATCHUP",
      version("recommendationEngine"),
      ["MatchupData", "draft.directOpponentChampionId"],
      ["player", "draft"],
      ["matchupShrinkageK"]
    ),
    entry(
      "BLIND_SAFETY",
      version("championTagDerivation"),
      ["ChampionTag.blindSafety"],
      ["referencedChampions"],
      []
    ),
    entry(
      "ALLY_SYNERGY",
      version("championTagDerivation"),
      ["ChampionTag do candidato e dos aliados", "draft.allies"],
      ["referencedChampions", "draft"],
      ["compositionRules"]
    ),
    entry(
      "ENEMY_COMPOSITION_ANSWER",
      version("draftStrategy"),
      ["ChampionCapabilityProfile e ChampionTag de candidato, aliados e inimigos", "draft.enemies"],
      ["referencedChampions", "draft"],
      []
    ),
    entry(
      "TEAM_COMPOSITION",
      version("draftStrategy"),
      ["ChampionCapabilityProfile e ChampionTag de candidato e aliados", "draft.allies"],
      ["referencedChampions", "draft"],
      ["compositionRules"]
    ),
    entry(
      "META_STRENGTH",
      version("recommendationEngine"),
      ["Fonte global de meta"],
      [],
      []
    ),
    entry(
      "PERSONAL_EXPERIENCE",
      version("executionRisk"),
      ["PlayerChampionStats.games", "PlayerChampionStats.recentMatches", "evaluatedAt"],
      ["player"],
      []
    ),
    entry(
      "CHAMPION_DIFFICULTY",
      version("executionRisk"),
      ["ChampionTag.officialDifficulty"],
      ["referencedChampions"],
      []
    ),
    entry(
      "EXECUTION_RISK",
      version("executionRisk"),
      ["ChampionTag.officialDifficulty", "PlayerChampionStats", "evaluatedAt"],
      ["player", "referencedChampions"],
      ["EXECUTION_RISK_PENALTY_START", "EXECUTION_RISK_MAX_PENALTY", "MAX_FAMILIARITY_RISK_RELIEF"]
    )
  ];
}
