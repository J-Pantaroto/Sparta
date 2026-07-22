import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchSummary } from "@sparta/core";

const {
  transactionMock,
  championFindManyMock,
  riotAccountFindManyMock,
  matchUpsertMock,
  matchFindManyMock,
  matchFindUniqueMock,
  matchParticipantCreateManyMock,
  matchParticipantUpdateManyMock,
  matchParticipantFindManyMock,
  matchTimelineUpsertMock
} = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  championFindManyMock: vi.fn(),
  riotAccountFindManyMock: vi.fn(),
  matchUpsertMock: vi.fn(),
  matchFindManyMock: vi.fn(),
  matchFindUniqueMock: vi.fn(),
  matchParticipantCreateManyMock: vi.fn(),
  matchParticipantUpdateManyMock: vi.fn(),
  matchParticipantFindManyMock: vi.fn(),
  matchTimelineUpsertMock: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    $transaction: (callback: (tx: unknown) => unknown) => transactionMock(callback),
    match: { findMany: matchFindManyMock, findUnique: matchFindUniqueMock },
    matchParticipant: { findMany: matchParticipantFindManyMock }
  }
}));

import {
  backfillMatchParticipants,
  findMatchDetail,
  findMatchesMissingParticipants,
  findParticipationHistory,
  persistMatch,
  type ParticipantToPersist
} from "./match-repository.js";

const tx = {
  champion: { findMany: championFindManyMock },
  riotAccount: { findMany: riotAccountFindManyMock },
  match: { upsert: matchUpsertMock },
  matchParticipant: { createMany: matchParticipantCreateManyMock, updateMany: matchParticipantUpdateManyMock },
  matchTimeline: { upsert: matchTimelineUpsertMock }
};

function summary(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    matchId: "m1",
    puuid: "puuid-tracked",
    championId: 61,
    championName: "Orianna",
    role: "MID",
    won: true,
    durationSeconds: 1800,
    startedAt: 1720000000000,
    patch: "14.14",
    metrics: {
      kills: 5,
      deaths: 2,
      assists: 8,
      csPerMinute: 8,
      goldPerMinute: 400,
      damagePerMinute: 700,
      visionScorePerMinute: 1
    },
    ...overrides
  };
}

const timeline = {
  matchId: "m1",
  deathsBefore10: 0,
  deathsBefore15: 0,
  csAt10: 80,
  csAt15: 120,
  goldDiffAt15: 300,
  objectiveEvents: []
};

