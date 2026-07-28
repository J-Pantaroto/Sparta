import { availableCoverage } from "../types/stat-coverage.js";
import { describe, expect, it } from "vitest";
import {
  analyzeTeamComposition,
  normalizeAvailableWeights,
  recommendFromPersonalPool,
  recommendPicks,
  selectWeights
} from "./recommendation-engine.js";
import type { ChampionTag, DraftState, PlayerChampionStats, PlayerProfile } from "../types/domain.js";
import type { PlayerChampionPoolCandidate } from "../types/player-champion-pool.js";
import { createChampionDifficultyEvidence } from "./execution-risk.js";

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

  it("ChampionTag.roles vazio não altera pool nem scores", () => {
    const input = {
      draft: {
        playerRole: "MID" as const,
        pickOrder: 1,
        allies: [],
        enemies: [],
        bannedChampionIds: []
      },
      player,
      championStats,
      matchups: [],
      compositionRules: {
        minimumFrontline: 35,
        minimumEngage: 35,
        minimumWaveclear: 35,
        preferDamageBalance: true
      },
      patchMeta: null
    };

    const withLegacyRole = recommendPicks({ ...input, championTags: tags });
    const withoutGlobalRole = recommendPicks({
      ...input,
      championTags: tags.map((tag) => ({ ...tag, roles: [] }))
    });

    expect(withoutGlobalRole).toEqual(withLegacyRole);
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

describe("pool pessoal e cinco recomendacoes (Etapa 12)", () => {
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

  function candidates(count: number): PlayerChampionPoolCandidate[] {
    return Array.from({ length: count }, (_, index) => ({
      championId: 100 + index,
      championName: `Campeao ${index + 1}`,
      role: "MID",
      source: "USER_PROVIDED",
      enabled: true
    }));
  }

  function tagsFor(pool: PlayerChampionPoolCandidate[]): ChampionTag[] {
    return pool.map((candidate, index) => ({
      ...tags[0],
      championId: candidate.championId,
      championName: candidate.championName,
      roles: [],
      blindSafety: 0.4 + index * 0.03
    }));
  }

  function recommend(
    pool: PlayerChampionPoolCandidate[],
    stats: PlayerChampionStats[] = [],
    draftOverride: DraftState = draft
  ) {
    return recommendFromPersonalPool({
      draft: draftOverride,
      candidates: pool,
      championStats: stats,
      championTags: tagsFor(pool),
      matchups: [],
      compositionRules,
      patchMeta: null
    });
  }

  it("separa exatamente cinco principais e ate tres alternativas, sem duplicatas", () => {
    const result = recommend(candidates(8));
    const ids = [
      ...result.primaryRecommendations,
      ...result.alternatives
    ].map((recommendation) => recommendation.championId);

    expect(result.primaryRecommendations).toHaveLength(5);
    expect(result.alternatives).toHaveLength(3);
    expect(new Set(ids).size).toBe(8);
    expect(result.poolSummary).toMatchObject({
      totalCandidates: 8,
      evaluatedCandidates: 8,
      primaryCount: 5,
      alternativeCount: 3,
      status: "AVAILABLE"
    });
  });

  it("nao preenche cinco vagas artificialmente quando o pool e menor", () => {
    const result = recommend(candidates(3));

    expect(result.primaryRecommendations).toHaveLength(3);
    expect(result.alternatives).toEqual([]);
    expect(result.poolSummary.status).toBe("PARTIAL");
    expect(result.poolSummary.shortageReason).toContain("mais 2");
  });

  it("mantem sinais pessoais ausentes para inclusao manual sem historico", () => {
    const [recommendation] = recommend(candidates(1)).primaryRecommendations;

    expect(recommendation.poolSource).toBe("USER_PROVIDED");
    expect(recommendation.personalGames).toBe(0);
    expect(recommendation.confidence).toBeUndefined();
    expect(recommendation.metrics.personalPerformance).toBeNull();
    expect(recommendation.metrics.recentForm).toBeNull();
    expect(recommendation.metrics.matchup).toBeNull();
    expect(recommendation.dataCoverage).toBeLessThan(1);
    expect(recommendation.metricDetails.filter((metric) => metric.status === "UNAVAILABLE"))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "PERSONAL_PERFORMANCE" }),
          expect.objectContaining({ key: "RECENT_FORM" }),
          expect.objectContaining({ key: "PERSONAL_MATCHUP" })
        ])
      );
    expect(recommendation.totalScore).toBeGreaterThanOrEqual(0);
  });

  it("nao usa 50 neutro quando o perfil estrategico tambem esta ausente", () => {
    const pool = candidates(1);
    const [recommendation] = recommendFromPersonalPool({
      draft,
      candidates: pool,
      championStats: [],
      championTags: [],
      matchups: [],
      compositionRules,
      patchMeta: null
    }).primaryRecommendations;

    expect(recommendation.metrics).toEqual({
      personalPerformance: null,
      recentForm: null,
      matchup: null,
      blindSafety: null,
      allySynergy: null,
      enemyDraftAnswer: null,
      compositionFit: null,
      meta: null
    });
    expect(recommendation.totalScore).toBe(0);
    expect(recommendation.dataCoverage).toBe(0);
    expect(recommendation.metricDetails.every((metric) => metric.value === null))
      .toBe(true);
  });

  it("nao promove uma unica partida observada a desempenho pessoal elegivel", () => {
    const pool: PlayerChampionPoolCandidate[] = [
      {
        championId: 61,
        championName: "Orianna",
        role: "MID",
        source: "PERSONAL_OBSERVED",
        enabled: true
      }
    ];
    const result = recommend(pool, [{ ...championStats[0], games: 1 }]);
    const [recommendation] = result.primaryRecommendations;

    expect(recommendation.poolSource).toBe("PERSONAL_OBSERVED");
    expect(recommendation.personalGames).toBe(1);
    expect(recommendation.metrics.personalPerformance).toBeNull();
    expect(recommendation.metrics.recentForm).toBeNull();
  });

  it("normaliza pesos e cobertura de cada candidato de forma independente", () => {
    const pool: PlayerChampionPoolCandidate[] = [
      {
        championId: 61,
        championName: "Orianna",
        role: "MID",
        source: "PERSONAL_OBSERVED",
        enabled: true
      },
      {
        championId: 103,
        championName: "Ahri",
        role: "MID",
        source: "USER_PROVIDED",
        enabled: true
      }
    ];
    const result = recommend(pool, championStats);
    const observed = result.primaryRecommendations.find(
      (recommendation) => recommendation.championId === 61
    )!;
    const manual = result.primaryRecommendations.find(
      (recommendation) => recommendation.championId === 103
    )!;

    expect(observed.metrics.personalPerformance).not.toBeNull();
    expect(manual.metrics.personalPerformance).toBeNull();
    expect(observed.dataCoverage).toBeGreaterThan(manual.dataCoverage);
    expect(
      observed.metricDetails.find(
        (metric) => metric.key === "PERSONAL_PERFORMANCE"
      )?.status
    ).toBe("AVAILABLE");
    expect(
      manual.metricDetails.find(
        (metric) => metric.key === "PERSONAL_PERFORMANCE"
      )?.status
    ).toBe("UNAVAILABLE");
  });

  it("preserva score e metricas do motor anterior para candidato observado elegivel", () => {
    const pool: PlayerChampionPoolCandidate[] = [
      {
        championId: 61,
        championName: "Orianna",
        role: "MID",
        source: "PERSONAL_OBSERVED",
        enabled: true
      }
    ];
    const common = {
      draft,
      championStats,
      championTags: tags,
      matchups: [],
      compositionRules,
      patchMeta: null
    };
    const legacy = recommendPicks({ ...common, player });
    const current = recommendFromPersonalPool({ ...common, candidates: pool });

    expect(current.primaryRecommendations[0].totalScore).toBe(legacy[0].totalScore);
    expect(current.primaryRecommendations[0].metrics).toEqual(legacy[0].metrics);
  });

  it("e invariavel a ordem de entrada e remove somente candidato indisponivel", () => {
    const pool = candidates(8);
    const forward = recommend(pool);
    const reverse = recommend([...pool].reverse());
    const withoutOne = recommend(pool.filter((candidate) => candidate.championId !== 103));
    const orderedIds = (result: ReturnType<typeof recommend>) =>
      [...result.primaryRecommendations, ...result.alternatives].map(
        (recommendation) => recommendation.championId
      );

    expect(orderedIds(reverse)).toEqual(orderedIds(forward));
    expect(orderedIds(withoutOne)).toEqual(
      orderedIds(forward).filter((championId) => championId !== 103)
    );
  });

  it("exclui banidos e campeoes ja escolhidos antes de montar as listas", () => {
    const pool = candidates(7);
    const result = recommend(pool, [], {
      ...draft,
      bannedChampionIds: [100],
      allies: [
        {
          championId: 101,
          championName: "Campeao 2",
          role: "TOP",
          team: "ally"
        }
      ]
    });
    const ids = [...result.primaryRecommendations, ...result.alternatives].map(
      (recommendation) => recommendation.championId
    );

    expect(ids).not.toContain(100);
    expect(ids).not.toContain(101);
    expect(result.poolSummary.totalCandidates).toBe(7);
    expect(result.poolSummary.evaluatedCandidates).toBe(5);
  });
});

