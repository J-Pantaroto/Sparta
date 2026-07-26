import { describe, expect, it } from "vitest";
import matchDetailFixture from "./__fixtures__/match-detail.json" with { type: "json" };
import { extractParticipantTeams, extractPatch, mapMatchToSummaries, type RiotMatchDto } from "./match-mapper.js";

const fixture = matchDetailFixture as RiotMatchDto;

describe("extractPatch", () => {
  it("extrai major.minor de uma gameVersion completa", () => {
    expect(extractPatch("14.14.593.1234")).toBe("14.14");
  });

  it("retorna a string original se o formato nao tiver pelo menos 2 partes", () => {
    expect(extractPatch("14")).toBe("14");
  });
});

describe("mapMatchToSummaries", () => {
  const summaries = mapMatchToSummaries(fixture);

  it("mapeia um MatchSummary por participante", () => {
    expect(summaries).toHaveLength(2);
  });

  it("mapeia teamPosition MIDDLE para role MID e calcula metricas por minuto (30min de partida)", () => {
    const player1 = summaries.find((summary) => summary.puuid === "puuid-player-1")!;
    expect(player1.role).toBe("MID");
    expect(player1.won).toBe(true);
    expect(player1.patch).toBe("14.14");
    expect(player1.durationSeconds).toBe(1800);
    expect(player1.startedAt).toBe(1720000000000);
    // (180 + 5) cs / 30 min = 6.1666...
    expect(player1.metrics.csPerMinute).toBeCloseTo(6.1667, 3);
    expect(player1.metrics.killParticipation).toBe(0.62);
  });

  it("nao inventa killParticipation quando o participante nao tem challenges (patch antigo)", () => {
    const player2 = summaries.find((summary) => summary.puuid === "puuid-player-2")!;
    expect(player2.metrics.killParticipation).toBeUndefined();
    expect(player2.metrics.objectiveParticipation).toBeUndefined();
  });
});

describe("extractParticipantTeams", () => {
  it("mapeia participantId (posicao na lista de metadata) para o teamId real", () => {
    const teams = extractParticipantTeams(fixture);
    expect(teams).toEqual([
      { participantId: 1, puuid: "puuid-player-1", teamId: 100 },
      { participantId: 2, puuid: "puuid-player-2", teamId: 200 }
    ]);
  });
});

describe("extractParticipantTeams sem teamId (Etapa 4)", () => {
  it("descarta o participante em vez de inventar o time 0", () => {
    const raw = {
      metadata: { matchId: "BR1_1", participants: ["p1", "p2"] },
      info: {
        gameDuration: 1800,
        gameStartTimestamp: 1,
        gameVersion: "14.1.1",
        participants: [{ puuid: "p1", teamId: 100 }]
      }
    } as unknown as Parameters<typeof extractParticipantTeams>[0];

    const teams = extractParticipantTeams(raw);
    expect(teams).toHaveLength(1);
    expect(teams[0]).toEqual({ participantId: 1, puuid: "p1", teamId: 100 });
    expect(teams.some((team) => team.teamId === 0)).toBe(false);
  });
});

describe("participação em objetivos no mapper (Etapa 5)", () => {
  function raw(overrides: {
    challenges?: Record<string, number>;
    teams?: { teamId: number; objectives?: Record<string, { kills: number }> }[];
  }) {
    return {
      metadata: { matchId: "BR1_1", participants: ["p1"] },
      info: {
        gameDuration: 1800,
        gameStartTimestamp: 1700000000000,
        gameVersion: "16.14.1.1",
        participants: [
          {
            puuid: "p1",
            championId: 234,
            championName: "Viego",
            teamId: 100,
            teamPosition: "JUNGLE",
            win: true,
            kills: 5,
            deaths: 2,
            assists: 7,
            totalMinionsKilled: 100,
            neutralMinionsKilled: 60,
            goldEarned: 12000,
            totalDamageDealtToChampions: 18000,
            visionScore: 20,
            challenges: overrides.challenges
          }
        ],
        teams: overrides.teams
      }
    } as unknown as RiotMatchDto;
  }

  it("extrai a razão e os absolutos do time correto", () => {
    const [summary] = mapMatchToSummaries(
      raw({
        challenges: { dragonTakedowns: 2, baronTakedowns: 1 },
        teams: [
          { teamId: 100, objectives: { dragon: { kills: 3 }, baron: { kills: 1 } } },
          // Objetivos do inimigo NÃO podem entrar no denominador.
          { teamId: 200, objectives: { dragon: { kills: 9 }, baron: { kills: 9 } } }
        ]
      })
    );
    expect(summary.metrics.objectiveParticipation).toBeCloseTo(0.75, 5);
    expect(summary.metrics.objectiveTakedowns).toBe(3);
    expect(summary.metrics.teamObjectiveKills).toBe(4);
  });

  it("ignora riftHeraldTakedowns (contabilidade divergente no payload)", () => {
    const [summary] = mapMatchToSummaries(
      raw({
        challenges: { dragonTakedowns: 1, baronTakedowns: 0, riftHeraldTakedowns: 5 },
        teams: [{ teamId: 100, objectives: { dragon: { kills: 2 }, baron: { kills: 0 } } }]
      })
    );
    // 1/2, nao 6/2 - o Arauto nao entra nem no numerador nem no denominador.
    expect(summary.metrics.objectiveParticipation).toBeCloseTo(0.5, 5);
    expect(summary.metrics.objectiveTakedowns).toBe(1);
  });

  it("payload sem `teams` não zera a métrica, deixa ausente", () => {
    const [summary] = mapMatchToSummaries(
      raw({ challenges: { dragonTakedowns: 2, baronTakedowns: 0 }, teams: undefined })
    );
    expect(summary.metrics.objectiveParticipation).toBeUndefined();
    expect(summary.metrics.teamObjectiveKills).toBeUndefined();
    // O numerador continua conhecido.
    expect(summary.metrics.objectiveTakedowns).toBe(2);
  });

  it("time do jogador ausente na lista deixa a métrica indisponível", () => {
    const [summary] = mapMatchToSummaries(
      raw({
        challenges: { dragonTakedowns: 1, baronTakedowns: 1 },
        teams: [{ teamId: 200, objectives: { dragon: { kills: 4 }, baron: { kills: 1 } } }]
      })
    );
    expect(summary.metrics.objectiveParticipation).toBeUndefined();
  });

  it("payload antigo sem `challenges` não quebra o mapeamento", () => {
    const [summary] = mapMatchToSummaries(
      raw({ challenges: undefined, teams: [{ teamId: 100, objectives: { dragon: { kills: 2 }, baron: { kills: 0 } } }] })
    );
    expect(summary.metrics.objectiveParticipation).toBeUndefined();
    expect(summary.metrics.objectiveTakedowns).toBeUndefined();
    // O resto da partida continua mapeado normalmente.
    expect(summary.metrics.kills).toBe(5);
    expect(summary.championName).toBe("Viego");
  });

  it("participação zero real atravessa como 0", () => {
    const [summary] = mapMatchToSummaries(
      raw({
        challenges: { dragonTakedowns: 0, baronTakedowns: 0 },
        teams: [{ teamId: 100, objectives: { dragon: { kills: 2 }, baron: { kills: 1 } } }]
      })
    );
    expect(summary.metrics.objectiveParticipation).toBe(0);
    expect(summary.metrics.objectiveTakedowns).toBe(0);
    expect(summary.metrics.teamObjectiveKills).toBe(3);
  });
});
