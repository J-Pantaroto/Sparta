import type { DraftState, PlayerRoleSource, RecommendationReason, Role } from "../types/domain.js";
import type { PlayerChampionPoolCandidate, PlayerChampionPoolSource } from "../types/player-champion-pool.js";
import type { DataProvenance } from "../types/provenance.js";
import type { RecommendationMetric } from "../types/recommendation-metric.js";
import type { DraftStrategicAnalysis } from "./draft-strategic-analysis.js";

/**
 * Snapshot imutável de uma execução do motor de recomendação.
 *
 * ## Por que um input canônico com hash
 *
 * O LCU emite eventos a cada 2,5 s e a maior parte deles é idêntica. Gravar
 * por tick encheria o histórico de duplicatas e tornaria impossível responder
 * "o que o Sparta recomendou naquele momento" — todo momento teria dezenas de
 * respostas iguais. O hash do input canônico é o que permite dizer, sem
 * comparar objeto por objeto, que **nada que afeta a análise mudou**.
 *
 * ## O que fica de fora do hash, de propósito
 *
 * - **Ordem de arrays**: os mesmos cinco inimigos revelados em ordem diferente
 *   são o mesmo draft. Tudo é ordenado antes de serializar.
 * - **Instante da análise**: `analyzedAt` é gravado no snapshot mas não entra
 *   no hash — senão cada tick produziria um hash novo e o mecanismo inteiro
 *   perderia a função.
 * - **IDs internos e campos de interface**: nada de `id` de linha, estado de
 *   componente ou rótulo traduzido.
 *
 * O que **entra** é exatamente o que muda a saída do motor: posição e sua
 * origem, pool habilitado, aliados, inimigos, bans, adversário direto,
 * campeão selecionado, e as versões de catálogo e algoritmo.
 */

export const SNAPSHOT_INPUT_VERSION = "recommendation-snapshot-input/1.0.0";

/** Versões que, ao mudarem, tornam a análise anterior não comparável. */
export type AlgorithmVersions = Record<string, string>;

export interface CanonicalSnapshotInput {
  /** Versão do próprio formato canônico. Entra no hash. */
  inputVersion: string;
  role: Role;
  roleSource: PlayerRoleSource;
  /** Pool considerado: id + origem, ordenado por id. */
  pool: { championId: number; source: PlayerChampionPoolSource }[];
  allies: { championId: number; role?: Role }[];
  enemies: { championId: number; role?: Role }[];
  bannedChampionIds: number[];
  directOpponentChampionId?: number;
  selectedChampionId?: number;
  /** Versões dos catálogos que alimentaram a análise. */
  catalogVersions: Record<string, string>;
  algorithmVersions: AlgorithmVersions;
}

export interface BuildCanonicalSnapshotInput {
  draft: DraftState;
  /** Só os candidatos realmente considerados (habilitados, da posição). */
  pool: readonly PlayerChampionPoolCandidate[];
  catalogVersions: Record<string, string>;
  algorithmVersions: AlgorithmVersions;
}

function sortedRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right, "en")));
}

/**
 * Monta o input canônico. Ordena tudo que é conjunto e remove duplicatas —
 * o mesmo campeão listado duas vezes no pool é o mesmo candidato.
 */
export function buildCanonicalSnapshotInput(input: BuildCanonicalSnapshotInput): CanonicalSnapshotInput | null {
  const role = input.draft.playerRole;
  if (!role) return null;

  const poolById = new Map<number, PlayerChampionPoolSource>();
  for (const candidate of input.pool) {
    if (!candidate.enabled || candidate.role !== role) continue;
    // Observado prevalece sobre inclusão manual - mesma regra do motor.
    const current = poolById.get(candidate.championId);
    if (current === undefined || candidate.source === "PERSONAL_OBSERVED") {
      poolById.set(candidate.championId, candidate.source);
    }
  }

  const picks = (list: readonly { championId: number; role?: Role }[]) =>
    [...new Map(list.map((pick) => [pick.championId, pick])).values()]
      .map((pick) => ({ championId: pick.championId, ...(pick.role ? { role: pick.role } : {}) }))
      .sort((left, right) => left.championId - right.championId);

  return {
    inputVersion: SNAPSHOT_INPUT_VERSION,
    role,
    // Ausência de origem não vira "LCU": sem `playerRoleSource` a posição foi
    // informada pelo usuário no modo manual.
    roleSource: input.draft.playerRoleSource ?? "USER",
    pool: [...poolById.entries()]
      .map(([championId, source]) => ({ championId, source }))
      .sort((left, right) => left.championId - right.championId),
    allies: picks(input.draft.allies),
    enemies: picks(input.draft.enemies),
    bannedChampionIds: [...new Set(input.draft.bannedChampionIds)].sort((left, right) => left - right),
    ...(input.draft.enemyLaneChampionId !== undefined
      ? { directOpponentChampionId: input.draft.enemyLaneChampionId }
      : {}),
    ...(input.draft.selectedChampionId !== undefined
      ? { selectedChampionId: input.draft.selectedChampionId }
      : {}),
    catalogVersions: sortedRecord(input.catalogVersions),
    algorithmVersions: sortedRecord(input.algorithmVersions)
  };
}

/**
 * Serialização estável do input canônico. É esta string que é hasheada — o
 * hash em si fica no lado que tem `node:crypto` (a API), porque `packages/core`
 * também roda no renderer e não pode depender de builtin do Node.
 */
