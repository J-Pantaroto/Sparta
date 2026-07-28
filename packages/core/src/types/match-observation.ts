import type { AvailabilityStatus, DataProvenance } from "./provenance.js";
import type { Role } from "./domain.js";

export type CatalogResolutionStatus = "EXACT" | "OTHER_VERSION" | "UNAVAILABLE";
export type ObservedSlotState = "PRESENT" | "EMPTY" | "UNAVAILABLE";
export type MatchRoleObservationSource = "TEAM_POSITION" | "INDIVIDUAL_POSITION";

export interface CatalogEnrichment {
  status: CatalogResolutionStatus;
  catalogVersion?: string;
  name?: string;
  asset?: string;
  provenance: DataProvenance;
}

export interface ObservedItemSlot {
  slot: number;
  state: ObservedSlotState;
  itemId?: number;
  enrichment: CatalogEnrichment;
  provenance: DataProvenance;
}

export interface ObservedRuneSelection {
  tree: "PRIMARY" | "SECONDARY";
  order: number;
  perkId: number;
  isKeystone: boolean;
  enrichment: CatalogEnrichment;
  provenance: DataProvenance;
}

export interface ObservedRuneFragment {
  slot: "OFFENSE" | "FLEX" | "DEFENSE";
  state: Exclude<ObservedSlotState, "EMPTY">;
  fragmentId?: number;
  enrichment: CatalogEnrichment;
  provenance: DataProvenance;
}

export interface ObservedRunePage {
  status: AvailabilityStatus;
  primaryStyleId?: number;
  secondaryStyleId?: number;
  selections: ObservedRuneSelection[];
  fragments: ObservedRuneFragment[];
  provenance: DataProvenance;
}

export interface ObservedSummonerSpellSlot {
  slot: 1 | 2;
  state: Exclude<ObservedSlotState, "EMPTY">;
  spellId?: number;
  enrichment: CatalogEnrichment;
  provenance: DataProvenance;
}

/**
 * Posição do jogador com o campeão nesta partida. Não representa, nem
 * alimenta, elegibilidade global do campeão.
 */
export interface PlayerChampionRoleObservation {
  teamPosition?: string;
  individualPosition?: string;
  positionAssignedByMatchmaking?: string;
  normalizedRole?: Role;
  normalizedRoleSource?: MatchRoleObservationSource;
  assignedRole?: Role;
  diverged: boolean;
  status: AvailabilityStatus;
  observedProvenance: DataProvenance;
  normalizedProvenance: DataProvenance;
}

export interface MatchObservationContext {
  gameVersion?: string;
  patch?: string;
  queueId?: number;
  gameMode?: string;
  gameType?: string;
  platform: string;
  startedAt?: string;
  durationSeconds?: number;
  won?: boolean;
}

export interface MatchLoadoutObservation {
  extractorVersion: string;
  matchId: string;
  championId: number;
  context: MatchObservationContext;
  items: ObservedItemSlot[];
  runes: ObservedRunePage;
  summonerSpells: ObservedSummonerSpellSlot[];
  position: PlayerChampionRoleObservation;
}
