import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedUserIdMock,
  riotAccountFindFirstMock,
  findChampionStatsByPuuidMock,
  findPlayerInsightsByPuuidMock,
  findAllChampionTagsMock,
  findPersonalLaneMatchupHistoryMock
} = vi.hoisted(() => ({
  getAuthenticatedUserIdMock: vi.fn(),
  riotAccountFindFirstMock: vi.fn(),
  findChampionStatsByPuuidMock: vi.fn(),
  findPlayerInsightsByPuuidMock: vi.fn(),
  findAllChampionTagsMock: vi.fn(),
  findPersonalLaneMatchupHistoryMock: vi.fn()
}));

vi.mock("../auth/routes.js", () => ({
  getAuthenticatedUserId: getAuthenticatedUserIdMock,
  authRoutes: async () => {}
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: { riotAccount: { findFirst: riotAccountFindFirstMock } }
}));

vi.mock("../catalog/champion-repository.js", () => ({
  findAllChampionTags: findAllChampionTagsMock
}));

vi.mock("../matches/matchup-repository.js", () => ({
  findPersonalLaneMatchupHistory: findPersonalLaneMatchupHistoryMock
}));

vi.mock("../players/player-stats-repository.js", () => ({
  findChampionStatsByPuuid: findChampionStatsByPuuidMock,
  findPlayerInsightsByPuuid: findPlayerInsightsByPuuidMock,
  derivePreferredRoles: (stats: { role: string }[]) => Array.from(new Set(stats.map((entry) => entry.role)))
}));

import { buildApp } from "../../app.js";

const draftPayload = {
  draft: { playerRole: "MID", pickOrder: 1, allies: [], enemies: [], bannedChampionIds: [] }
};

describe("drafts routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllChampionTagsMock.mockResolvedValue([]);
    findPersonalLaneMatchupHistoryMock.mockResolvedValue([]);
  });

  describe("posição ausente (Etapa 6)", () => {
    const semPosicao = { draft: { pickOrder: 1, allies: [], enemies: [], bannedChampionIds: [] } };

    it("responde 422 com código estável em vez de assumir MID", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      const app = await buildApp();

      const response = await app.inject({ method: "POST", url: "/drafts/recommendations", payload: semPosicao });
      const body = response.json();

      expect(response.statusCode).toBe(422);
      expect(body.code).toBe("PLAYER_ROLE_UNAVAILABLE");
      expect(body.message).toMatch(/posição/i);
      // Nao pode vazar detalhe interno.
      expect(body.stack).toBeUndefined();
      await app.close();
    });

    it("não consulta estatísticas nem monta pool sem posição", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      const app = await buildApp();

      await app.inject({ method: "POST", url: "/drafts/recommendations", payload: semPosicao });

      expect(riotAccountFindFirstMock).not.toHaveBeenCalled();
      expect(findChampionStatsByPuuidMock).not.toHaveBeenCalled();
      expect(findPersonalLaneMatchupHistoryMock).not.toHaveBeenCalled();
      await app.close();
    });

    it("exige autenticação antes de avaliar a posição", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({ method: "POST", url: "/drafts/recommendations", payload: semPosicao });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it("aceita aliado/inimigo sem posição atribuída", async () => {
      getAuthenticatedUserIdMock.mockResolvedValue("user-1");
      riotAccountFindFirstMock.mockResolvedValue(null);
      const app = await buildApp();

      const response = await app.inject({
        method: "POST",
        url: "/drafts/recommendations",
        payload: {
          draft: {
            playerRole: "JUNGLE",
            pickOrder: 1,
            allies: [{ championId: 103, championName: "Ahri", team: "ally" }],
            enemies: [],
            bannedChampionIds: []
          }
        }
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });
  });

  it("retorna 401 sem autenticacao", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({ method: "POST", url: "/drafts/recommendations", payload: draftPayload });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("responde honesto-neutro (sem recomendacoes fabricadas) quando o usuario nao tem conta Riot vinculada", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({ method: "POST", url: "/drafts/recommendations", payload: draftPayload });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.recommendations).toEqual([]);
    expect(findChampionStatsByPuuidMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("usa dado real (championStats/championTags/matchups) da conta Riot do usuario autenticado", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue({
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
        games: 10,
        wins: 6,
        kills: 50,
        deaths: 20,
        assists: 70,
        csPerMinute: 7.8,
        goldPerMinute: 420,
        damagePerMinute: 760,
        visionScorePerMinute: 0.9,
        killParticipation: 0.62,
        objectiveParticipation: 0.4,
        recentMatches: []
      }
    ]);
    findPlayerInsightsByPuuidMock.mockResolvedValue({
      strengths: [],
      weaknesses: [],
      recentForm: { last10Score: 60, last20Score: 58, last50Score: 55, trend: "stable", confidence: "medium" }
    });

    const app = await buildApp();
    const response = await app.inject({ method: "POST", url: "/drafts/recommendations", payload: draftPayload });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(findPersonalLaneMatchupHistoryMock).toHaveBeenCalledWith("puuid-1", "MID");
    expect(body.recommendations.length).toBeGreaterThan(0);
    expect(body.recommendations[0].championName).toBe("Orianna");
    await app.close();
  });
});
