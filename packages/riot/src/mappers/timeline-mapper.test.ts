import { describe, expect, it } from "vitest";
import matchTimelineFixture from "./__fixtures__/match-timeline.json" with { type: "json" };
import { mapTimelineToSummary, type RiotMatchTimelineDto } from "./timeline-mapper.js";

const fixture = matchTimelineFixture as RiotMatchTimelineDto;
const teams = [
  { participantId: 1, teamId: 100 },
  { participantId: 2, teamId: 200 }
];

describe("mapTimelineToSummary", () => {
  const summary = mapTimelineToSummary(fixture, 1, teams);

  it("conta mortes antes de 10 e 15 minutos a partir dos eventos reais da timeline", () => {
    // morte aos 5min conta nos dois; morte aos 11min so conta em deathsBefore15
    expect(summary.deathsBefore10).toBe(1);
    expect(summary.deathsBefore15).toBe(2);
  });

  it("le CS (minions + jungle) do frame mais proximo de 10/15 minutos", () => {
    expect(summary.csAt10).toBe(72); // 70 + 2
    expect(summary.csAt15).toBe(113); // 110 + 3
  });

  it("calcula goldDiffAt15 como ouro do time do jogador menos o do time inimigo", () => {
    expect(summary.goldDiffAt15).toBe(700); // 5800 - 5100
  });

  it("extrai objetivos (dragao/torre) formatados com minuto:segundo", () => {
    expect(summary.objectiveEvents).toEqual(["DRAGON@9:55", "TOWER_BUILDING@14:30"]);
  });

  it("goldDiffAt15 fica undefined se a partida nao chegou aos 15 minutos", () => {
    const shortGame: RiotMatchTimelineDto = {
      metadata: fixture.metadata,
      info: { frameInterval: 60000, frames: fixture.info.frames.slice(0, 2) }
    };
    const shortSummary = mapTimelineToSummary(shortGame, 1, teams);
    expect(shortSummary.goldDiffAt15).toBeUndefined();
  });
});
