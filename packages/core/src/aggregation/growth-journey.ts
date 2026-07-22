import { confidenceFromGames } from "../scoring/champion-performance.js";
import { round } from "../scoring/dimension-signals.js";
import type { GrowthJourney, PostGameAnalysis, WeaknessTrend } from "../types/domain.js";

const BLOCK_SIZE = 10;

/**
 * Piso aplicado aos dois blocos (nao so ao anterior, como em
 * computeRecentForm) - com poucos relatorios analisados, um blockA pequeno
 * faz uma unica partida oscilar a taxa em 50-100 pontos, gerando veredito
 * "resolved"/"new" espurio a partir de 1 jogo.
 */
const MIN_BLOCK_REPORTS = 3;

/**
 * 20 pontos percentuais num bloco de 10 partidas equivale a uma oscilacao
 * de 2 jogos - mesma granularidade aceita pelo TREND_THRESHOLD_POINTS de
 * computeRecentForm, so que aqui a unidade e taxa de presenca (%), nao
 * score 0-100.
 */
export const RATE_TREND_THRESHOLD_POINTS = 20;

function rate(reports: PostGameAnalysis[], code: string): number {
  if (reports.length === 0) return 0;
  const count = reports.filter((report) => report.weaknesses.some((weakness) => weakness.code === code)).length;
  return round((count / reports.length) * 100);
}

/**
 * Tendencia de cada codigo de fraqueza ao longo do tempo, comparando o
 * bloco de relatorios mais recente com o bloco imediatamente anterior -
 * mesmo padrao de bloco de computeRecentForm (Fase 2). `reports` precisa
 * vir ordenado do mais recente pro mais antigo.
 *
 * Limitacao conhecida: `weaknesses` de cada PostGameAnalysis ja e um corte
 * top-3 (MAX_WEAKNESSES em post-game-analysis.ts) - presenca significa
 * "estava entre os 3 piores sinais daquela partida", nao uma medida
 * continua. Um codigo na fronteira do corte pode entrar/sair mesmo com a
 * metrica subjacente quase parada. Aceito como limitacao do v1.
 */
export function computeWeaknessTrends(reports: PostGameAnalysis[]): WeaknessTrend[] {
  const blockA = reports.slice(0, BLOCK_SIZE);
  const blockB = reports.slice(BLOCK_SIZE, BLOCK_SIZE * 2);

  const labelsByCode = new Map<string, string>();
  for (const report of [...blockA, ...blockB]) {
    for (const weakness of report.weaknesses) {
      if (!labelsByCode.has(weakness.code)) labelsByCode.set(weakness.code, weakness.label);
    }
  }
  if (labelsByCode.size === 0) return [];

  const insufficientData = blockA.length < MIN_BLOCK_REPORTS || blockB.length < MIN_BLOCK_REPORTS;
  const confidence = confidenceFromGames(blockA.length + blockB.length);

  const trends: WeaknessTrend[] = Array.from(labelsByCode.entries()).map(([code, label]) => {
    const recentRate = rate(blockA, code);
    const previousRate = rate(blockB, code);

    let trend: WeaknessTrend["trend"];
    if (insufficientData) {
      trend = "stable";
    } else if (previousRate > 0 && recentRate === 0) {
      trend = "resolved";
    } else if (previousRate === 0 && recentRate > 0) {
      trend = "new";
    } else {
      const diff = previousRate - recentRate;
      trend = diff >= RATE_TREND_THRESHOLD_POINTS ? "improving" : diff <= -RATE_TREND_THRESHOLD_POINTS ? "worsening" : "stable";
    }

    return { code, label, recentRate, previousRate, trend, confidence };
  });

  return trends.sort((a, b) => Math.abs(b.previousRate - b.recentRate) - Math.abs(a.previousRate - a.recentRate));
}

/**
 * Wrapper fino sobre computeWeaknessTrends - matchesAnalyzed e o total de
 * relatorios pos-game ja persistidos do jogador (independente de quantos
 * entraram nos blocos de comparacao).
 */
export function computeGrowthJourney(reports: PostGameAnalysis[]): GrowthJourney {
  return { weaknessTrends: computeWeaknessTrends(reports), matchesAnalyzed: reports.length };
}
