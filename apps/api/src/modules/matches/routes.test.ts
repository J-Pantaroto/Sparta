import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, accountMock, observationMock, participantsOverviewMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  accountMock: vi.fn(),
  observationMock: vi.fn(),
  participantsOverviewMock: vi.fn()
}));

vi.mock("../auth/routes.js", () => ({
  getAuthenticatedUserId: authMock,
  authRoutes: async () => {}
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    riotAccount: { findFirst: accountMock }
  }
}));

vi.mock("./match-observation-repository.js", () => ({
  findMatchLoadoutObservation: observationMock
}));

vi.mock("./match-participants-repository.js", () => ({
  findMatchParticipantsOverview: participantsOverviewMock
}));

import { buildApp } from "../../app.js";

describe("GET /matches/:matchId/observation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exige autenticação", async () => {
    authMock.mockResolvedValue(null);
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/matches/BR1_1/observation" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("não permite consultar observação de outra conta", async () => {
    authMock.mockResolvedValue("user-1");
    accountMock.mockResolvedValue({ puuid: "own-puuid" });
    observationMock.mockResolvedValue(null);
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/matches/BR1_1/observation" });
    expect(response.statusCode).toBe(404);
    expect(observationMock).toHaveBeenCalledWith("BR1_1", "own-puuid");
    await app.close();
  });

  it("expõe o contrato factual normalizado", async () => {
    authMock.mockResolvedValue("user-1");
    accountMock.mockResolvedValue({ puuid: "own-puuid" });
    observationMock.mockResolvedValue({
      extractorVersion: "match-observation/1.0.0",
      matchId: "BR1_1",
      championId: 61,
      context: { patch: "16.14", queueId: 420, platform: "BR1", won: true },
      items: [{ slot: 0, state: "EMPTY" }],
      runes: { status: "UNAVAILABLE", selections: [], fragments: [] },
      summonerSpells: [{ slot: 1, state: "PRESENT", spellId: 4 }],
      position: {
        normalizedRole: "MID",
        normalizedRoleSource: "TEAM_POSITION",
        diverged: false,
        status: "AVAILABLE"
      }
    });
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/matches/BR1_1/observation" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      context: { patch: "16.14", queueId: 420 },
      items: [{ slot: 0, state: "EMPTY" }],
      position: { normalizedRole: "MID", normalizedRoleSource: "TEAM_POSITION" }
    });
    await app.close();
  });
});

describe("GET /matches/:matchId/participants", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exige autenticação", async () => {
    authMock.mockResolvedValue(null);
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/matches/BR1_1/participants" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("404 quando a conta autenticada não tem linha nesta partida (posse implícita)", async () => {
    authMock.mockResolvedValue("user-1");
    accountMock.mockResolvedValue({ puuid: "own-puuid" });
    participantsOverviewMock.mockResolvedValue(null);
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/matches/BR1_1/participants" });
    expect(response.statusCode).toBe(404);
    expect(participantsOverviewMock).toHaveBeenCalledWith("BR1_1", "own-puuid");
    await app.close();
  });

  it("expõe os 10 participantes com a linha do jogador marcada", async () => {
    authMock.mockResolvedValue("user-1");
    accountMock.mockResolvedValue({ puuid: "own-puuid" });
    participantsOverviewMock.mockResolvedValue({
      matchId: "BR1_1",
      participants: [
        { puuid: "own-puuid", teamId: 100, championId: 61, championName: "Orianna", won: true, isTrackedPlayer: true },
        { puuid: "other-puuid", teamId: 200, championId: 1, championName: "Annie", won: false, isTrackedPlayer: false }
      ]
    });
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/matches/BR1_1/participants" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.participants).toHaveLength(2);
    expect(body.participants.find((p: { puuid: string }) => p.puuid === "own-puuid").isTrackedPlayer).toBe(true);
    await app.close();
  });
});
