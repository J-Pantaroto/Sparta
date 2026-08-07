import { describe, expect, it } from "vitest";
import type { ProfileRecentMatch } from "@sparta/core";
import { groupMatchesByPeriod } from "./match-history-grouping";

function match(id: string, observedAt: string | null): ProfileRecentMatch {
  return {
    matchId: id,
    championId: 61,
    championName: "Orianna",
    role: "MID",
    won: true,
    kills: 1,
    deaths: 1,
    assists: 1,
    csPerMinute: 5,
    damagePerMinute: 400,
    visionScorePerMinute: 1,
    killParticipation: null,
    objectiveParticipation: null,
    objectiveTakedowns: null,
    teamObjectiveKills: null,
    durationSeconds: 1800,
    queueId: 420,
    queueLabel: "Ranqueada Solo/Duo",
    patch: "26.15",
    observedAt,
    items: [],
    runes: [],
    spells: [],
    timelineAvailable: false,
    postGameAvailable: false,
    draftComparisonAvailable: false,
    positionStatus: null
  };
}

// 2026-08-10T12:00:00Z como "agora" fixo pra todo o teste.
const NOW = new Date("2026-08-10T12:00:00.000Z");

describe("groupMatchesByPeriod", () => {
  it("separa hoje, ontem, esta semana e mais antigas sem misturar", () => {
    const groups = groupMatchesByPeriod(
      [
        match("today", "2026-08-10T08:00:00.000Z"),
        match("yesterday", "2026-08-09T08:00:00.000Z"),
        match("this-week", "2026-08-05T08:00:00.000Z"),
        match("earlier", "2026-07-01T08:00:00.000Z")
      ],
      NOW
    );

    expect(groups.map((group) => group.key)).toEqual(["today", "yesterday", "this-week", "earlier"]);
    expect(groups.find((group) => group.key === "today")?.matches[0].matchId).toBe("today");
    expect(groups.find((group) => group.key === "earlier")?.matches[0].matchId).toBe("earlier");
  });

  it("partida sem data cai num grupo próprio, nunca em 'Hoje'", () => {
    const groups = groupMatchesByPeriod([match("undated", null)], NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("undated");
    expect(groups[0].label).toBe("Sem data registrada");
  });

  it("omite grupos vazios", () => {
    const groups = groupMatchesByPeriod([match("today", "2026-08-10T08:00:00.000Z")], NOW);
    expect(groups).toEqual([{ key: "today", label: "Hoje", matches: [expect.anything()] }]);
  });

  it("lista vazia devolve nenhum grupo", () => {
    expect(groupMatchesByPeriod([], NOW)).toEqual([]);
  });
});
