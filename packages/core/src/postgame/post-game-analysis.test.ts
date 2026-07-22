import { describe, expect, it } from "vitest";
import { generatePostGameAnalysis, type PostGameMatchContext } from "./post-game-analysis.js";
import type { PlayerChampionStats } from "../types/domain.js";

function baseContext(overrides: Partial<PostGameMatchContext> = {}): PostGameMatchContext {
  return {
    matchId: "m1",
    championId: 61,
    championName: "Orianna",
    role: "MID",
    won: true,
    durationSeconds: 1800,
    metrics: {
      kills: 6,
      deaths: 3,
      assists: 6,
      csPerMinute: 7.7,
      goldPerMinute: 430,
      damagePerMinute: 760,
      visionScorePerMinute: 0.85,
      killParticipation: 0.56,
      objectiveParticipation: 0.38
    },
    timeline: {
      matchId: "m1",
      deathsBefore10: 0,
      deathsBefore15: 1,
      csAt10: 80,
      csAt15: 120,
      goldDiffAt15: 0,
      objectiveEvents: []
    },
    ...overrides
  };
}

function championHistory(overrides: Partial<PlayerChampionStats> = {}): PlayerChampionStats {
  return {
    championId: 61,
    championName: "Orianna",
    role: "MID",
    games: 10,
    wins: 7,
    kills: 60,
    deaths: 30,
    assists: 60,
    csPerMinute: 7.7,
    goldPerMinute: 430,
    damagePerMinute: 760,
    visionScorePerMinute: 0.85,
    killParticipation: 0.56,
    objectiveParticipation: 0.38,
    recentMatches: [],
    ...overrides
  };
}

describe("generatePostGameAnalysis", () => {
  it("gera pontos fortes numa partida com desempenho bem acima da baseline", () => {
    const context = baseContext({
      won: true,
      metrics: {
        kills: 10,
        deaths: 1,
        assists: 8,
        csPerMinute: 12,
        goldPerMinute: 600,
        damagePerMinute: 1200,
        visionScorePerMinute: 1.5,
        killParticipation: 0.7,
        objectiveParticipation: 0.5
      },
      timeline: {
        matchId: "m1",
        deathsBefore10: 0,
        deathsBefore15: 0,
        csAt10: 90,
        csAt15: 140,
        goldDiffAt15: 1500,
        objectiveEvents: []
      },
      championHistory: championHistory()
    });

    const result = generatePostGameAnalysis(context);

    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.strengths.length).toBeLessThanOrEqual(3);
    expect(result.weaknesses).toEqual([]);
    expect(result.executionSummary).toContain("Vitória");
    expect(result.executionSummary).toContain("sem mortes antes dos 10 minutos");
    expect(result.pickAssessment).toContain("funcionou");
  });

  it("gera fraquezas e dicas numa derrota com mortes cedo e atraso de ouro", () => {
    const context = baseContext({
      won: false,
      metrics: {
        kills: 1,
        deaths: 8,
        assists: 1,
        csPerMinute: 3,
        goldPerMinute: 250,
        damagePerMinute: 300,
        visionScorePerMinute: 0.3,
        killParticipation: 0.2,
        objectiveParticipation: 0.1
      },
      timeline: {
        matchId: "m1",
        deathsBefore10: 3,
        deathsBefore15: 5,
        csAt10: 40,
        csAt15: 60,
        goldDiffAt15: -1500,
        objectiveEvents: []
      }
    });

    const result = generatePostGameAnalysis(context);

    expect(result.weaknesses.length).toBeGreaterThan(0);
    expect(result.weaknesses.some((weakness) => weakness.code === "morre_demais")).toBe(true);
    expect(result.tips.length).toBe(2);
    expect(result.executionSummary).toContain("Derrota");
    expect(result.executionSummary).toContain("mortes antes dos 10 minutos");
    expect(result.pickAssessment).toContain("não performou como esperado");
  });

  it("expectedPlan reconhece a ausência de histórico pessoal com o campeão", () => {
    const context = baseContext({ championHistory: undefined });
    const result = generatePostGameAnalysis(context);
    expect(result.expectedPlan).toContain("Sem histórico seu");
  });

  it("expectedPlan reconhece histórico curto (menos de 5 partidas) como pouco confiável", () => {
    const context = baseContext({ championHistory: championHistory({ games: 3, wins: 2 }) });
    const result = generatePostGameAnalysis(context);
    expect(result.expectedPlan).toContain("ainda poucas pra estabelecer");
  });

  it("expectedPlan usa o score histórico quando há amostra suficiente (>=5 partidas)", () => {
    const context = baseContext({ championHistory: championHistory({ games: 10, wins: 7 }) });
    const result = generatePostGameAnalysis(context);
    expect(result.expectedPlan).toContain("score histórico");
  });

  it("confidence e sempre 'low' em todos os pontos fortes/fracos, independente da magnitude do sinal", () => {
    const context = baseContext({
      metrics: {
        kills: 10,
        deaths: 8,
        assists: 8,
        csPerMinute: 12,
        goldPerMinute: 250,
        damagePerMinute: 1200,
        visionScorePerMinute: 0.3,
        killParticipation: 0.7,
        objectiveParticipation: 0.1
      }
    });
    const result = generatePostGameAnalysis(context);
    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.weaknesses.length).toBeGreaterThan(0);
    for (const strength of result.strengths) expect(strength.confidence).toBe("low");
    for (const weakness of result.weaknesses) expect(weakness.confidence).toBe("low");
  });

  it("nao gera kp/objective como sinal quando a Riot nao forneceu o dado (undefined, nao 0)", () => {
    const context = baseContext({
      metrics: {
        kills: 6,
        deaths: 3,
        assists: 6,
        csPerMinute: 7.7,
        goldPerMinute: 430,
        damagePerMinute: 760,
        visionScorePerMinute: 0.85,
        killParticipation: undefined,
        objectiveParticipation: undefined
      }
    });
    const result = generatePostGameAnalysis(context);
    const codes = [...result.strengths, ...result.weaknesses].map((signal) => signal.code);
    expect(codes).not.toContain("boa_participacao_abates");
    expect(codes).not.toContain("baixa_participacao_abates");
    expect(codes).not.toContain("contribui_objetivos");
    expect(codes).not.toContain("baixa_contribuicao_objetivos");
  });

  it("partidas muito curtas (remake) nao geram sinais/dicas a partir de numeros ruidosos", () => {
    const context = baseContext({
      durationSeconds: 180,
      metrics: {
        kills: 0,
        deaths: 0,
        assists: 0,
        csPerMinute: 0,
        goldPerMinute: 0,
        damagePerMinute: 0,
        visionScorePerMinute: 0,
        killParticipation: 0,
        objectiveParticipation: 0
      },
      timeline: {
        matchId: "m1",
        deathsBefore10: 0,
        deathsBefore15: 0,
        csAt10: 0,
        csAt15: 0,
        objectiveEvents: []
      }
    });

    const result = generatePostGameAnalysis(context);

    expect(result.strengths).toEqual([]);
    expect(result.weaknesses).toEqual([]);
    expect(result.tips).toEqual([]);
    expect(result.executionSummary).toContain("menos de 5 minutos");
  });

  it("preenche deathsBefore10/15 e csAt10/15 em metrics a partir da timeline", () => {
    const result = generatePostGameAnalysis(baseContext());
    expect(result.metrics.deathsBefore10).toBe(0);
    expect(result.metrics.deathsBefore15).toBe(1);
    expect(result.metrics.csAt10).toBe(80);
    expect(result.metrics.csAt15).toBe(120);
  });
});
