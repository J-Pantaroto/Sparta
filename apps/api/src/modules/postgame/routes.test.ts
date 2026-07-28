import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedUserIdMock,
  riotAccountFindFirstMock,
  matchFindUniqueMock,
  postgameReportUpsertMock,
  postgameReportFindUniqueMock,
  matchParticipantFindFirstMock,
  findMatchDetailMock,
  findChampionStatsByPuuidMock,
  findDraftComparisonBySessionMock,
  findDraftComparisonByMatchMock,
  generateDraftComparisonMock
} = vi.hoisted(() => ({
  getAuthenticatedUserIdMock: vi.fn(),
  riotAccountFindFirstMock: vi.fn(),
  matchFindUniqueMock: vi.fn(),
  postgameReportUpsertMock: vi.fn(),
  postgameReportFindUniqueMock: vi.fn(),
  matchParticipantFindFirstMock: vi.fn(),
  findMatchDetailMock: vi.fn(),
  findChampionStatsByPuuidMock: vi.fn(),
  findDraftComparisonBySessionMock: vi.fn(),
  findDraftComparisonByMatchMock: vi.fn(),
  generateDraftComparisonMock: vi.fn()
}));

vi.mock("../auth/routes.js", () => ({
  getAuthenticatedUserId: getAuthenticatedUserIdMock,
  authRoutes: async () => {}
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    riotAccount: { findFirst: riotAccountFindFirstMock },
    match: { findUnique: matchFindUniqueMock },
    matchParticipant: { findFirst: matchParticipantFindFirstMock },
    postgameReport: { upsert: postgameReportUpsertMock, findUnique: postgameReportFindUniqueMock }
  }
}));

vi.mock("../matches/match-repository.js", () => ({
  findMatchDetail: findMatchDetailMock
}));

vi.mock("../players/player-stats-repository.js", () => ({
  findChampionStatsByPuuid: findChampionStatsByPuuidMock
}));

vi.mock("./draft-postgame-comparison-repository.js", () => ({
  findDraftComparisonBySession: findDraftComparisonBySessionMock,
  findDraftComparisonByMatch: findDraftComparisonByMatchMock,
  generateDraftComparison: generateDraftComparisonMock
}));

import { buildApp } from "../../app.js";

const matchDetail = {
  matchDbId: "match-db-id",
  matchId: "riot-m1",
  durationSeconds: 1800,
  ownParticipant: {
    championId: 61,
    championName: "Orianna",
    role: "MID",
    won: true,
    kills: 6,
    deaths: 3,
    assists: 6,
    csPerMinute: 7.7,
    goldPerMinute: 430,
    damagePerMinute: 760,
    visionScorePerMinute: 0.85,
    killParticipation: 0.56,
    objectiveParticipation: 0.38
  },
  enemyLaneChampionName: "Yasuo",
  timeline: {
    matchId: "riot-m1",
    deathsBefore10: 0,
    deathsBefore15: 1,
    csAt10: 80,
    csAt15: 120,
    goldDiffAt15: 300,
    objectiveEvents: []
  }
};

