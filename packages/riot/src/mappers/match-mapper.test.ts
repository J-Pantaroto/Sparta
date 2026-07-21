import { describe, expect, it } from "vitest";
import matchDetailFixture from "./__fixtures__/match-detail.json";
import { extractParticipantTeams, extractPatch, mapMatchToSummaries, type RiotMatchDto } from "./match-mapper";

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
