import {
  calculateKda,
  normalizeInverse,
  roleBaselines,
  scoreChampionPerformance
} from "../scoring/champion-performance.js";
import { buildRatioSignal, buildScoreSignal, type DimensionSignal } from "../scoring/dimension-signals.js";
import type {
  MatchPerformanceMetrics,
  MatchTimelineSummary,
  PlayerChampionStats,
  PlayerStrength,
  PlayerWeakness,
  PostGameAnalysis,
  Role
} from "../types/domain.js";

/**
 * Partidas mais curtas que isso (remake, derrota rendida) tem taxas por
 * minuto e contagens de morte/CS pouco confiaveis demais pra gerar sinal -
 * a analise vira so um aviso honesto, sem inventar forca/fraqueza a partir
 * de numeros ruidosos de 2-3 minutos de jogo.
 */
const SHORT_MATCH_DURATION_SECONDS = 300;

const MAX_STRENGTHS = 3;
const MAX_WEAKNESSES = 3;

export interface PostGameMatchContext {
  matchId: string;
  championId: number;
  championName: string;
  role: Role;
  won: boolean;
  durationSeconds: number;
  metrics: MatchPerformanceMetrics;
  timeline: MatchTimelineSummary;
  /** Historico do jogador nesse campeao+role especificos, se ja tiver jogado antes. */
  championHistory?: PlayerChampionStats;
  /** Nome do laner adversario, se identificavel na partida - so cor de texto. */
  enemyLaneChampionName?: string;
}

function buildRatioSignals(role: Role, metrics: MatchPerformanceMetrics): DimensionSignal[] {
  const baseline = roleBaselines[role];
  const kda = calculateKda(metrics.kills, metrics.deaths, metrics.assists);

  const ratios: Record<string, number | undefined> = {
    kda: kda / baseline.kda,
    cs: metrics.csPerMinute / baseline.cs,
    damage: metrics.damagePerMinute / baseline.damage,
    gold: metrics.goldPerMinute / baseline.gold,
    vision: metrics.visionScorePerMinute / baseline.vision,
    // undefined (nao 0) quando a Riot nao manda o objeto "challenges" -
    // 0 aqui seria inventar uma participacao real que nao temos como saber.
    kp: metrics.killParticipation === undefined ? undefined : metrics.killParticipation / baseline.kp,
    objective:
      metrics.objectiveParticipation === undefined ? undefined : metrics.objectiveParticipation / baseline.objective
  };

  const scores: Record<string, number | undefined> = {
    deaths: normalizeInverse(metrics.deaths, 7)
  };

  return [
    ...Object.entries(ratios)
      .map(([key, ratio]) => buildRatioSignal(key, ratio))
      .filter((signal): signal is DimensionSignal => signal !== undefined),
    ...Object.entries(scores)
      .map(([key, score]) => buildScoreSignal(key, score))
      .filter((signal): signal is DimensionSignal => signal !== undefined)
  ];
}

function toStrengthsAndWeaknesses(signals: DimensionSignal[]): {
  strengths: PlayerStrength[];
  weaknesses: PlayerWeakness[];
} {
  // confidence fixo em "low": aqui confidence significa "quanto isso
  // generaliza pra sua habilidade geral", nao "temos certeza que isso
  // aconteceu" - uma unica partida e sempre baixa confianca como sinal
  // geral, mesmo sendo 100% precisa sobre o que aconteceu nela. Variar
  // conforme o historico do campeao concorda ou nao com essa partida fica
  // pra depois.
  const strengths: PlayerStrength[] = signals
    .filter((signal) => signal.kind === "strength")
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, MAX_STRENGTHS)
    .map((signal) => ({ code: signal.code, label: signal.label, detail: signal.detail, confidence: "low" }));

  const weaknesses: PlayerWeakness[] = signals
    .filter((signal) => signal.kind === "weakness")
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, MAX_WEAKNESSES)
    .map((signal) => ({
      code: signal.code,
      label: signal.label,
      detail: signal.detail,
      severity: signal.severity,
      confidence: "low"
    }));

  return { strengths, weaknesses };
}

function buildTips(timeline: MatchTimelineSummary): string[] {
  const tips: string[] = [];
  if (timeline.deathsBefore10 >= 2) {
    tips.push("Você morreu 2 ou mais vezes antes dos 10 minutos - reveja trocas de dano e visão no início da lane.");
  }
  if (timeline.goldDiffAt15 !== undefined && timeline.goldDiffAt15 < -1000) {
    tips.push("Sua equipe estava mais de 1000 de ouro atrás aos 15 minutos - avalie se valeu repriorizar lane sobre objetivos.");
  }
  return tips;
}

