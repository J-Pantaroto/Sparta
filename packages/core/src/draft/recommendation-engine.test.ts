import { describe, expect, it } from "vitest";
import { analyzeTeamComposition, recommendPicks, selectWeights } from "./recommendation-engine.js";
import type { ChampionTag, DraftState, PlayerChampionStats, PlayerProfile } from "../types/domain.js";

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
  recentForm: { last10Score: 65, last20Score: 62, last50Score: 60, trend: "stable", confidence: "medium" }
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
    // Precisa de pelo menos um aliado: risco de composicao e afirmacao
    // sobre o TIME, e sem ninguem escolhido a analise descreveria so o
    // proprio candidato (ver "guardas de time vazio" abaixo).
    const composition = analyzeTeamComposition(
      {
        playerRole: "MID",
        pickOrder: 5,
        allies: [{ championId: 103, championName: "Ahri", role: "MID", team: "ally" }],
        enemies: [],
        bannedChampionIds: []
      },
      tags,
      tags[0]
    );
    expect(composition.risks).toContain("Pouca linha de frente");
  });

  it("has each selectWeights scenario table summing to 1.0 (invariante estrutural)", () => {
    const baseDraft: DraftState = { playerRole: "MID", pickOrder: 1, allies: [], enemies: [], bannedChampionIds: [] };

    const scenarios: DraftState[] = [
      { ...baseDraft, pickOrder: 1 },
      { ...baseDraft, pickOrder: 3, enemyLaneChampionId: 61 },
      { ...baseDraft, pickOrder: 5 }
    ];

    for (const scenario of scenarios) {
      const total = Object.values(selectWeights(scenario)).reduce((sum, weight) => sum + weight, 0);
      expect(total).toBeCloseTo(1.0, 5);
    }
  });
});

describe("guardas de time vazio", () => {
  const tagBase: ChampionTag = {
    championId: 10,
    championName: "Candidato",
    roles: ["MID"],
    damageProfile: "AP",
    tags: [],
    blindSafety: 0.7,
    difficulty: 0.5,
    engage: 0.6,
    peel: 0.3,
    frontline: 0.2,
    pickoff: 0.8,
    waveclear: 0.5,
    scaling: 0.6,
    earlyPressure: 0.7
  };

  const draftSemAliados: DraftState = {
    playerRole: "MID",
    pickOrder: 1,
    allies: [],
    enemies: [],
    bannedChampionIds: []
  };

  const statsElegiveis: PlayerChampionStats = {
    championId: 10,
    championName: "Candidato",
    role: "MID",
    games: 10,
    wins: 6,
    kills: 60,
    deaths: 30,
    assists: 70,
    csPerMinute: 7,
    goldPerMinute: 420,
    damagePerMinute: 700,
    visionScorePerMinute: 0.8,
    killParticipation: 0.55,
    objectiveParticipation: 0.4,
    recentMatches: []
  };

  it("mantem allySynergy neutro quando nenhum aliado foi escolhido", () => {
    // Sem a guarda, a formula degenera em 100*(e²+p²+w²)/3, que nunca passa
    // de 33 - todo first pick levaria uma penalidade sem significado.
    const [recomendacao] = recommendPicks({
      draft: draftSemAliados,
      player: { preferredRoles: ["MID"] } as never,
      championStats: [statsElegiveis],
      championTags: [tagBase],
      matchups: [],
      compositionRules: {
        minimumFrontline: 40,
        minimumEngage: 40,
        minimumWaveclear: 40,
        preferDamageBalance: true
      },
      patchMeta: null
    });

    expect(recomendacao.metrics.allySynergy).toBe(50);
  });

  it("nao emite risco de composicao sem aliados, mas emite com aliados", () => {
    const semAliados = analyzeTeamComposition(draftSemAliados, [tagBase], tagBase);
    expect(semAliados.risks).toEqual([]);
    expect(semAliados.strengths).toEqual([]);

    const comAliado = analyzeTeamComposition(
      {
        ...draftSemAliados,
        allies: [{ championId: 10, championName: "Candidato", role: "TOP", team: "ally" }]
      },
      [tagBase],
      tagBase
    );
    expect(comAliado.risks.length).toBeGreaterThan(0);
  });
});
