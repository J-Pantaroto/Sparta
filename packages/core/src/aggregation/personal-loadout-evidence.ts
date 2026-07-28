import type {
  CatalogEnrichment,
  CatalogResolutionStatus,
  MatchLoadoutObservation,
  ObservedRuneFragment,
  ObservedRuneSelection
} from "../types/match-observation.js";
import type { Role } from "../types/domain.js";
import type { AvailabilityStatus, DataProvenance } from "../types/provenance.js";

export const PERSONAL_LOADOUT_EVIDENCE_VERSION = "personal-loadout-evidence/1.0.0";

export interface PersonalLoadoutEvidenceFilters {
  championId: number;
  role: Role;
  requestedPatch?: string;
  queueIds?: number[];
  playedAtFrom?: string;
  playedAtTo?: string;
  recentMatches?: number;
}

export interface PersonalCatalogResolution {
  id: number;
  status: CatalogResolutionStatus;
  names: string[];
  assets: string[];
  catalogVersions: string[];
  provenance: DataProvenance[];
}

export interface PersonalLoadoutPatternBase {
  signature: string;
  status: Extract<AvailabilityStatus, "AVAILABLE" | "PARTIAL">;
  games: number;
  wins: number;
  losses: number;
  outcomeUnavailableGames: number;
  lastUsedAt: string | null;
  patches: string[];
  queueIds: number[];
  unknownPatchGames: number;
  unknownQueueGames: number;
  provenance: DataProvenance;
  observationProvenance: DataProvenance;
  limitations: string[];
}

export interface PersonalInventoryItem extends PersonalCatalogResolution {
  quantity: number;
}

export interface PersonalInventoryPattern extends PersonalLoadoutPatternBase {
  /**
   * Multiconjunto canônico: ordenado por ID, preserva repetições e ignora a
   * posição acidental nos slots. Não representa ordem de compra.
   */
  itemIds: number[];
  items: PersonalInventoryItem[];
  unavailableSlotCount: number;
}

export interface PersonalRuneSelection {
  tree: "PRIMARY" | "SECONDARY";
  order: number;
  perkId: number;
  isKeystone: boolean;
  enrichment: PersonalCatalogResolution;
}

export interface PersonalRuneFragment {
  slot: "OFFENSE" | "FLEX" | "DEFENSE";
  fragmentId?: number;
  enrichment?: PersonalCatalogResolution;
}

export interface PersonalRunePattern extends PersonalLoadoutPatternBase {
  primaryStyleId?: number;
  secondaryStyleId?: number;
  selections: PersonalRuneSelection[];
  fragments: PersonalRuneFragment[];
}

export interface PersonalSpellPattern extends PersonalLoadoutPatternBase {
  /** Par canônico ordenado. A ordem dos slots não muda a semântica do par. */
  spellIds: number[];
  spells: PersonalCatalogResolution[];
  /** Ordens realmente observadas, inclusive slots ausentes como `null`. */
  observedOrders: [number | null, number | null][];
}

export interface PersonalLoadoutPartAvailability {
  status: AvailabilityStatus;
  sampleSize: number;
  availableSampleSize: number;
  unavailableReason?: string;
}

export interface PersonalLoadoutPartsAvailability {
  finalInventories: PersonalLoadoutPartAvailability;
  runePages: PersonalLoadoutPartAvailability;
  summonerSpellSets: PersonalLoadoutPartAvailability;
}

export interface PersonalLoadoutHistory {
  status: AvailabilityStatus;
  sampleSize: number;
  availableSampleSize: number;
  patchScope: {
    observedPatches: string[];
    unknownPatchSamples: number;
  };
  queueScope: {
    requestedQueueIds?: number[];
    observedQueueIds: number[];
    unknownQueueSamples: number;
  };
  finalInventories: PersonalInventoryPattern[];
  runePages: PersonalRunePattern[];
  summonerSpellSets: PersonalSpellPattern[];
  parts: PersonalLoadoutPartsAvailability;
  provenance: DataProvenance;
  unavailableReason?: string;
  staleReason?: string;
}

