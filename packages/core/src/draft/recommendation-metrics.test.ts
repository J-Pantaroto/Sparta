import { availableCoverage } from "../types/stat-coverage.js";
import { describe, expect, it } from "vitest";
import { recommendPicks } from "./recommendation-engine.js";
import {
  RECOMMENDATION_ENGINE_VERSION,
  ensureRecommendationMetrics,
  toRecommendationMetrics
} from "./recommendation-metrics.js";
import { unavailableMetric } from "../types/recommendation-metric.js";
import type { ChampionTag, DraftState, PlayerChampionStats, PlayerProfile } from "../types/domain.js";

const metricasNumericas = {
  personalPerformance: 52.2,
  recentForm: 63.7,
  matchup: 50,
  blindSafety: 43,
  allySynergy: 50,
  enemyDraftAnswer: 50,
  compositionFit: 65,
  meta: 50
};

describe("toRecommendationMetrics", () => {
  const metricas = toRecommendationMetrics(metricasNumericas, "low");

  it("preserva os valores calculados sem alterá-los", () => {
    const porChave = new Map(metricas.map((metric) => [metric.key, metric.value]));
    expect(porChave.get("PERSONAL_PERFORMANCE")).toBe(52.2);
    expect(porChave.get("RECENT_FORM")).toBe(63.7);
    expect(porChave.get("BLIND_SAFETY")).toBe(43);
    expect(porChave.get("TEAM_COMPOSITION")).toBe(65);
  });

  it("declara proveniência só onde há uma fonte real", () => {
    const porChave = new Map(metricas.map((metric) => [metric.key, metric]));
    expect(porChave.get("PERSONAL_PERFORMANCE")!.provenance?.sourceType).toBe("CALCULATED");
    expect(porChave.get("BLIND_SAFETY")!.provenance?.sourceType).toBe("DERIVED");
    expect(porChave.get("BLIND_SAFETY")!.provenance?.algorithmVersion).toBe(RECOMMENDATION_ENGINE_VERSION);
    // Meta e matchup global não têm fonte nesta etapa. Matchup pessoal sem
    // amostra também não pode inventar uma origem.
    expect(porChave.get("META_STRENGTH")!.provenance).toBeUndefined();
    expect(porChave.get("PERSONAL_MATCHUP")!.provenance).toBeUndefined();
    expect(porChave.get("GLOBAL_MATCHUP")!.provenance).toBeUndefined();
  });

  it("só atribui confiança às métricas que dependem do histórico do jogador", () => {
    const porChave = new Map(metricas.map((metric) => [metric.key, metric]));
    expect(porChave.get("PERSONAL_PERFORMANCE")!.confidence).not.toBeNull();
    expect(porChave.get("BLIND_SAFETY")!.confidence).toBeNull();
  });

  it("não transforma meta e matchup sem fonte em 50 disponível", () => {
    const composicao = metricas.find((metric) => metric.key === "TEAM_COMPOSITION")!;
    const meta = metricas.find((metric) => metric.key === "META_STRENGTH")!;
    const matchup = metricas.find((metric) => metric.key === "PERSONAL_MATCHUP")!;
    const global = metricas.find((metric) => metric.key === "GLOBAL_MATCHUP")!;
    expect(meta.value).toBeNull();
    expect(meta.status).toBe("UNAVAILABLE");
    expect(matchup.value).toBeNull();
    expect(matchup.status).toBe("UNAVAILABLE");
    expect(global.value).toBeNull();
    expect(global.status).toBe("UNAVAILABLE");
    expect(composicao.status).toBe("AVAILABLE");
  });

  it("mantém disponível o 50 que foi realmente calculado do histórico pessoal", () => {
    const metricasComAmostra = toRecommendationMetrics(metricasNumericas, "low", {
      playerRole: "MID",
      enemyLaneKnown: true,
      personalMatchup: {
        championId: 10,
        enemyChampionId: 99,
        role: "MID",
        score: 50,
        sampleSize: 8,
        confidence: "medium"
      }
    });
    const matchup = metricasComAmostra.find((metric) => metric.key === "PERSONAL_MATCHUP")!;
    expect(matchup.value).toBe(50);
    expect(matchup.status).toBe("AVAILABLE");
    expect(matchup.confidence).not.toBeNull();
    expect(matchup.provenance?.sampleSize).toBe(8);
    expect(matchup.provenance?.sourceType).toBe("CALCULATED");
  });
});

