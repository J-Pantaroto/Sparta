import type {
  CapabilityEvidence,
  ChampionCapabilityKey,
  ChampionCapabilityProfile
} from "../types/champion-capability.js";
import type { AvailabilityStatus, DataProvenance } from "../types/provenance.js";
import type { PatchChange, PatchRelease, StructuredPatchDelta } from "./patch-intelligence.js";

export const THEORETICAL_PATCH_IMPACT_ALGORITHM_VERSION =
  "theoretical-patch-impact/1.0.0";

export const PATCH_IMPACT_DIMENSIONS = [
  "INITIAL_DAMAGE",
  "SUSTAINED_DAMAGE",
  "BURST",
  "POKE",
  "WAVECLEAR",
  "MOBILITY",
  "ENGAGE",
  "DISENGAGE",
  "PEEL",
  "PROTECTION",
  "CONTROL",
  "RANGE",
  "RESISTANCE",
  "SUSTAIN",
  "RESOURCE_COST",
  "COOLDOWN",
  "SCALING",
  "EARLY_POWER",
  "MID_POWER",
  "LATE_POWER",
  "CONSISTENCY",
  "ERROR_TOLERANCE",
  "UNCLASSIFIED"
] as const;

export type PatchImpactDimension = (typeof PATCH_IMPACT_DIMENSIONS)[number];
export type PatchImpactDirection =
  | "POSITIVE"
  | "NEGATIVE"
  | "MIXED"
  | "NEUTRAL"
  | "UNKNOWN";
export type PatchImpactMagnitude = "MINOR" | "MODERATE" | "MAJOR";

export interface PatchImpactCapabilityEvidence {
  key: ChampionCapabilityKey;
  sourceType: CapabilityEvidence["sourceType"];
  sourceId: string;
  sourceName: string;
  sourceText?: string;
  extractionRule: string;
  provenance: DataProvenance;
}

export interface PatchImpactEvidence {
  patchChangeId: string;
  affectedComponent?: string;
  structuredChangeIndex?: number;
  label?: string;
  previousValue?: string;
  newValue?: string;
  numericPreviousValue?: number;
  numericNewValue?: number;
  relativeChange?: number;
  relationship: "DIRECT" | "CAPABILITY_DERIVED" | "UNINTERPRETED";
  officialProvenance: DataProvenance;
  capability?: PatchImpactCapabilityEvidence;
}

export interface TheoreticalPatchImpactSignal {
  dimension: PatchImpactDimension;
  direction: PatchImpactDirection;
  magnitude: PatchImpactMagnitude | null;
  status: AvailabilityStatus;
  explanation: string;
  supportingChangeIds: string[];
  evidence: PatchImpactEvidence[];
  unavailableReason?: string;
}

export interface TheoreticalPatchImpact {
  patch: string;
  championId: number;
  patchRevision: number;
  sourceHash: string;
  entityChanged: boolean;
  status: AvailabilityStatus;
  /** Fração 0-1 das unidades oficiais interpretáveis coberta pelo algoritmo. */
  coverage: number;
  signals: TheoreticalPatchImpactSignal[];
  unavailableSignals: TheoreticalPatchImpactSignal[];
  patchChangeIds: string[];
  algorithmVersion: string;
  capabilityAlgorithmVersion?: string;
  provenance: DataProvenance;
  unavailableReason?: string;
}

export interface TheoreticalPatchImpactCollection {
  patch: string;
  locale: string;
  patchRevision: number;
  sourceHash: string;
  status: AvailabilityStatus;
  impacts: TheoreticalPatchImpact[];
  algorithmVersion: string;
  provenance: DataProvenance;
}

type NumericDirection = "DIRECT" | "INVERSE";

interface ImpactRule {
  id: string;
  dimension: PatchImpactDimension;
  patterns: readonly RegExp[];
  numericDirection: NumericDirection;
  effect: string;
  requiredCapabilities?: readonly ChampionCapabilityKey[];
}

interface MatchedCapability {
  key: ChampionCapabilityKey;
  evidence: CapabilityEvidence;
  provenance: DataProvenance;
  status: AvailabilityStatus;
}

