import { beforeEach, describe, expect, it, vi } from "vitest";

const { matchFindManyMock, participantFindManyMock, participantUpdateMock, accountFindManyMock, recomputeMock } =
  vi.hoisted(() => ({
    matchFindManyMock: vi.fn(),
    participantFindManyMock: vi.fn(),
    participantUpdateMock: vi.fn(),
    accountFindManyMock: vi.fn(),
    recomputeMock: vi.fn()
  }));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    match: { findMany: matchFindManyMock },
    matchParticipant: { findMany: participantFindManyMock, update: participantUpdateMock },
    riotAccount: { findMany: accountFindManyMock }
  }
}));

vi.mock("../players/player-stats-repository.js", () => ({ recomputeChampionStats: recomputeMock }));

/**
 * Guarda explícita: o backfill reprocessa `Match.rawJson` já persistido e
 * **não pode** chamar a Riot API. Qualquer fetch aqui falha o teste.
 */
const fetchSpy = vi.fn(() => {
  throw new Error("O backfill não pode fazer nenhuma chamada de rede.");
});
vi.stubGlobal("fetch", fetchSpy);

import { backfillObjectiveParticipation } from "./backfill-objective-participation.js";

function rawMatch(teamObjectives: { dragon: number; baron: number }, challenges?: Record<string, number>) {
  return {
    metadata: { matchId: "BR1_1", participants: ["p1"] },
    info: {
      gameDuration: 1800,
      gameStartTimestamp: 1700000000000,
      gameVersion: "16.14.1.1",
      participants: [{ puuid: "p1", teamId: 100, challenges }],
      teams: [
        { teamId: 100, objectives: { dragon: { kills: teamObjectives.dragon }, baron: { kills: teamObjectives.baron } } },
        { teamId: 200, objectives: { dragon: { kills: 9 }, baron: { kills: 9 } } }
      ]
    }
  };
}

const matchRow = {
  id: "m1",
  matchId: "BR1_1",
  patch: "16.14",
  startedAt: new Date("2026-07-01T00:00:00.000Z"),
  rawJson: rawMatch({ dragon: 3, baron: 1 }, { dragonTakedowns: 2, baronTakedowns: 1 })
};

beforeEach(() => {
  vi.clearAllMocks();
  accountFindManyMock.mockResolvedValue([]);
});