export function canonicalSnapshotInputString(input: CanonicalSnapshotInput): string {
  const ordered = {
    inputVersion: input.inputVersion,
    role: input.role,
    roleSource: input.roleSource,
    pool: input.pool.map((entry) => [entry.championId, entry.source]),
    allies: input.allies.map((entry) => [entry.championId, entry.role ?? null]),
    enemies: input.enemies.map((entry) => [entry.championId, entry.role ?? null]),
    bannedChampionIds: input.bannedChampionIds,
    directOpponentChampionId: input.directOpponentChampionId ?? null,
    selectedChampionId: input.selectedChampionId ?? null,
    catalogVersions: input.catalogVersions,
    algorithmVersions: input.algorithmVersions
  };
  return JSON.stringify(ordered);
}

/** Pesos efetivamente usados por candidato, depois da normalização. */
export type EffectiveWeights = Record<string, number>;

/**
 * Um candidato dentro do snapshot. Guarda tudo que sustentou a posição dele,
 * não só o score — o score sozinho não permite reconstruir por que ele foi
 * recomendado.
 */
export interface PersistedRecommendation {
  championId: number;
  championName: string;
  rank: number;
  group: "PRIMARY" | "ALTERNATIVE";
  totalScore: number;
  dataCoverage: number;
  poolSource: PlayerChampionPoolSource;
  poolProvenance?: DataProvenance;
  /** Partidas do jogador com este campeão nesta posição. */
  personalGames: number;
  /** Métricas estruturadas: indisponível continua indisponível, sem valor. */
  metricDetails: RecommendationMetric[];
  /** Pesos depois da normalização por disponibilidade. */
  effectiveWeights: EffectiveWeights;
  category: string;
  confidence?: string;
  /** Motivos da classificação, com código e impacto - não só o rótulo. */
  reasons: RecommendationReason[];
  warnings: RecommendationReason[];
  limitations: string[];
  strategicAnalysis?: DraftStrategicAnalysis;
}

export interface RecommendationSnapshotRecord {
  id: string;
  draftSessionId: string;
  inputHash: string;
  canonicalInput: CanonicalSnapshotInput;
  algorithmVersions: AlgorithmVersions;
  /** Cobertura da execução; não é confiança nem chance de vitória. */
  dataCoverage: number;
  createdAt: string;
  /** Quando um snapshot posterior passou a valer. Ausente enquanto é o atual. */
  supersededAt?: string;
  recommendations: PersistedRecommendation[];
}

/**
 * Converte a resposta do motor no formato persistido, preservando ranking e
 * grupo. `PRIMARY` e `ALTERNATIVE` vêm de listas separadas, e o `rank` é o
 * que o motor já atribuiu — nada é renumerado aqui.
 *
 * Um candidato aparece **uma única vez**: se o mesmo campeão viesse nas duas
 * listas (não acontece hoje, mas o formato não deve permitir), a entrada de
 * `PRIMARY` prevalece.
 */
export function toPersistedRecommendations(input: {
  primaryRecommendations: readonly PersistedRecommendationSource[];
  alternatives: readonly PersistedRecommendationSource[];
}): PersistedRecommendation[] {
  const byChampion = new Map<number, PersistedRecommendation>();

  const add = (source: PersistedRecommendationSource, group: "PRIMARY" | "ALTERNATIVE") => {
    if (byChampion.has(source.championId)) return;
    byChampion.set(source.championId, {
      championId: source.championId,
      championName: source.championName,
      rank: source.rank,
      group,
      totalScore: source.totalScore,
      dataCoverage: source.dataCoverage,
      poolSource: source.poolSource,
      ...(source.poolProvenance ? { poolProvenance: source.poolProvenance } : {}),
      personalGames: source.personalGames,
      metricDetails: [...(source.metricDetails ?? [])],
      effectiveWeights: { ...(source.effectiveWeights ?? {}) },
      category: source.category,
      ...(source.confidence ? { confidence: source.confidence } : {}),
      reasons: source.reasons.map((reason) => ({ ...reason })),
      warnings: source.warnings.map((warning) => ({ ...warning })),
      limitations: [...(source.limitations ?? [])],
      ...(source.strategicAnalysis ? { strategicAnalysis: source.strategicAnalysis } : {})
    });
  };

  for (const recommendation of input.primaryRecommendations) add(recommendation, "PRIMARY");
  for (const recommendation of input.alternatives) add(recommendation, "ALTERNATIVE");

  return [...byChampion.values()].sort((left, right) => left.rank - right.rank);
}

/** Forma mínima aceita de uma recomendação do motor. */
export interface PersistedRecommendationSource {
  championId: number;
  championName: string;
  rank: number;
  totalScore: number;
  dataCoverage: number;
  poolSource: PlayerChampionPoolSource;
  poolProvenance?: DataProvenance;
  personalGames: number;
  metricDetails?: RecommendationMetric[];
  effectiveWeights?: EffectiveWeights;
  category: string;
  confidence?: string;
  reasons: RecommendationReason[];
  warnings: RecommendationReason[];
  limitations?: string[];
  strategicAnalysis?: DraftStrategicAnalysis;
}

/**
 * `true` quando o snapshot novo precisa ser gravado. Input e versões
 * idênticos ao último snapshot não geram gravação nenhuma — é o que impede a
 * duplicação por tick.
 */
export function shouldPersistSnapshot(input: {
  latestInputHash?: string;
  candidateInputHash: string;
}): boolean {
  return input.latestInputHash !== input.candidateInputHash;
}