interface AtomicSignal {
  dimension: PatchImpactDimension;
  direction: Exclude<PatchImpactDirection, "MIXED" | "UNKNOWN">;
  magnitude: PatchImpactMagnitude | null;
  status: AvailabilityStatus;
  explanation: string;
  changeId: string;
  evidence: PatchImpactEvidence;
}

interface AnalysisUnit {
  change: PatchChange;
  delta?: StructuredPatchDelta;
  deltaIndex?: number;
}

const DIRECT_RULES: readonly ImpactRule[] = [
  {
    id: "cooldown-reduction",
    dimension: "COOLDOWN",
    patterns: [/\breducao do tempo de recarga\b/, /\breducao de recarga\b/],
    numericDirection: "DIRECT",
    effect: "a frequência teórica de uso do componente"
  },
  {
    id: "cooldown",
    dimension: "COOLDOWN",
    patterns: [/\btempo de recarga\b/, /\brecarga\b/, /\bcooldown\b/],
    numericDirection: "INVERSE",
    effect: "a frequência teórica de uso do componente"
  },
  {
    id: "resource-cost",
    dimension: "RESOURCE_COST",
    patterns: [
      /\bcusto de mana\b/,
      /\bcusto de energia\b/,
      /\bcusto de vida\b/,
      /\bcusto de recurso/
    ],
    numericDirection: "INVERSE",
    effect: "a disponibilidade teórica de recursos para usos repetidos"
  },
  {
    id: "scaling",
    dimension: "SCALING",
    patterns: [/\bcrescimento\b/, /\bpor nivel\b/, /\bescalonamento\b/],
    numericDirection: "DIRECT",
    effect: "o crescimento teórico ao longo dos níveis"
  },
  {
    id: "initial-damage",
    dimension: "INITIAL_DAMAGE",
    patterns: [/\bdano inicial\b/, /\bdano do primeiro\b/, /\bprimeiro acerto\b/],
    numericDirection: "DIRECT",
    effect: "o dano teórico aplicado no início da interação"
  },
  {
    id: "sustained-damage",
    dimension: "SUSTAINED_DAMAGE",
    patterns: [
      /\bdano por segundo\b/,
      /\bdano ao longo do tempo\b/,
      /\bdano por ataque\b/,
      /\bdano por acerto\b/,
      /\bdano ao contato\b/
    ],
    numericDirection: "DIRECT",
    effect: "o dano teórico sustentado em aplicações repetidas"
  },
  {
    id: "burst",
    dimension: "BURST",
    patterns: [/\bdano explosivo\b/, /\bexplosao de dano\b/],
    numericDirection: "DIRECT",
    effect: "o dano explosivo teórico"
  },
  {
    id: "poke",
    dimension: "POKE",
    patterns: [/\bpoke\b/, /\bdano de assedio\b/],
    numericDirection: "DIRECT",
    effect: "a pressão teórica à distância antes do confronto"
  },
  {
    id: "waveclear",
    dimension: "WAVECLEAR",
    patterns: [/\bdano (?:contra|a) tropas\b/, /\blimpeza de onda\b/, /\bwave ?clear\b/],
    numericDirection: "DIRECT",
    effect: "a limpeza teórica de ondas"
  },
  {
    id: "mobility",
    dimension: "MOBILITY",
    patterns: [/\bvelocidade de movimento\b/, /\bdistancia do dash\b/, /\bdistancia do avanco\b/],
    numericDirection: "DIRECT",
    effect: "a mobilidade teórica"
  },
  {
    id: "engage",
    dimension: "ENGAGE",
    patterns: [/\biniciacao\b/, /\bengage\b/],
    numericDirection: "DIRECT",
    effect: "a capacidade teórica de iniciar confrontos",
    requiredCapabilities: ["ENGAGE"]
  },
  {
    id: "disengage",
    dimension: "DISENGAGE",
    patterns: [/\bdesengage\b/, /\bdesengajamento\b/],
    numericDirection: "DIRECT",
    effect: "a capacidade teórica de interromper confrontos",
    requiredCapabilities: ["DISENGAGE"]
  },
  {
    id: "peel",
    dimension: "PEEL",
    patterns: [/\bpeel\b/, /\bprotecao de aliados\b/],
    numericDirection: "DIRECT",
    effect: "a capacidade teórica de proteger aliados sob ameaça",
    requiredCapabilities: ["PEEL"]
  },
  {
    id: "protection",
    dimension: "PROTECTION",
    patterns: [/\bescudo\b/, /\bbarreira\b/],
    numericDirection: "DIRECT",
    effect: "a proteção teórica fornecida pelo componente",
    requiredCapabilities: ["PROTECTION"]
  },
  {
    id: "control",
    dimension: "CONTROL",
    patterns: [
      /\batordoamento\b/,
      /\benraizamento\b/,
      /\bsupressao\b/,
      /\bprovocacao\b/,
      /\bmedo\b/,
      /\bencanto\b/,
      /\bsilencio\b/,
      /\blentidao\b/,
      /\bcontrole de grupo\b/
    ],
    numericDirection: "DIRECT",
    effect: "a intensidade ou duração teórica do controle"
  },
  {
    id: "range",
    dimension: "RANGE",
    patterns: [/\balcance\b/],
    numericDirection: "DIRECT",
    effect: "o alcance teórico do componente"
  },
  {
    id: "resistance",
    dimension: "RESISTANCE",
    patterns: [
      /^armadura$/,
      /^resistencia magica$/,
      /^vida$/,
      /\barmadura base\b/,
      /\bresistencia magica base\b/,
      /\barmadura\b.*\badicionais?\b/,
      /\bresistencia magica\b.*\badicionais?\b/,
      /\breducao de dano recebido\b/,
      /\bvida maxima\b/
    ],
    numericDirection: "DIRECT",
    effect: "a resistência teórica a dano"
  },
  {
    id: "sustain",
    dimension: "SUSTAIN",
    patterns: [/\bregeneracao de vida\b/, /\bcura propria\b/, /\broubo de vida\b/, /\bvampirismo\b/],
    numericDirection: "DIRECT",
    effect: "a sustentação teórica ao longo do combate"
  },
  {
    id: "early-power",
    dimension: "EARLY_POWER",
    patterns: [/\binicio de jogo\b/, /\bniveis iniciais\b/],
    numericDirection: "DIRECT",
    effect: "a força teórica no início da partida"
  },
  {
    id: "mid-power",
    dimension: "MID_POWER",
    patterns: [/\bmeio de jogo\b/],
    numericDirection: "DIRECT",
    effect: "a força teórica no meio da partida"
  },
  {
    id: "late-power",
    dimension: "LATE_POWER",
    patterns: [/\bfim de jogo\b/, /\bniveis finais\b/],
    numericDirection: "DIRECT",
    effect: "a força teórica no fim da partida"
  },
  {
    id: "consistency",
    dimension: "CONSISTENCY",
    patterns: [/\bconsistencia\b/, /\bprecisao\b/],
    numericDirection: "DIRECT",
    effect: "a consistência teórica de aplicação"
  },
  {
    id: "error-tolerance",
    dimension: "ERROR_TOLERANCE",
    patterns: [/\bmargem de erro\b/, /\btolerancia a erro\b/],
    numericDirection: "DIRECT",
    effect: "a tolerância teórica a erro de execução"
  }
];

