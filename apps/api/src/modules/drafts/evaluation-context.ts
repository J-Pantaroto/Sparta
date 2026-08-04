import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  CHAMPION_TAG_DERIVATION_VERSION,
  DRAFT_STRATEGIC_ANALYSIS_VERSION,
  EXECUTION_RISK_VERSION,
  RECOMMENDATION_ENGINE_VERSION,
  REPLAY_BUNDLE_SCHEMA_VERSION,
  THREAT_RESPONSE_MODEL_VERSION,
  buildBaselineConfiguration,
  buildDependencyManifest,
  canonicalBundleContent,
  recommendFromPersonalPool,
  type ChampionTag,
  type DraftRecommendationResponse,
  type DraftState,
  type EffectiveRecommendationConfiguration,
  type MatchupData,
  type PlayerChampionStats,
  type ReplayChampionContext,
  type ReplayChampionRole,
  type ReplayInputBundle,
  type Role
} from "@sparta/core";
import type { ChampionCapabilityProfile } from "@sparta/core";
import { compositionRules } from "../../config/composition-rules.js";
import { findAllChampionTags } from "../catalog/champion-repository.js";
import { findAllChampionCapabilityProfiles } from "../catalog/champion-capability-repository.js";
import { findPersonalLaneMatchupHistory } from "../matches/matchup-repository.js";
import { findChampionStatsByPuuid } from "../players/player-stats-repository.js";
import { findPlayerPool } from "../players/player-pool-repository.js";
import { aggregateMatchupData } from "@sparta/core";
import {
  resolveActiveConfiguration,
  type ResolvedRecommendationConfiguration
} from "../release/active-configuration-provider.js";
import type { FastifyBaseLogger } from "fastify";

/**
 * Contexto de avaliacao imutavel (Etapa 26b).
 *
 * ## Por que existe
 *
 * Antes desta etapa a rota lia os repositorios e passava um **subconjunto
 * re-derivado** para a persistencia: `championStats`, `matchups` e
 * `evaluatedAt` nem chegavam la. Capturar um bundle a partir dali exigiria
 * consultar o banco uma segunda vez, e uma escrita concorrente entre as duas
 * leituras produziria snapshot e bundle de **momentos diferentes** — dois
 * registros que se apresentam como o mesmo instante sem serem.
 *
 * Agora as fontes mutaveis sao lidas **uma unica vez**, congeladas aqui, e a
 * mesma instancia alimenta motor, snapshot e bundle. `evaluatedAt` nasce junto
 * com o contexto porque ele alimenta a recencia do risco de execucao: gerar um
 * segundo instante na captura mudaria a derivacao.
 *
 * Nenhum peso, threshold, formula ou ordenacao mudou — este modulo so reorganiza
 * de onde os inputs vem.
 */

export interface EvaluationContext {
  readonly evaluatedAt: string;
  readonly riotAccountId?: string;
  readonly role: Role;
  readonly draft: DraftState;
  readonly pool: readonly {
    championId: number;
    championName: string;
    role: Role;
    source: "PERSONAL_OBSERVED" | "USER_PROVIDED";
    enabled: boolean;
  }[];
  readonly championStats: readonly PlayerChampionStats[];
  readonly championTags: readonly ChampionTag[];
  readonly capabilityProfiles: readonly ChampionCapabilityProfile[];
  readonly matchups: readonly MatchupData[];
  readonly algorithmVersions: Record<string, string>;
  readonly unavailableReasons: { input: string; reason: string }[];
  /** Configuração efetiva resolvida (Etapa 27b) — a mesma instância alimenta motor, snapshot e bundle. */
  readonly configuration: EffectiveRecommendationConfiguration;
  readonly configurationMeta: ResolvedRecommendationConfiguration;
}

/**
 * Versoes de algoritmo que produziram esta execucao.
 *
 * `configHash` (Etapa 27b, opcional) entra como mais uma chave do mesmo
 * `Record<string,string>` — não é campo novo em nenhum tipo do core: é o que
 * permite a mesma configuração efetiva "viajar" pro hash do snapshot (uma
 * troca de release força um snapshot novo, mesmo com o draft idêntico) e pro
 * `algorithmVersions` do `ReplayInputBundle` (que já aceita chaves extras),
 * sem tocar `packages/core`.
 */
