import { describe, expect, it } from "vitest";
import { aggregatePlayerChampionStats, type MatchParticipationRecord } from "./player-champion-stats.js";

function match(overrides: Partial<MatchParticipationRecord>): MatchParticipationRecord {
  return {
    matchId: "m1",
    championId: 61,
    role: "MID",
    won: true,
    kills: 5,
    deaths: 2,
    assists: 8,
    csPerMinute: 7,
    goldPerMinute: 400,
    damagePerMinute: 700,
    visionScorePerMinute: 1,
    killParticipation: 0.6,
    objectiveParticipation: 0.4,
    ...overrides
  };
}

describe("aggregatePlayerChampionStats", () => {
  it("soma kills/deaths/assists e faz media das metricas por minuto", () => {
    const matches = [
      match({ matchId: "m1", kills: 5, deaths: 2, assists: 8, csPerMinute: 8 }),
      match({ matchId: "m2", kills: 3, deaths: 4, assists: 6, csPerMinute: 6 })
    ];

    const stats = aggregatePlayerChampionStats(61, "Orianna", "MID", matches)!;

    expect(stats.games).toBe(2);
    expect(stats.kills).toBe(8);
    expect(stats.deaths).toBe(6);
    expect(stats.assists).toBe(14);
    expect(stats.csPerMinute).toBe(7);
  });

  it("conta vitorias corretamente", () => {
    const matches = [match({ won: true }), match({ won: true }), match({ won: false })];
    const stats = aggregatePlayerChampionStats(61, "Orianna", "MID", matches)!;
    expect(stats.wins).toBe(2);
    expect(stats.games).toBe(3);
  });

  it("killParticipation/objectiveParticipation ignoram partidas sem o dado (nao inventam 0)", () => {
    const matches = [
      match({ killParticipation: 0.8, objectiveParticipation: 0.5 }),
      match({ killParticipation: null, objectiveParticipation: null }),
      match({ killParticipation: 0.6, objectiveParticipation: 0.3 })
    ];

    const stats = aggregatePlayerChampionStats(61, "Orianna", "MID", matches)!;

    // media so das 2 partidas com dado: (0.8+0.6)/2 = 0.7, (0.5+0.3)/2 = 0.4
    expect(stats.killParticipation).toBeCloseTo(0.7, 5);
    expect(stats.objectiveParticipation).toBeCloseTo(0.4, 5);
  });

  // Etapa 4: antes isto caia pra 0, indistinguivel de participacao zero
  // medida - e esse 0 entrava no score de JUNGLE/SUPPORT com peso real.
  it("fica indisponivel se nenhuma partida do campeao tiver killParticipation/objectiveParticipation", () => {
    const matches = [match({ killParticipation: null, objectiveParticipation: null })];
    const stats = aggregatePlayerChampionStats(61, "Orianna", "MID", matches)!;
    expect(stats.killParticipation).toBeNull();
    expect(stats.objectiveParticipation).toBeNull();
    expect(stats.coverage.killParticipation.status).toBe("UNAVAILABLE");
    expect(stats.coverage.killParticipation.availableSampleSize).toBe(0);
    expect(stats.coverage.killParticipation.reason).toBeDefined();
  });

  it("preserva participacao zero medida como valor real, com cobertura completa", () => {
    const matches = [match({ killParticipation: 0 }), match({ killParticipation: 0 })];
    const stats = aggregatePlayerChampionStats(61, "Orianna", "MID", matches)!;
    expect(stats.killParticipation).toBe(0);
    expect(stats.coverage.killParticipation.status).toBe("AVAILABLE");
    expect(stats.coverage.killParticipation.availableSampleSize).toBe(2);
  });

  it("marca como parcial quando so parte das partidas tem o dado", () => {
    const matches = [
      match({ killParticipation: 0.8 }),
      match({ killParticipation: null }),
      match({ killParticipation: 0.6 })
    ];
    const stats = aggregatePlayerChampionStats(61, "Orianna", "MID", matches)!;
    // Denominador e 2 (as partidas com dado), nao 3 - dividir pelo total
    // diluiria o valor na proporcao do que falta.
    expect(stats.killParticipation).toBeCloseTo(0.7, 5);
    expect(stats.coverage.killParticipation.status).toBe("PARTIAL");
    expect(stats.coverage.killParticipation.sampleSize).toBe(3);
    expect(stats.coverage.killParticipation.availableSampleSize).toBe(2);
  });

  it("recentMatches respeita o limite de 20 e preserva a ordem recebida (mais recente primeiro)", () => {
    const matches = Array.from({ length: 25 }, (_, index) => match({ matchId: `m${index}` }));
    const stats = aggregatePlayerChampionStats(61, "Orianna", "MID", matches)!;

    expect(stats.recentMatches).toHaveLength(20);
    expect(stats.recentMatches[0].matchId).toBe("m0");
    expect(stats.recentMatches[19].matchId).toBe("m19");
  });

  // Etapa 4: colecao vazia nao produz media zero. Um agregado com
  // csPerMinute 0 seria lido como "farmou nada", nao como "nao ha partida".
  it("nao produz agregado quando nao ha partidas", () => {
    expect(aggregatePlayerChampionStats(61, "Orianna", "MID", [])).toBeNull();
  });

  it("nunca produz NaN ou Infinity nas medias", () => {
    const matches = [match({ csPerMinute: 0, goldPerMinute: 0, damagePerMinute: 0, visionScorePerMinute: 0 })];
    const stats = aggregatePlayerChampionStats(61, "Orianna", "MID", matches)!;
    [stats.csPerMinute, stats.goldPerMinute, stats.damagePerMinute, stats.visionScorePerMinute].forEach((value) => {
      expect(Number.isFinite(value)).toBe(true);
    });
  });
});