const CAPABILITY_DAMAGE_DIMENSIONS: Readonly<
  Partial<Record<ChampionCapabilityKey, PatchImpactDimension>>
> = {
  BURST: "BURST",
  POKE: "POKE",
  WAVECLEAR: "WAVECLEAR",
  SUSTAINED_DAMAGE: "SUSTAINED_DAMAGE"
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function componentMatchesEvidence(
  affectedComponent: string | undefined,
  evidence: CapabilityEvidence
): boolean {
  if (!affectedComponent || evidence.sourceType === "CHAMPION_METADATA") return false;
  const component = normalizeText(affectedComponent);
  const sourceName = normalizeText(evidence.sourceName);
  return sourceName.length > 0 && component.includes(sourceName);
}

function matchedCapabilities(
  profile: ChampionCapabilityProfile | undefined,
  affectedComponent: string | undefined
): MatchedCapability[] {
  if (!profile) return [];
  return profile.capabilities.flatMap((capability) => {
    if (capability.status === "UNAVAILABLE") return [];
    return capability.evidence
      .filter((evidence) => componentMatchesEvidence(affectedComponent, evidence))
      .map((evidence) => ({
        key: capability.key,
        evidence,
        provenance: capability.provenance,
        status: capability.status
      }));
  });
}

function relativeChange(previous: number, next: number): number | undefined {
  if (!Number.isFinite(previous) || !Number.isFinite(next) || previous === 0) return undefined;
  return Math.abs((next - previous) / previous);
}

/**
 * Bandas proporcionais documentadas em `docs/theoretical-patch-impact.md`.
 * Elas só comparam o mesmo escalar/unidade e nunca são aplicadas a séries,
 * fórmulas, texto ou mudanças compensadas.
 */
export function classifyPatchImpactMagnitude(
  previous: number,
  next: number
): PatchImpactMagnitude | null {
  const relative = relativeChange(previous, next);
  if (relative === undefined || previous === next) return null;
  if (relative < 0.1) return "MINOR";
  if (relative <= 0.25) return "MODERATE";
  return "MAJOR";
}

function directionFor(
  previous: number,
  next: number,
  numericDirection: NumericDirection
): Exclude<PatchImpactDirection, "MIXED" | "UNKNOWN"> {
  if (next === previous) return "NEUTRAL";
  const increasesEffect = numericDirection === "DIRECT" ? next > previous : next < previous;
  return increasesEffect ? "POSITIVE" : "NEGATIVE";
}

function signalStatus(
  release: PatchRelease,
  unit: AnalysisUnit,
  capability?: MatchedCapability
): AvailabilityStatus {
  if (
    release.status === "STALE" ||
    unit.change.status === "STALE" ||
    unit.delta?.status === "STALE"
  ) {
    return "STALE";
  }
  if (
    capability?.status === "PARTIAL" ||
    unit.change.status === "PARTIAL" ||
    unit.delta?.status === "PARTIAL"
  ) {
    return "PARTIAL";
  }
  return "AVAILABLE";
}

function capabilityEvidence(
  capability: MatchedCapability
): PatchImpactCapabilityEvidence {
  return {
    key: capability.key,
    sourceType: capability.evidence.sourceType,
    sourceId: capability.evidence.sourceId,
    sourceName: capability.evidence.sourceName,
    ...(capability.evidence.sourceText
      ? { sourceText: capability.evidence.sourceText }
      : {}),
    extractionRule: capability.evidence.extractionRule,
    provenance: capability.provenance
  };
}

function patchEvidence(
  unit: AnalysisUnit,
  relationship: PatchImpactEvidence["relationship"],
  capability?: MatchedCapability
): PatchImpactEvidence {
  const delta = unit.delta;
  const previous = delta?.numericPreviousValue;
  const next = delta?.numericNewValue;
  const relative =
    previous !== undefined && next !== undefined
      ? relativeChange(previous, next)
      : undefined;
  return {
    patchChangeId: unit.change.id,
    ...(unit.change.affectedComponent
      ? { affectedComponent: unit.change.affectedComponent }
      : {}),
    ...(unit.deltaIndex !== undefined ? { structuredChangeIndex: unit.deltaIndex } : {}),
    ...(delta?.label ? { label: delta.label } : {}),
    ...(delta?.previousValue !== undefined ? { previousValue: delta.previousValue } : {}),
    ...(delta?.newValue !== undefined ? { newValue: delta.newValue } : {}),
    ...(previous !== undefined ? { numericPreviousValue: previous } : {}),
    ...(next !== undefined ? { numericNewValue: next } : {}),
    ...(relative !== undefined ? { relativeChange: relative } : {}),
    relationship,
    officialProvenance: unit.change.provenance,
    ...(capability ? { capability: capabilityEvidence(capability) } : {})
  };
}

function comparableDelta(
  delta: StructuredPatchDelta | undefined
): delta is StructuredPatchDelta & {
  numericPreviousValue: number;
  numericNewValue: number;
} {
  return Boolean(
    delta &&
      Number.isFinite(delta.numericPreviousValue) &&
      Number.isFinite(delta.numericNewValue)
  );
}

function matchingRules(label: string): ImpactRule[] {
  const normalized = normalizeText(label);
  const matched = DIRECT_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(normalized))
  );
  const cooldownReduction = matched.some((rule) => rule.id === "cooldown-reduction");
  return matched.filter((rule) => {
    if (cooldownReduction && rule.id === "cooldown") return false;
    if (
      rule.dimension === "MOBILITY" &&
      /\breducao (?:da|de) velocidade de movimento\b/.test(normalized)
    ) {
      return false;
    }
    if (rule.dimension === "RESISTANCE" && /\bpenetracao\b/.test(normalized)) {
      return false;
    }
    return true;
  });
}

