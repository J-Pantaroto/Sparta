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

  // Etapa 4: ate aqui a partida curta reportava csAt10/csAt15 = 0, ou o CS
  // de um minuto anterior rotulado como se fosse do minuto pedido.
  it("csAt10/csAt15 ficam undefined se a partida nao chegou naqueles minutos", () => {
    const shortGame: RiotMatchTimelineDto = {
      metadata: fixture.metadata,
      info: { frameInterval: 60000, frames: fixture.info.frames.slice(0, 2) }
    };
    const shortSummary = mapTimelineToSummary(shortGame, 1, teams);
    expect(shortSummary.csAt10).toBeUndefined();
    expect(shortSummary.csAt15).toBeUndefined();
    // Contagem de eventos continua sendo um numero real: nao morreu = 0.
    expect(shortSummary.deathsBefore10).toBe(1);
    expect(typeof shortSummary.deathsBefore15).toBe("number");
  });

  it("csAt fica undefined quando o frame nao traz aquele participante", () => {
    const outroParticipante = mapTimelineToSummary(fixture, 99, [
      ...teams,
      { participantId: 99, teamId: 100 }
    ]);
    expect(outroParticipante.csAt10).toBeUndefined();
    expect(outroParticipante.csAt15).toBeUndefined();
  });

  it("timeline sem frames nao produz estatisticas zeradas", () => {
    const vazia: RiotMatchTimelineDto = {
      metadata: fixture.metadata,
      info: { frameInterval: 60000, frames: [] }
    };
    const summaryVazia = mapTimelineToSummary(vazia, 1, teams);
    expect(summaryVazia.csAt10).toBeUndefined();
    expect(summaryVazia.csAt15).toBeUndefined();
    expect(summaryVazia.goldDiffAt15).toBeUndefined();
    expect(summaryVazia.objectiveEvents).toEqual([]);
  });

  it("nao produz NaN nem Infinity em nenhum campo numerico", () => {
    [summary.deathsBefore10, summary.deathsBefore15, summary.csAt10, summary.csAt15, summary.goldDiffAt15]
      .filter((value): value is number => value !== undefined)
      .forEach((value) => expect(Number.isFinite(value)).toBe(true));
  });
});
