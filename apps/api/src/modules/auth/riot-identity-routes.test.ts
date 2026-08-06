import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedUserIdMock, prismaMock } = vi.hoisted(() => {
  const prisma = {
    riotAccount: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn()
    },
    rsoAuthorizationTransaction: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn()
    },
    $transaction: vi.fn()
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
    callback(prisma)
  );
  return { getAuthenticatedUserIdMock: vi.fn(), prismaMock: prisma };
});

vi.mock("./routes.js", () => ({ getAuthenticatedUserId: getAuthenticatedUserIdMock }));
vi.mock("../../db/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../../config/env.js", () => ({
  loadEnv: () => ({
    RSO_ENABLED: true,
    RSO_CLIENT_ID: "client-id",
    RSO_REDIRECT_URI: "https://api.example.test/auth/riot/rso/callback"
  })
}));

import { createRiotIdentityRoutes } from "./riot-identity-routes.js";
import type { RiotIdentityProvider } from "./riot-identity.js";

const claim = {
  puuid: "own-puuid",
  gameName: "Sparta",
  tagLine: "BR1",
  platformRegion: "br1",
  regionalRouting: "americas"
};

const provider: RiotIdentityProvider = {
  name: "RIOT_RSO",
  isConfigured: () => true,
  exchangeCodeForOwnIdentity: vi.fn().mockResolvedValue(claim)
};

describe("rotas RSO", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock)
    );
    prismaMock.rsoAuthorizationTransaction.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.rsoAuthorizationTransaction.update.mockResolvedValue({});
    prismaMock.riotAccount.create.mockResolvedValue({});
    getAuthenticatedUserIdMock.mockResolvedValue("user-1");
  });

  it("retorna erro estruturado quando o provider real nao esta configurado", async () => {
    const app = Fastify();
    await app.register(
      createRiotIdentityRoutes({
        name: "RIOT_RSO",
        isConfigured: () => false,
        exchangeCodeForOwnIdentity: vi.fn()
      })
    );
    const response = await app.inject({ method: "POST", url: "/auth/riot/rso/start" });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("RSO_NOT_CONFIGURED");
    await app.close();
  });

  it("vincula a claim resolvida pelo provider ao usuario que iniciou o state", async () => {
    prismaMock.rsoAuthorizationTransaction.findUnique.mockResolvedValue({
      id: "tx-1",
      userId: "user-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
      redirectUri: "https://api.example.test/auth/riot/rso/callback",
      riotAccountId: null,
      previousLinkStatus: null
    });
    prismaMock.riotAccount.findUnique.mockResolvedValue(null);
    const app = Fastify();
    await app.register(createRiotIdentityRoutes(provider));

    const response = await app.inject({
      method: "GET",
      url: `/auth/riot/rso/callback?code=opaque-code&state=${"s".repeat(40)}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "VERIFIED_BY_RSO" });
    expect(prismaMock.riotAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        puuid: "own-puuid",
        linkStatus: "VERIFIED_BY_RSO"
      })
    });
    expect(JSON.stringify(response.json())).not.toMatch(/puuid|token|code/i);
    await app.close();
  });

  it("consome state uma unica vez e nao reassocia identidade de outro usuario", async () => {
    const transaction = {
      id: "tx-1",
      userId: "user-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
      redirectUri: "https://api.example.test/auth/riot/rso/callback",
      riotAccountId: null,
      previousLinkStatus: null
    };
    prismaMock.rsoAuthorizationTransaction.findUnique.mockResolvedValue(transaction);
    prismaMock.riotAccount.findUnique.mockResolvedValue({ id: "account-2", userId: "user-2" });
    const app = Fastify();
    await app.register(createRiotIdentityRoutes(provider));

    const first = await app.inject({
      method: "GET",
      url: `/auth/riot/rso/callback?code=opaque-code&state=${"x".repeat(40)}`
    });
    expect(first.statusCode).toBe(409);
    expect(prismaMock.riotAccount.create).not.toHaveBeenCalled();

    prismaMock.rsoAuthorizationTransaction.updateMany.mockResolvedValueOnce({ count: 0 });
    const replay = await app.inject({
      method: "GET",
      url: `/auth/riot/rso/callback?code=opaque-code&state=${"x".repeat(40)}`
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().code).toBe("RSO_CALLBACK_INVALID");
    await app.close();
  });

  it("rejeita troca de identidade no callback de um vinculo existente", async () => {
    prismaMock.rsoAuthorizationTransaction.findUnique.mockResolvedValue({
      id: "tx-1",
      userId: "user-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
      redirectUri: "https://api.example.test/auth/riot/rso/callback",
      riotAccountId: "account-1",
      previousLinkStatus: "VERIFIED_BY_RSO"
    });
    prismaMock.riotAccount.findUnique.mockResolvedValueOnce({
      id: "account-1",
      userId: "user-1",
      puuid: "different-puuid"
    });
    const app = Fastify();
    await app.register(createRiotIdentityRoutes(provider));

    const response = await app.inject({
      method: "GET",
      url: `/auth/riot/rso/callback?code=opaque-code&state=${"m".repeat(40)}`
    });

    expect(response.statusCode).toBe(502);
    expect(prismaMock.riotAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "account-1", userId: "user-1" },
      data: expect.objectContaining({ linkStatus: "REQUIRES_REAUTHENTICATION" })
    });
    await app.close();
  });

  it("nao reativa vinculo revogado quando a verificacao falha", async () => {
    prismaMock.rsoAuthorizationTransaction.findUnique.mockResolvedValue({
      id: "tx-1",
      userId: "user-1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
      redirectUri: "https://api.example.test/auth/riot/rso/callback",
      riotAccountId: "account-1",
      previousLinkStatus: "REVOKED"
    });
    const failingProvider: RiotIdentityProvider = {
      name: "RIOT_RSO",
      isConfigured: () => true,
      exchangeCodeForOwnIdentity: vi.fn().mockRejectedValue(new Error("provider unavailable"))
    };
    const app = Fastify();
    await app.register(createRiotIdentityRoutes(failingProvider));

    const response = await app.inject({
      method: "GET",
      url: `/auth/riot/rso/callback?code=opaque-code&state=${"r".repeat(40)}`
    });

    expect(response.statusCode).toBe(502);
    expect(prismaMock.riotAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "account-1", userId: "user-1" },
      data: expect.objectContaining({ linkStatus: "REVOKED" })
    });
    await app.close();
  });
});