function analyzeUnit(
  release: PatchRelease,
  unit: AnalysisUnit,
  profile: ChampionCapabilityProfile | undefined
): { signals: AtomicSignal[]; unavailable?: TheoreticalPatchImpactSignal } {
  if (unit.change.changeType === "BUGFIX") {
    return {
      signals: [],
      unavailable: unavailableSignal(
        unit,
        "UNCLASSIFIED",
        "Correção de bug preservada sem direção automática; o texto não fornece uma relação funcional segura para este algoritmo."
      )
    };
  }

  const label = unit.delta?.label ?? unit.change.affectedComponent ?? unit.change.entityName;
  const rules = matchingRules(label);
  const capabilities = matchedCapabilities(profile, unit.change.affectedComponent);
  const numericRules = [...rules];

  if (/\bdano\b/.test(normalizeText(label))) {
    for (const capability of capabilities) {
      const dimension = CAPABILITY_DAMAGE_DIMENSIONS[capability.key];
      if (!dimension || numericRules.some((rule) => rule.dimension === dimension)) continue;
      numericRules.push({
        id: `capability-${capability.key}`,
        dimension,
        patterns: [],
        numericDirection: "DIRECT",
        effect: `a dimensão ${dimension.toLowerCase()} associada ao componente`,
        requiredCapabilities: [capability.key]
      });
    }
  }

  if (numericRules.length === 0) {
    return {
      signals: [],
      unavailable: unavailableSignal(
        unit,
        "UNCLASSIFIED",
        "A mudança oficial não corresponde a uma dimensão teórica suportada sem acrescentar conhecimento externo."
      )
    };
  }

  if (!comparableDelta(unit.delta)) {
    return {
      signals: [],
      unavailable: unavailableSignal(
        unit,
        numericRules[0]!.dimension,
        "A dimensão foi reconhecida, mas os valores publicados não formam um escalar anterior/novo comparável na mesma unidade."
      )
    };
  }

  const signals: AtomicSignal[] = [];
  let capabilityMissingRule: ImpactRule | undefined;
  for (const rule of numericRules) {
    const capability = rule.requiredCapabilities
      ? capabilities.find((entry) => rule.requiredCapabilities!.includes(entry.key))
      : undefined;
    if (rule.requiredCapabilities && !capability) {
      capabilityMissingRule ??= rule;
      continue;
    }
    const direction = directionFor(
      unit.delta.numericPreviousValue,
      unit.delta.numericNewValue,
      rule.numericDirection
    );
    const before = unit.delta.previousValue ?? String(unit.delta.numericPreviousValue);
    const after = unit.delta.newValue ?? String(unit.delta.numericNewValue);
    const relationship = capability ? "CAPABILITY_DERIVED" : "DIRECT";
    signals.push({
      dimension: rule.dimension,
      direction,
      magnitude:
        direction === "NEUTRAL"
          ? null
          : classifyPatchImpactMagnitude(
              unit.delta.numericPreviousValue,
              unit.delta.numericNewValue
            ),
      status: signalStatus(release, unit, capability),
      explanation:
        `${unit.delta.label} mudou de ${before} para ${after}. ` +
        `Isso pode afetar ${rule.effect}.` +
        (capability
          ? ` A relação com ${capability.evidence.sourceName} foi derivada pelo Sparta a partir da capacidade ${capability.key}.`
          : ""),
      changeId: unit.change.id,
      evidence: patchEvidence(unit, relationship, capability)
    });
  }

  if (signals.length > 0) return { signals };
  const missing = capabilityMissingRule ?? numericRules[0]!;
  return {
    signals: [],
    unavailable: unavailableSignal(
      unit,
      missing.dimension,
      "A nota permite reconhecer a dimensão, mas não há capacidade rastreável da mesma habilidade para sustentar a relação estratégica."
    )
  };
}