describe("match-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation((callback: (tx: unknown) => unknown) => callback(tx));
    matchUpsertMock.mockResolvedValue({ id: "match-db-id" });
    matchTimelineUpsertMock.mockResolvedValue(undefined);
    matchParticipantCreateManyMock.mockResolvedValue(undefined);
    matchParticipantUpdateManyMock.mockResolvedValue(undefined);
  });

  it("persiste os participantes elegiveis e pula os que ainda nao estao no catalogo de campeoes", async () => {
    championFindManyMock.mockResolvedValue([{ id: 61 }]); // so o campeao rastreado esta no catalogo
    riotAccountFindManyMock.mockResolvedValue([{ id: "acc-1", puuid: "puuid-tracked" }]);

    const participants: ParticipantToPersist[] = [
      { summary: summary(), teamId: 100 },
      { summary: summary({ puuid: "puuid-enemy", championId: 9999, role: "MID" }), teamId: 200 }
    ];

    const result = await persistMatch({
      platform: "br1",
      trackedPuuid: "puuid-tracked",
      participants,
      timeline,
      rawMatch: {}
    });

    expect(result.skippedParticipantPuuids).toEqual(["puuid-enemy"]);
    expect(matchParticipantCreateManyMock).toHaveBeenCalledTimes(1);
    const createManyArg = matchParticipantCreateManyMock.mock.calls[0][0];
    expect(createManyArg.skipDuplicates).toBe(true);
    expect(createManyArg.data).toHaveLength(1);
    expect(createManyArg.data[0]).toMatchObject({ puuid: "puuid-tracked", riotAccountId: "acc-1", teamId: 100 });
  });

  it("resolve riotAccountId pra qualquer participante que seja uma conta Sparta conhecida, nao so o rastreado", async () => {
    championFindManyMock.mockResolvedValue([{ id: 61 }, { id: 157 }]);
    riotAccountFindManyMock.mockResolvedValue([
      { id: "acc-1", puuid: "puuid-tracked" },
      { id: "acc-2", puuid: "puuid-outro-usuario-sparta" }
    ]);

    const participants: ParticipantToPersist[] = [
      { summary: summary(), teamId: 100 },
      { summary: summary({ puuid: "puuid-outro-usuario-sparta", championId: 157 }), teamId: 200 }
    ];

    await persistMatch({ platform: "br1", trackedPuuid: "puuid-tracked", participants, timeline, rawMatch: {} });

    const createManyArg = matchParticipantCreateManyMock.mock.calls[0][0];
    const other = createManyArg.data.find((row: { puuid: string }) => row.puuid === "puuid-outro-usuario-sparta");
    expect(other.riotAccountId).toBe("acc-2");
  });

  it("usa upsert (nao create) pra Match e MatchTimeline, tolerando reprocessar a mesma partida", async () => {
    championFindManyMock.mockResolvedValue([{ id: 61 }]);
    riotAccountFindManyMock.mockResolvedValue([{ id: "acc-1", puuid: "puuid-tracked" }]);

    await persistMatch({
      platform: "br1",
      trackedPuuid: "puuid-tracked",
      participants: [{ summary: summary(), teamId: 100 }],
      timeline,
      rawMatch: {}
    });

    expect(matchUpsertMock).toHaveBeenCalledWith(expect.objectContaining({ where: { matchId: "m1" }, update: {} }));
    expect(matchTimelineUpsertMock).toHaveBeenCalledWith(expect.objectContaining({ where: { matchId: "match-db-id" }, update: {} }));
  });

  it("lanca erro se o puuid rastreado nao estiver na lista de participantes", async () => {
    await expect(
      persistMatch({
        platform: "br1",
        trackedPuuid: "puuid-ausente",
        participants: [{ summary: summary(), teamId: 100 }],
        timeline,
        rawMatch: {}
      })
    ).rejects.toThrow(/puuid-ausente/);
  });

  it("nao grava nenhuma linha (e nao chama createMany) quando todos os campeoes estao fora do catalogo", async () => {
    championFindManyMock.mockResolvedValue([]);
    riotAccountFindManyMock.mockResolvedValue([]);

    const result = await persistMatch({
      platform: "br1",
      trackedPuuid: "puuid-tracked",
      participants: [{ summary: summary({ championId: 9999 }), teamId: 100 }],
      timeline,
      rawMatch: {}
    });

    expect(matchParticipantCreateManyMock).not.toHaveBeenCalled();
    expect(result.skippedParticipantPuuids).toEqual(["puuid-tracked"]);
  });

  it("preenche o teamId de uma linha ja existente (participante rastreado pre-Fase-3) que ainda esta nula", async () => {
    championFindManyMock.mockResolvedValue([{ id: 61 }]);
    riotAccountFindManyMock.mockResolvedValue([{ id: "acc-1", puuid: "puuid-tracked" }]);

    await persistMatch({
      platform: "br1",
      trackedPuuid: "puuid-tracked",
      participants: [{ summary: summary(), teamId: 100 }],
      timeline,
      rawMatch: {}
    });

    expect(matchParticipantUpdateManyMock).toHaveBeenCalledWith({
      where: { matchId: "match-db-id", puuid: "puuid-tracked", teamId: null },
      data: { teamId: 100 }
    });
  });

  it("backfillMatchParticipants grava direto num Match ja existente, sem tocar Match/MatchTimeline", async () => {
    championFindManyMock.mockResolvedValue([{ id: 157 }]);
    riotAccountFindManyMock.mockResolvedValue([]);

    const result = await backfillMatchParticipants("match-db-id-existente", [
      { summary: summary({ puuid: "puuid-enemy", championId: 157 }), teamId: 200 }
    ]);

    expect(matchUpsertMock).not.toHaveBeenCalled();
    expect(matchTimelineUpsertMock).not.toHaveBeenCalled();
    expect(matchParticipantCreateManyMock).toHaveBeenCalledTimes(1);
    expect(result.skippedParticipantPuuids).toEqual([]);
  });

  describe("findMatchesMissingParticipants", () => {
    it("inclui partidas com menos de 10 participantes", async () => {
      matchFindManyMock.mockResolvedValue([
        { id: "m1", matchId: "riot-m1", rawJson: {}, _count: { participants: 3 }, participants: [{ teamId: 100 }] }
      ]);

      const result = await findMatchesMissingParticipants();

      expect(result).toEqual([{ id: "m1", matchId: "riot-m1", rawJson: {} }]);
    });

    it("inclui partidas com 10 participantes mas algum ainda com teamId nulo (linha pre-Fase-3 pulada por skipDuplicates)", async () => {
      matchFindManyMock.mockResolvedValue([
        {
          id: "m2",
          matchId: "riot-m2",
          rawJson: {},
          _count: { participants: 10 },
          participants: [{ teamId: null }, { teamId: 100 }]
        }
      ]);

      const result = await findMatchesMissingParticipants();

      expect(result).toHaveLength(1);
    });

    it("nao inclui partidas com 10 participantes e todos com teamId preenchido", async () => {
      matchFindManyMock.mockResolvedValue([
        {
          id: "m3",
          matchId: "riot-m3",
          rawJson: {},
          _count: { participants: 10 },
          participants: [{ teamId: 100 }, { teamId: 200 }]
        }
      ]);

      expect(await findMatchesMissingParticipants()).toEqual([]);
    });

    it("ignora partidas sem rawJson (nao ha como reconstruir os participantes)", async () => {
      matchFindManyMock.mockResolvedValue([
        { id: "m4", matchId: "riot-m4", rawJson: null, _count: { participants: 1 }, participants: [{ teamId: null }] }
      ]);

      expect(await findMatchesMissingParticipants()).toEqual([]);
    });
  });

  describe("findMatchDetail", () => {
    function participantRow(overrides: Record<string, unknown> = {}) {
      return {
        puuid: "puuid-tracked",
        championId: 61,
        role: "MID",
        teamId: 100,
        won: true,
        kills: 6,
        deaths: 3,
        assists: 6,
        csPerMinute: 7.7,
        goldPerMinute: 430,
        damagePerMinute: 760,
        visionScorePerMinute: 0.85,
        killParticipation: 0.56,
        objectiveParticipation: 0.38,
        champion: { name: "Orianna" },
        ...overrides
      };
    }

    it("retorna null quando a partida nao existe", async () => {
      matchFindUniqueMock.mockResolvedValue(null);
      expect(await findMatchDetail("riot-inexistente", "puuid-tracked")).toBeNull();
    });

    it("retorna null quando o puuid nao esta entre os participantes persistidos", async () => {
      matchFindUniqueMock.mockResolvedValue({
        id: "match-db-id",
        matchId: "riot-m1",
        durationSeconds: 1800,
        timeline: null,
        participants: [participantRow({ puuid: "outro-puuid" })]
      });

      expect(await findMatchDetail("riot-m1", "puuid-tracked")).toBeNull();
    });

    it("identifica o laner oposto (mesmo role, teamId diferente) e monta o detalhe completo", async () => {
      matchFindUniqueMock.mockResolvedValue({
        id: "match-db-id",
        matchId: "riot-m1",
        durationSeconds: 1800,
        timeline: {
          deathsBefore10: 1,
          deathsBefore15: 2,
          csAt10: 80,
          csAt15: 120,
          goldDiffAt15: 300,
          eventsJson: ["DRAGON@14:32"]
        },
        participants: [
          participantRow(),
          participantRow({ puuid: "puuid-enemy", championId: 157, teamId: 200, won: false, champion: { name: "Yasuo" } }),
          participantRow({ puuid: "puuid-jungle-aliado", role: "JUNGLE", teamId: 100, champion: { name: "Vi" } })
        ]
      });

      const result = await findMatchDetail("riot-m1", "puuid-tracked");

      expect(result).not.toBeNull();
      expect(result!.ownParticipant.championName).toBe("Orianna");
      expect(result!.enemyLaneChampionName).toBe("Yasuo");
      expect(result!.timeline).toEqual({
        matchId: "riot-m1",
        deathsBefore10: 1,
        deathsBefore15: 2,
        csAt10: 80,
        csAt15: 120,
        goldDiffAt15: 300,
        objectiveEvents: ["DRAGON@14:32"]
      });
    });

    it("nao identifica laner oposto quando teamId ainda nao foi preenchido (partida pre-Fase-3 sem backfill)", async () => {
      matchFindUniqueMock.mockResolvedValue({
        id: "match-db-id",
        matchId: "riot-m1",
        durationSeconds: 1800,
        timeline: null,
        participants: [
          participantRow({ teamId: null }),
          participantRow({ puuid: "puuid-enemy", championId: 157, teamId: null, champion: { name: "Yasuo" } })
        ]
      });

      const result = await findMatchDetail("riot-m1", "puuid-tracked");

      expect(result!.enemyLaneChampionName).toBeUndefined();
      expect(result!.timeline).toBeNull();
    });

    it("usa um default alto de duracao quando durationSeconds e nulo, em vez de disparar por engano a guarda de partida curta", async () => {
      matchFindUniqueMock.mockResolvedValue({
        id: "match-db-id",
        matchId: "riot-m1",
        durationSeconds: null,
        timeline: null,
        participants: [participantRow()]
      });

      const result = await findMatchDetail("riot-m1", "puuid-tracked");

      expect(result!.durationSeconds).toBeGreaterThanOrEqual(300);
    });
  });

  describe("findParticipationHistory", () => {
    function participationRow() {
      return {
        match: { matchId: "riot-m1" },
        championId: 61,
        champion: { name: "Orianna" },
        role: "MID",
        won: true,
        kills: 5,
        deaths: 2,
        assists: 8,
        csPerMinute: 7,
        goldPerMinute: 400,
        damagePerMinute: 600,
        visionScorePerMinute: 1,
        killParticipation: 0.5,
        objectiveParticipation: 0.4
      };
    }

    it("busca o historico completo quando limit nao e informado (comportamento inalterado)", async () => {
      matchParticipantFindManyMock.mockResolvedValue([participationRow()]);

      await findParticipationHistory("puuid-1");

      expect(matchParticipantFindManyMock).toHaveBeenCalledWith({
        where: { puuid: "puuid-1" },
        include: { match: true, champion: true },
        orderBy: { match: { startedAt: "desc" } }
      });
    });

    it("restringe as N partidas mais recentes quando limit e informado (Fase 6b)", async () => {
      matchParticipantFindManyMock.mockResolvedValue([participationRow()]);

      await findParticipationHistory("puuid-1", 50);

      expect(matchParticipantFindManyMock).toHaveBeenCalledWith({
        where: { puuid: "puuid-1" },
        include: { match: true, champion: true },
        orderBy: { match: { startedAt: "desc" } },
        take: 50
      });
    });
  });
});
