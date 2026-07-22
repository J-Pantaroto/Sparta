import {
  calculateKda,
  calculateRecentForm,
  confidenceFromGames,
  normalizeInverse,
  roleBaselines,
  scoreChampionPerformance
} from "../scoring/champion-performance.js";
import type {
  PlayerChampionStats,
  PlayerStrength,
  PlayerWeakness,
  RecentChampionMatch,
  RecentForm
} from "../types/domain.js";
import type { MatchParticipationRecord } from "./player-champion-stats.js";

const PREVIOUS_BLOCK_MIN_GAMES = 3;
const TREND_THRESHOLD_POINTS = 5;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function toRecentChampionMatch(record: MatchParticipationRecord): RecentChampionMatch {
  return {
    matchId: record.matchId,
    championId: record.championId,
    role: record.role,
    won: record.won,
    kills: record.kills,
    deaths: record.deaths,
    assists: record.assists,
    csPerMinute: record.csPerMinute,
    goldPerMinute: record.goldPerMinute,
    damagePerMinute: record.damagePerMinute,
    visionScorePerMinute: record.visionScorePerMinute,
    // calculateRecentForm nao usa kp/objective na formula - coagir null pra 0
    // aqui e inocuo (nao afeta o score, so preenche o formato exigido).
    killParticipation: record.killParticipation ?? 0,
    objectiveParticipation: record.objectiveParticipation ?? 0
  };
}

/**
 * Forma recente do jogador (todos os campeoes/roles), nao por campeao -
 * `history` precisa vir ordenado do mais recente pro mais antigo (mesmo
 * contrato de `aggregatePlayerChampionStats`). Tendencia compara o bloco
 * mais recente (10 partidas) com o bloco imediatamente anterior (10
 * partidas antes dessas) em vez de last10 vs last20, ja que last20 inclui
 * as mesmas 10 partidas de last10 e diluiria a diferenca.
 */
export function computeRecentForm(history: MatchParticipationRecord[]): RecentForm {
  if (history.length === 0) {
    return { last10Score: 50, last20Score: 50, last50Score: 50, trend: "stable", confidence: "low" };
  }

  const matches = history.map(toRecentChampionMatch);
  const last10Score = round(calculateRecentForm(matches.slice(0, 10)));
  const last20Score = round(calculateRecentForm(matches.slice(0, 20)));
  const last50Score = round(calculateRecentForm(matches.slice(0, 50)));

  const blockA = matches.slice(0, 10);
  const blockB = matches.slice(10, 20);
  let trend: RecentForm["trend"] = "stable";
  if (blockB.length >= PREVIOUS_BLOCK_MIN_GAMES) {
    const diff = calculateRecentForm(blockA) - calculateRecentForm(blockB);
    if (diff >= TREND_THRESHOLD_POINTS) trend = "improving";
    else if (diff <= -TREND_THRESHOLD_POINTS) trend = "declining";
  }

  return { last10Score, last20Score, last50Score, trend, confidence: confidenceFromGames(history.length) };
}

type Severity = "low" | "medium" | "high";

interface DimensionSignal {
  kind: "strength" | "weakness";
  code: string;
  label: string;
  detail: string;
  magnitude: number;
  severity: Severity;
}

interface DimensionLabels {
  strengthCode: string;
  strengthLabel: string;
  weaknessCode: string;
  weaknessLabel: string;
  detail: (percentOrScore: number, isStrength: boolean) => string;
}

const RATIO_STRENGTH_THRESHOLD = 1.1;
const RATIO_WEAKNESS_THRESHOLD = 0.85;
const RATIO_HIGH_SEVERITY = 0.7;
const RATIO_MEDIUM_SEVERITY = 0.8;

const SCORE_STRENGTH_THRESHOLD = 65;
const SCORE_WEAKNESS_THRESHOLD = 35;
const SCORE_HIGH_SEVERITY = 20;
const SCORE_MEDIUM_SEVERITY = 30;