function unavailableSignal(
  unit: AnalysisUnit,
  dimension: PatchImpactDimension,
  unavailableReason: string
): TheoreticalPatchImpactSignal {
  return {
    dimension,
    direction: "UNKNOWN",
    magnitude: null,
    status: "UNAVAILABLE",
    explanation: "O impacto teórico desta unidade oficial permanece indisponível.",
    supportingChangeIds: [unit.change.id],
    evidence: [patchEvidence(unit, "UNINTERPRETED")],
    unavailableReason
  };
}

function aggregateDirection(directions: AtomicSignal["direction"][]): PatchImpactDirection {
  const set = new Set(directions);
  if (set.has("POSITIVE") && set.has("NEGATIVE")) return "MIXED";
  if (set.has("POSITIVE")) return "POSITIVE";
  if (set.has("NEGATIVE")) return "NEGATIVE";
  return "NEUTRAL";
}

function aggregateSignals(atoms: AtomicSignal[]): TheoreticalPatchImpactSignal[] {
  const byDimension = new Map<PatchImpactDimension, AtomicSignal[]>();
  for (const atom of atoms) {
    byDimension.set(atom.dimension, [...(byDimension.get(atom.dimension) ?? []), atom]);
  }
  return [...byDimension.entries()]
    .map(([dimension, entries]): TheoreticalPatchImpactSignal => {
      const direction = aggregateDirection(entries.map((entry) => entry.direction));
      const explanations = [...new Set(entries.map((entry) => entry.explanation))];
      const status: AvailabilityStatus = entries.some((entry) => entry.status === "STALE")
        ? "STALE"
        : entries.some((entry) => entry.status === "PARTIAL")
          ? "PARTIAL"
          : "AVAILABLE";
      return {
        dimension,
        direction,
        magnitude:
          entries.length === 1 && direction !== "MIXED" && direction !== "NEUTRAL"
            ? entries[0]!.magnitude
            : null,
        status,
        explanation:
          (direction === "MIXED"
            ? "Há efeitos teóricos positivos e negativos preservados nesta dimensão. "
            : "") + explanations.join(" "),
        supportingChangeIds: [...new Set(entries.map((entry) => entry.changeId))],
        evidence: entries.map((entry) => entry.evidence)
      };
    })
    .sort((left, right) => left.dimension.localeCompare(right.dimension));
}

