import {
  CHAMPION_CAPABILITY_KEYS,
  type CapabilityEvidence,
  type CapabilityEvidenceSourceType,
  type CapabilitySourceReference,
  type ChampionCapability,
  type ChampionCapabilityKey,
  type ChampionCapabilityProfile
} from "../types/champion-capability.js";
import type { AvailabilityStatus, DataProvenance } from "../types/provenance.js";
import {
  CHAMPION_CAPABILITY_ALGORITHM_VERSION,
  CHAMPION_CAPABILITY_LOCALE
} from "./champion-capability-extractor.js";

export interface ChampionCapabilityManifestMetadata {
  dataDragonVersion: string;
  locale: string;
  sourceResourceTemplate: string;
  algorithmVersion: string;
  generatedAt: string;
}

export interface ChampionCapabilityManifest {
  metadata: ChampionCapabilityManifestMetadata;
  profiles: ChampionCapabilityProfile[];
}

export interface ChampionCapabilityValidationIssue {
  championId?: number;
  key?: ChampionCapabilityKey;
  problem: string;
}

export interface ChampionCapabilityManifestReport {
  unchanged: boolean;
  validationIssues: ChampionCapabilityValidationIssue[];
}

const SOURCE_TYPES = new Set<CapabilityEvidenceSourceType>([
  "PASSIVE",
  "SPELL",
  "CHAMPION_METADATA"
]);
const AVAILABILITY = new Set<AvailabilityStatus>([
  "AVAILABLE",
  "PARTIAL",
  "STALE",
  "UNAVAILABLE"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSourceReference(
  raw: unknown
): CapabilitySourceReference | undefined {
  if (
    !isRecord(raw) ||
    !SOURCE_TYPES.has(raw.sourceType as CapabilityEvidenceSourceType) ||
    typeof raw.sourceId !== "string" ||
    typeof raw.sourceName !== "string"
  ) {
    return undefined;
  }
  return {
    sourceType: raw.sourceType as CapabilityEvidenceSourceType,
    sourceId: raw.sourceId,
    sourceName: raw.sourceName
  };
}

function readEvidence(raw: unknown): CapabilityEvidence | undefined {
  const source = readSourceReference(raw);
  if (
    !source ||
    !isRecord(raw) ||
    typeof raw.extractionRule !== "string" ||
    (raw.sourceText !== undefined && typeof raw.sourceText !== "string")
  ) {
    return undefined;
  }
  return {
    ...source,
    ...(typeof raw.sourceText === "string"
      ? { sourceText: raw.sourceText }
      : {}),
    extractionRule: raw.extractionRule
  };
}

function readProvenance(raw: unknown): DataProvenance | undefined {
  if (
    !isRecord(raw) ||
    raw.sourceType !== "CALCULATED" ||
    (raw.status !== undefined &&
      !AVAILABILITY.has(raw.status as AvailabilityStatus))
  ) {
    return undefined;
  }
  return raw as unknown as DataProvenance;
}

function readCapability(raw: unknown): ChampionCapability | undefined {
  if (!isRecord(raw)) return undefined;
  if (
    !CHAMPION_CAPABILITY_KEYS.includes(raw.key as ChampionCapabilityKey) ||
    !AVAILABILITY.has(raw.status as AvailabilityStatus) ||
    !(
      raw.value === null ||
      typeof raw.value === "boolean" ||
      typeof raw.value === "number"
    ) ||
    !Array.isArray(raw.evidence)
  ) {
    return undefined;
  }
  const evidence = raw.evidence.map(readEvidence);
  const provenance = readProvenance(raw.provenance);
  if (evidence.some((entry) => entry === undefined) || !provenance) {
    return undefined;
  }
  return {
    key: raw.key as ChampionCapabilityKey,
    status: raw.status as AvailabilityStatus,
    value: raw.value as number | boolean | null,
    evidence: evidence as CapabilityEvidence[],
    provenance,
    ...(typeof raw.unavailableReason === "string"
      ? { unavailableReason: raw.unavailableReason }
      : {})
  };
}

function readProfile(raw: unknown): ChampionCapabilityProfile | undefined {
  if (
    !isRecord(raw) ||
    typeof raw.championId !== "number" ||
    typeof raw.championKey !== "string" ||
    typeof raw.championName !== "string" ||
    !(raw.dataDragonVersion === null || typeof raw.dataDragonVersion === "string") ||
    typeof raw.locale !== "string" ||
    typeof raw.algorithmVersion !== "string" ||
    !AVAILABILITY.has(raw.status as AvailabilityStatus) ||
    typeof raw.coverage !== "number" ||
    typeof raw.availableCapabilities !== "number" ||
    typeof raw.totalCapabilities !== "number" ||
    !Array.isArray(raw.sourceReferences) ||
    !Array.isArray(raw.capabilities)
  ) {
    return undefined;
  }
  const sourceReferences = raw.sourceReferences.map(readSourceReference);
  const capabilities = raw.capabilities.map(readCapability);
  if (
    sourceReferences.some((entry) => entry === undefined) ||
    capabilities.some((entry) => entry === undefined)
  ) {
    return undefined;
  }
  return {
    championId: raw.championId,
    championKey: raw.championKey,
    championName: raw.championName,
    dataDragonVersion: raw.dataDragonVersion,
    locale: raw.locale,
    algorithmVersion: raw.algorithmVersion,
    status: raw.status as AvailabilityStatus,
    coverage: raw.coverage,
    availableCapabilities: raw.availableCapabilities,
    totalCapabilities: raw.totalCapabilities,
    sourceReferences: sourceReferences as CapabilitySourceReference[],
    capabilities: capabilities as ChampionCapability[]
  };
}

export function validateChampionCapabilityProfile(
  profile: ChampionCapabilityProfile
): ChampionCapabilityValidationIssue[] {
  const issues: ChampionCapabilityValidationIssue[] = [];
  const references = new Set(
    profile.sourceReferences.map(
      (source) =>
        `${source.sourceType}\u0000${source.sourceId}\u0000${source.sourceName}`
    )
  );
  const seen = new Set<ChampionCapabilityKey>();

  for (const capability of profile.capabilities) {
    if (seen.has(capability.key)) {
      issues.push({
        championId: profile.championId,
        key: capability.key,
        problem: "capacidade duplicada"
      });
    }
    seen.add(capability.key);

    if (capability.status === "UNAVAILABLE") {
      if (capability.value !== null || capability.evidence.length !== 0) {
        issues.push({
          championId: profile.championId,
          key: capability.key,
          problem: "UNAVAILABLE deve ter valor nulo e nenhuma evidência"
        });
      }
    } else if (
      capability.value === null ||
      capability.evidence.length === 0
    ) {
      issues.push({
        championId: profile.championId,
        key: capability.key,
        problem: "capacidade utilizável precisa de valor e evidência"
      });
    }

    for (const evidence of capability.evidence) {
      const reference =
        `${evidence.sourceType}\u0000${evidence.sourceId}\u0000${evidence.sourceName}`;
      if (!references.has(reference)) {
        issues.push({
          championId: profile.championId,
          key: capability.key,
          problem: `evidência referencia fonte inexistente: ${evidence.sourceType}/${evidence.sourceId}`
        });
      }
    }
  }

  for (const key of CHAMPION_CAPABILITY_KEYS) {
    if (!seen.has(key)) {
      issues.push({
        championId: profile.championId,
        key,
        problem: "capacidade prevista ausente"
      });
    }
  }

  const available = profile.capabilities.filter(
    (capability) =>
      capability.status === "AVAILABLE" || capability.status === "PARTIAL"
  ).length;
  const expectedCoverage =
    Math.round((available / CHAMPION_CAPABILITY_KEYS.length) * 10_000) /
    10_000;
  if (
    profile.totalCapabilities !== CHAMPION_CAPABILITY_KEYS.length ||
    profile.availableCapabilities !== available ||
    profile.coverage !== expectedCoverage
  ) {
    issues.push({
      championId: profile.championId,
      problem: "contagem ou cobertura inconsistente"
    });
  }
  return issues;
}

export function parseChampionCapabilityManifest(
  raw: unknown
): ChampionCapabilityManifest {
  if (!isRecord(raw) || !isRecord(raw.metadata) || !Array.isArray(raw.profiles)) {
    throw new Error("Manifesto de capacidades inválido.");
  }
  const metadata = raw.metadata;
  if (
    typeof metadata.dataDragonVersion !== "string" ||
    typeof metadata.locale !== "string" ||
    typeof metadata.sourceResourceTemplate !== "string" ||
    typeof metadata.algorithmVersion !== "string" ||
    typeof metadata.generatedAt !== "string"
  ) {
    throw new Error("Metadados do manifesto de capacidades inválidos.");
  }
  const profiles = raw.profiles.map(readProfile);
  if (profiles.some((profile) => profile === undefined)) {
    throw new Error("Perfil estruturalmente inválido no manifesto de capacidades.");
  }
  const parsed: ChampionCapabilityManifest = {
    metadata: {
      dataDragonVersion: metadata.dataDragonVersion,
      locale: metadata.locale,
      sourceResourceTemplate: metadata.sourceResourceTemplate,
      algorithmVersion: metadata.algorithmVersion,
      generatedAt: metadata.generatedAt
    },
    profiles: profiles as ChampionCapabilityProfile[]
  };
  const issues = parsed.profiles.flatMap(validateChampionCapabilityProfile);
  if (issues.length > 0) {
    throw new Error(
      `Manifesto de capacidades contém ${issues.length} inconsistência(s): ${issues[0]?.problem}`
    );
  }
  return parsed;
}

export function buildChampionCapabilityManifest(input: {
  profiles: ChampionCapabilityProfile[];
  dataDragonVersion: string;
  locale?: string;
  now: string;
  previous?: ChampionCapabilityManifest;
}): {
  manifest: ChampionCapabilityManifest;
  report: ChampionCapabilityManifestReport;
} {
  const profiles = [...input.profiles].sort(
    (left, right) => left.championId - right.championId
  );
  const validationIssues = profiles.flatMap(validateChampionCapabilityProfile);
  const locale = input.locale ?? CHAMPION_CAPABILITY_LOCALE;
  const unchanged =
    validationIssues.length === 0 &&
    input.previous?.metadata.dataDragonVersion === input.dataDragonVersion &&
    input.previous.metadata.locale === locale &&
    input.previous.metadata.algorithmVersion ===
      CHAMPION_CAPABILITY_ALGORITHM_VERSION &&
    JSON.stringify(input.previous.profiles) === JSON.stringify(profiles);

  return {
    manifest: {
      metadata: {
        dataDragonVersion: input.dataDragonVersion,
        locale,
        sourceResourceTemplate: "champion/{championKey}.json",
        algorithmVersion: CHAMPION_CAPABILITY_ALGORITHM_VERSION,
        generatedAt: unchanged
          ? input.previous!.metadata.generatedAt
          : input.now
      },
      profiles
    },
    report: { unchanged, validationIssues }
  };
}

export function serializeChampionCapabilityManifest(
  manifest: ChampionCapabilityManifest
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
