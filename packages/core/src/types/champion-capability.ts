import type { AvailabilityStatus, DataProvenance } from "./provenance.js";

export const CHAMPION_CAPABILITY_KEYS = [
  "HARD_CC",
  "SOFT_CC",
  "DISPLACEMENT",
  "TARGETED_CC",
  "AREA_CC",
  "CC_RELIABILITY",
  "MOBILITY",
  "DASH",
  "BLINK",
  "MOVEMENT_SPEED",
  "ANTI_MOBILITY",
  "ENGAGE",
  "DISENGAGE",
  "PEEL",
  "FRONTLINE",
  "PICKOFF",
  "PROTECTION",
  "WAVECLEAR",
  "POKE",
  "BURST",
  "SUSTAINED_DAMAGE",
  "SCALING",
  "RANGE_PROFILE"
] as const;

export type ChampionCapabilityKey =
  (typeof CHAMPION_CAPABILITY_KEYS)[number];

export type CapabilityEvidenceSourceType =
  | "PASSIVE"
  | "SPELL"
  | "CHAMPION_METADATA";

export interface CapabilitySourceReference {
  sourceType: CapabilityEvidenceSourceType;
  sourceId: string;
  sourceName: string;
}

export interface CapabilityEvidence extends CapabilitySourceReference {
  /** Trecho oficial que disparou a regra, preservado sem reinterpretá-lo. */
  sourceText?: string;
  /** Identificador estável da regra determinística aplicada. */
  extractionRule: string;
}

export interface ChampionCapability {
  key: ChampionCapabilityKey;
  status: AvailabilityStatus;
  /**
   * `true` registra presença textual explícita. Números são aceitos somente
   * para medidas estruturadas objetivas, como alcance de ataque base.
   */
  value: number | boolean | null;
  evidence: CapabilityEvidence[];
  provenance: DataProvenance;
  unavailableReason?: string;
}

export interface ChampionCapabilityProfile {
  championId: number;
  championKey: string;
  championName: string;
  dataDragonVersion: string | null;
  locale: string;
  algorithmVersion: string;
  status: AvailabilityStatus;
  /** Fração 0-1 das capacidades com informação utilizável. */
  coverage: number;
  availableCapabilities: number;
  totalCapabilities: number;
  sourceReferences: CapabilitySourceReference[];
  capabilities: ChampionCapability[];
}

export interface ChampionCapabilitySpellInput {
  id: string;
  name: string;
  description?: string;
  tooltip?: string;
}

export interface ChampionCapabilityExtractionInput {
  championId: number;
  championKey: string;
  championName: string;
  dataDragonVersion: string | null;
  locale: string;
  passive?: {
    name: string;
    description?: string;
  };
  spells: readonly ChampionCapabilitySpellInput[];
  /** `stats.attackrange` oficial, em unidades do jogo, quando presente. */
  attackRange?: number;
}