function analysisUnits(change: PatchChange): AnalysisUnit[] {
  return change.structuredChanges.length > 0
    ? change.structuredChanges.map((delta, deltaIndex) => ({ change, delta, deltaIndex }))
    : [{ change }];
}

function roundedCoverage(covered: number, total: number): number {
  if (total === 0) return 1;
  return Math.round((covered / total) * 10_000) / 10_000;
}

export function analyzeTheoreticalPatchImpact(input: {
  release: PatchRelease;
  championId: number;
  capabilityProfile?: ChampionCapabilityProfile;
}): TheoreticalPatchImpact {
  const changes = input.release.changes.filter(
    (change) =>
      change.entityType === "CHAMPION" &&
      change.entityId === input.championId &&
      change.entityResolution.status === "RESOLVED"
  );
  const patchChangeIds = [...new Set(changes.map((change) => change.id))];
  const provenanceBase: DataProvenance = {
    sourceType: "DERIVED",
    sourceId: "sparta-theoretical-patch-impact",
    resource: input.release.sourceUrl,
    patch: input.release.patch,
    locale: input.release.locale,
    collectedAt: input.release.collectedAt,
    algorithmVersion: THEORETICAL_PATCH_IMPACT_ALGORITHM_VERSION
  };

  if (changes.length === 0) {
    return {
      patch: input.release.patch,
      championId: input.championId,
      patchRevision: input.release.revision,
      sourceHash: input.release.sourceHash,
      entityChanged: false,
      status: input.release.status === "STALE" ? "STALE" : "AVAILABLE",
      coverage: 1,
      signals: [],
      unavailableSignals: [],
      patchChangeIds: [],
      algorithmVersion: THEORETICAL_PATCH_IMPACT_ALGORITHM_VERSION,
      ...(input.capabilityProfile
        ? { capabilityAlgorithmVersion: input.capabilityProfile.algorithmVersion }
        : {}),
      provenance: {
        ...provenanceBase,
        status: input.release.status === "STALE" ? "STALE" : "AVAILABLE"
      }
    };
  }

  const units = changes.flatMap(analysisUnits);
  const atoms: AtomicSignal[] = [];
  const unavailableSignals: TheoreticalPatchImpactSignal[] = [];
  let coveredUnits = 0;
  for (const unit of units) {
    const result = analyzeUnit(input.release, unit, input.capabilityProfile);
    atoms.push(...result.signals);
    if (result.signals.length > 0) coveredUnits += 1;
    if (result.unavailable) unavailableSignals.push(result.unavailable);
  }

  const signals = aggregateSignals(atoms);
  const coverage = roundedCoverage(coveredUnits, units.length);
  const status: AvailabilityStatus =
    input.release.status === "STALE"
      ? "STALE"
      : signals.length === 0
        ? "UNAVAILABLE"
        : unavailableSignals.length > 0
          ? "PARTIAL"
          : "AVAILABLE";
  const unavailableReason =
    signals.length === 0
      ? "Há mudança oficial, mas nenhuma dimensão pôde ser interpretada com segurança."
      : undefined;

  return {
    patch: input.release.patch,
    championId: input.championId,
    patchRevision: input.release.revision,
    sourceHash: input.release.sourceHash,
    entityChanged: true,
    status,
    coverage,
    signals,
    unavailableSignals,
    patchChangeIds,
    algorithmVersion: THEORETICAL_PATCH_IMPACT_ALGORITHM_VERSION,
    ...(input.capabilityProfile
      ? { capabilityAlgorithmVersion: input.capabilityProfile.algorithmVersion }
      : {}),
    provenance: {
      ...provenanceBase,
      status,
      ...(unavailableReason ? { unavailableReason } : {}),
      ...(input.release.staleReason ? { staleReason: input.release.staleReason } : {})
    },
    ...(unavailableReason ? { unavailableReason } : {})
  };
}

