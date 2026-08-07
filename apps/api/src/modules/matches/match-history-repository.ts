import type { Prisma } from "@prisma/client";
import type { ProfileRecentMatch, Role } from "@sparta/core";
import { prisma } from "../../db/prisma.js";
import { mapParticipantRowToProfileRecentMatch, matchHistoryInclude } from "./match-history-mapper.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ROLES = new Set<Role>(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);

function asRole(value: string | null | undefined): Role | null {
  return value && ROLES.has(value as Role) ? (value as Role) : null;
}

export interface MatchHistoryFilters {
  role?: Role;
  won?: boolean;
  queueId?: number;
  championId?: number;
  /** Janela em dias a partir de agora - só os valores que o produto oferece (7/14/30). `undefined` = sem corte de período. */
  periodDays?: 7 | 14 | 30;
  limit?: number;
  offset?: number;
}

export interface MatchHistoryPage {
  matches: ProfileRecentMatch[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Histórico pessoal filtrável e paginado, distinto de `recentMatches` de
 * `/me/player-profile` (que é sempre um recorte fixo das 10 mais recentes).
 * Reusa exatamente o mesmo enriquecimento de `matchHistoryInclude`/
 * `mapParticipantRowToProfileRecentMatch` - o comportamento de
 * `/me/player-profile` não muda aqui.
 *
 * Só lista partidas com posição conhecida (mesma regra de sempre desde a
 * Etapa 6: ausência de posição nunca vira um valor chutado) - por isso o
 * filtro `role: { not: null }` entra incondicionalmente na query, e não só
 * quando o cliente pede uma posição específica.
 */
export async function findMatchHistoryByPuuid(
  puuid: string,
  filters: MatchHistoryFilters = {},
  now = new Date()
): Promise<MatchHistoryPage | null> {
  const account = await prisma.riotAccount.findFirst({
    where: { puuid },
    select: { id: true, puuid: true }
  });
  if (!account) return null;

  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(filters.offset ?? 0, 0);

  const where: Prisma.MatchParticipantWhereInput = {
    riotAccountId: account.id,
    role: filters.role ?? { not: null },
    ...(filters.won !== undefined ? { won: filters.won } : {}),
    ...(filters.championId !== undefined ? { championId: filters.championId } : {}),
    ...(filters.queueId !== undefined || filters.periodDays !== undefined
      ? {
          match: {
            ...(filters.queueId !== undefined ? { queueId: filters.queueId } : {}),
            ...(filters.periodDays !== undefined
              ? { startedAt: { gte: new Date(now.getTime() - filters.periodDays * DAY_MS) } }
              : {})
          }
        }
      : {})
  };

  const [total, rows] = await Promise.all([
    prisma.matchParticipant.count({ where }),
    prisma.matchParticipant.findMany({
      where,
      include: matchHistoryInclude(account),
      orderBy: { match: { startedAt: "desc" } },
      skip: offset,
      take: limit
    })
  ]);

  const matches = rows.flatMap((row) => {
    const role = asRole(row.observation?.normalizedRole ?? row.role);
    if (!role) return [];
    return [mapParticipantRowToProfileRecentMatch(row, role)];
  });

  return { matches, total, limit, offset };
}