const RATIO_DIMENSIONS: Record<string, DimensionLabels> = {
  kda: {
    strengthCode: "kda_solido",
    strengthLabel: "KDA sólido",
    weaknessCode: "kda_abaixo",
    weaknessLabel: "KDA abaixo do esperado",
    detail: (pct, isStrength) =>
      isStrength
        ? `Relação de abates e assistências por morte ${pct}% acima da referência esperada para o(s) papel(éis) jogado(s).`
        : `Relação de abates e assistências por morte ${pct}% abaixo da referência esperada para o(s) papel(éis) jogado(s).`
  },
  cs: {
    strengthCode: "farm_consistente",
    strengthLabel: "Farm consistente",
    weaknessCode: "farm_abaixo",
    weaknessLabel: "Farm abaixo do esperado",
    detail: (pct, isStrength) =>
      isStrength
        ? `CS por minuto ${pct}% acima da referência esperada para o(s) papel(éis) jogado(s).`
        : `CS por minuto ${pct}% abaixo da referência esperada para o(s) papel(éis) jogado(s).`
  },
  damage: {
    strengthCode: "dano_acima",
    strengthLabel: "Dano acima do esperado",
    weaknessCode: "dano_abaixo",
    weaknessLabel: "Dano abaixo do esperado",
    detail: (pct, isStrength) =>
      isStrength
        ? `Dano por minuto ${pct}% acima da referência esperada para o(s) papel(éis) jogado(s).`
        : `Dano por minuto ${pct}% abaixo da referência esperada para o(s) papel(éis) jogado(s).`
  },
  gold: {
    strengthCode: "geracao_ouro_acima",
    strengthLabel: "Geração de ouro acima do esperado",
    weaknessCode: "geracao_ouro_abaixo",
    weaknessLabel: "Geração de ouro abaixo do esperado",
    detail: (pct, isStrength) =>
      isStrength
        ? `Ouro por minuto ${pct}% acima da referência esperada para o(s) papel(éis) jogado(s).`
        : `Ouro por minuto ${pct}% abaixo da referência esperada para o(s) papel(éis) jogado(s).`
  },
  vision: {
    strengthCode: "visao_acima",
    strengthLabel: "Controle de visão acima do esperado",
    weaknessCode: "visao_abaixo",
    weaknessLabel: "Controle de visão abaixo do esperado",
    detail: (pct, isStrength) =>
      isStrength
        ? `Pontuação de visão por minuto ${pct}% acima da referência esperada para o(s) papel(éis) jogado(s).`
        : `Pontuação de visão por minuto ${pct}% abaixo da referência esperada para o(s) papel(éis) jogado(s).`
  },
  kp: {
    strengthCode: "boa_participacao_abates",
    strengthLabel: "Boa participação em abates",
    weaknessCode: "baixa_participacao_abates",
    weaknessLabel: "Baixa participação em abates",
    detail: (pct, isStrength) =>
      isStrength
        ? `Participação em abates ${pct}% acima da referência esperada para o(s) papel(éis) jogado(s).`
        : `Participação em abates ${pct}% abaixo da referência esperada para o(s) papel(éis) jogado(s).`
  },
  objective: {
    strengthCode: "contribui_objetivos",
    strengthLabel: "Boa contribuição em objetivos",
    weaknessCode: "baixa_contribuicao_objetivos",
    weaknessLabel: "Baixa contribuição em objetivos",
    detail: (pct, isStrength) =>
      isStrength
        ? `Participação em objetivos ${pct}% acima da referência esperada para o(s) papel(éis) jogado(s).`
        : `Participação em objetivos ${pct}% abaixo da referência esperada para o(s) papel(éis) jogado(s).`
  }
};

