import type {
  CatalogEnrichment,
  MatchLoadoutObservation,
  MatchRoleObservationSource,
  ObservedItemSlot,
  ObservedRuneFragment,
  ObservedRunePage,
  ObservedRuneSelection,
  ObservedSummonerSpellSlot,
  PlayerChampionRoleObservation,
  Role
} from "@sparta/core";
import type { RiotMatchDto, RiotMatchParticipantDto } from "./match-mapper.js";

export const MATCH_OBSERVATION_EXTRACTOR_VERSION = "match-observation/1.0.0";

export interface LocalCatalogEntry {
  name: string;
  asset?: string;
}

export interface LocalMatchObservationCatalog {
  version: string;
  items?: ReadonlyMap<number, LocalCatalogEntry>;
  runes?: ReadonlyMap<number, LocalCatalogEntry>;
  spells?: ReadonlyMap<number, LocalCatalogEntry>;
}

const POSITION_TO_ROLE: Partial<Record<string, Role>> = {
  TOP: "TOP",
  JUNGLE: "JUNGLE",
  MIDDLE: "MID",
  BOTTOM: "ADC",
  UTILITY: "SUPPORT"
};

function observedProvenance(patch?: string) {
  return {
    sourceType: "OBSERVED" as const,
    sourceId: "riot-match-v5",
    resource: "/lol/match/v5/matches/{matchId}",
    patch,
    status: "AVAILABLE" as const
  };
}

function unavailableEnrichment(): CatalogEnrichment {
  return {
    status: "UNAVAILABLE",
    provenance: {
      sourceType: "OFFICIAL",
      sourceId: "data-dragon-local-catalog",
      status: "UNAVAILABLE",
      unavailableReason: "Catálogo local compatível não disponível."
    }
  };
}

function normalizedCatalogPatch(version: string): string | undefined {
  const match = /^(\d+)\.(\d+)/.exec(version);
  return match ? `${match[1]}.${match[2]}` : undefined;
}

