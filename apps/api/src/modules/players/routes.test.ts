import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findRiotAccountByRiotIdMock,
  findChampionStatsByPuuidMock,
  findPlayerInsightsByPuuidMock,
  findParticipationHistoryMock,
  findPostgameReportsByPuuidMock
} = vi.hoisted(() => ({
  findRiotAccountByRiotIdMock: vi.fn(),
  findChampionStatsByPuuidMock: vi.fn(),
  findPlayerInsightsByPuuidMock: vi.fn(),
  findParticipationHistoryMock: vi.fn(),
  findPostgameReportsByPuuidMock: vi.fn()
}));

vi.mock("./player-stats-repository.js", () => ({
  findRiotAccountByRiotId: findRiotAccountByRiotIdMock,
  findChampionStatsByPuuid: findChampionStatsByPuuidMock,
  findPlayerInsightsByPuuid: findPlayerInsightsByPuuidMock,
  derivePreferredRoles: (stats: { role: string }[]) => Array.from(new Set(stats.map((entry) => entry.role)))
}));

vi.mock("../matches/match-repository.js", () => ({
  findParticipationHistory: findParticipationHistoryMock
}));

vi.mock("../postgame/postgame-repository.js", () => ({
  findPostgameReportsByPuuid: findPostgameReportsByPuuidMock
}));

import { buildApp } from "../../app.js";

describe("players routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 404 no perfil quando a conta Riot nao foi vinculada no Sparta", async () => {
    findRiotAccountByRiotIdMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/players/Zekerus/117/profile" });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("retorna o perfil real (championStats/preferredRoles) quando a conta existe", async () => {
    findRiotAccountByRiotIdMock.mockResolvedValue({
      puuid: "puuid-1",
      gameName: "Zekerus",
      tagLine: "117",
      platformRegion: "br1",
      regionalRouting: "americas"
    });
    findChampionStatsByPuuidMock.mockResolvedValue([
      {
        championId: 61,
        championName: "Orianna",
        role: "MID",
        games: 5,
        wins: 3,
        kills: 20,
        deaths: 10,
        assists: 30,
        csPerMinute: 7,
        goldPerMinute: 400,
        damagePerMinute: 700,
        visionScorePerMinute: 1,
        killParticipation: 0.5,
        objectiveParticipation: 0.4,
        recentMatches: []
      }
    ]);
    findPlayerInsightsByPuuidMock.mockResolvedValue({
      strengths: [],
      weaknesses: [],
      recentForm: { last10Score: 50, last20Score: 50, last50Score: 50, trend: "stable", confidence: "low" }
    });
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/players/Zekerus/117/profile" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.id).toBe("puuid-1");
    expect(body.championStats).toHaveLength(1);
    expect(body.preferredRoles).toEqual(["MID"]);
    expect(body.recentForm.confidence).toBe("low");
    await app.close();
  });

  it("recent-matches devolve lista vazia quando o jogador nunca sincronizou", async () => {
    findParticipationHistoryMock.mockResolvedValue([]);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/players/puuid-x/recent-matches" });

    expect(response.statusCode).toBe(200);
    expect(response.json().matches).toEqual([]);
    await app.close();
  });

  it("champion-performance devolve lista vazia quando nao ha stats", async () => {
    findChampionStatsByPuuidMock.mockResolvedValue([]);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/players/puuid-x/champion-performance" });

    expect(response.statusCode).toBe(200);
    expect(response.json().champions).toEqual([]);
    await app.close();
  });

  it("growth-journey devolve vazio quando o jogador nunca analisou uma partida", async () => {
    findPostgameReportsByPuuidMock.mockResolvedValue([]);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/players/puuid-x/growth-journey" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.puuid).toBe("puuid-x");
    expect(body.matchesAnalyzed).toBe(0);
    expect(body.weaknessTrends).toEqual([]);
    await app.close();
  });

  it("growth-journey deriva tendencias reais a partir dos relatorios persistidos", async () => {
    const weakness = { code: "morre_demais", label: "Morre com frequencia", detail: "d", severity: "medium", confidence: "low" };
    const reportWith = { matchId: "m", expectedPlan: "p", executionSummary: "e", pickAssessment: "a", strengths: [], weaknesses: [weakness], tips: [], metrics: {} };
    const reportWithout = { ...reportWith, weaknesses: [] };
    findPostgameReportsByPuuidMock.mockResolvedValue([
      reportWithout,
      reportWithout,
      reportWithout,
      reportWith,
      reportWith,
      reportWith
    ]);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/players/puuid-x/growth-journey" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.matchesAnalyzed).toBe(6);
    expect(body.weaknessTrends).toHaveLength(1);
    expect(body.weaknessTrends[0].code).toBe("morre_demais");
    await app.close();
  });
});
