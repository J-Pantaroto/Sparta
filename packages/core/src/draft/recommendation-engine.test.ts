import { availableCoverage } from "../types/stat-coverage.js";
import { describe, expect, it } from "vitest";
import { analyzeTeamComposition, normalizeAvailableWeights, recommendPicks, selectWeights } from "./recommendation-engine.js";
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
    coverage: { killParticipation: availableCoverage(10), objectiveParticipation: availableCoverage(10) },
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

  it("normaliza apenas os pesos de métricas disponíveis e conserva a cobertura original", () => {
    const weights = selectWeights({
      playerRole: "MID",
      pickOrder: 3,
      enemyLaneChampionId: 157,
      allies: [],
      enemies: [],
      bannedChampionIds: []
    });
    const { normalizedWeights, dataCoverage } = normalizeAvailableWeights(weights, {
      personalPerformance: true,
      recentForm: true,
      matchup: false,
      blindSafety: true,
      allySynergy: true,
      enemyDraftAnswer: true,
      compositionFit: true,
      meta: false
    });

    expect(dataCoverage).toBeCloseTo(0.7, 5);
    expect(Object.values(normalizedWeights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 5);
    expect(normalizedWeights.matchup).toBe(0);
    expect(normalizedWeights.meta).toBe(0);
    expect(normalizedWeights.blindSafety).toBe(0); // tinha peso zero no cenário original
  });

  it("calcula cobertura por candidato sem tirar a escala 0-100 do score", () => {
    const recommendations = recommendPicks({
      draft: {
        playerRole: "MID",
        pickOrder: 3,
        enemyLaneChampionId: 157,
        allies: [],
        enemies: [],
        bannedChampionIds: []
      },
      player,
      championStats: [
        championStats[0],
        { ...championStats[0], championId: 99, championName: "Outro campeão" }
      ],
      championTags: tags,
      matchups: [
        { championId: 61, enemyChampionId: 157, role: "MID", score: 50, sampleSize: 8, confidence: "medium" }
      ],
      compositionRules: {
        minimumFrontline: 35,
        minimumEngage: 35,
        minimumWaveclear: 35,
        preferDamageBalance: true
      },
      patchMeta: null
    });

    const withMatchup = recommendations.find((recommendation) => recommendation.championId === 61)!;
    const withoutMatchup = recommendations.find((recommendation) => recommendation.championId === 99)!;
    expect(withMatchup.dataCoverage).toBeCloseTo(0.95, 5);
    expect(withoutMatchup.dataCoverage).toBeCloseTo(0.7, 5);
    expect(withMatchup.totalScore).toBeGreaterThanOrEqual(0);
    expect(withMatchup.totalScore).toBeLessThanOrEqual(100);
    expect(withMatchup.metricDetails.find((metric) => metric.key === "PERSONAL_MATCHUP")?.value).toBe(50);
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
    coverage: { killParticipation: availableCoverage(10), objectiveParticipation: availableCoverage(10) },
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

describe("motor de recomendacao - proveniencia nao muda resultado (Etapa 8)", () => {
  const profile: PlayerProfile = {
    id: "player-1",
    account: { puuid: "p", gameName: "Zekerus", tagLine: "117", platformRegion: "br1", regionalRouting: "americas" },
    preferredRoles: ["MID"],
    championStats,
    strengths: [],
    weaknesses: [],
    recentForm: { last10Score: 60, last20Score: 58, last50Score: 55, trend: "stable", confidence: "medium" }
  };

  const draft: DraftState = {
    playerRole: "MID",
    pickOrder: 3,
    allies: [],
    enemies: [],
    bannedChampionIds: []
  };

  const compositionRules = {
    minimumFrontline: 40,
    minimumEngage: 40,
    minimumWaveclear: 40,
    preferDamageBalance: true
  };

  function recommend(championTags: ChampionTag[]) {
    return recommendPicks({
      draft,
      player: profile,
      championStats,
      championTags,
      matchups: [],
      compositionRules,
      patchMeta: null,
      limit: 5
    });
  }

  const provenance = {
    source: {
      sourceType: "DERIVED" as const,
      sourceId: "data-dragon",
      resource: "champion.json",
      patch: "16.14.1",
      locale: "pt_BR",
      algorithmVersion: "champion-tag-derivation/1.0.0",
      status: "AVAILABLE" as const
    },
    reviewState: "PARTIALLY_REVIEWED" as const,
    reviewedDimensions: ["pickoff" as const]
  };

  it("scores e ordenacao sao identicos com e sem proveniencia anexada", () => {
    const semProveniencia = recommend(tags);
    const comProveniencia = recommend(tags.map((tag) => ({ ...tag, provenance })));

    expect(comProveniencia).toEqual(semProveniencia);
  });

  it("estado de revisao nao entra em nenhuma metrica", () => {
    const revisado = recommend(tags.map((tag) => ({ ...tag, provenance })));
    const naoRevisado = recommend(
      tags.map((tag) => ({ ...tag, provenance: { ...provenance, reviewState: "UNREVIEWED" as const, reviewedDimensions: [] } }))
    );

    expect(revisado[0].metrics).toEqual(naoRevisado[0].metrics);
    expect(revisado[0].totalScore).toBe(naoRevisado[0].totalScore);
  });

  it("versao desatualizada da fonte nao altera o score", () => {
    const atual = recommend(tags.map((tag) => ({ ...tag, provenance })));
    const antiga = recommend(
      tags.map((tag) => ({
        ...tag,
        provenance: { ...provenance, source: { ...provenance.source, patch: "15.1.1" } }
      }))
    );

    expect(antiga[0].totalScore).toBe(atual[0].totalScore);
  });
});
