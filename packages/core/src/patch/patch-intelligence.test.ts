import { describe, expect, it } from "vitest";
import {
  summarizePatchRelease,
  type PatchChange,
  type PatchRelease
} from "./patch-intelligence.js";

const provenance = { sourceType: "OFFICIAL" as const, sourceId: "riot-patch-notes" };

function change(
  entityType: PatchChange["entityType"],
  entityName: string,
  changeType: PatchChange["changeType"]
): PatchChange {
  return {
    id: `${entityName}-${changeType}`,
    entityType,
    entityName,
    entityResolution: { status: "UNRESOLVED" },
    changeType,
    officialSummary: "",
    officialDetails: [],
    structuredChanges: [],
    status: "AVAILABLE",
    provenance
  };
}

describe("resumo factual de patch", () => {
  it("conta classificações e entidades sem criar score ou força neutra", () => {
    const release: PatchRelease = {
      patch: "26.14",
      title: "Patch 26.14",
      locale: "pt_BR",
      publishedAt: null,
      collectedAt: "2026-07-28T18:00:00.000Z",
      sourceUrl: "https://www.leagueoflegends.com/pt-br/news/game-updates/x-notes/",
      sourceHash: "hash",
      parserVersion: "parser/1",
      revision: 1,
      status: "AVAILABLE",
      changes: [
        change("CHAMPION", "Orianna", "BUFF"),
        change("ITEM", "Item A", "NERF"),
        change("ITEM", "Item A", "NERF"),
        change("RUNE", "Runa A", "ADJUSTMENT"),
        change("OTHER", "Correções", "BUGFIX")
      ],
      provenance
    };
    const summary = summarizePatchRelease(release);
    expect(summary.counts).toEqual({
      buffs: 1,
      nerfs: 2,
      adjustments: 1,
      bugfixes: 1,
      changedItems: 1,
      changedRunes: 1
    });
    expect(JSON.stringify(summary)).not.toMatch(/META_STRENGTH|score|ranking|strength/i);
  });
});
