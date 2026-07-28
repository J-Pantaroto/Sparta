import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PatchChange, PatchRelease } from "@sparta/core";

const championFindMany = vi.hoisted(() => vi.fn());
vi.mock("../../db/prisma.js", () => ({
  prisma: { champion: { findMany: championFindMany } }
}));

import { resolvePatchCatalogAssociations } from "./patch-repository.js";

const provenance = { sourceType: "OFFICIAL" as const };
function change(entityType: PatchChange["entityType"], entityName: string): PatchChange {
  return {
    id: `${entityType}-${entityName}`,
    entityType,
    entityName,
    entityResolution: { status: "UNRESOLVED" },
    changeType: "UNCLASSIFIED",
    officialSummary: "Texto oficial.",
    officialDetails: ["Detalhe oficial."],
    structuredChanges: [],
    status: "AVAILABLE",
    provenance
  };
}

const release: PatchRelease = {
  patch: "26.14",
  title: "Patch 26.14",
  locale: "pt_BR",
  publishedAt: null,
  collectedAt: "2026-07-28T18:00:00.000Z",
  sourceUrl:
    "https://www.leagueoflegends.com/pt-br/news/game-updates/league-of-legends-patch-26-14-notes/",
  sourceHash: "canonical-source-hash",
  parserVersion: "parser/1",
  revision: 0,
  status: "AVAILABLE",
  changes: [
    change("CHAMPION", "Cho Gath"),
    change("CHAMPION", "Campeão Novo"),
    change("ITEM", "Item X")
  ],
  provenance
};

describe("associação segura ao catálogo", () => {
  beforeEach(() => {
    championFindMany.mockResolvedValue([{ id: 31, name: "Cho'Gath" }]);
  });

  it("usa somente normalização genérica exata e preserva nomes não resolvidos", async () => {
    const result = await resolvePatchCatalogAssociations(release);
    expect(result.release.changes[0]).toMatchObject({
      entityId: 31,
      entityName: "Cho Gath",
      entityResolution: { status: "RESOLVED" }
    });
    expect(result.release.changes[1]).toMatchObject({
      entityName: "Campeão Novo",
      entityResolution: {
        status: "UNRESOLVED",
        reason: expect.stringContaining("Nenhuma correspondência exata")
      }
    });
    expect(result.release.changes[2]).toMatchObject({
      entityName: "Item X",
      entityResolution: {
        status: "UNRESOLVED",
        reason: expect.stringContaining("catálogo local de itens")
      }
    });
    expect(result.release.sourceHash).toBe("canonical-source-hash");
    expect(result.release.status).toBe("PARTIAL");
    expect(result).toMatchObject({ resolvedEntities: 1, unresolvedEntities: 2 });
  });

  it("não escolhe silenciosamente quando a normalização é ambígua", async () => {
    championFindMany.mockResolvedValue([
      { id: 1, name: "A-B" },
      { id: 2, name: "A B" }
    ]);
    const ambiguous = { ...release, changes: [change("CHAMPION", "AB")] };
    const result = await resolvePatchCatalogAssociations(ambiguous);
    expect(result.release.changes[0]).toMatchObject({
      entityResolution: {
        status: "UNRESOLVED",
        reason: expect.stringContaining("Mais de uma")
      }
    });
    expect(result.release.changes[0]).not.toHaveProperty("entityId");
  });
});
