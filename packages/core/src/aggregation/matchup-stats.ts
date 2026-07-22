import { confidenceFromGames } from "../scoring/champion-performance.js";
import type { MatchupData, Role } from "../types/domain.js";

export interface MatchupParticipantRecord {
  matchId: string;
  championId: number;
  role: Role;
  teamId: number;
  won: boolean;
}

/**
 * Fator de encolhimento em direcao ao neutro 50: amostras pequenas (1-2
 * partidas) pesam pouco, amostras maiores pesam mais
 * (`games / (games + SHRINKAGE_K)`). Ponto de partida, nao um valor
 * derivado - recalibrar quando houver mais historico real persistido e for
 * possivel olhar a distribuicao real de `sampleSize` por par de campeoes.
 */
const SHRINKAGE_K = 10;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Agrega o historico de MatchParticipant (todas as partidas, todos os
 * jogadores - matchup e um sinal de meta, nao pessoal) em MatchupData[].
 * Pura, sem I/O - quem chama decide o escopo da consulta (normalmente por
 * role, pra limitar o tamanho).
 *
 * Agrupa por (matchId, role) pra achar os dois laners opostos (times
 * diferentes); grupos com != 2 participantes (dado incompleto/inconsistente
 * - ex.: teamPosition mapeado errado) sao ignorados em vez de inventar um
 * pareamento. Cada partida gera dois pontos de dado direcionais (X-vs-Y da
 * perspectiva de X, Y-vs-X da perspectiva de Y). Nao emite entrada nenhuma
 * pra pares sem nenhuma partida - o fallback de `findMatchupScore` (?? 50)
 * ja cobre a ausencia honestamente.
 */
export function aggregateMatchupData(records: MatchupParticipantRecord[]): MatchupData[] {
  const byMatchRole = new Map<string, MatchupParticipantRecord[]>();
  for (const record of records) {
    const key = `${record.matchId}:${record.role}`;
    const group = byMatchRole.get(key) ?? [];
    group.push(record);
    byMatchRole.set(key, group);
  }

  interface DirectionalPoint {
    championId: number;
    enemyChampionId: number;
    role: Role;
    won: boolean;
  }

  const points: DirectionalPoint[] = [];
  for (const group of byMatchRole.values()) {
    if (group.length !== 2) continue;
    const [a, b] = group;
    if (a.teamId === b.teamId) continue;
    points.push({ championId: a.championId, enemyChampionId: b.championId, role: a.role, won: a.won });
    points.push({ championId: b.championId, enemyChampionId: a.championId, role: b.role, won: b.won });
  }

  interface PairAggregate {
    championId: number;
    enemyChampionId: number;
    role: Role;
    wins: number;
    games: number;
  }

  const byPair = new Map<string, PairAggregate>();
  for (const point of points) {
    const key = `${point.championId}:${point.enemyChampionId}:${point.role}`;
    const entry = byPair.get(key) ?? {
      championId: point.championId,
      enemyChampionId: point.enemyChampionId,
      role: point.role,
      wins: 0,
      games: 0
    };
    entry.games += 1;
    if (point.won) entry.wins += 1;
    byPair.set(key, entry);
  }

  return Array.from(byPair.values()).map((entry) => {
    const winrate = entry.wins / entry.games;
    const shrinkFactor = entry.games / (entry.games + SHRINKAGE_K);
    const score = round(50 + (winrate * 100 - 50) * shrinkFactor);

    return {
      championId: entry.championId,
      enemyChampionId: entry.enemyChampionId,
      role: entry.role,
      score,
      sampleSize: entry.games,
      confidence: confidenceFromGames(entry.games)
    };
  });
}
