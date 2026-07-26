import { availableCoverage } from "../types/stat-coverage.js";
import { describe, expect, it } from "vitest";
import {
  calculateKda,
  calculateRecentForm,
  DEATHS_BAD_VALUE,
  recencyWeight,
  roleBaselines,
  scoreChampionPerformance,
  weights
} from "./champion-performance.js";
import type { PlayerChampionStats, RecentChampionMatch, Role } from "../types/domain.js";

const baseStats: PlayerChampionStats = {
  championId: 61,
  championName: "Orianna",
  role: "MID",
  games: 6,
  wins: 4,
  kills: 42,
  deaths: 18,
  assists: 55,
  csPerMinute: 8,
  goldPerMinute: 430,
  damagePerMinute: 780,
  visionScorePerMinute: 0.9,
  killParticipation: 0.62,
  objectiveParticipation: 0.42,
  coverage: { killParticipation: availableCoverage(6), objectiveParticipation: availableCoverage(6) },
  recentMatches: []
};

describe("champion performance score", () => {
  it("calculates KDA without division by zero", () => {
    expect(calculateKda(10, 0, 5)).toBe(15);
  });

  it("weights recent matches more than older matches", () => {
    expect(recencyWeight(0)).toBeGreaterThan(recencyWeight(8));
  });

  it("allows a strong 6-game champion to score while keeping medium or low confidence", () => {
    const result = scoreChampionPerformance(baseStats);
    expect(result.eligible).toBe(true);
    expect(result.score).toBeGreaterThan(60);
    expect(result.confidence).toBe("low");
  });

  it("does not reward volume directly", () => {
    const lowImpact = scoreChampionPerformance({
      ...baseStats,
      championId: 157,
      championName: "Yasuo",
      games: 60,
      wins: 27,
      kills: 160,
      deaths: 260,
      assists: 190,
      csPerMinute: 6,
      damagePerMinute: 520
    });
    const highImpact = scoreChampionPerformance(baseStats);
    expect(highImpact.score).toBeGreaterThan(lowImpact.score);
    expect(lowImpact.confidence).toBe("high");
  });

  it("has weights summing to 1.0 per role (invariante estrutural)", () => {
    for (const role of Object.keys(weights) as Role[]) {
      const total = Object.values(weights[role]).reduce((sum, weight) => sum + weight, 0);
      expect(total).toBeCloseTo(1.0, 5);
    }
  });

  it("gives recencyWeight(8) ~= 1/e, pinning the ~8-game half-life", () => {
    expect(recencyWeight(8)).toBeCloseTo(Math.exp(-1), 5);
  });

  it("uses the same DEATHS_BAD_VALUE in scoreChampionPerformance and calculateRecentForm", () => {
    const statsAtBadValue: PlayerChampionStats = {
      ...baseStats,
      deaths: DEATHS_BAD_VALUE * baseStats.games
    };
    expect(scoreChampionPerformance(statsAtBadValue).components.deaths).toBe(0);

    // kills/assists zerados pra isolar o componente de mortes do componente
    // de kda (que tambem depende de deaths) - assim a unica variavel entre
    // os dois matches abaixo e o proprio valor de mortes.
    const perfectMatch: RecentChampionMatch = {
      matchId: "isolated-deaths-1",
      championId: 1,
      role: "MID",
      won: true,
      kills: 0,
      deaths: 0,
      assists: 0,
      csPerMinute: roleBaselines.MID.cs,
      goldPerMinute: roleBaselines.MID.gold,
      damagePerMinute: roleBaselines.MID.damage,
      visionScorePerMinute: roleBaselines.MID.vision,
      killParticipation: roleBaselines.MID.kp,
      objectiveParticipation: roleBaselines.MID.objective
    };

    const scoreWithNoDeaths = calculateRecentForm([perfectMatch]);
    const scoreWithBadDeaths = calculateRecentForm([{ ...perfectMatch, deaths: DEATHS_BAD_VALUE }]);

    // Peso do componente de mortes em calculateRecentForm e 0.1; normalizeInverse
    // vai de 100 (0 mortes) a 0 (DEATHS_BAD_VALUE mortes) - a diferenca esperada
    // e exatamente 0.1 * 100 = 10 pontos, provando que calculateRecentForm usa
    // o mesmo DEATHS_BAD_VALUE que scoreChampionPerformance/normalizeInverse.
    expect(scoreWithNoDeaths - scoreWithBadDeaths).toBeCloseTo(10, 5);
  });
});