export interface PersonalLoadoutEvidence extends PersonalLoadoutHistory {
  championId: number;
  role: Role;
  patchScope: PersonalLoadoutHistory["patchScope"] & {
    requestedPatch?: string;
    hasRequestedPatchObservations?: boolean;
  };
  filterScope: {
    playedAtFrom?: string;
    playedAtTo?: string;
    recentMatches?: number;
  };
  algorithmVersion: string;
  /**
   * Só existe quando um patch foi pedido e há observações fora dele. Nunca é
   * apresentado como configuração do patch solicitado.
   */
  recentHistory?: PersonalLoadoutHistory;
}

type UsableStatus = "AVAILABLE" | "PARTIAL";

interface Prepared<T> {
  observation: MatchLoadoutObservation;
  status?: UsableStatus;
  signature?: string;
  value?: T;
  limitations: string[];
}

interface InventoryValue {
  itemIds: number[];
  unavailableSlotCount: number;
}

interface RuneValue {
  primaryStyleId?: number;
  secondaryStyleId?: number;
  selections: ObservedRuneSelection[];
  fragments: ObservedRuneFragment[];
}

interface SpellValue {
  spellIds: number[];
  observedOrder: [number | null, number | null];
}

const PART_UNAVAILABLE = {
  finalInventories: "Nenhum inventário final foi observado neste contexto.",
  runePages: "Nenhuma página de runas foi observada neste contexto.",
  summonerSpellSets: "Nenhum par de feitiços foi observado neste contexto."
} as const;

function uniqueSorted<T extends number | string>(values: readonly T[]): T[] {
  return Array.from(new Set(values)).sort((left, right) =>
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right))
  );
}