function buildExpectedPlan(role: Role, championName: string, championHistory: PlayerChampionStats | undefined): string {
  if (!championHistory) {
    return `Sem histórico seu com ${championName} no papel ${role} ainda - a expectativa usada aqui é a referência geral do papel, não o seu desempenho pessoal.`;
  }
  const performance = scoreChampionPerformance(championHistory);
  if (!performance.eligible) {
    return `Você tem ${championHistory.games} partida(s) com ${championName} no papel ${role}, ainda poucas pra estabelecer uma expectativa pessoal confiável - a referência aqui combina esse histórico curto com a baseline geral do papel.`;
  }
  const relativeToBaseline =
    performance.score >= 65 ? "acima da referência do papel" : performance.score <= 35 ? "abaixo da referência do papel" : "próximo da referência do papel";
  return `Com base nas suas ${championHistory.games} partidas anteriores com ${championName} no papel ${role} (score histórico ${performance.score}), a expectativa era um desempenho ${relativeToBaseline}.`;
}

function buildExecutionSummary(
  won: boolean,
  timeline: MatchTimelineSummary,
  strengths: PlayerStrength[],
  weaknesses: PlayerWeakness[]
): string {
  const outcome = won ? "Vitória." : "Derrota.";
  const earlyGame =
    timeline.deathsBefore10 >= 2
      ? ` Começo de jogo difícil, com ${timeline.deathsBefore10} mortes antes dos 10 minutos.`
      : timeline.deathsBefore10 === 0
        ? " Início de jogo limpo, sem mortes antes dos 10 minutos."
        : "";
  const topSignal = weaknesses[0]
    ? ` O ponto que mais pesou contra foi "${weaknesses[0].label}".`
    : strengths[0]
      ? ` O destaque da partida foi "${strengths[0].label}".`
      : " O desempenho ficou dentro do esperado pro papel, sem desvios grandes.";
  return `${outcome}${earlyGame}${topSignal}`;
}

function buildPickAssessment(championName: string, role: Role, won: boolean, enemyLaneChampionName: string | undefined): string {
  const matchupClause = enemyLaneChampionName ? ` contra ${enemyLaneChampionName}` : "";
  return won
    ? `${championName} no papel ${role}${matchupClause} funcionou nessa partida.`
    : `${championName} no papel ${role}${matchupClause} não performou como esperado nessa partida - vale revisar se a escolha fez sentido pro contexto do draft.`;
}

function buildMetrics(context: PostGameMatchContext): MatchPerformanceMetrics {
  return {
    ...context.metrics,
    deathsBefore10: context.timeline.deathsBefore10,
    deathsBefore15: context.timeline.deathsBefore15,
    csAt10: context.timeline.csAt10,
    csAt15: context.timeline.csAt15
  };
}

/**
 * Gera a analise pos-game de uma partida especifica. Pura, sem I/O - quem
 * chama busca o dado real (participante, timeline, historico do campeao) e
 * monta o `PostGameMatchContext`.
 *
 * `expectedPlan` nao e uma lembranca de recomendacao de draft armazenada -
 * essa recomendacao nunca existiu pra nenhuma partida ja jogada
 * (recommendPicks e uma funcao pura chamada ao vivo no champion select,
 * nunca persistida). E honestamente derivado do historico proprio do
 * jogador nesse campeao+role, caindo pra baseline geral do role na
 * ausencia de historico - o texto gerado deixa isso explicito em vez de
 * fingir memoria de uma previsao que nunca foi salva.
 */
export function generatePostGameAnalysis(context: PostGameMatchContext): PostGameAnalysis {
  const metrics = buildMetrics(context);

  if (context.durationSeconds < SHORT_MATCH_DURATION_SECONDS) {
    return {
      matchId: context.matchId,
      expectedPlan: "Partida encerrada muito cedo (provável remake) - sem dado suficiente pra estimar uma expectativa.",
      executionSummary: "A partida durou menos de 5 minutos - não há dado suficiente pra analisar a execução.",
      pickAssessment: `${context.championName} não chegou a ser testado de verdade nessa partida.`,
      strengths: [],
      weaknesses: [],
      tips: [],
      metrics
    };
  }

  const signals = buildRatioSignals(context.role, context.metrics);
  const { strengths, weaknesses } = toStrengthsAndWeaknesses(signals);
  const tips = buildTips(context.timeline);

  return {
    matchId: context.matchId,
    expectedPlan: buildExpectedPlan(context.role, context.championName, context.championHistory),
    executionSummary: buildExecutionSummary(context.won, context.timeline, strengths, weaknesses),
    pickAssessment: buildPickAssessment(context.championName, context.role, context.won, context.enemyLaneChampionName),
    strengths,
    weaknesses,
    tips,
    metrics
  };
}
