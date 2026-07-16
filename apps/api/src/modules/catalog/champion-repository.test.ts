import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));

vi.mock("../../db/prisma", () => ({
  prisma: { champion: { upsert: upsertMock } }
}));

vi.mock("@sparta/riot", () => ({
  fetchDataDragonVersions: vi.fn().mockResolvedValue(["14.14.1"]),
  fetchDataDragonChampions: vi.fn().mockResolvedValue([
    { key: "61", id: "Orianna", name: "Orianna", title: "a Donzela Mecânica", tags: ["Mage"] },
    { key: "103", id: "Ahri", name: "Ahri", title: "a Raposa de Nove Caudas", tags: ["Mage", "Assassin"] },
    { key: "266", id: "Aatrox", name: "Aatrox", title: "a Espada das Trevas", tags: ["Fighter"] }
  ])
}));

vi.mock("../../db/api-cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined)
}));

import { syncChampionCatalog } from "./champion-repository";

describe("champion-repository", () => {
  beforeEach(() => {
    upsertMock.mockClear();
  });

  it("mapeia key (id numerico) e id (slug) do Data Dragon para id/key do Sparta", async () => {
    const result = await syncChampionCatalog();

    expect(result).toEqual({ version: "14.14.1", count: 3 });
    expect(upsertMock).toHaveBeenCalledTimes(3);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 61 },
        create: expect.objectContaining({ id: 61, key: "Orianna", name: "Orianna", roles: [] })
      })
    );
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 266 },
        create: expect.objectContaining({ id: 266, key: "Aatrox", name: "Aatrox" })
      })
    );
  });
});