describe("ausência versus zero nos componentes do score (Etapa 4)", () => {
  const jungleStats: PlayerChampionStats = {
    ...baseStats,
    championId: 234,
    championName: "Viego",
    role: "JUNGLE",
    games: 8
  };

  it("deixa de fora o componente sem dado em vez de pontuá-lo como 0", () => {
    const semObjetivo = scoreChampionPerformance({ ...jungleStats, objectiveParticipation: null });
    expect(semObjetivo.components.objective).toBeUndefined();
    // JUNGLE pesa `objective` em 0.15 - o peso sai e e redistribuido.
    expect(semObjetivo.dataCoverage).toBeCloseTo(0.85, 5);
  });

  it("não pune o campeão por um dado que o Sparta nunca teve", () => {
    const comDado = scoreChampionPerformance(jungleStats);
    const semDado = scoreChampionPerformance({ ...jungleStats, objectiveParticipation: null });
    const comZeroInventado = scoreChampionPerformance({ ...jungleStats, objectiveParticipation: 0 });

    // O caminho antigo (0 no lugar da ausencia) produzia um score menor que
    // qualquer um dos dois - era o falso zero entrando com peso real.
    expect(comZeroInventado.score).toBeLessThan(semDado.score);
    expect(semDado.score).toBeGreaterThan(0);
    expect(comDado.dataCoverage).toBeCloseTo(1, 5);
  });

  it("preserva participação zero medida como componente real", () => {
    const zeroReal = scoreChampionPerformance({ ...jungleStats, killParticipation: 0 });
    expect(zeroReal.components.kp).toBe(0);
    // Zero medido continua no calculo: coberturaa cheia, nao ausencia.
    expect(zeroReal.dataCoverage).toBeCloseTo(1, 5);
  });

  it("não produz NaN nem Infinity com zero partidas", () => {
    const semPartidas = scoreChampionPerformance({ ...baseStats, games: 0, wins: 0, deaths: 0 });
    Object.values(semPartidas.components).forEach((value) => expect(Number.isFinite(value)).toBe(true));
    expect(Number.isFinite(semPartidas.score)).toBe(true);
  });

  it("mantém o score na escala 0-100 mesmo com metade dos componentes ausentes", () => {
    const score = scoreChampionPerformance({
      ...jungleStats,
      killParticipation: null,
      objectiveParticipation: null
    });
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.dataCoverage).toBeCloseTo(0.7, 5);
  });
});

describe("participação em objetivos reintroduzida no score (Etapa 5)", () => {
  const jungle: PlayerChampionStats = {
    ...baseStats,
    championId: 234,
    championName: "Viego",
    role: "JUNGLE",
    games: 8
  };

  it("reintroduz o peso quando a métrica passa a existir", () => {
    const semDado = scoreChampionPerformance({ ...jungle, objectiveParticipation: null });
    const comDado = scoreChampionPerformance({ ...jungle, objectiveParticipation: 0.62 });

    expect(semDado.dataCoverage).toBeCloseTo(0.85, 5);
    // A cobertura sobe pro modelo inteiro quando o dado existe.
    expect(comDado.dataCoverage).toBeCloseTo(1, 5);
    expect(comDado.components.objective).toBeGreaterThan(0);
  });

  it("valor real zero participa do score e da cobertura", () => {
    const zeroReal = scoreChampionPerformance({ ...jungle, objectiveParticipation: 0 });
    expect(zeroReal.components.objective).toBe(0);
    // Zero medido é dado: a cobertura é cheia, não 0.85.
    expect(zeroReal.dataCoverage).toBeCloseTo(1, 5);
  });

  it("preserva a normalização quando a métrica continua indisponível", () => {
    const semDado = scoreChampionPerformance({ ...jungle, objectiveParticipation: null });
    expect(semDado.components.objective).toBeUndefined();
    expect(semDado.score).toBeGreaterThan(0);
    expect(semDado.score).toBeLessThanOrEqual(100);
  });

  it("não altera papéis que não pesam objetivos", () => {
    // TOP/MID/ADC nao tem `objective` na tabela de pesos - a cobertura
    // continua cheia com ou sem a metrica.
    const comDado = scoreChampionPerformance({ ...baseStats, objectiveParticipation: 0.5 });
    const semDado = scoreChampionPerformance({ ...baseStats, objectiveParticipation: null });
    expect(comDado.score).toBe(semDado.score);
    expect(semDado.dataCoverage).toBeCloseTo(1, 5);
  });
});
