import type { Prisma } from "@prisma/client";
import { aggregatePlayerChampionStats, type Role } from "@sparta/core";
import { prisma } from "../../db/prisma";
import { findParticipationHistory } from "../matches/match-repository";

/**
 * PlayerProfile nunca era criado em nenhum lugar do codigo antes desta
 * tarefa - a FK de PlayerChampionStats exige uma linha aqui, entao criamos
 * (se nao existir) sempre que formos recalcular stats.
 */
async function ensurePlayerProfile(riotAccountId: string): Promise<string> {
  const profile = await prisma.playerProfile.upsert({
    where: { riotAccountId },
    update: {},
    create: { riotAccountId, preferredRoles: [] }
  });
  return profile.id;
}

export interface ChampionRolePair {
  championId: number;
  role: string;
}

/**
 * Recalcula PlayerChampionStats so para os (championId, role) tocados na
 * ultima rodada de sync - nao reprocessa o perfil inteiro toda vez, so os
 * campeoes/roles que essa rodada realmente sincronizou.
 */
export async function recomputeChampionStats(
  riotAccountId: string,
  puuid: string,
  touchedPairs: ChampionRolePair[]
): Promise<void> {
  if (touchedPairs.length === 0) return;

  const playerProfileId = await ensurePlayerProfile(riotAccountId);
  const history = await findParticipationHistory(puuid);

  const uniquePairs = Array.from(
    new Map(touchedPairs.map((pair) => [`${pair.championId}:${pair.role}`, pair])).values()
  );

  for (const { championId, role } of uniquePairs) {
    const matches = history
      .filter((entry) => entry.championId === championId && entry.role === role)
      .map((entry) => ({ ...entry, role: entry.role as Role }));
    if (matches.length === 0) continue;

    const stats = aggregatePlayerChampionStats(championId, matches[0].championName, role as Role, matches);
    const recentMatchesJson = stats.recentMatches as unknown as Prisma.InputJsonValue;

    await prisma.playerChampionStats.upsert({
      where: { playerProfileId_championId_role: { playerProfileId, championId, role } },
      update: {
        games: stats.games,
        wins: stats.wins,
        kills: stats.kills,
        deaths: stats.deaths,
        assists: stats.assists,
        csPerMinute: stats.csPerMinute,
        goldPerMinute: stats.goldPerMinute,
        damagePerMinute: stats.damagePerMinute,
        visionScorePerMinute: stats.visionScorePerMinute,
        killParticipation: stats.killParticipation,
        objectiveParticipation: stats.objectiveParticipation,
        recentMatchesJson
      },
      create: {
        playerProfileId,
        championId,
        role,
        games: stats.games,
        wins: stats.wins,
        kills: stats.kills,
        deaths: stats.deaths,
        assists: stats.assists,
        csPerMinute: stats.csPerMinute,
        goldPerMinute: stats.goldPerMinute,
        damagePerMinute: stats.damagePerMinute,
        visionScorePerMinute: stats.visionScorePerMinute,
        killParticipation: stats.killParticipation,
        objectiveParticipation: stats.objectiveParticipation,
        recentMatchesJson
      }
    });
  }
}