function canonicalPatch(patch: string | undefined): string | undefined {
  if (!patch) return undefined;
  const match = patch.match(/^(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : patch;
}

function samePatch(left: string | undefined, right: string | undefined): boolean {
  const canonicalLeft = canonicalPatch(left);
  const canonicalRight = canonicalPatch(right);
  return canonicalLeft !== undefined && canonicalLeft === canonicalRight;
}

function timestamp(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function sortObservations(
  observations: readonly MatchLoadoutObservation[]
): MatchLoadoutObservation[] {
  return [...observations].sort((left, right) => {
    const leftTimestamp = timestamp(left.context.startedAt);
    const rightTimestamp = timestamp(right.context.startedAt);
    if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp;
    return left.matchId.localeCompare(right.matchId);
  });
}

function selectBaseObservations(
  observations: readonly MatchLoadoutObservation[],
  filters: PersonalLoadoutEvidenceFilters
): MatchLoadoutObservation[] {
  const selected = observations.filter((observation) => {
    if (observation.championId !== filters.championId) return false;
    if (observation.position.normalizedRole !== filters.role) return false;
    if (
      filters.queueIds &&
      (observation.context.queueId === undefined ||
        !filters.queueIds.includes(observation.context.queueId))
    ) {
      return false;
    }
    const playedAt = observation.context.startedAt;
    if (
      filters.playedAtFrom &&
      (!playedAt || timestamp(playedAt) < timestamp(filters.playedAtFrom))
    ) {
      return false;
    }
    if (filters.playedAtTo && (!playedAt || timestamp(playedAt) > timestamp(filters.playedAtTo))) {
      return false;
    }
    return true;
  });
  const sorted = sortObservations(selected);
  return filters.recentMatches === undefined
    ? sorted
    : sorted.slice(0, Math.max(0, filters.recentMatches));
}

function prepareInventory(observation: MatchLoadoutObservation): Prepared<InventoryValue> {
  const slots = [...observation.items].sort((left, right) => left.slot - right.slot);
  const itemIds = slots
    .filter((slot) => slot.state === "PRESENT" && (slot.itemId ?? 0) > 0)
    .map((slot) => slot.itemId!)
    .sort((left, right) => left - right);
  const unavailableSlotCount =
    Math.max(0, 7 - slots.length) +
    slots.filter(
      (slot) => slot.state === "UNAVAILABLE" || (slot.state === "PRESENT" && !slot.itemId)
    ).length;
  const hasObservedSlot = slots.some((slot) => slot.state === "PRESENT" || slot.state === "EMPTY");
  if (!hasObservedSlot) {
    return { observation, limitations: [PART_UNAVAILABLE.finalInventories] };
  }
  const status: UsableStatus = unavailableSlotCount > 0 ? "PARTIAL" : "AVAILABLE";
  return {
    observation,
    status,
    signature: `inventory/v1|items=${itemIds.join(",")}|unavailable=${unavailableSlotCount}`,
    value: { itemIds, unavailableSlotCount },
    limitations:
      status === "PARTIAL"
        ? ["Inventário parcialmente observado; slots ausentes não foram completados."]
        : []
  };
}

function runeTreeOrder(tree: ObservedRuneSelection["tree"]): number {
  return tree === "PRIMARY" ? 0 : 1;
}

function fragmentOrder(slot: ObservedRuneFragment["slot"]): number {
  return { OFFENSE: 0, FLEX: 1, DEFENSE: 2 }[slot];
}

function prepareRunes(observation: MatchLoadoutObservation): Prepared<RuneValue> {
  const runes = observation.runes;
  const selections = [...runes.selections].sort(
    (left, right) =>
      runeTreeOrder(left.tree) - runeTreeOrder(right.tree) ||
      left.order - right.order ||
      left.perkId - right.perkId
  );
  const fragments = [...runes.fragments].sort(
    (left, right) => fragmentOrder(left.slot) - fragmentOrder(right.slot)
  );
  const hasObservedValue =
    runes.primaryStyleId !== undefined ||
    runes.secondaryStyleId !== undefined ||
    selections.length > 0 ||
    fragments.some((fragment) => fragment.fragmentId !== undefined);
  if (!hasObservedValue) {
    return { observation, limitations: [PART_UNAVAILABLE.runePages] };
  }
  const complete =
    runes.status === "AVAILABLE" &&
    runes.primaryStyleId !== undefined &&
    runes.secondaryStyleId !== undefined &&
    selections.length > 0 &&
    fragments.length === 3 &&
    fragments.every(
      (fragment) => fragment.state === "PRESENT" && fragment.fragmentId !== undefined
    );
  const status: UsableStatus = complete ? "AVAILABLE" : "PARTIAL";
  const selectionSignature = selections
    .map(
      (selection) =>
        `${selection.tree}:${selection.order}:${selection.perkId}:${selection.isKeystone ? 1 : 0}`
    )
    .join(",");
  const fragmentSignature = fragments
    .map(
      (fragment) => `${fragment.slot}:${fragment.state}:${fragment.fragmentId?.toString() ?? "?"}`
    )
    .join(",");
  return {
    observation,
    status,
    signature:
      `runes/v1|status=${status}|primary=${runes.primaryStyleId ?? "?"}` +
      `|secondary=${runes.secondaryStyleId ?? "?"}|selections=${selectionSignature}` +
      `|fragments=${fragmentSignature}`,
    value: {
      primaryStyleId: runes.primaryStyleId,
      secondaryStyleId: runes.secondaryStyleId,
      selections,
      fragments
    },
    limitations:
      status === "PARTIAL"
        ? ["Página parcialmente observada; perks e fragmentos ausentes não foram completados."]
        : []
  };
}

function prepareSpells(observation: MatchLoadoutObservation): Prepared<SpellValue> {
  const slots = [...observation.summonerSpells].sort((left, right) => left.slot - right.slot);
  const observedOrder: [number | null, number | null] = [
    slots.find((slot) => slot.slot === 1)?.spellId ?? null,
    slots.find((slot) => slot.slot === 2)?.spellId ?? null
  ];
  const spellIds = observedOrder
    .filter((spellId): spellId is number => spellId !== null && spellId > 0)
    .sort((left, right) => left - right);
  if (spellIds.length === 0) {
    return { observation, limitations: [PART_UNAVAILABLE.summonerSpellSets] };
  }
  const status: UsableStatus = spellIds.length === 2 ? "AVAILABLE" : "PARTIAL";
  return {
    observation,
    status,
    signature: `spells/v1|status=${status}|ids=${spellIds.join(",")}`,
    value: { spellIds, observedOrder },
    limitations:
      status === "PARTIAL"
        ? ["Par de feitiços parcialmente observado; o slot ausente não foi completado."]
        : []
  };
}

function groupPrepared<T>(prepared: readonly Prepared<T>[]): Map<string, Prepared<T>[]> {
  const grouped = new Map<string, Prepared<T>[]>();
  for (const entry of prepared) {
    if (!entry.signature || !entry.status || !entry.value) continue;
    const group = grouped.get(entry.signature) ?? [];
    group.push(entry);
    grouped.set(entry.signature, group);
  }
  return grouped;
}

function patternBase<T>(
  signature: string,
  entries: readonly Prepared<T>[]
): PersonalLoadoutPatternBase {
  const observations = entries.map((entry) => entry.observation);
  const games = observations.length;
  const wins = observations.filter((observation) => observation.context.won === true).length;
  const losses = observations.filter((observation) => observation.context.won === false).length;
  const dates = observations
    .map((observation) => observation.context.startedAt)
    .filter((value): value is string => value !== undefined)
    .sort();
  const status: UsableStatus = entries.every((entry) => entry.status === "AVAILABLE")
    ? "AVAILABLE"
    : "PARTIAL";
  const limitations = uniqueSorted([
    ...entries.flatMap((entry) => entry.limitations),
    ...(games === 1
      ? ["Amostra de uma partida; frequência observada não indica superioridade."]
      : []),
    ...(observations.some((observation) => observation.context.patch === undefined)
      ? ["Há partida sem patch observado."]
      : []),
    ...(observations.some((observation) => observation.context.queueId === undefined)
      ? ["Há partida sem fila resolvida."]
      : [])
  ]);
  return {
    signature,
    status,
    games,
    wins,
    losses,
    outcomeUnavailableGames: games - wins - losses,
    lastUsedAt: dates.at(-1) ?? null,
    patches: uniqueSorted(
      observations
        .map((observation) => observation.context.patch)
        .filter((value): value is string => value !== undefined)
    ),
    queueIds: uniqueSorted(
      observations
        .map((observation) => observation.context.queueId)
        .filter((value): value is number => value !== undefined)
    ),
    unknownPatchGames: observations.filter((observation) => observation.context.patch === undefined)
      .length,
    unknownQueueGames: observations.filter(
      (observation) => observation.context.queueId === undefined
    ).length,
    provenance: {
      sourceType: "CALCULATED",
      sourceId: "sparta",
      resource: "MatchObservation",
      sampleSize: games,
      algorithmVersion: PERSONAL_LOADOUT_EVIDENCE_VERSION,
      status
    },
    observationProvenance: {
      sourceType: "OBSERVED",
      sourceId: "riot-match-v5",
      resource: "/lol/match/v5/matches/{matchId}",
      sampleSize: games,
      status
    },
    limitations
  };
}

function provenanceKey(provenance: DataProvenance): string {
  return JSON.stringify({
    sourceType: provenance.sourceType,
    sourceId: provenance.sourceId,
    resource: provenance.resource,
    patch: provenance.patch,
    locale: provenance.locale,
    status: provenance.status,
    staleReason: provenance.staleReason,
    unavailableReason: provenance.unavailableReason
  });
}

function catalogResolution(
  id: number,
  enrichments: readonly CatalogEnrichment[]
): PersonalCatalogResolution {
  const priority: Record<CatalogResolutionStatus, number> = {
    EXACT: 0,
    OTHER_VERSION: 1,
    UNAVAILABLE: 2
  };
  const ordered = [...enrichments].sort(
    (left, right) =>
      priority[left.status] - priority[right.status] ||
      (right.catalogVersion ?? "").localeCompare(left.catalogVersion ?? "") ||
      (left.name ?? "").localeCompare(right.name ?? "")
  );
  const status = ordered[0]?.status ?? "UNAVAILABLE";
  const provenance = new Map<string, DataProvenance>();
  for (const enrichment of enrichments) {
    provenance.set(provenanceKey(enrichment.provenance), enrichment.provenance);
  }
  return {
    id,
    status,
    names: uniqueSorted(
      ordered.map((entry) => entry.name).filter((value): value is string => value !== undefined)
    ),
    assets: uniqueSorted(
      ordered.map((entry) => entry.asset).filter((value): value is string => value !== undefined)
    ),
    catalogVersions: uniqueSorted(
      ordered
        .map((entry) => entry.catalogVersion)
        .filter((value): value is string => value !== undefined)
    ),
    provenance: [...provenance.values()]
  };
}

function sortPatterns<T extends PersonalLoadoutPatternBase>(patterns: T[]): T[] {
  return patterns.sort(
    (left, right) =>
      right.games - left.games ||
      timestamp(right.lastUsedAt ?? undefined) - timestamp(left.lastUsedAt ?? undefined) ||
      left.signature.localeCompare(right.signature)
  );
}

function inventoryPatterns(
  prepared: readonly Prepared<InventoryValue>[]
): PersonalInventoryPattern[] {
  const patterns: PersonalInventoryPattern[] = [];
  for (const [signature, entries] of groupPrepared(prepared)) {
    const value = entries[0]!.value!;
    const items = uniqueSorted(value.itemIds).map((itemId) => {
      const enrichments = entries.flatMap((entry) =>
        entry.observation.items
          .filter((slot) => slot.itemId === itemId)
          .map((slot) => slot.enrichment)
      );
      return {
        ...catalogResolution(itemId, enrichments),
        quantity: value.itemIds.filter((candidate) => candidate === itemId).length
      };
    });
    const unresolved = items.filter((item) => item.status === "UNAVAILABLE").map((item) => item.id);
    const base = patternBase(signature, entries);
    patterns.push({
      ...base,
      limitations: uniqueSorted([
        ...base.limitations,
        ...(unresolved.length > 0
          ? [`IDs de item sem resolução no catálogo: ${unresolved.join(", ")}.`]
          : [])
      ]),
      itemIds: value.itemIds,
      items,
      unavailableSlotCount: value.unavailableSlotCount
    });
  }
  return sortPatterns(patterns);
}

function runePatterns(prepared: readonly Prepared<RuneValue>[]): PersonalRunePattern[] {
  const patterns: PersonalRunePattern[] = [];
  for (const [signature, entries] of groupPrepared(prepared)) {
    const value = entries[0]!.value!;
    const selections = value.selections.map((selection) => {
      const enrichments = entries.flatMap((entry) =>
        entry
          .value!.selections.filter(
            (candidate) =>
              candidate.tree === selection.tree &&
              candidate.order === selection.order &&
              candidate.perkId === selection.perkId
          )
          .map((candidate) => candidate.enrichment)
      );
      return {
        tree: selection.tree,
        order: selection.order,
        perkId: selection.perkId,
        isKeystone: selection.isKeystone,
        enrichment: catalogResolution(selection.perkId, enrichments)
      };
    });
    const fragments = value.fragments.map((fragment) => {
      if (fragment.fragmentId === undefined) return { slot: fragment.slot };
      const enrichments = entries.flatMap((entry) =>
        entry
          .value!.fragments.filter(
            (candidate) =>
              candidate.slot === fragment.slot && candidate.fragmentId === fragment.fragmentId
          )
          .map((candidate) => candidate.enrichment)
      );
      return {
        slot: fragment.slot,
        fragmentId: fragment.fragmentId,
        enrichment: catalogResolution(fragment.fragmentId, enrichments)
      };
    });
    const unresolved = [
      ...selections
        .filter((selection) => selection.enrichment.status === "UNAVAILABLE")
        .map((selection) => selection.perkId),
      ...fragments
        .filter(
          (fragment) =>
            fragment.fragmentId !== undefined && fragment.enrichment?.status === "UNAVAILABLE"
        )
        .map((fragment) => fragment.fragmentId!)
    ];
    const base = patternBase(signature, entries);
    patterns.push({
      ...base,
      limitations: uniqueSorted([
        ...base.limitations,
        ...(unresolved.length > 0
          ? [`IDs de runa sem resolução no catálogo: ${uniqueSorted(unresolved).join(", ")}.`]
          : [])
      ]),
      primaryStyleId: value.primaryStyleId,
      secondaryStyleId: value.secondaryStyleId,
      selections,
      fragments
    });
  }
  return sortPatterns(patterns);
}

function spellPatterns(prepared: readonly Prepared<SpellValue>[]): PersonalSpellPattern[] {
  const patterns: PersonalSpellPattern[] = [];
  for (const [signature, entries] of groupPrepared(prepared)) {
    const value = entries[0]!.value!;
    const spells = uniqueSorted(value.spellIds).map((spellId) =>
      catalogResolution(
        spellId,
        entries.flatMap((entry) =>
          entry.observation.summonerSpells
            .filter((slot) => slot.spellId === spellId)
            .map((slot) => slot.enrichment)
        )
      )
    );
    const unresolved = spells
      .filter((spell) => spell.status === "UNAVAILABLE")
      .map((spell) => spell.id);
    const orderByKey = new Map<string, [number | null, number | null]>();
    for (const entry of entries) {
      orderByKey.set(entry.value!.observedOrder.join(","), entry.value!.observedOrder);
    }
    const observedOrders = [...orderByKey.values()].sort(
      (left, right) =>
        (left[0] ?? Number.MAX_SAFE_INTEGER) - (right[0] ?? Number.MAX_SAFE_INTEGER) ||
        (left[1] ?? Number.MAX_SAFE_INTEGER) - (right[1] ?? Number.MAX_SAFE_INTEGER)
    );
    const base = patternBase(signature, entries);
    patterns.push({
      ...base,
      limitations: uniqueSorted([
        ...base.limitations,
        ...(unresolved.length > 0
          ? [`IDs de feitiço sem resolução no catálogo: ${unresolved.join(", ")}.`]
          : [])
      ]),
      spellIds: value.spellIds,
      spells,
      observedOrders
    });
  }
  return sortPatterns(patterns);
}

function partAvailability<T>(
  prepared: readonly Prepared<T>[],
  unavailableReason: string
): PersonalLoadoutPartAvailability {
  const availableSampleSize = prepared.filter((entry) => entry.status !== undefined).length;
  const status: AvailabilityStatus =
    availableSampleSize === 0
      ? "UNAVAILABLE"
      : prepared.every((entry) => entry.status === "AVAILABLE")
        ? "AVAILABLE"
        : "PARTIAL";
  return {
    status,
    sampleSize: prepared.length,
    availableSampleSize,
    ...(status === "UNAVAILABLE" ? { unavailableReason } : {})
  };
}

function buildHistory(
  observations: readonly MatchLoadoutObservation[],
  requestedQueueIds?: number[]
): PersonalLoadoutHistory {
  const inventories = observations.map(prepareInventory);
  const runes = observations.map(prepareRunes);
  const spells = observations.map(prepareSpells);
  const parts: PersonalLoadoutPartsAvailability = {
    finalInventories: partAvailability(inventories, PART_UNAVAILABLE.finalInventories),
    runePages: partAvailability(runes, PART_UNAVAILABLE.runePages),
    summonerSpellSets: partAvailability(spells, PART_UNAVAILABLE.summonerSpellSets)
  };
  const sampleSize = observations.length;
  const availableMatchIds = new Set<string>();
  for (const prepared of [inventories, runes, spells]) {
    for (const entry of prepared) {
      if (entry.status) availableMatchIds.add(entry.observation.matchId);
    }
  }
  const availableSampleSize = availableMatchIds.size;
  const unavailableReason =
    sampleSize === 0
      ? "Nenhuma partida observada com este campeão nesta posição para os filtros informados."
      : undefined;
  const status: AvailabilityStatus =
    sampleSize === 0
      ? "UNAVAILABLE"
      : Object.values(parts).every((part) => part.status === "AVAILABLE")
        ? "AVAILABLE"
        : "PARTIAL";
  return {
    status,
    sampleSize,
    availableSampleSize,
    patchScope: {
      observedPatches: uniqueSorted(
        observations
          .map((observation) => observation.context.patch)
          .filter((value): value is string => value !== undefined)
      ),
      unknownPatchSamples: observations.filter(
        (observation) => observation.context.patch === undefined
      ).length
    },
    queueScope: {
      ...(requestedQueueIds ? { requestedQueueIds: uniqueSorted(requestedQueueIds) } : {}),
      observedQueueIds: uniqueSorted(
        observations
          .map((observation) => observation.context.queueId)
          .filter((value): value is number => value !== undefined)
      ),
      unknownQueueSamples: observations.filter(
        (observation) => observation.context.queueId === undefined
      ).length
    },
    finalInventories: inventoryPatterns(inventories),
    runePages: runePatterns(runes),
    summonerSpellSets: spellPatterns(spells),
    parts,
    provenance: {
      sourceType: "CALCULATED",
      sourceId: "sparta",
      resource: "MatchObservation",
      sampleSize,
      algorithmVersion: PERSONAL_LOADOUT_EVIDENCE_VERSION,
      status,
      ...(unavailableReason ? { unavailableReason } : {})
    },
    ...(unavailableReason ? { unavailableReason } : {})
  };
}

/**
 * Agrega somente observações Match-V5 normalizadas. Não conhece ranking,
 * ChampionTag, meta, matchup, risco ou o motor estratégico.
 */
export function aggregatePersonalLoadoutEvidence(
  observations: readonly MatchLoadoutObservation[],
  filters: PersonalLoadoutEvidenceFilters
): PersonalLoadoutEvidence {
  const base = selectBaseObservations(observations, filters);
  const context = filters.requestedPatch
    ? base.filter((observation) => samePatch(observation.context.patch, filters.requestedPatch))
    : base;
  const historyObservations = filters.requestedPatch
    ? base.filter((observation) => !samePatch(observation.context.patch, filters.requestedPatch))
    : [];
  const current = buildHistory(context, filters.queueIds);
  const recentHistory =
    historyObservations.length > 0
      ? buildHistory(historyObservations, filters.queueIds)
      : undefined;
  if (recentHistory) {
    recentHistory.status = "STALE";
    recentHistory.staleReason =
      `Estas observações não pertencem ao patch solicitado ${filters.requestedPatch}; ` +
      "são exibidas somente como histórico.";
    recentHistory.provenance = {
      ...recentHistory.provenance,
      status: "STALE",
      staleReason: recentHistory.staleReason
    };
  }

  return {
    ...current,
    championId: filters.championId,
    role: filters.role,
    patchScope: {
      ...current.patchScope,
      ...(filters.requestedPatch ? { requestedPatch: filters.requestedPatch } : {}),
      ...(filters.requestedPatch ? { hasRequestedPatchObservations: context.length > 0 } : {})
    },
    filterScope: {
      ...(filters.playedAtFrom ? { playedAtFrom: filters.playedAtFrom } : {}),
      ...(filters.playedAtTo ? { playedAtTo: filters.playedAtTo } : {}),
      ...(filters.recentMatches !== undefined ? { recentMatches: filters.recentMatches } : {})
    },
    algorithmVersion: PERSONAL_LOADOUT_EVIDENCE_VERSION,
    ...(recentHistory ? { recentHistory } : {})
  };
}

export function unavailablePersonalLoadoutEvidence(
  championId: number,
  role: Role,
  unavailableReason: string
): PersonalLoadoutEvidence {
  const result = aggregatePersonalLoadoutEvidence([], { championId, role });
  return {
    ...result,
    unavailableReason,
    provenance: {
      ...result.provenance,
      unavailableReason
    }
  };
}