function enrich(
  id: number | undefined,
  entries: ReadonlyMap<number, LocalCatalogEntry> | undefined,
  catalog: LocalMatchObservationCatalog | undefined,
  patch: string | undefined
): CatalogEnrichment {
  if (id === undefined || !catalog || !entries) return unavailableEnrichment();
  const entry = entries.get(id);
  if (!entry) return unavailableEnrichment();
  const exactPatch = patch !== undefined && normalizedCatalogPatch(catalog.version) === patch;
  return {
    status: exactPatch ? "EXACT" : "OTHER_VERSION",
    catalogVersion: catalog.version,
    name: entry.name,
    asset: entry.asset,
    provenance: {
      sourceType: "OFFICIAL",
      sourceId: "data-dragon-local-catalog",
      patch: normalizedCatalogPatch(catalog.version),
      status: exactPatch ? "AVAILABLE" : "STALE",
      ...(exactPatch ? {} : { staleReason: "Versão do catálogo local diverge do patch observado." })
    }
  };
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function positiveId(value: unknown): number | undefined {
  const parsed = finiteInteger(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function presentRawPosition(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized === "NONE" || normalized === "INVALID") return undefined;
  return normalized;
}

export function roleFromMatchPosition(value: unknown): Role | undefined {
  const raw = presentRawPosition(value);
  return raw ? POSITION_TO_ROLE[raw] : undefined;
}

/**
 * A posição jogada usa primeiro `teamPosition`, corroborada nos payloads
 * locais por `individualPosition`. A posição atribuída pelo matchmaking é
 * preservada para auditoria, mas não substitui o que foi observado: há
 * partidas reais em que ela diverge enquanto os dois campos observados
 * concordam.
 */
export function extractPlayerChampionRoleObservation(
  participant: Pick<
    RiotMatchParticipantDto,
    "teamPosition" | "individualPosition" | "positionAssignedByMatchmaking"
  >,
  patch?: string
): PlayerChampionRoleObservation {
  const teamPosition = presentRawPosition(participant.teamPosition);
  const individualPosition = presentRawPosition(participant.individualPosition);
  const positionAssignedByMatchmaking = presentRawPosition(
    participant.positionAssignedByMatchmaking
  );
  const teamRole = roleFromMatchPosition(teamPosition);
  const individualRole = roleFromMatchPosition(individualPosition);
  const assignedRole = roleFromMatchPosition(positionAssignedByMatchmaking);

  let normalizedRole: Role | undefined;
  let normalizedRoleSource: MatchRoleObservationSource | undefined;
  if (teamRole) {
    normalizedRole = teamRole;
    normalizedRoleSource = "TEAM_POSITION";
  } else if (individualRole) {
    normalizedRole = individualRole;
    normalizedRoleSource = "INDIVIDUAL_POSITION";
  }

  const validRoles = [teamRole, individualRole, assignedRole].filter(
    (role): role is Role => role !== undefined
  );
  const diverged = new Set(validRoles).size > 1;

  return {
    teamPosition,
    individualPosition,
    positionAssignedByMatchmaking,
    normalizedRole,
    normalizedRoleSource,
    assignedRole,
    diverged,
    status: normalizedRole ? "AVAILABLE" : "UNAVAILABLE",
    observedProvenance: {
      ...observedProvenance(patch),
      status:
        teamPosition || individualPosition || positionAssignedByMatchmaking
          ? "AVAILABLE"
          : "UNAVAILABLE",
      ...(teamPosition || individualPosition || positionAssignedByMatchmaking
        ? {}
        : { unavailableReason: "Campos de posição ausentes ou inválidos." })
    },
    normalizedProvenance: {
      sourceType: "CALCULATED",
      sourceId: "sparta",
      algorithmVersion: MATCH_OBSERVATION_EXTRACTOR_VERSION,
      patch,
      status: normalizedRole ? "AVAILABLE" : "UNAVAILABLE",
      ...(normalizedRole ? {} : { unavailableReason: "Nenhuma posição observada válida." })
    }
  };
}

function extractItems(
  participant: RiotMatchParticipantDto,
  patch: string | undefined,
  catalog?: LocalMatchObservationCatalog
): ObservedItemSlot[] {
  const record = participant as unknown as Record<string, unknown>;
  return Array.from({ length: 7 }, (_, slot): ObservedItemSlot => {
    const key = `item${slot}`;
    const value = record[key];
    const id = finiteInteger(value);
    const provenance = observedProvenance(patch);
    if (!Object.prototype.hasOwnProperty.call(record, key) || id === undefined || id < 0) {
      return {
        slot,
        state: "UNAVAILABLE",
        enrichment: unavailableEnrichment(),
        provenance: {
          ...provenance,
          status: "UNAVAILABLE",
          unavailableReason: "Slot não informado no payload."
        }
      };
    }
    if (id === 0) {
      return { slot, state: "EMPTY", enrichment: unavailableEnrichment(), provenance };
    }
    return {
      slot,
      state: "PRESENT",
      itemId: id,
      enrichment: enrich(id, catalog?.items, catalog, patch),
      provenance
    };
  });
}

function extractRunes(
  participant: RiotMatchParticipantDto,
  patch: string | undefined,
  catalog?: LocalMatchObservationCatalog
): ObservedRunePage {
  const perks = participant.perks;
  if (!perks) {
    return {
      status: "UNAVAILABLE",
      selections: [],
      fragments: [],
      provenance: {
        ...observedProvenance(patch),
        status: "UNAVAILABLE",
        unavailableReason: "Campo perks ausente."
      }
    };
  }

  const primary =
    perks.styles?.find((style) => style.description === "primaryStyle") ?? perks.styles?.[0];
  const secondary =
    perks.styles?.find((style) => style.description === "subStyle") ?? perks.styles?.[1];
  const selections: ObservedRuneSelection[] = [];

  for (const [tree, style] of [
    ["PRIMARY", primary],
    ["SECONDARY", secondary]
  ] as const) {
    for (const [order, selection] of (style?.selections ?? []).entries()) {
      const perkId = positiveId(selection.perk);
      if (perkId === undefined) continue;
      selections.push({
        tree,
        order,
        perkId,
        isKeystone: tree === "PRIMARY" && order === 0,
        enrichment: enrich(perkId, catalog?.runes, catalog, patch),
        provenance: observedProvenance(patch)
      });
    }
  }

  const fragmentInputs = [
    ["OFFENSE", perks.statPerks?.offense],
    ["FLEX", perks.statPerks?.flex],
    ["DEFENSE", perks.statPerks?.defense]
  ] as const;
  const fragments: ObservedRuneFragment[] = fragmentInputs.map(([slot, value]) => {
    const fragmentId = positiveId(value);
    return {
      slot,
      state: fragmentId === undefined ? "UNAVAILABLE" : "PRESENT",
      fragmentId,
      enrichment: enrich(fragmentId, catalog?.runes, catalog, patch),
      provenance:
        fragmentId === undefined
          ? {
              ...observedProvenance(patch),
              status: "UNAVAILABLE",
              unavailableReason: "Fragmento não informado."
            }
          : observedProvenance(patch)
    };
  });

  const primaryStyleId = positiveId(primary?.style);
  const secondaryStyleId = positiveId(secondary?.style);
  const complete =
    primaryStyleId !== undefined &&
    secondaryStyleId !== undefined &&
    selections.length > 0 &&
    fragments.every((fragment) => fragment.state === "PRESENT");
  return {
    status: complete ? "AVAILABLE" : "PARTIAL",
    primaryStyleId,
    secondaryStyleId,
    selections,
    fragments,
    provenance: {
      ...observedProvenance(patch),
      status: complete ? "AVAILABLE" : "PARTIAL"
    }
  };
}

function extractSpells(
  participant: RiotMatchParticipantDto,
  patch: string | undefined,
  catalog?: LocalMatchObservationCatalog
): ObservedSummonerSpellSlot[] {
  return ([participant.summoner1Id, participant.summoner2Id] as const).map((value, index) => {
    const spellId = positiveId(value);
    return {
      slot: (index + 1) as 1 | 2,
      state: spellId === undefined ? "UNAVAILABLE" : "PRESENT",
      spellId,
      enrichment: enrich(spellId, catalog?.spells, catalog, patch),
      provenance:
        spellId === undefined
          ? {
              ...observedProvenance(patch),
              status: "UNAVAILABLE",
              unavailableReason: "Feitiço não informado."
            }
          : observedProvenance(patch)
    };
  });
}

export interface ExtractMatchObservationsOptions {
  platform: string;
  catalog?: LocalMatchObservationCatalog;
}

export interface ExtractedMatchLoadoutObservation extends MatchLoadoutObservation {
  participantPuuid: string;
}

export function extractMatchLoadoutObservations(
  raw: RiotMatchDto,
  options: ExtractMatchObservationsOptions
): ExtractedMatchLoadoutObservation[] {
  const fullVersion = typeof raw.info?.gameVersion === "string" ? raw.info.gameVersion : undefined;
  const patch = fullVersion ? normalizedCatalogPatch(fullVersion) : undefined;
  const matchId = raw.metadata?.matchId;
  if (typeof matchId !== "string" || !Array.isArray(raw.info?.participants)) return [];

  const durationSeconds = finiteInteger(raw.info.gameDuration);
  const startedAtMs = finiteInteger(raw.info.gameStartTimestamp);
  const queueId = finiteInteger(raw.info.queueId);

  return raw.info.participants.flatMap((participant) => {
    const championId = positiveId(participant.championId);
    if (typeof participant.puuid !== "string" || championId === undefined) return [];
    return [
      {
        extractorVersion: MATCH_OBSERVATION_EXTRACTOR_VERSION,
        participantPuuid: participant.puuid,
        matchId,
        championId,
        context: {
          gameVersion: fullVersion,
          patch,
          queueId,
          gameMode: typeof raw.info.gameMode === "string" ? raw.info.gameMode : undefined,
          gameType: typeof raw.info.gameType === "string" ? raw.info.gameType : undefined,
          platform: options.platform,
          startedAt: startedAtMs !== undefined ? new Date(startedAtMs).toISOString() : undefined,
          durationSeconds:
            durationSeconds !== undefined && durationSeconds >= 0 ? durationSeconds : undefined,
          won: typeof participant.win === "boolean" ? participant.win : undefined
        },
        items: extractItems(participant, patch, options.catalog),
        runes: extractRunes(participant, patch, options.catalog),
        summonerSpells: extractSpells(participant, patch, options.catalog),
        position: extractPlayerChampionRoleObservation(participant, patch)
      }
    ];
  });
}
