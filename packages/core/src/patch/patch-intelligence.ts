import type { AvailabilityStatus, DataProvenance } from "../types/provenance.js";

export const PATCH_INTELLIGENCE_CONTRACT_VERSION = "patch-intelligence/1.0.0";

export const PATCH_ENTITY_TYPES = ["CHAMPION", "ITEM", "RUNE", "SYSTEM", "OTHER"] as const;
export type PatchEntityType = (typeof PATCH_ENTITY_TYPES)[number];

export const PATCH_CHANGE_TYPES = [
  "BUFF",
  "NERF",
  "ADJUSTMENT",
  "BUGFIX",
  "NEW",
  "REMOVED",
  "UNCLASSIFIED"
] as const;
export type PatchChangeType = (typeof PATCH_CHANGE_TYPES)[number];

export interface StructuredPatchDelta {
  label: string;
  previousValue?: string;
  newValue?: string;
  numericPreviousValue?: number;
  numericNewValue?: number;
  numericDelta?: number;
  unit?: string;
  status: AvailabilityStatus;
}

export interface PatchEntityResolution {
  status: "RESOLVED" | "UNRESOLVED" | "NOT_APPLICABLE";
  reason?: string;
}

export interface PatchChange {
  id: string;
  entityType: PatchEntityType;
  entityId?: number;
  entityName: string;
  entityResolution: PatchEntityResolution;
  changeType: PatchChangeType;
  affectedComponent?: string;
  officialSummary: string;
  officialDetails: string[];
  structuredChanges: StructuredPatchDelta[];
  status: AvailabilityStatus;
  provenance: DataProvenance;
}

export interface PatchRelease {
  patch: string;
  title: string;
  locale: string;
  publishedAt: string | null;
  collectedAt: string;
  sourceUrl: string;
  sourceHash: string;
  parserVersion: string;
  revision: number;
  status: AvailabilityStatus;
  changes: PatchChange[];
  provenance: DataProvenance;
  unavailableReason?: string;
  staleReason?: string;
}

export interface PatchReleaseSummary {
  patch: string;
  title: string;
  locale: string;
  publishedAt: string | null;
  collectedAt: string;
  sourceUrl: string;
  sourceHash: string;
  parserVersion: string;
  revision: number;
  status: AvailabilityStatus;
  counts: {
    buffs: number;
    nerfs: number;
    adjustments: number;
    bugfixes: number;
    changedItems: number;
    changedRunes: number;
  };
  provenance: DataProvenance;
  unavailableReason?: string;
  staleReason?: string;
}

export function summarizePatchRelease(release: PatchRelease): PatchReleaseSummary {
  const entities = (type: PatchEntityType) =>
    new Set(
      release.changes
        .filter((change) => change.entityType === type)
        .map((change) => change.entityId ?? change.entityName)
    ).size;

  return {
    patch: release.patch,
    title: release.title,
    locale: release.locale,
    publishedAt: release.publishedAt,
    collectedAt: release.collectedAt,
    sourceUrl: release.sourceUrl,
    sourceHash: release.sourceHash,
    parserVersion: release.parserVersion,
    revision: release.revision,
    status: release.status,
    counts: {
      buffs: release.changes.filter((change) => change.changeType === "BUFF").length,
      nerfs: release.changes.filter((change) => change.changeType === "NERF").length,
      adjustments: release.changes.filter((change) => change.changeType === "ADJUSTMENT").length,
      bugfixes: release.changes.filter((change) => change.changeType === "BUGFIX").length,
      changedItems: entities("ITEM"),
      changedRunes: entities("RUNE")
    },
    provenance: release.provenance,
    unavailableReason: release.unavailableReason,
    staleReason: release.staleReason
  };
}
