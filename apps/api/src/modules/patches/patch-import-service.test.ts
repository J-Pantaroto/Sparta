import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatchRelease } from "@sparta/core";

const mocks = vi.hoisted(() => {
  class IncompatibleError extends Error {
    readonly code = "PATCH_PARSER_INCOMPATIBLE";
  }
  class ExternalError extends Error {
    readonly code = "NETWORK_UNAVAILABLE";
  }
  return {
    collect: vi.fn(),
    parse: vi.fn(),
    officialUrl: vi.fn(),
    readCache: vi.fn(),
    setCached: vi.fn(),
    resolve: vi.fn(),
    findHashState: vi.fn(),
    persist: vi.fn(),
    recordFailure: vi.fn(),
    IncompatibleError,
    ExternalError
  };
});

vi.mock("@sparta/riot", () => ({
  collectOfficialPatchNotesPage: mocks.collect,
  parseOfficialPatchNotes: mocks.parse,
  officialPatchNotesUrl: mocks.officialUrl,
  IncompatiblePatchNotesError: mocks.IncompatibleError,
  ExternalServiceError: mocks.ExternalError
}));
vi.mock("../../db/api-cache.js", () => ({
  readCache: mocks.readCache,
  setCached: mocks.setCached
}));
vi.mock("./patch-repository.js", () => ({
  resolvePatchCatalogAssociations: mocks.resolve,
  findPatchHashState: mocks.findHashState,
  persistPatchRelease: mocks.persist,
  recordPatchImportFailure: mocks.recordFailure
}));

import { importOfficialPatchNotes } from "./patch-import-service.js";

const sourceUrl =
  "https://www.leagueoflegends.com/pt-br/news/game-updates/league-of-legends-patch-26-14-notes/";
const page = {
  html: "<html>official</html>",
  sourceUrl,
  collectedAt: "2026-07-28T18:00:00.000Z"
};
const release: PatchRelease = {
  patch: "26.14",
  title: "Patch 26.14",
  locale: "pt_BR",
  publishedAt: "2026-07-14T18:00:00.000Z",
  collectedAt: page.collectedAt,
  sourceUrl,
  sourceHash: "hash-v1",
  parserVersion: "parser/1",
  revision: 0,
  status: "AVAILABLE",
  changes: [],
  provenance: { sourceType: "OFFICIAL", sourceId: "riot-patch-notes" }
};

describe("importação resiliente de patch notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.officialUrl.mockReturnValue(sourceUrl);
    mocks.readCache.mockResolvedValue({
      value: null,
      metadata: { state: "MISS", servedAsFallback: false }
    });
    mocks.collect.mockResolvedValue(page);
    mocks.parse.mockReturnValue(release);
    mocks.resolve.mockResolvedValue({
      release,
      resolvedEntities: 0,
      unresolvedEntities: 0
    });
    mocks.findHashState.mockResolvedValue("NEW");
    mocks.persist.mockResolvedValue({ content: "NEW", revision: 1, releaseId: "release-1" });
  });

  it("erro de rede registra falha estruturada e nunca persiste release vazio", async () => {
    mocks.collect.mockRejectedValue(new Error("offline"));

    await expect(
      importOfficialPatchNotes({ patch: "26.14", locale: "pt_BR", persist: true })
    ).rejects.toMatchObject({ code: "PATCH_PAGE_UNAVAILABLE" });

    expect(mocks.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PAGE_UNAVAILABLE" })
    );
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("parser incompatível preserva a última revisão porque não chama persistência", async () => {
    mocks.parse.mockImplementation(() => {
      throw new mocks.IncompatibleError("markup changed");
    });

    await expect(
      importOfficialPatchNotes({ patch: "26.14", locale: "pt_BR", persist: true })
    ).rejects.toMatchObject({ code: "PATCH_PARSER_INCOMPATIBLE" });

    expect(mocks.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PARSER_INCOMPATIBLE" })
    );
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("serve apenas o cache stale válido como fallback explicitamente identificado", async () => {
    mocks.readCache.mockResolvedValue({
      value: page,
      metadata: {
        state: "STALE",
        collectedAt: page.collectedAt,
        servedAsFallback: false
      }
    });
    mocks.collect.mockRejectedValue(new Error("offline"));
    mocks.findHashState.mockResolvedValue("UNCHANGED");
    mocks.persist.mockResolvedValue({
      content: "UNCHANGED",
      revision: 1,
      releaseId: "release-1"
    });

    const report = await importOfficialPatchNotes({
      patch: "26.14",
      locale: "pt_BR",
      persist: true
    });

    expect(report).toMatchObject({
      releaseStatus: "STALE",
      staleFallback: true,
      cacheState: "STALE",
      content: "UNCHANGED"
    });
    expect(mocks.persist).toHaveBeenCalledWith(
      expect.objectContaining({ status: "STALE", changes: [] }),
      "STALE_FALLBACK",
      "STALE"
    );
    expect(mocks.setCached).not.toHaveBeenCalled();
  });

  it("check valida sem criar revisão, tentativa ou cache operacional", async () => {
    const report = await importOfficialPatchNotes({
      patch: "26.14",
      locale: "pt_BR",
      persist: false
    });
    expect(report.content).toBe("NEW");
    expect(report.revision).toBeNull();
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.recordFailure).not.toHaveBeenCalled();
    expect(mocks.setCached).not.toHaveBeenCalled();
  });
});
