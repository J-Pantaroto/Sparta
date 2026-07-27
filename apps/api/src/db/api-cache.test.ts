import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, upsertMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  upsertMock: vi.fn()
}));

vi.mock("./prisma.js", () => ({
  prisma: { apiCacheEntry: { findUnique: findUniqueMock, upsert: upsertMock } }
}));

import { getCached, readCache, setCached } from "./api-cache.js";

describe("api-cache", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    upsertMock.mockReset();
  });

  it("distingue MISS, FRESH, STALE e EXPIRED sem inventar collectedAt", async () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    findUniqueMock.mockResolvedValueOnce(null);
    expect((await readCache("x", 1_000, now)).metadata.state).toBe("MISS");

    findUniqueMock.mockResolvedValueOnce({
      valueJson: { ok: true },
      expiresAt: new Date("2026-07-27T12:00:01.000Z"),
      collectedAt: null
    });
    const fresh = await readCache("x", 1_000, now);
    expect(fresh.metadata).toMatchObject({ state: "FRESH", collectedAt: undefined, ageMs: undefined });

    findUniqueMock.mockResolvedValueOnce({
      valueJson: { ok: true },
      expiresAt: new Date("2026-07-27T11:59:59.500Z"),
      collectedAt: new Date("2026-07-27T11:00:00.000Z")
    });
    expect((await readCache("x", 1_000, now)).metadata.state).toBe("STALE");

    findUniqueMock.mockResolvedValueOnce({
      valueJson: { ok: true },
      expiresAt: new Date("2026-07-27T11:59:58.000Z"),
      collectedAt: null
    });
    const expired = await readCache("x", 1_000, now);
    expect(expired.metadata.state).toBe("EXPIRED");
    expect(expired.value).toBeNull();
  });

  it("o cache legado de autenticacao so aceita FRESH", async () => {
    findUniqueMock.mockResolvedValue({
      valueJson: { puuid: "real" },
      expiresAt: new Date(Date.now() - 1),
      collectedAt: new Date(Date.now() - 10_000)
    });
    await expect(getCached("riot-account:x")).resolves.toBeNull();
  });

  it("grava o instante real da coleta junto com a validade", async () => {
    await setCached("x", { ok: true }, 1_000);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ collectedAt: expect.any(Date), expiresAt: expect.any(Date) }),
        create: expect.objectContaining({ collectedAt: expect.any(Date), expiresAt: expect.any(Date) })
      })
    );
  });
});
