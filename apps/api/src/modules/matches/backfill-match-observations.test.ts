import { beforeEach, describe, expect, it, vi } from "vitest";

const { matchFindManyMock, persistMock } = vi.hoisted(() => ({
  matchFindManyMock: vi.fn(),
  persistMock: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: { match: { findMany: matchFindManyMock } }
}));

vi.mock("./match-observation-repository.js", () => ({
  persistMatchObservations: persistMock
}));

import { backfillMatchObservations } from "./backfill-match-observations.js";

const raw = {
  metadata: { matchId: "BR1_1", participants: ["private"] },
  info: { participants: [] }
};

describe("backfillMatchObservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continua quando rawJson está ausente e não chama nenhum serviço externo", async () => {
    matchFindManyMock.mockResolvedValue([
      { id: "db-1", platform: "BR1", rawJson: null },
      { id: "db-2", platform: "BR1", rawJson: raw }
    ]);
    persistMock.mockResolvedValue({ extracted: 0, updated: 0, unavailable: 0 });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const summary = await backfillMatchObservations();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      matchesProcessed: 2,
      matchesUpdated: 0,
      matchesUnavailable: 2,
      matchesWithErrors: 0
    });
    fetchSpy.mockRestore();
  });

  it("é idempotente quando a versão atual já foi persistida", async () => {
    matchFindManyMock.mockResolvedValue([{ id: "db-1", platform: "BR1", rawJson: raw }]);
    persistMock
      .mockResolvedValueOnce({ extracted: 2, updated: 2, unavailable: 0 })
      .mockResolvedValueOnce({ extracted: 2, updated: 0, unavailable: 0 });

    const first = await backfillMatchObservations();
    const second = await backfillMatchObservations();

    expect(first).toMatchObject({ matchesUpdated: 1, participantsUpdated: 2 });
    expect(second).toMatchObject({ matchesUpdated: 0, participantsUpdated: 0 });
  });

  it("relata erro sem expor identificadores ou payload", async () => {
    matchFindManyMock.mockResolvedValue([{ id: "sensitive-db-id", platform: "BR1", rawJson: raw }]);
    persistMock.mockRejectedValue(new Error("payload private failed"));

    const summary = await backfillMatchObservations();

    expect(summary.matchesWithErrors).toBe(1);
    expect(summary.errors).toEqual([{ reason: "MATCH_OBSERVATION_EXTRACTION_FAILED" }]);
    expect(JSON.stringify(summary)).not.toContain("sensitive-db-id");
    expect(JSON.stringify(summary)).not.toContain("private");
  });
});