export function algorithmVersionsOf(configHash?: string): Record<string, string> {
  return {
    recommendationEngine: RECOMMENDATION_ENGINE_VERSION,
    championTagDerivation: CHAMPION_TAG_DERIVATION_VERSION,
    executionRisk: EXECUTION_RISK_VERSION,
    draftStrategy: DRAFT_STRATEGIC_ANALYSIS_VERSION,
    threatResponseModel: THREAT_RESPONSE_MODEL_VERSION,
    ...(configHash ? { recommendationConfiguration: configHash } : {})
  };
}

function hashCanonical(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Le todas as fontes mutaveis **uma vez** e congela o resultado.
 *
 * Depois desta funcao, nenhuma outra parte do fluxo consulta repositorio.
 */
export async function buildEvaluationContext(input: {
  draft: DraftState;
  role: Role;
  riotAccount?: { id: string; puuid: string };
  /** Sanitizado por construção: só evento e campos estruturados, nunca stack. */
  log?: Pick<FastifyBaseLogger, "info" | "warn" | "error">;
}): Promise<EvaluationContext> {
  const evaluatedAt = new Date().toISOString();
  const unavailableReasons: { input: string; reason: string }[] = [];

  const championStats = input.riotAccount
    ? await findChampionStatsByPuuid(input.riotAccount.puuid)
    : [];
  if (!input.riotAccount) {
    unavailableReasons.push({
      input: "PlayerChampionStats",
      reason: "Conta Riot não vinculada; nenhuma estatística pessoal disponível."
    });
  }

  const configurationResolutionStartedAt = performance.now();
  const [championTags, capabilityProfiles, laneHistory, personalPool, configurationMeta] = await Promise.all([
    findAllChampionTags(),
    findAllChampionCapabilityProfiles(),
    input.riotAccount
      ? findPersonalLaneMatchupHistory(input.riotAccount.puuid, input.role)
      : Promise.resolve([]),
    input.riotAccount
      ? findPlayerPool(input.riotAccount.id, input.riotAccount.puuid, input.role)
      : Promise.resolve({ entries: [], roleSummaries: [] }),
    // Resolvida UMA vez aqui, junto de todas as outras fontes mutáveis: o
    // motor, o snapshot e o bundle reaproveitam exatamente esta instância.
    resolveActiveConfiguration({ riotAccountId: input.riotAccount?.id, ...(input.log ? { log: input.log } : {}) })
  ]);
  // Aproximação deliberada: mede o `Promise.all` inteiro (as consultas rodam
  // em paralelo, então o tempo de `resolveActiveConfiguration` sozinho não é
  // isolável sem serializar as chamadas só para medir). Suficiente pra
  // observabilidade — não é um SLA por consulta.
  const configurationResolutionMs = performance.now() - configurationResolutionStartedAt;

  const matchups = aggregateMatchupData(laneHistory);
  if (matchups.length === 0) {
    unavailableReasons.push({
      input: "MatchupData",
      reason: "Nenhum confronto observado nesta posição."
    });
  }

  // Ausência de release ativa resolve pra baseline explícita (Etapa 27a),
  // dependente do cenário deste draft — nunca pesos vazios ou parciais.
  const configuration =
    configurationMeta.source === "RELEASE"
      ? configurationMeta.configuration
      : buildBaselineConfiguration(input.draft, { computeHash: hashCanonical });

  if (input.log) {
    input.log.info({
      event: "recommendation_configuration_resolved",
      source: configurationMeta.source,
      releaseId: configurationMeta.source === "RELEASE" ? configurationMeta.release.id : null,
      cacheState: configurationMeta.cacheState,
      fallbackUsed: configurationMeta.fallbackUsed,
      fallbackReason: configurationMeta.fallbackUsed ? configurationMeta.fallbackReason ?? null : null,
      configHash: configuration.configHash,
      resolutionMs: Math.round(configurationResolutionMs)
    });
  }

  return Object.freeze({
    evaluatedAt,
    ...(input.riotAccount ? { riotAccountId: input.riotAccount.id } : {}),
    role: input.role,
    draft: input.draft,
    configuration,
    configurationMeta,
    pool: personalPool.entries.map((entry) => ({
      championId: entry.championId,
      championName: entry.championName,
      role: entry.role,
      source: entry.source,
      enabled: entry.enabled
    })),
    championStats,
    championTags,
    capabilityProfiles,
    matchups,
    algorithmVersions: algorithmVersionsOf(configuration.configHash),
    unavailableReasons
  });
}

/**
 * Executa o motor **a partir do contexto congelado**.
 *
 * Os argumentos sao exatamente os mesmos de antes da refatoracao; a diferenca
 * e so a origem deles.
 */
export function runEngine(context: EvaluationContext): DraftRecommendationResponse {
  return recommendFromPersonalPool({
    draft: context.draft,
    candidates: context.pool.map((entry) => ({
      championId: entry.championId,
      championName: entry.championName,
      role: entry.role,
      source: entry.source,
      enabled: entry.enabled
    })),
    championStats: [...context.championStats],
    championTags: [...context.championTags],
    capabilityProfiles: [...context.capabilityProfiles],
    matchups: [...context.matchups],
    compositionRules,
    patchMeta: null,
    evaluatedAt: context.evaluatedAt,
    configuration: context.configuration
  });
}

/**
 * Versoes de catalogo que sustentaram a analise. So declara a versao quando
 * **todas** as tags concordam - com perfis de versoes diferentes, anunciar uma
 * delas atribuiria ao conjunto uma origem que ele nao tem (mesma regra da
 * Etapa 8).
 */
export function catalogVersionsOf(context: EvaluationContext): Record<string, string> {
  const versions: Record<string, string> = {};

  const patches = new Set(
    context.championTags
      .map((tag) => tag.provenance?.source.patch)
      .filter((patch): patch is string => !!patch)
  );
  if (
    patches.size === 1 &&
    context.championTags.every((tag) => tag.provenance?.source.patch !== undefined)
  ) {
    versions.dataDragon = [...patches][0];
  }

  const capabilityVersions = new Set(
    context.capabilityProfiles
      .map((profile) => profile.algorithmVersion)
      .filter((version): version is string => !!version)
  );
  if (capabilityVersions.size === 1) {
    versions.championCapabilities = [...capabilityVersions][0];
  }

  return versions;
}

/** SHA-256 da serializacao canonica. O hash mora aqui, nao no dominio. */
export function hashBundleContent(content: Omit<ReplayInputBundle, "contentHash">): string {
  return createHash("sha256").update(canonicalBundleContent(content)).digest("hex");
}

/**
 * Monta o bundle a partir do **mesmo** contexto que produziu as recomendacoes.
 *
 * `referencedChampions` cobre candidatos, aliados, inimigos e o adversario
 * direto — sem os perfis de aliado e inimigo, tres metricas estrategicas nao
 * seriam reproduziveis (achado da auditoria da Etapa 26).
 */
export function buildReplayBundle(input: {
  context: EvaluationContext;
  snapshotId: string;
  capturedAt?: string;
}): ReplayInputBundle {
  const { context } = input;
  const roles = new Map<number, Set<ReplayChampionRole>>();
  const addRole = (championId: number, role: ReplayChampionRole) => {
    const current = roles.get(championId) ?? new Set<ReplayChampionRole>();
    current.add(role);
    roles.set(championId, current);
  };

  for (const candidate of context.pool) addRole(candidate.championId, "CANDIDATE");
  for (const ally of context.draft.allies) addRole(ally.championId, "ALLY");
  for (const enemy of context.draft.enemies) addRole(enemy.championId, "ENEMY");
  if (context.draft.enemyLaneChampionId !== undefined) {
    addRole(context.draft.enemyLaneChampionId, "DIRECT_OPPONENT");
  }

  const tagById = new Map<number, ChampionTag>();
  const tagByName = new Map<string, ChampionTag>();
  for (const tag of context.championTags) {
    if (tag.championId !== undefined) tagById.set(tag.championId, tag);
    tagByName.set(tag.championName, tag);
  }
  const capabilityById = new Map(
    context.capabilityProfiles.map((profile) => [profile.championId, profile])
  );
  const nameById = new Map<number, string>();
  for (const entry of context.pool) nameById.set(entry.championId, entry.championName);
  for (const pick of [...context.draft.allies, ...context.draft.enemies]) {
    if (pick.championName) nameById.set(pick.championId, pick.championName);
  }

  const referencedChampions: ReplayChampionContext[] = [...roles.entries()].map(
    ([championId, championRoles]) => {
      const championName = nameById.get(championId) ?? "";
      const tag = tagById.get(championId) ?? (championName ? tagByName.get(championName) : undefined);
      const capability = capabilityById.get(championId);
      const unavailableReasons: { input: string; reason: string }[] = [];
      if (!tag) {
        unavailableReasons.push({
          input: "ChampionTag",
          reason: "Perfil de classe indisponível para este campeão no instante do draft."
        });
      }
      if (!capability) {
        unavailableReasons.push({
          input: "ChampionCapabilityProfile",
          reason: "Capacidades não disponíveis para este campeão no instante do draft."
        });
      }

      const sourceVersions: Record<string, string> = {};
      if (tag?.provenance?.source.patch) sourceVersions.dataDragon = tag.provenance.source.patch;
      if (capability?.algorithmVersion) {
        sourceVersions.championCapabilities = capability.algorithmVersion;
      }

      return {
        championId,
        championName,
        roles: [...championRoles],
        championTag: tag ?? null,
        capabilityProfile: capability ?? null,
        sourceVersions,
        unavailableReasons
      };
    }
  );

  const content: Omit<ReplayInputBundle, "contentHash"> = {
    schemaVersion: REPLAY_BUNDLE_SCHEMA_VERSION,
    snapshotId: input.snapshotId,
    evaluatedAt: context.evaluatedAt,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    algorithmVersions: { ...context.algorithmVersions },
    // Etapa 27c: a MESMA instância já resolvida em `buildEvaluationContext`,
    // que também alimentou o motor, o snapshot e a observabilidade. Nada é
    // relido do banco nem reconstruído aqui — uma segunda cópia poderia
    // divergir da que de fato produziu o resultado.
    effectiveRecommendationConfiguration: context.configuration,
    draft: {
      role: context.role,
      roleSource: context.draft.playerRoleSource ?? "USER",
      pickOrder: context.draft.pickOrder,
      ...(context.draft.patch ? { patch: context.draft.patch } : {}),
      pool: context.pool.map((entry) => ({
        championId: entry.championId,
        source: entry.source
      })),
      allies: context.draft.allies.map((pick) => ({
        championId: pick.championId,
        ...(pick.role ? { role: pick.role } : {})
      })),
      enemies: context.draft.enemies.map((pick) => ({
        championId: pick.championId,
        ...(pick.role ? { role: pick.role } : {})
      })),
      bannedChampionIds: [...context.draft.bannedChampionIds],
      ...(context.draft.enemyLaneChampionId !== undefined
        ? { directOpponentChampionId: context.draft.enemyLaneChampionId }
        : {}),
      ...(context.draft.selectedChampionId !== undefined
        ? { selectedChampionId: context.draft.selectedChampionId }
        : {})
    },
    player: {
      championStats: [...context.championStats],
      matchups: [...context.matchups],
      unavailableReasons: [...context.unavailableReasons]
    },
    candidates: context.pool.map((entry) => ({
      championId: entry.championId,
      championName: entry.championName,
      role: entry.role,
      poolSource: entry.source,
      enabled: entry.enabled
    })),
    referencedChampions,
    activeParameters: {
      compositionRules,
      compositionRulesVersion: "composition-rules/1.0.0",
      patchMetaAvailable: false
    },
    dependencyManifest: buildDependencyManifest({
      algorithmVersions: context.algorithmVersions,
      availability: {
        META_STRENGTH: {
          available: false,
          reason: "Fonte global de meta permanece indisponível."
        },
        GLOBAL_MATCHUP: {
          available: false,
          reason: "Fonte global de matchup permanece indisponível."
        }
      }
    }),
    provenance: {
      sourceType: "CALCULATED",
      sourceId: "sparta",
      resource: "ReplayInputBundle",
      algorithmVersion: REPLAY_BUNDLE_SCHEMA_VERSION
    }
  };

  return { ...content, contentHash: hashBundleContent(content) };
}
