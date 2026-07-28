import type { Role } from "./domain.js";
import type { AvailabilityStatus, DataProvenance } from "./provenance.js";
import type { MatchRoleObservationSource } from "./match-observation.js";

export const PLAYER_CHAMPION_ROLE_EVIDENCE_VERSION =
  "player-champion-role-evidence/1.0.0";
export const GLOBAL_ROLE_ELIGIBILITY_UNAVAILABLE_REASON =
  "Elegibilidade global por posição ainda não está disponível.";

export interface PlayerChampionRoleEvidence {
  championId: number;
  role: Role;
  status: AvailabilityStatus;
  games: number;
  wins: number;
  losses: number;
  lastPlayedAt: string | null;
  patches: string[];
  queueIds: number[];
  normalization: {
    extractorVersions: string[];
    sources: MatchRoleObservationSource[];
  };
  provenance: DataProvenance;
  observationSource: DataProvenance;
  unavailableReason?: string;
}

export interface GlobalChampionRoleEligibility {
  championId: number;
  role: Role;
  status: "UNAVAILABLE";
  eligible: null;
  unavailableReason: string;
}

export interface PlayerChampionRoleObservationRecord {
  championId: number;
  role?: Role;
  won: boolean;
  playedAt?: string;
  patch?: string;
  queueId?: number;
  gameMode?: string;
  gameType?: string;
  extractorVersion: string;
  normalizationSource?: MatchRoleObservationSource;
}

export interface PlayerChampionRoleEvidenceFilters {
  championId: number;
  role: Role;
  patches?: string[];
  queueIds?: number[];
  playedAtFrom?: string;
  playedAtTo?: string;
  gameModes?: string[];
  gameTypes?: string[];
}

function uniqueSorted<T extends number | string>(values: T[]): T[] {
  return Array.from(new Set(values)).sort((left, right) =>
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right))
  );
}

function includesOrUnfiltered<T>(filter: T[] | undefined, value: T | undefined): boolean {
  return filter === undefined || (value !== undefined && filter.includes(value));
}

function observedMatchV5Source(
  status: AvailabilityStatus,
  sampleSize: number,
  unavailableReason?: string
): DataProvenance {
  return {
    sourceType: "OBSERVED",
    sourceId: "riot-match-v5",
    resource: "/lol/match/v5/matches/{matchId}",
    sampleSize,
    status,
    ...(unavailableReason ? { unavailableReason } : {})
  };
}

/**
 * Agrega somente posições normalizadas da Etapa 10. A função não conhece
 * ChampionTag, feitiços, classes, frequência global ou qualquer outra fonte.
 */
export function aggregatePlayerChampionRoleEvidence(
  records: readonly PlayerChampionRoleObservationRecord[],
  filters: PlayerChampionRoleEvidenceFilters
): PlayerChampionRoleEvidence {
  const selected = records.filter((record) => {
    if (record.championId !== filters.championId || record.role !== filters.role) return false;
    if (!includesOrUnfiltered(filters.patches, record.patch)) return false;
    if (!includesOrUnfiltered(filters.queueIds, record.queueId)) return false;
    if (!includesOrUnfiltered(filters.gameModes, record.gameMode)) return false;
    if (!includesOrUnfiltered(filters.gameTypes, record.gameType)) return false;
    if (filters.playedAtFrom && (!record.playedAt || record.playedAt < filters.playedAtFrom)) return false;
    if (filters.playedAtTo && (!record.playedAt || record.playedAt > filters.playedAtTo)) return false;
    return true;
  });

  const games = selected.length;
  const wins = selected.filter((record) => record.won).length;
  const unavailableReason =
    games === 0
      ? "Nenhuma partida observada com este campeão nesta posição para os filtros informados."
      : undefined;
  const status: AvailabilityStatus = games === 0 ? "UNAVAILABLE" : "AVAILABLE";
  const playedDates = selected
    .map((record) => record.playedAt)
    .filter((value): value is string => value !== undefined)
    .sort();

  return {
    championId: filters.championId,
    role: filters.role,
    status,
    games,
    wins,
    losses: games - wins,
    lastPlayedAt: playedDates.at(-1) ?? null,
    patches: uniqueSorted(
      selected.map((record) => record.patch).filter((value): value is string => value !== undefined)
    ),
    queueIds: uniqueSorted(
      selected.map((record) => record.queueId).filter((value): value is number => value !== undefined)
    ),
    normalization: {
      extractorVersions: uniqueSorted(selected.map((record) => record.extractorVersion)),
      sources: uniqueSorted(
        selected
          .map((record) => record.normalizationSource)
          .filter((value): value is MatchRoleObservationSource => value !== undefined)
      )
    },
    provenance: {
      sourceType: "CALCULATED",
      sourceId: "sparta",
      resource: "MatchObservation",
      position: filters.role,
      sampleSize: games,
      algorithmVersion: PLAYER_CHAMPION_ROLE_EVIDENCE_VERSION,
      status,
      ...(unavailableReason ? { unavailableReason } : {})
    },
    observationSource: observedMatchV5Source(status, games, unavailableReason),
    ...(unavailableReason ? { unavailableReason } : {})
  };
}

export function unavailableGlobalChampionRoleEligibility(
  championId: number,
  role: Role
): GlobalChampionRoleEligibility {
  return {
    championId,
    role,
    status: "UNAVAILABLE",
    eligible: null,
    unavailableReason: GLOBAL_ROLE_ELIGIBILITY_UNAVAILABLE_REASON
  };
}

const ROLES: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

export interface LegacyChampionRoleField {
  values: Role[];
  semantics: "UNKNOWN";
}

/**
 * Ponto único de compatibilidade para `role`/`roles` antigos. Os valores
 * continuam legíveis, mas não ganham origem e nunca viram elegibilidade.
 */
export function adaptLegacyChampionRoleField(value: unknown): LegacyChampionRoleField | undefined {
  const candidates = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const roles = uniqueSorted(
    candidates.filter((candidate): candidate is Role =>
      typeof candidate === "string" && ROLES.includes(candidate as Role)
    )
  );
  return roles.length > 0 ? { values: roles, semantics: "UNKNOWN" } : undefined;
}
