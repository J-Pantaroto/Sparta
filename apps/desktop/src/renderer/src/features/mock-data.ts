import type { ChampionTag, CompositionRules, PlayerChampionStats, PlayerProfile } from "@sparta/core";

export const championStats: PlayerChampionStats[] = [
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
  },
  {
    championId: 103,
    championName: "Ahri",
    role: "MID",
    games: 12,
    wins: 7,
    kills: 68,
    deaths: 38,
    assists: 86,
    csPerMinute: 7.1,
    goldPerMinute: 405,
    damagePerMinute: 690,
    visionScorePerMinute: 0.82,
    killParticipation: 0.58,
    objectiveParticipation: 0.36,
    recentMatches: []
  }
];

export const championTags: ChampionTag[] = [
  {
    championId: 61,
    championName: "Orianna",
    roles: ["MID"],
    damageProfile: "AP",
    tags: ["control_mage", "teamfight", "scaling", "waveclear"],
    blindSafety: 0.82,
    difficulty: 0.7,
    engage: 0.4,
    peel: 0.6,
    frontline: 0.1,
    pickoff: 0.5,
    waveclear: 0.9,
    scaling: 0.85,
    earlyPressure: 0.45
  },
  {
    championId: 103,
    championName: "Ahri",
    roles: ["MID"],
    damageProfile: "AP",
    tags: ["pickoff", "mobility", "midgame"],
    blindSafety: 0.74,
    difficulty: 0.55,
    engage: 0.45,
    peel: 0.35,
    frontline: 0.05,
    pickoff: 0.85,
    waveclear: 0.72,
    scaling: 0.62,
    earlyPressure: 0.6
  }
];

export const compositionRules: CompositionRules = {
  minimumFrontline: 35,
  minimumEngage: 35,
  minimumWaveclear: 35,
  preferDamageBalance: true
};

export const playerProfile: PlayerProfile = {
  id: "local-dev",
  account: {
    puuid: "mock-puuid",
    gameName: "Sparta",
    tagLine: "BR1",
    platformRegion: "br1",
    regionalRouting: "americas"
  },
  preferredRoles: ["MID"],
  championStats,
  strengths: [],
  weaknesses: [],
  recentForm: { last10Score: 66, last20Score: 63, last50Score: 61, trend: "stable" }
};