const SCORE_DIMENSIONS: Record<string, DimensionLabels> = {
  winrate: {
    strengthCode: "boa_taxa_vitoria",
    strengthLabel: "Boa taxa de vitória",
    weaknessCode: "taxa_vitoria_baixa",
    weaknessLabel: "Taxa de vitória baixa",
    detail: (score, isStrength) =>
      isStrength
        ? `Taxa de vitória ponderada em ${score} pontos, acima da média nos campeões com amostra suficiente.`
        : `Taxa de vitória ponderada em ${score} pontos, abaixo da média nos campeões com amostra suficiente.`
  },
  deaths: {
    strengthCode: "poucas_mortes",
    strengthLabel: "Poucas mortes por partida",
    weaknessCode: "morre_demais",
    weaknessLabel: "Morre com frequência acima do esperado",
    detail: (score, isStrength) =>
      isStrength
        ? `Sobrevivência ponderada em ${score} pontos (poucas mortes por partida).`
        : `Sobrevivência ponderada em ${score} pontos (mortes por partida acima do confortável).`
  }
};

interface WeightedItem {
  value: number;
  weight: number;
}

function weightedAverage(items: WeightedItem[]): number | undefined {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return undefined;
  return items.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

/**
 * Magnitude em "pontos percentuais de desvio do centro neutro", pra poder
 * comparar/ordenar dimensoes de razao (centro 1.0, tipicamente 0-200%) e de
 * score (centro 50, escala 0-100) na mesma unidade - sem essa normalizacao,
 * um pequeno desvio de winrate (ate 50 pontos) sempre teria mais peso na
 * ordenacao do que um desvio de razao muito mais extremo (tipicamente < 2).
 */
function ratioMagnitude(ratio: number): number {
  return Math.abs(ratio - 1) * 100;
}

function scoreMagnitude(score: number): number {
  return Math.abs(score - 50) * 2;
}

function buildRatioSignal(key: string, ratio: number | undefined): DimensionSignal | undefined {
  if (ratio === undefined) return undefined;
  const labels = RATIO_DIMENSIONS[key];
  const magnitude = ratioMagnitude(ratio);

  if (ratio >= RATIO_STRENGTH_THRESHOLD) {
    return {
      kind: "strength",
      code: labels.strengthCode,
      label: labels.strengthLabel,
      detail: labels.detail(round((ratio - 1) * 100), true),
      magnitude,
      severity: "low"
    };
  }
  if (ratio <= RATIO_WEAKNESS_THRESHOLD) {
    const severity: Severity = ratio <= RATIO_HIGH_SEVERITY ? "high" : ratio <= RATIO_MEDIUM_SEVERITY ? "medium" : "low";
    return {
      kind: "weakness",
      code: labels.weaknessCode,
      label: labels.weaknessLabel,
      detail: labels.detail(round((1 - ratio) * 100), false),
      magnitude,
      severity
    };
  }
  return undefined;
}

function buildScoreSignal(key: string, score: number | undefined): DimensionSignal | undefined {
  if (score === undefined) return undefined;
  const labels = SCORE_DIMENSIONS[key];
  const magnitude = scoreMagnitude(score);

  if (score >= SCORE_STRENGTH_THRESHOLD) {
    return {
      kind: "strength",
      code: labels.strengthCode,
      label: labels.strengthLabel,
      detail: labels.detail(round(score), true),
      magnitude,
      severity: "low"
    };
  }
  if (score <= SCORE_WEAKNESS_THRESHOLD) {
    const severity: Severity = score <= SCORE_HIGH_SEVERITY ? "high" : score <= SCORE_MEDIUM_SEVERITY ? "medium" : "low";
    return {
      kind: "weakness",
      code: labels.weaknessCode,
      label: labels.weaknessLabel,
      detail: labels.detail(round(score), false),
      magnitude,
      severity
    };
  }
  return undefined;
}

const MAX_STRENGTHS = 3;
const MAX_WEAKNESSES = 3;

/**
 * Deriva pontos fortes/fracos do jogador a partir do pool de campeoes
 * elegiveis (mesmo piso de `scoreChampionPerformance`: >=5 partidas). Nao
 * reaproveita `components` (ja clampado e centrado em 75 pras razoes, nao
 * em 50) - em vez disso agrega a razao bruta valor/baseline por campeao,
 * ponderada por jogos, e so entao aplica o corte de sinal diretamente
 * sobre a razao agregada. kp/objective excluem campeoes com o valor
 * exatamente 0, que na agregacao de PlayerChampionStats significa "sem
 * dado" (challenges ausente da Riot em patches antigos), nao "0% real".
 */
export function derivePlayerStrengthsWeaknesses(
  championStats: PlayerChampionStats[]
): { strengths: PlayerStrength[]; weaknesses: PlayerWeakness[] } {
  const eligible = championStats.filter((stats) => scoreChampionPerformance(stats).eligible);
  if (eligible.length === 0) return { strengths: [], weaknesses: [] };

  const totalGames = eligible.reduce((sum, stats) => sum + stats.games, 0);
  const confidence = confidenceFromGames(totalGames);

  const ratioValues: Record<string, number | undefined> = {
    kda: weightedAverage(
      eligible.map((stats) => ({
        value: calculateKda(stats.kills, stats.deaths, stats.assists) / roleBaselines[stats.role].kda,
        weight: stats.games
      }))
    ),
    cs: weightedAverage(
      eligible.map((stats) => ({ value: stats.csPerMinute / roleBaselines[stats.role].cs, weight: stats.games }))
    ),
    damage: weightedAverage(
      eligible.map((stats) => ({ value: stats.damagePerMinute / roleBaselines[stats.role].damage, weight: stats.games }))
    ),
    gold: weightedAverage(
      eligible.map((stats) => ({ value: stats.goldPerMinute / roleBaselines[stats.role].gold, weight: stats.games }))
    ),
    vision: weightedAverage(
      eligible.map((stats) => ({
        value: stats.visionScorePerMinute / roleBaselines[stats.role].vision,
        weight: stats.games
      }))
    ),
    kp: weightedAverage(
      eligible
        .filter((stats) => stats.killParticipation > 0)
        .map((stats) => ({ value: stats.killParticipation / roleBaselines[stats.role].kp, weight: stats.games }))
    ),
    objective: weightedAverage(
      eligible
        .filter((stats) => stats.objectiveParticipation > 0)
        .map((stats) => ({ value: stats.objectiveParticipation / roleBaselines[stats.role].objective, weight: stats.games }))
    )
  };

  const deathsPerGame = weightedAverage(eligible.map((stats) => ({ value: stats.deaths / stats.games, weight: stats.games })));
  const scoreValues: Record<string, number | undefined> = {
    winrate: weightedAverage(eligible.map((stats) => ({ value: (stats.wins / stats.games) * 100, weight: stats.games }))),
    deaths: deathsPerGame === undefined ? undefined : normalizeInverse(deathsPerGame, 7)
  };

  const signals: DimensionSignal[] = [
    ...Object.entries(ratioValues)
      .map(([key, ratio]) => buildRatioSignal(key, ratio))
      .filter((signal): signal is DimensionSignal => signal !== undefined),
    ...Object.entries(scoreValues)
      .map(([key, score]) => buildScoreSignal(key, score))
      .filter((signal): signal is DimensionSignal => signal !== undefined)
  ];

  const strengths: PlayerStrength[] = signals
    .filter((signal) => signal.kind === "strength")
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, MAX_STRENGTHS)
    .map((signal) => ({ code: signal.code, label: signal.label, detail: signal.detail, confidence }));

  const weaknesses: PlayerWeakness[] = signals
    .filter((signal) => signal.kind === "weakness")
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, MAX_WEAKNESSES)
    .map((signal) => ({
      code: signal.code,
      label: signal.label,
      detail: signal.detail,
      severity: signal.severity,
      confidence
    }));

  return { strengths, weaknesses };
}
