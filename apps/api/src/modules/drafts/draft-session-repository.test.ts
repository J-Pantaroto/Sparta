import { beforeEach, describe, expect, it, vi } from "vitest";

const { snapshotFindFirstMock, releaseFindFirstMock, activePointerFindUniqueMock } = vi.hoisted(() => ({
  snapshotFindFirstMock: vi.fn(),
  releaseFindFirstMock: vi.fn(),
  activePointerFindUniqueMock: vi.fn()
}));

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    recommendationSnapshot: { findFirst: snapshotFindFirstMock },
    recommendationEngineRelease: { findFirst: releaseFindFirstMock },
    recommendationEngineActivePointer: { findUnique: activePointerFindUniqueMock }
  }
}));

import { findLatestSnapshot } from "./draft-session-repository.js";

function snapshotRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "snap-1",
    inputHash: "hash-1",
    dataCoverage: 0.8,
    algorithmVersionsJson: { recommendationEngine: "1.0.0" },
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    supersededAt: null,
    recommendations: [],
    configurationSource: null,
    configurationVersion: null,
    configHash: null,
    configurationReleaseId: null,
    ...overrides
  };
}

describe("findLatestSnapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve null quando não há snapshot", async () => {
    snapshotFindFirstMock.mockResolvedValue(null);
    const result = await findLatestSnapshot("account-1", "session-1");
    expect(result).toBeNull();
    expect(releaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("configuração BUILT_IN_BASELINE não tenta resolver release nenhuma", async () => {
    snapshotFindFirstMock.mockResolvedValue(
      snapshotRow({ configurationSource: "BUILT_IN_BASELINE", configHash: "abc123" })
    );
    const result = await findLatestSnapshot("account-1", "session-1");
    expect(result?.configurationSource).toBe("BUILT_IN_BASELINE");
    expect(result?.configHash).toBe("abc123");
    expect(result?.release).toBeNull();
    expect(releaseFindFirstMock).not.toHaveBeenCalled();
  });

  it("resolve a release referenciada e marca currentlyActive quando o ponteiro aponta pra ela", async () => {
    snapshotFindFirstMock.mockResolvedValue(
      snapshotRow({
        configurationSource: "RELEASE",
        configurationVersion: "1.0.0",
        configHash: "cfg-hash",
        configurationReleaseId: "release-1"
      })
    );
    releaseFindFirstMock.mockResolvedValue({
      id: "release-1",
      releaseVersion: "release-etapa27c-v1",
      artifactHash: "artifact-hash",
      status: "ACTIVE"
    });
    activePointerFindUniqueMock.mockResolvedValue({ releaseId: "release-1" });

    const result = await findLatestSnapshot("account-1", "session-1");

    expect(result?.release).toEqual({
      id: "release-1",
      releaseVersion: "release-etapa27c-v1",
      artifactHash: "artifact-hash",
      status: "ACTIVE",
      currentlyActive: true
    });
    expect(releaseFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "release-1", riotAccountId: "account-1" } })
    );
  });

  it("release referenciada porém revertida (ponteiro aponta pra outra) não fica currentlyActive", async () => {
    snapshotFindFirstMock.mockResolvedValue(
      snapshotRow({ configurationSource: "RELEASE", configurationReleaseId: "release-old" })
    );
    releaseFindFirstMock.mockResolvedValue({
      id: "release-old",
      releaseVersion: "release-etapa27b-v2",
      artifactHash: "old-hash",
      status: "ROLLED_BACK"
    });
    activePointerFindUniqueMock.mockResolvedValue({ releaseId: "release-1" });

    const result = await findLatestSnapshot("account-1", "session-1");

    expect(result?.release?.currentlyActive).toBe(false);
  });

  it("release referenciada mas não encontrada (removida) fica null, sem quebrar o snapshot", async () => {
    snapshotFindFirstMock.mockResolvedValue(
      snapshotRow({ configurationSource: "RELEASE", configurationReleaseId: "release-deleted" })
    );
    releaseFindFirstMock.mockResolvedValue(null);
    activePointerFindUniqueMock.mockResolvedValue(null);

    const result = await findLatestSnapshot("account-1", "session-1");

    expect(result?.release).toBeNull();
  });
});