export function analyzeTheoreticalPatchImpacts(input: {
  release: PatchRelease;
  capabilityProfiles?: readonly ChampionCapabilityProfile[];
}): TheoreticalPatchImpactCollection {
  const championIds = [
    ...new Set(
      input.release.changes.flatMap((change) =>
        change.entityType === "CHAMPION" &&
        change.entityResolution.status === "RESOLVED" &&
        change.entityId !== undefined
          ? [change.entityId]
          : []
      )
    )
  ].sort((left, right) => left - right);
  const profiles = new Map(
    (input.capabilityProfiles ?? []).map((profile) => [profile.championId, profile])
  );
  const impacts = championIds.map((championId) =>
    analyzeTheoreticalPatchImpact({
      release: input.release,
      championId,
      capabilityProfile: profiles.get(championId)
    })
  );
  const status: AvailabilityStatus =
    input.release.status === "STALE"
      ? "STALE"
      : impacts.length === 0
        ? "AVAILABLE"
        : impacts.every((impact) => impact.status === "UNAVAILABLE")
        ? "UNAVAILABLE"
        : impacts.some((impact) => impact.status !== "AVAILABLE")
          ? "PARTIAL"
          : "AVAILABLE";
  const provenance: DataProvenance = {
    sourceType: "DERIVED",
    sourceId: "sparta-theoretical-patch-impact",
    resource: input.release.sourceUrl,
    patch: input.release.patch,
    locale: input.release.locale,
    collectedAt: input.release.collectedAt,
    algorithmVersion: THEORETICAL_PATCH_IMPACT_ALGORITHM_VERSION,
    status
  };
  return {
    patch: input.release.patch,
    locale: input.release.locale,
    patchRevision: input.release.revision,
    sourceHash: input.release.sourceHash,
    status,
    impacts,
    algorithmVersion: THEORETICAL_PATCH_IMPACT_ALGORITHM_VERSION,
    provenance
  };
}
