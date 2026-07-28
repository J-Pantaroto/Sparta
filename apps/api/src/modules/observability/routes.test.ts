import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthenticatedUserIdMock,
  riotAccountFindFirstMock,
  buildRecommendationObservabilityForPlayerMock
} = vi.hoisted(() => ({
  getAuthenticatedUserIdMock: vi.fn(),
  riotAccountFindFirstMock: vi.fn(),
  buildRecommendationObservabilityForPlayerMock: vi.fn()
}));

vi.mock("../auth/routes.js", () => ({
  getAuthenticatedUserId: getAuthenticatedUserIdMock,
  authRoutes: async () => {}
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    riotAccount: { findFirst: riotAccountFindFirstMock }
  }
}));

vi.mock("./recommendation-observability-repository.js", () => ({
  buildRecommendationObservabilityForPlayer: buildRecommendationObservabilityForPlayerMock
}));

import { buildApp } from "../../app.js";

describe("recommendation observability routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
    riotAccountFindFirstMock.mockResolvedValue({ id: "account-1", puuid: "puuid-1" });
    buildRecommendationObservabilityForPlayerMock.mockResolvedValue({
      status: "UNAVAILABLE",
      filters: { playerId: "puuid-1" },
      sampleSize: 0
    });
  });

  it("protege o isolamento por conta", async () => {
    riotAccountFindFirstMock.mockResolvedValue(null);
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/players/other-puuid/recommendation-observability"
    });

    expect(response.statusCode).toBe(403);
    expect(buildRecommendationObservabilityForPlayerMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("repassa filtros factuais e versões sem aceitar agregados do cliente", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url:
        "/players/puuid-1/recommendation-observability" +
        "?patch=26.14,26.15&queueId=420&role=JUNGLE" +
        "&championId=234&group=PRIMARY" +
        "&algorithmDimension=recommendationEngine" +
        "&algorithmVersion=recommendation-engine%2F3.0.0" +
        "&displaySampleThreshold=8"
    });

    expect(response.statusCode).toBe(200);
    expect(buildRecommendationObservabilityForPlayerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        riotAccountId: "account-1",
        puuid: "puuid-1",
        displaySampleThreshold: 8,
        filters: {
          patches: ["26.14", "26.15"],
          queueIds: [420],
          roles: ["JUNGLE"],
          championIds: [234],
          selectionGroups: ["PRIMARY"],
          algorithmVersions: {
            recommendationEngine: ["recommendation-engine/3.0.0"]
          }
        }
      })
    );
    await app.close();
  });

  it("força a posição do path e disponibiliza a visão por versões", async () => {
    const app = await buildApp();
    const roleResponse = await app.inject({
      method: "GET",
      url: "/players/puuid-1/recommendation-observability/roles/MID"
    });
    const versionResponse = await app.inject({
      method: "GET",
      url: "/players/puuid-1/recommendation-observability/versions"
    });

    expect(roleResponse.statusCode).toBe(200);
    expect(versionResponse.statusCode).toBe(200);
    expect(buildRecommendationObservabilityForPlayerMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ filters: { roles: ["MID"] } })
    );
    expect(buildRecommendationObservabilityForPlayerMock).toHaveBeenCalledTimes(2);
    await app.close();
  });
});