describe("backfillObjectiveParticipation", () => {
  it("calcula a razão e os absolutos a partir do rawJson persistido", async () => {
    matchFindManyMock.mockResolvedValue([matchRow]);
    participantFindManyMock.mockResolvedValue([
      { id: "p", puuid: "p1", teamId: 100, objectiveParticipation: null, objectiveTakedowns: null, teamObjectiveKills: null }
    ]);

    const summary = await backfillObjectiveParticipation();

    expect(summary.matchesAnalyzed).toBe(1);
    expect(summary.participantsUpdated).toBe(1);
    expect(participantUpdateMock).toHaveBeenCalledWith({
      where: { id: "p" },
      data: { objectiveParticipation: 0.75, objectiveTakedowns: 3, teamObjectiveKills: 4 }
    });
  });

  it("não faz nenhuma chamada de rede", async () => {
    matchFindManyMock.mockResolvedValue([matchRow]);
    participantFindManyMock.mockResolvedValue([
      { id: "p", puuid: "p1", teamId: 100, objectiveParticipation: null, objectiveTakedowns: null, teamObjectiveKills: null }
    ]);

    await backfillObjectiveParticipation();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("é idempotente: linha já correta não é reescrita", async () => {
    matchFindManyMock.mockResolvedValue([matchRow]);
    participantFindManyMock.mockResolvedValue([
      { id: "p", puuid: "p1", teamId: 100, objectiveParticipation: 0.75, objectiveTakedowns: 3, teamObjectiveKills: 4 }
    ]);

    const summary = await backfillObjectiveParticipation();
    expect(summary.participantsUpdated).toBe(0);
    expect(participantUpdateMock).not.toHaveBeenCalled();
  });

  it("idempotente mesmo quando a razão não faz round-trip exato no banco", async () => {
    // `1/6` volta do `double precision` com outra representação; a
    // comparação usa os inteiros, que são exatos. Caso real medido.
    matchFindManyMock.mockResolvedValue([
      { ...matchRow, rawJson: rawMatch({ dragon: 6, baron: 0 }, { dragonTakedowns: 1, baronTakedowns: 0 }) }
    ]);
    participantFindManyMock.mockResolvedValue([
      { id: "p", puuid: "p1", teamId: 100, objectiveParticipation: 0.1666666666666667, objectiveTakedowns: 1, teamObjectiveKills: 6 }
    ]);

    const summary = await backfillObjectiveParticipation();
    expect(summary.participantsUpdated).toBe(0);
  });

  it("ignora com segurança partida sem rawJson", async () => {
    matchFindManyMock.mockResolvedValue([{ ...matchRow, rawJson: null }]);

    const summary = await backfillObjectiveParticipation();
    expect(summary.matchesWithoutRawJson).toBe(1);
    expect(summary.participantsUpdated).toBe(0);
    expect(participantFindManyMock).not.toHaveBeenCalled();
  });

  it("grava null (não zero) quando o time não conquistou objetivo neutro", async () => {
    matchFindManyMock.mockResolvedValue([
      { ...matchRow, rawJson: rawMatch({ dragon: 0, baron: 0 }, { dragonTakedowns: 0, baronTakedowns: 0 }) }
    ]);
    participantFindManyMock.mockResolvedValue([
      { id: "p", puuid: "p1", teamId: 100, objectiveParticipation: null, objectiveTakedowns: null, teamObjectiveKills: null }
    ]);

    const summary = await backfillObjectiveParticipation();
    expect(summary.participantsWithoutData).toBe(1);
    expect(participantUpdateMock).toHaveBeenCalledWith({
      where: { id: "p" },
      data: { objectiveParticipation: null, objectiveTakedowns: 0, teamObjectiveKills: 0 }
    });
  });

  it("preserva zero legítimo como zero", async () => {
    matchFindManyMock.mockResolvedValue([
      { ...matchRow, rawJson: rawMatch({ dragon: 2, baron: 1 }, { dragonTakedowns: 0, baronTakedowns: 0 }) }
    ]);
    participantFindManyMock.mockResolvedValue([
      { id: "p", puuid: "p1", teamId: 100, objectiveParticipation: null, objectiveTakedowns: null, teamObjectiveKills: null }
    ]);

    await backfillObjectiveParticipation();
    expect(participantUpdateMock).toHaveBeenCalledWith({
      where: { id: "p" },
      data: { objectiveParticipation: 0, objectiveTakedowns: 0, teamObjectiveKills: 3 }
    });
  });

  it("participante fora do payload não vira zero", async () => {
    matchFindManyMock.mockResolvedValue([matchRow]);
    participantFindManyMock.mockResolvedValue([
      { id: "p", puuid: "desconhecido", teamId: 100, objectiveParticipation: null, objectiveTakedowns: null, teamObjectiveKills: null }
    ]);

    const summary = await backfillObjectiveParticipation();
    expect(summary.participantsWithoutData).toBe(1);
    // Ja estava tudo null: nada a escrever, e nenhum zero e inventado.
    expect(participantUpdateMock).not.toHaveBeenCalled();
  });

  it("recalcula o agregado das contas vinculadas", async () => {
    matchFindManyMock.mockResolvedValue([]);
    accountFindManyMock.mockResolvedValue([{ id: "acc", puuid: "p1" }]);
    participantFindManyMock.mockResolvedValue([{ championId: 234, role: "JUNGLE" }]);

    const summary = await backfillObjectiveParticipation();
    expect(summary.accountsRecomputed).toBe(1);
    expect(recomputeMock).toHaveBeenCalledWith("acc", "p1", [{ championId: 234, role: "JUNGLE" }]);
  });
});
