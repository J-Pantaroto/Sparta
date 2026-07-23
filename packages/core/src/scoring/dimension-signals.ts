/**
 * Deriva sinais de "força"/"fraqueza" a partir de razoes (valor/baseline,
 * centro 1.0) ou scores (0-100, centro 50) ja calculados por quem chama -
 * generico o suficiente pra servir tanto uma media ponderada entre varias
 * partidas (Fase 2, `player-insights.ts`) quanto o valor bruto de uma unica
 * partida dividido pela baseline do role (Fase 4, `postgame/`). Nao sabe
 * nem precisa saber de onde veio o numero.
 */

export type Severity = "low" | "medium" | "high";

export interface DimensionSignal {
  kind: "strength" | "weakness";
  code: string;
  label: string;
  detail: string;
  magnitude: number;
  severity: Severity;
}

export interface DimensionLabels {
  strengthCode: string;
  strengthLabel: string;
  weaknessCode: string;
  weaknessLabel: string;
  detail: (percentOrScore: number, isStrength: boolean) => string;
}

/**
 * Bandas de força/fraqueza deliberadamente assimetricas em torno do centro
 * neutro (1.0 pra razao, 50 pra score): a banda de fraqueza comeca mais
 * perto do centro (0.85, so 15% abaixo) que a de força (1.1, 10% acima) -
 * ficar abaixo do esperado e mais acionavel/notavel de sinalizar pro
 * jogador do que superar a expectativa, entao o corte pra "isso e uma
 * fraqueza" e mais sensivel. Julgamento de design, nao calibrado
 * estatisticamente ainda contra dado real acumulado (ver "Fase futura:
 * revisao dos algoritmos de scoring" no CLAUDE.md).
 */
export const RATIO_STRENGTH_THRESHOLD = 1.1;
export const RATIO_WEAKNESS_THRESHOLD = 0.85;
/** Sub-tiers de severidade dentro da banda de fraqueza (ratio <= 0.85). */
export const RATIO_HIGH_SEVERITY = 0.7;
export const RATIO_MEDIUM_SEVERITY = 0.8;

/**
 * Equivalente em "espaco de score" (centro 50, escala 0-100) das bandas
 * acima - aqui simetrico (65/35, ambos 15 pontos do centro), diferente da
 * assimetria deliberada em espaco de razao (RATIO_STRENGTH_THRESHOLD/
 * RATIO_WEAKNESS_THRESHOLD) porque um score ja e uma escala absoluta
 * calculada pelo chamador (ex.: winrate 0-100), nao uma razao onde
 * "acima"/"abaixo" tem grandezas naturalmente diferentes.
 */
export const SCORE_STRENGTH_THRESHOLD = 65;
export const SCORE_WEAKNESS_THRESHOLD = 35;
export const SCORE_HIGH_SEVERITY = 20;
export const SCORE_MEDIUM_SEVERITY = 30;

export const RATIO_DIMENSIONS: Record<string, DimensionLabels> = {
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

export const SCORE_DIMENSIONS: Record<string, DimensionLabels> = {
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

export function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Magnitude em "pontos percentuais de desvio do centro neutro", pra poder
 * comparar/ordenar dimensoes de razao (centro 1.0, tipicamente 0-200%) e de
 * score (centro 50, escala 0-100) na mesma unidade - sem essa normalizacao,
 * um pequeno desvio de winrate (ate 50 pontos) sempre teria mais peso na
 * ordenacao do que um desvio de razao muito mais extremo (tipicamente < 2).
 */
export function ratioMagnitude(ratio: number): number {
  return Math.abs(ratio - 1) * 100;
}

export function scoreMagnitude(score: number): number {
  return Math.abs(score - 50) * 2;
}

export function buildRatioSignal(key: string, ratio: number | undefined): DimensionSignal | undefined {
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

export function buildScoreSignal(key: string, score: number | undefined): DimensionSignal | undefined {
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
