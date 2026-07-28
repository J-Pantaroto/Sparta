import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  observationFindMany: vi.fn(),
  poolFindMany: vi.fn(),
  poolFindUnique: vi.fn(),
  poolUpsert: vi.fn(),
  poolUpdate: vi.fn(),
  championFindUnique: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    matchObservation: { findMany: prismaMocks.observationFindMany },
    playerChampionPoolEntry: {
      findMany: prismaMocks.poolFindMany,
      findUnique: prismaMocks.poolFindUnique,
      upsert: prismaMocks.poolUpsert,
      update: prismaMocks.poolUpdate
    },
    champion: { findUnique: prismaMocks.championFindUnique }
  }
}));

import {
  addUserProvidedPoolEntry,
  disableUserProvidedPoolEntry,
  findPlayerPool,
  materializeObservedPlayerPool
} from "./player-pool-repository.js";

const timestamp = new Date("2026-07-27T23:00:00.000Z");

function row(
  championId: number,
  role: string,
  source: string,
  enabled = true
) {
  return {
    riotAccountId: "account-1",
    riotAccount: { puuid: "puuid-1" },
    championId,
    champion: { name: `Campeao ${championId}` },
    role,
    source,
    enabled,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("player pool repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.observationFindMany.mockResolvedValue([]);
    prismaMocks.poolFindMany.mockResolvedValue([]);
  });

  it("materializa apenas posicoes normalizadas do proprio jogador e deduplica", async () => {
    prismaMocks.observationFindMany.mockResolvedValue([
      {
        normalizedRole: "MID",
        matchParticipant: { championId: 61 }
      },
      {
        normalizedRole: "MID",
        matchParticipant: { championId: 61 }
      },
      {
        normalizedRole: null,
        matchParticipant: { championId: 99 }
      }
    ]);

    const count = await materializeObservedPlayerPool(
      "account-1",
      "puuid-1",
      "MID"
    );

    expect(prismaMocks.observationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          positionStatus: "AVAILABLE",
          normalizedRole: "MID",
          matchParticipant: { puuid: "puuid-1" }
        }
      })
    );
    expect(count).toBe(1);
    expect(prismaMocks.poolUpsert).toHaveBeenCalledTimes(1);
    expect(prismaMocks.poolUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          championId: 61,
          role: "MID",
          source: "PERSONAL_OBSERVED"
        }),
        update: { source: "PERSONAL_OBSERVED", enabled: true }
      })
    );
  });

  it("filtra as entradas pedidas, mas resume todas as posicoes", async () => {
    prismaMocks.poolFindMany.mockResolvedValue([
      row(61, "MID", "PERSONAL_OBSERVED"),
      row(103, "MID", "USER_PROVIDED"),
      row(64, "JUNGLE", "PERSONAL_OBSERVED")
    ]);

    const result = await findPlayerPool("account-1", "puuid-1", "MID");

    expect(prismaMocks.observationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ normalizedRole: undefined })
      })
    );
    expect(prismaMocks.poolFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { riotAccountId: "account-1" } })
    );
    expect(result.entries.map((entry) => entry.championId)).toEqual([61, 103]);
    expect(result.roleSummaries.find((summary) => summary.role === "MID"))
      .toMatchObject({
        enabledCandidates: 2,
        observedCandidates: 1,
        userProvidedCandidates: 1
      });
    expect(result.roleSummaries.find((summary) => summary.role === "JUNGLE"))
      .toMatchObject({ enabledCandidates: 1 });
  });

  it("adiciona manualmente de forma idempotente e reativa entrada desabilitada", async () => {
    prismaMocks.championFindUnique.mockResolvedValue({ id: 103 });
    prismaMocks.poolFindUnique.mockResolvedValue({
      ...row(103, "MID", "USER_PROVIDED", false)
    });
    prismaMocks.poolUpsert.mockResolvedValue(row(103, "MID", "USER_PROVIDED"));

    const result = await addUserProvidedPoolEntry(
      "account-1",
      "puuid-1",
      103,
      "MID"
    );

    expect(result.status).toBe("EXISTING");
    expect(prismaMocks.poolUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          riotAccountId_championId_role: {
            riotAccountId: "account-1",
            championId: 103,
            role: "MID"
          }
        },
        update: { enabled: true }
      })
    );
  });

  it("preserva a origem observada quando o mesmo campeao e adicionado manualmente", async () => {
    prismaMocks.championFindUnique.mockResolvedValue({ id: 61 });
    prismaMocks.poolFindUnique.mockResolvedValue(
      row(61, "MID", "PERSONAL_OBSERVED")
    );

    const result = await addUserProvidedPoolEntry(
      "account-1",
      "puuid-1",
      61,
      "MID"
    );

    expect(result.status).toBe("EXISTING");
    if (result.status === "EXISTING") {
      expect(result.entry.source).toBe("PERSONAL_OBSERVED");
    }
    expect(prismaMocks.poolUpsert).not.toHaveBeenCalled();
  });

  it("nao permite desabilitar evidencia observada nem procura em outra conta", async () => {
    prismaMocks.poolFindUnique.mockResolvedValue({
      ...row(61, "MID", "PERSONAL_OBSERVED")
    });

    const result = await disableUserProvidedPoolEntry(
      "account-2",
      61,
      "MID"
    );

    expect(result).toEqual({ status: "OBSERVED_ENTRY" });
    expect(prismaMocks.poolFindUnique).toHaveBeenCalledWith({
      where: {
        riotAccountId_championId_role: {
          riotAccountId: "account-2",
          championId: 61,
          role: "MID"
        }
      }
    });
    expect(prismaMocks.poolUpdate).not.toHaveBeenCalled();
  });
});