describe("recommendPicks com o contrato novo", () => {
  const tag: ChampionTag = {
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

  function stats(championId: number, championName: string): PlayerChampionStats {
    return {
      championId,
      championName,
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
  }

  const draft: DraftState = {
    playerRole: "MID",
    pickOrder: 1,
    allies: [],
    enemies: [],
    bannedChampionIds: []
  };

  const recomendacoes = recommendPicks({
    draft,
    player: { preferredRoles: ["MID"] } as unknown as PlayerProfile,
    championStats: [stats(10, "Candidato"), stats(11, "Outro")],
    championTags: [tag],
    matchups: [],
    compositionRules: {
      minimumFrontline: 40,
      minimumEngage: 40,
      minimumWaveclear: 40,
      preferDamageBalance: true
    },
    patchMeta: null
  });

  it("entrega métricas estruturadas por candidato", () => {
    expect(recomendacoes.length).toBeGreaterThan(1);
    recomendacoes.forEach((recomendacao) => {
      expect(recomendacao.metricDetails.length).toBe(9);
      expect(new Set(recomendacao.metricDetails.map((metric) => metric.key)).size).toBe(9);
    });
  });

  it("mantém `metrics` numérico compatível com os consumidores atuais", () => {
    const [primeira] = recomendacoes;
    const estruturada = primeira.metricDetails.find((metric) => metric.key === "PERSONAL_PERFORMANCE")!;
    expect(estruturada.value).toBe(primeira.metrics.personalPerformance);
    expect(primeira.metrics.meta).toBeNull();
  });

  it("nunca produz métrica indisponível com número", () => {
    recomendacoes.forEach((recomendacao) => {
      recomendacao.metricDetails
        .filter((metric) => metric.status === "UNAVAILABLE")
        .forEach((metric) => expect(metric.value).toBeNull());
    });
  });
});

describe("ensureRecommendationMetrics", () => {
  const recomendacaoAntiga = {
    metrics: metricasNumericas,
    confidence: "low" as const
  };

  it("trata matchup e meta legados como indisponíveis quando o backend não envia metricDetails", () => {
    // Cenário medido na validação da Etapa 2: desktop novo contra API
    // anterior ao contrato. Sem isso a tela quebrava inteira.
    const metricas = ensureRecommendationMetrics(recomendacaoAntiga);
    expect(metricas).toHaveLength(9);
    expect(metricas.find((metric) => metric.key === "PERSONAL_PERFORMANCE")!.value).toBe(52.2);
    expect(metricas.find((metric) => metric.key === "PERSONAL_MATCHUP")!.value).toBeNull();
    expect(metricas.find((metric) => metric.key === "META_STRENGTH")!.value).toBeNull();
  });

  it("preserva as métricas já estruturadas quando elas vêm", () => {
    const jaEstruturada = {
      ...recomendacaoAntiga,
      metricDetails: [unavailableMetric("LANE_MATCHUP", "Sem fonte")]
    };
    const metricas = ensureRecommendationMetrics(jaEstruturada);
    expect(metricas).toHaveLength(1);
    expect(metricas[0].key).toBe("PERSONAL_MATCHUP");
    expect(metricas[0].value).toBeNull();
  });

  it("devolve lista vazia (não valores inventados) quando não há nada", () => {
    const semNada = { confidence: "low" as const } as unknown as Parameters<typeof ensureRecommendationMetrics>[0];
    expect(ensureRecommendationMetrics(semNada)).toEqual([]);
  });
});