describe("postgame routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findChampionStatsByPuuidMock.mockResolvedValue([]);
    postgameReportUpsertMock.mockResolvedValue(undefined);
  });

  describe("POST /postgame/analyze", () => {
    it("retorna 401 sem autenticacao", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/postgame/analyze",
        payload: { matchId: "riot-m1" }
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it("retorna 404 quando o usuario nao tem conta Riot vinculada", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/postgame/analyze",
        payload: { matchId: "riot-m1" }
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it("retorna 404 quando a partida nao esta sincronizada pra essa conta", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue({ puuid: "puuid-1" });
      findMatchDetailMock.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/postgame/analyze",
        payload: { matchId: "riot-m1" }
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it("gera a analise real, persiste (upsert) e retorna o resultado", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue({ puuid: "puuid-1" });
      findMatchDetailMock.mockResolvedValue(matchDetail);
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/postgame/analyze",
        payload: { matchId: "riot-m1" }
      });
      const body = response.json();

      expect(response.statusCode).toBe(200);
      expect(body.matchId).toBe("riot-m1");
      expect(body.pickAssessment).toContain("Orianna");
      expect(postgameReportUpsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { matchId_puuid: { matchId: "match-db-id", puuid: "puuid-1" } }
        })
      );
      await app.close();
    });
  });

  describe("GET /postgame/:matchId", () => {
    it("retorna 401 sem autenticacao", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({ method: "GET", url: "/postgame/riot-m1" });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it("retorna 404 quando a partida nao existe", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue({ puuid: "puuid-1" });
      matchFindUniqueMock.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({ method: "GET", url: "/postgame/riot-m1" });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it("retorna 404 honesto quando a partida existe mas ainda nao foi analisada", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue({ puuid: "puuid-1" });
      matchFindUniqueMock.mockResolvedValue({ id: "match-db-id" });
      postgameReportFindUniqueMock.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({ method: "GET", url: "/postgame/riot-m1" });
      const body = response.json();

      expect(response.statusCode).toBe(404);
      expect(body.error).toContain("Ainda nao analisado");
      await app.close();
    });

    it("retorna o relatorio persistido quando ja foi analisado", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue({ puuid: "puuid-1" });
      matchFindUniqueMock.mockResolvedValue({ id: "match-db-id" });
      postgameReportFindUniqueMock.mockResolvedValue({
        reportJson: { matchId: "riot-m1", pickAssessment: "ja analisado" }
      });
      const app = await buildApp();

      const response = await app.inject({ method: "GET", url: "/postgame/riot-m1" });
      const body = response.json();

      expect(response.statusCode).toBe(200);
      expect(body.pickAssessment).toBe("ja analisado");
      await app.close();
    });
  });

  describe("comparação entre draft e partida", () => {
    it("GET por sessão distingue relatório ainda não gerado", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue({ id: "account-1", puuid: "puuid-1" });
      findDraftComparisonBySessionMock.mockResolvedValue({
        state: "NOT_GENERATED",
        draftSessionId: "11111111-1111-4111-8111-111111111111",
        report: null
      });
      const app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/draft-sessions/11111111-1111-4111-8111-111111111111/post-game-comparison"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().state).toBe("NOT_GENERATED");
      expect(findDraftComparisonBySessionMock).toHaveBeenCalledWith(
        "account-1",
        "11111111-1111-4111-8111-111111111111"
      );
      await app.close();
    });

    it("GET por partida não expõe partida que não pertence à conta", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue({ id: "account-1", puuid: "puuid-1" });
      matchParticipantFindFirstMock.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/matches/BR1_1/draft-comparison"
      });

      expect(response.statusCode).toBe(404);
      expect(findDraftComparisonByMatchMock).not.toHaveBeenCalled();
      await app.close();
    });

    it("POST rejeita métricas e conclusões enviadas pelo cliente", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue({ id: "account-1", puuid: "puuid-1" });
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/draft-sessions/11111111-1111-4111-8111-111111111111/post-game-comparison/generate",
        payload: { score: 100, conclusion: "cliente não é fonte" }
      });

      expect(response.statusCode).toBe(400);
      expect(generateDraftComparisonMock).not.toHaveBeenCalled();
      await app.close();
    });

    it("POST sem payload gera somente com fontes resolvidas no servidor", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue({ id: "account-1", puuid: "puuid-1" });
      generateDraftComparisonMock.mockResolvedValue({
        ok: true,
        created: true,
        report: { draftSessionId: "11111111-1111-4111-8111-111111111111" }
      });
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/draft-sessions/11111111-1111-4111-8111-111111111111/post-game-comparison/generate"
      });

      expect(response.statusCode).toBe(201);
      expect(generateDraftComparisonMock).toHaveBeenCalledWith(
        "account-1",
        "puuid-1",
        "11111111-1111-4111-8111-111111111111"
      );
      await app.close();
    });
  });
});
