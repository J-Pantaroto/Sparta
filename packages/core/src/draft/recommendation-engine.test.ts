import { describe, expect, it } from "vitest";
import { analyzeTeamComposition, recommendPicks } from "./recommendation-engine.js";
import type { ChampionTag, PlayerChampionStats, PlayerProfile } from "../types/domain.js";

const championStats: PlayerChampionStats[] = [
  {
    championId: 61,
    championName: "Orianna",
    role: "MID",
    games: 8,
    wins: 5,
    kills: 50,
    deaths: 20,
    assists: 70,
    csPerMinute: 7.8,
    goldPerMinute: 420,
    damagePerMinute: 760,
    visionScorePerMinute: 0.9,
    killParticipation: 0.62,
    objectiveParticipation: 0.4,
    recentMatches: []
  }
];

const tags: ChampionTag[] = [
  {
    championId: 61,
    championName: "Orianna",
    roles: ["MID"],
    damageProfile: "AP",
    tags: ["control_mage", "teamfight", "waveclear"],
    blindSafety: 0.82,
    difficulty: 0.7,
    engage: 0.4,
    peel: 0.6,
    frontline: 0.1,
    pickoff: 0.5,
    waveclear: 0.9,
    scaling: 0.85,
    earlyPressure: 0.45
  }
];

const player: PlayerProfile = {
  id: "p1",
  account: {
    puuid: "puuid",
    gameName: "Sparta",
    tagLine: "BR1",
    platformRegion: "br1",
    regionalRouting: "americas"
  },
  preferredRoles: ["MID"],
  championStats,
  strengths: [],
  weaknesses: [],
  recentForm: { last10Score: 65, last20Score: 62, last50Score: 60, trend: "stable" }
};

describe("recommendation engine", () => {
  it("returns explainable recommendations for manual champion select", () => {
    const recommendations = recommendPicks({
      draft: { playerRole: "MID", pickOrder: 1, allies: [], enemies: [], bannedChampionIds: [] },
      player,
      championStats,
      championTags: tags,
      matchups: [],
      compositionRules: {
        minimumFrontline: 35,
        minimumEngage: 35,
        minimumWaveclear: 35,
        preferDamageBalance: true
      },
      patchMeta: null
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].championName).toBe("Orianna");
    expect(recommendations[0].reasons.length).toBeGreaterThan(0);
  });

  it("detects composition risks", () => {
    const composition = analyzeTeamComposition(
      { playerRole: "MID", pickOrder: 5, allies: [], enemies: [], bannedChampionIds: [] },
      tags,
      tags[0]
    );
    expect(composition.risks).toContain("Pouca linha de frente");
  });
});
