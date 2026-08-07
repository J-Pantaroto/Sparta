import type { ProfileRecentMatch } from "@sparta/core";

export interface MatchHistoryGroup {
  key: string;
  label: string;
  matches: ProfileRecentMatch[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Agrupamento temporal puro (Hoje/Ontem/Esta semana/Mais antigas), sem
 * inventar data pra partida que não tem uma: `observedAt: null` cai num
 * grupo próprio, nunca é misturado a "Hoje" nem descartado em silêncio.
 * Ordem de entrada dentro de cada grupo é preservada (a API já ordena por
 * `startedAt` desc).
 */
export function groupMatchesByPeriod(
  matches: readonly ProfileRecentMatch[],
  now: Date = new Date()
): MatchHistoryGroup[] {
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - DAY_MS;
  const weekStart = todayStart - 7 * DAY_MS;

  const groups: MatchHistoryGroup[] = [
    { key: "today", label: "Hoje", matches: [] },
    { key: "yesterday", label: "Ontem", matches: [] },
    { key: "this-week", label: "Esta semana", matches: [] },
    { key: "earlier", label: "Mais antigas", matches: [] },
    { key: "undated", label: "Sem data registrada", matches: [] }
  ];
  const [today, yesterday, thisWeek, earlier, undated] = groups;

  for (const match of matches) {
    if (!match.observedAt) {
      undated.matches.push(match);
      continue;
    }
    const observedAt = new Date(match.observedAt).getTime();
    if (observedAt >= todayStart) today.matches.push(match);
    else if (observedAt >= yesterdayStart) yesterday.matches.push(match);
    else if (observedAt >= weekStart) thisWeek.matches.push(match);
    else earlier.matches.push(match);
  }

  return groups.filter((group) => group.matches.length > 0);
}
