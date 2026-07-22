import { describe, expect, it } from "vitest";
import { aggregateMatchupData, type MatchupParticipantRecord } from "./matchup-stats.js";

function buildMatchupRecords(
  count: number,
  championA: number,
  championB: number,
  role: MatchupParticipantRecord["role"],
  winsForA: number
): MatchupParticipantRecord[] {
  const records: MatchupParticipantRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    const aWon = i < winsForA;
    records.push({ matchId: `m-${championA}-${championB}-${i}`, championId: championA, role, teamId: 100, won: aWon });
    records.push({ matchId: `m-${championA}-${championB}-${i}`, championId: championB, role, teamId: 200, won: !aWon });
  }
  return records;
}

describe("aggregateMatchupData", () => {
  it("pareia os dois laners opostos (mesmo role, times diferentes) e emite os dois pontos direcionais", () => {
    const records = buildMatchupRecords(1, 61, 157, "MID", 1);
    const result = aggregateMatchupData(records);

    expect(result).toHaveLength(2);
    const orianna = result.find((entry) => entry.championId === 61 && entry.enemyChampionId === 157);
    const yasuo = result.find((entry) => entry.championId === 157 && entry.enemyChampionId === 61);
    expect(orianna?.sampleSize).toBe(1);
    expect(yasuo?.sampleSize).toBe(1);
    expect(orianna!.score).toBeGreaterThan(50); // ganhou a unica partida
    expect(yasuo!.score).toBeLessThan(50); // perdeu a unica partida
  });

  it("ignora partidas com dado de role incompleto (so 1 participante naquele role)", () => {
    const records: MatchupParticipantRecord[] = [{ matchId: "m1", championId: 61, role: "MID", teamId: 100, won: true }];
    expect(aggregateMatchupData(records)).toEqual([]);
  });

  it("ignora partidas onde os dois participantes do mesmo role estao no mesmo time (dado inconsistente)", () => {
    const records: MatchupParticipantRecord[] = [
      { matchId: "m1", championId: 61, role: "MID", teamId: 100, won: true },
      { matchId: "m1", championId: 103, role: "MID", teamId: 100, won: true }
    ];
    expect(aggregateMatchupData(records)).toEqual([]);
  });

  it("nao emite entrada nenhuma quando nao ha nenhum pareamento valido (sem sampleSize 0 inventado)", () => {
    const records: MatchupParticipantRecord[] = [
      { matchId: "m1", championId: 61, role: "MID", teamId: 100, won: true },
      { matchId: "m1", championId: 103, role: "SUPPORT", teamId: 200, won: false }
    ];
    expect(aggregateMatchupData(records)).toEqual([]);
  });

  it("aplica shrinkage rumo a 50: mesma winrate de 100%, amostra maior se afasta mais do neutro", () => {
    const oneGame = aggregateMatchupData(buildMatchupRecords(1, 61, 157, "MID", 1));
    const twentyGames = aggregateMatchupData(buildMatchupRecords(20, 61, 157, "MID", 20));

    const scoreOneGame = oneGame.find((entry) => entry.championId === 61)!.score;
    const scoreTwentyGames = twentyGames.find((entry) => entry.championId === 61)!.score;

    expect(scoreOneGame).toBeGreaterThan(50);
    expect(scoreOneGame).toBeLessThan(scoreTwentyGames);
    expect(scoreTwentyGames).toBeLessThanOrEqual(100);
  });

  it("indica confidence baseado no tamanho da amostra (limites de 8 e 20 jogos)", () => {
    const low = aggregateMatchupData(buildMatchupRecords(7, 61, 157, "MID", 4));
    const medium = aggregateMatchupData(buildMatchupRecords(8, 61, 103, "MID", 4));
    const high = aggregateMatchupData(buildMatchupRecords(20, 61, 82, "MID", 10));

    expect(low.find((entry) => entry.championId === 61 && entry.enemyChampionId === 157)?.confidence).toBe("low");
    expect(medium.find((entry) => entry.championId === 61 && entry.enemyChampionId === 103)?.confidence).toBe("medium");
    expect(high.find((entry) => entry.championId === 61 && entry.enemyChampionId === 82)?.confidence).toBe("high");
  });
});