describe("dificuldade e risco pessoal no ranking (Etapa 13)", () => {
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
  const baseTag: ChampionTag = {
    ...tags[0],
    roles: [],
    blindSafety: 0.7
  };
  const pool: PlayerChampionPoolCandidate[] = [
    {
      championId: 200,
      championName: "Difícil",
      role: "MID",
      source: "USER_PROVIDED",
      enabled: true
    },
    {
      championId: 201,
      championName: "Simples",
      role: "MID",
      source: "USER_PROVIDED",
      enabled: true
    }
  ];
  const riskTags: ChampionTag[] = [
    {
      ...baseTag,
      championId: 200,
      championName: "Difícil",
      officialDifficulty: createChampionDifficultyEvidence(10)
    },
    {
      ...baseTag,
      championId: 201,
      championName: "Simples",
      officialDifficulty: createChampionDifficultyEvidence(2)
    }
  ];

  function recommend(
    candidates = pool,
    stats: PlayerChampionStats[] = []
  ) {
    return recommendFromPersonalPool({
      draft,
      candidates,
      championStats: stats,
      championTags: riskTags,
      matchups: [],
      compositionRules,
      patchMeta: null,
      evaluatedAt: "2026-07-28T12:00:00.000Z"
    });
  }

  it("opções estrategicamente iguais são diferenciadas pelo risco limitado", () => {
    const result = recommend();
    const simple = result.primaryRecommendations.find(
      (entry) => entry.championId === 201
    )!;
    const difficult = result.primaryRecommendations.find(
      (entry) => entry.championId === 200
    )!;

    expect(simple.totalScore).toBeGreaterThan(difficult.totalScore);
    expect(
      simple.metricDetails.find(
        (metric) => metric.key === "CHAMPION_DIFFICULTY"
      )?.value
    ).toBe(20);
    expect(
      difficult.metricDetails.find(
        (metric) => metric.key === "EXECUTION_RISK"
      )?.value
    ).toBe(100);
    expect(difficult.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "execution_risk" })
      ])
    );
  });

  it("experiência reduz o risco sem alterar a dificuldade oficial", () => {
    const noHistory = recommend().primaryRecommendations.find(
      (entry) => entry.championId === 200
    )!;
    const experiencedStats: PlayerChampionStats = {
      ...championStats[0],
      championId: 200,
      championName: "Difícil",
      games: 20,
      recentMatches: [
        {
          matchId: "BR1_13",
          championId: 200,
          role: "MID",
          won: true,
          kills: 4,
          deaths: 2,
          assists: 8,
          csPerMinute: 7,
          goldPerMinute: 420,
          damagePerMinute: 700,
          visionScorePerMinute: 0.8,
          killParticipation: 0.55,
          objectiveParticipation: 0.4,
          observedAt: "2026-07-27T12:00:00.000Z"
        }
      ]
    };
    const experienced = recommend(pool, [experiencedStats])
      .primaryRecommendations.find((entry) => entry.championId === 200)!;

    const metric = (
      recommendation: typeof experienced,
      key: "CHAMPION_DIFFICULTY" | "EXECUTION_RISK"
    ) => recommendation.metricDetails.find((entry) => entry.key === key)?.value;
    expect(metric(experienced, "CHAMPION_DIFFICULTY")).toBe(
      metric(noHistory, "CHAMPION_DIFFICULTY")
    );
    expect(metric(experienced, "EXECUTION_RISK")).toBeLessThan(
      metric(noHistory, "EXECUTION_RISK")!
    );
  });

  it("ordem de entrada não altera score individual com risco disponível", () => {
    const forward = recommend(pool);
    const reverse = recommend([...pool].reverse());
    const scoreById = (result: ReturnType<typeof recommend>) =>
      Object.fromEntries(
        result.primaryRecommendations.map((entry) => [
          entry.championId,
          entry.totalScore
        ])
      );

    expect(scoreById(reverse)).toEqual(scoreById(forward));
  });

  it("principais e alternativas recebem o mesmo contrato de dificuldade e risco", () => {
    const candidates = Array.from({ length: 8 }, (_, index) => ({
      championId: 300 + index,
      championName: `Candidato ${index}`,
      role: "MID" as const,
      source: "USER_PROVIDED" as const,
      enabled: true
    }));
    const result = recommendFromPersonalPool({
      draft,
      candidates,
      championStats: [],
      championTags: candidates.map((candidate) => ({
        ...baseTag,
        championId: candidate.championId,
        championName: candidate.championName,
        officialDifficulty: createChampionDifficultyEvidence(5)
      })),
      matchups: [],
      compositionRules,
      patchMeta: null
    });

    for (const recommendation of [
      ...result.primaryRecommendations,
      ...result.alternatives
    ]) {
      expect(recommendation.metricDetails).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "CHAMPION_DIFFICULTY", value: 50 }),
          expect.objectContaining({ key: "EXECUTION_RISK", value: 50 })
        ])
      );
    }
  });
});
