import type {
  PlayerChampionPoolEntry,
  PlayerChampionPoolRoleSummary,
  PlayerChampionPoolSource,
  Role
} from "@sparta/core";
import { prisma } from "../../db/prisma.js";

const ROLES: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

function toPoolEntry(row: {
  riotAccount: { puuid: string };
  championId: number;
  champion: { name: string };
  role: string;
  source: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PlayerChampionPoolEntry {
  const source = row.source as PlayerChampionPoolSource;
  return {
    playerId: row.riotAccount.puuid,
    championId: row.championId,
    championName: row.champion.name,
    role: row.role as Role,
    source,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    provenance: {
      sourceType: source === "PERSONAL_OBSERVED" ? "OBSERVED" : "USER_PROVIDED",
      sourceId: source === "PERSONAL_OBSERVED" ? "riot-match-v5" : "sparta-user-pool",
      resource: source === "PERSONAL_OBSERVED" ? "MatchObservation" : "PlayerChampionPoolEntry",
      position: row.role,
      status: "AVAILABLE"
    }
  };
}

/**
 * Materializa a parte observada do pool a partir da única fonte aprovada:
 * posições normalizadas da Etapa 10 do próprio jogador.
 */
export async function materializeObservedPlayerPool(
  riotAccountId: string,
  puuid: string,
  role?: Role
): Promise<number> {
  const observations = await prisma.matchObservation.findMany({
    where: {
      positionStatus: "AVAILABLE",
      normalizedRole: role,
      matchParticipant: { puuid }
    },
    select: {
      normalizedRole: true,
      matchParticipant: { select: { championId: true } }
    }
  });
  const pairs = new Map<string, { championId: number; role: Role }>();
  for (const observation of observations) {
    const observedRole = observation.normalizedRole as Role | null;
    if (!observedRole || !ROLES.includes(observedRole)) continue;
    const pair = { championId: observation.matchParticipant.championId, role: observedRole };
    pairs.set(`${pair.championId}:${pair.role}`, pair);
  }

  for (const pair of pairs.values()) {
    await prisma.playerChampionPoolEntry.upsert({
      where: {
        riotAccountId_championId_role: {
          riotAccountId,
          championId: pair.championId,
          role: pair.role
        }
      },
      create: {
        riotAccountId,
        championId: pair.championId,
        role: pair.role,
        source: "PERSONAL_OBSERVED",
        enabled: true
      },
      update: {
        source: "PERSONAL_OBSERVED",
        enabled: true
      }
    });
  }
  return pairs.size;
}

export async function findPlayerPool(
  riotAccountId: string,
  puuid: string,
  role?: Role
): Promise<{ entries: PlayerChampionPoolEntry[]; roleSummaries: PlayerChampionPoolRoleSummary[] }> {
  await materializeObservedPlayerPool(riotAccountId, puuid);
  const rows = await prisma.playerChampionPoolEntry.findMany({
    where: { riotAccountId },
    include: { champion: true, riotAccount: { select: { puuid: true } } },
    orderBy: [{ role: "asc" }, { champion: { name: "asc" } }]
  });
  const allEntries = rows.map(toPoolEntry);
  const roleSummaries = ROLES.map((candidateRole) => {
    const enabled = allEntries.filter(
      (entry) => entry.role === candidateRole && entry.enabled
    );
    return {
      role: candidateRole,
      enabledCandidates: enabled.length,
      observedCandidates: enabled.filter((entry) => entry.source === "PERSONAL_OBSERVED").length,
      userProvidedCandidates: enabled.filter((entry) => entry.source === "USER_PROVIDED").length
    };
  });
  return {
    entries: role
      ? allEntries.filter((entry) => entry.role === role)
      : allEntries,
    roleSummaries
  };
}

export type AddPoolEntryResult =
  | { status: "CREATED" | "EXISTING"; entry: PlayerChampionPoolEntry }
  | { status: "CHAMPION_NOT_FOUND" };

export async function addUserProvidedPoolEntry(
  riotAccountId: string,
  puuid: string,
  championId: number,
  role: Role
): Promise<AddPoolEntryResult> {
  const champion = await prisma.champion.findUnique({ where: { id: championId } });
  if (!champion) return { status: "CHAMPION_NOT_FOUND" };

  const key = { riotAccountId, championId, role };
  const existing = await prisma.playerChampionPoolEntry.findUnique({
    where: { riotAccountId_championId_role: key },
    include: { champion: true, riotAccount: { select: { puuid: true } } }
  });
  if (existing?.source === "PERSONAL_OBSERVED") {
    return { status: "EXISTING", entry: toPoolEntry(existing) };
  }

  const row = await prisma.playerChampionPoolEntry.upsert({
    where: { riotAccountId_championId_role: key },
    create: { ...key, source: "USER_PROVIDED", enabled: true },
    update: { enabled: true },
    include: { champion: true, riotAccount: { select: { puuid: true } } }
  });
  return { status: existing ? "EXISTING" : "CREATED", entry: toPoolEntry(row) };
}

export type DisablePoolEntryResult =
  | { status: "DISABLED"; entry: PlayerChampionPoolEntry }
  | { status: "NOT_FOUND" }
  | { status: "OBSERVED_ENTRY" };

export async function disableUserProvidedPoolEntry(
  riotAccountId: string,
  championId: number,
  role: Role
): Promise<DisablePoolEntryResult> {
  const key = { riotAccountId, championId, role };
  const existing = await prisma.playerChampionPoolEntry.findUnique({
    where: { riotAccountId_championId_role: key }
  });
  if (!existing) return { status: "NOT_FOUND" };
  if (existing.source !== "USER_PROVIDED") return { status: "OBSERVED_ENTRY" };

  const row = await prisma.playerChampionPoolEntry.update({
    where: { riotAccountId_championId_role: key },
    data: { enabled: false },
    include: { champion: true, riotAccount: { select: { puuid: true } } }
  });
  return { status: "DISABLED", entry: toPoolEntry(row) };
}
