import type { Confidence, PlayerChampionStats, RecentChampionMatch, Role } from "../types/domain.js";
import { normalizeWeightsByAvailability } from "./weight-normalization.js";

export interface ChampionPerformanceScore {
  championId: number;
  championName: string;
  role: Role;
  score: number;
  confidence: Confidence;
  eligible: boolean;
  games: number;
  /**
   * Só os componentes com dado. Um componente indisponível fica **fora** do
   * mapa em vez de aparecer como `0` - a interface itera o que existe.
   */
  components: Record<string, number>;
  /**
   * Soma dos pesos originais do papel que de fato tinham dado. `1` quando
   * o modelo inteiro participou; menor quando algum componente ficou de
   * fora. Não é confiança estatística - são coisas diferentes.
   */
  dataCoverage: number;
}

/**
 * Referencias por role usadas como "expectativa" em `normalizeRatio` (valor
 * real / valor aqui). Sao aproximacoes de senso comum de LoL (ex.: suporte
 * farma pouco mas visao alta; jungle prioriza kp/objetivo em vez de CS) -
 * julgamento de design, nao calibrado estatisticamente contra dado real do
 * Sparta ainda (nao ha volume de partidas acumulado suficiente pra isso -
 * ver "Fase futura: revisao dos algoritmos de scoring" no CLAUDE.md).
 */
export const roleBaselines: Record<Role, Record<string, number>> = {
  TOP: { kda: 3.2, cs: 7.5, damage: 700, gold: 420, vision: 0.8, kp: 0.5, objective: 0.35 },
  JUNGLE: { kda: 3.5, cs: 5.8, damage: 560, gold: 390, vision: 1.0, kp: 0.62, objective: 0.62 },
  MID: { kda: 3.4, cs: 7.7, damage: 760, gold: 430, vision: 0.85, kp: 0.56, objective: 0.38 },
  ADC: { kda: 3.2, cs: 8.2, damage: 780, gold: 440, vision: 0.7, kp: 0.58, objective: 0.42 },
  SUPPORT: { kda: 3.1, cs: 1.2, damage: 360, gold: 270, vision: 2.2, kp: 0.64, objective: 0.5 }
};

/**
 * Pesos por role sobre os componentes de `scoreChampionPerformance`, cada
 * role somando 1.0 (testado em champion-performance.test.ts). Laners (TOP/
 * MID/ADC) priorizam KDA/winrate/CS/dano/gold - os sinais mais diretos de
 * performance de lane 1v1/1v2. JUNGLE troca CS por kp/objetivo (farma menos
 * relevante que presenca em rotas/objetivos). SUPPORT concentra em kp/visao
 * (suas duas fontes primarias de impacto, ja que nao tem ouro/CS proprios
 * pra medir) e reduz o peso de kda/winrate individuais (resultado de time
 * pesa mais que estatistica pessoal pro papel). Julgamento de design, nao
 * calibrado estatisticamente ainda - mesma ressalva de `roleBaselines`.
 */
export const weights: Record<Role, Record<string, number>> = {
  TOP: { kda: 0.2, winrate: 0.15, cs: 0.15, damage: 0.15, gold: 0.1, deaths: 0.1, recent: 0.1, vision: 0.05 },
  MID: { kda: 0.2, winrate: 0.15, cs: 0.15, damage: 0.15, gold: 0.1, deaths: 0.1, recent: 0.1, vision: 0.05 },
  ADC: { kda: 0.2, winrate: 0.15, cs: 0.15, damage: 0.15, gold: 0.1, deaths: 0.1, recent: 0.1, vision: 0.05 },
  JUNGLE: { kda: 0.15, winrate: 0.15, kp: 0.15, objective: 0.15, gold: 0.1, damage: 0.1, deaths: 0.1, recent: 0.1 },
  SUPPORT: { kp: 0.2, vision: 0.2, deaths: 0.15, objective: 0.15, kda: 0.1, winrate: 0.1, recent: 0.1 }
};

/**
 * Piso de partidas pra um campeao entrar no ranking (`rankChampionPool`) -
 * amostra menor que isso e considerada estatisticamente instavel demais pra
 * comparar contra outros campeoes. Ver `docs/scoring-model.md`.
 */
export const MIN_GAMES_FOR_RANKING = 5;

/**
 * Thresholds de `confidenceFromGames` - exportados (nao só constantes
 * internas) pra outros modulos que precisam do mesmo piso de "amostra
 * pequena" reusarem em vez de duplicar o literal (ex.:
 * `recommendation-engine.ts` usava um `8` solto pro mesmo conceito antes
 * desta revisao).
 */
export const MEDIUM_CONFIDENCE_GAMES = 8;
export const HIGH_CONFIDENCE_GAMES = 20;

/**
 * "Valor ruim" de mortes usado em `normalizeInverse` - mortes por partida
 * (ou por partida individual) igual a isso ou mais zera o componente de
 * mortes. Reusado em `scoreChampionPerformance`, `calculateRecentForm`,
 * `player-insights.ts` e `postgame/post-game-analysis.ts`; antes desta
 * revisao, `calculateRecentForm` usava `8` em vez de `7` sem nenhum motivo
 * pra divergir dos outros 3 usos do mesmo conceito - inconsistencia
 * corrigida alinhando todos nesta constante unica.
 */
export const DEATHS_BAD_VALUE = 7;

export function calculateKda(kills: number, deaths: number, assists: number): number {
  return (kills + assists) / Math.max(1, deaths);
}

/**
 * Decaimento exponencial pra ponderar partidas mais recentes. `decayFactor
 * = 8` da uma "meia-vida" de ~8 partidas: o peso cai a ~37% (1/e) no indice
 * 8 e a ~1% perto do indice 37 - uma janela de "forma recente" de
 * aproximadamente uma sessao/dia competitivo tipico, nao uma temporada
 * inteira. Julgamento de design, nao calibrado estatisticamente ainda.
 */
export function recencyWeight(index: number, decayFactor = 8): number {
  return Math.exp(-index / decayFactor);
}

export function calculateRecentForm(matches: RecentChampionMatch[], decayFactor = 8): number {
  if (matches.length === 0) return 50;

  let weightedTotal = 0;
  let weightSum = 0;

  matches.forEach((match, index) => {
    const kda = calculateKda(match.kills, match.deaths, match.assists);
    const baseline = roleBaselines[match.role];
    // Sub-pesos internos (0.25/0.2/0.15/0.15/0.1/0.1/0.05, soma 1.0) - kp/
    // objective ficam de fora deliberadamente aqui: sao os dois campos que
    // podem faltar por partida (`null` desde a Etapa 4), e inclui-los
    // exigiria renormalizar por partida sem ganho pratico - a forma recente
    // ja e capturada pelos outros sete sinais.
    const matchScore =
      normalizeRatio(kda, baseline.kda) * 0.25 +
      // Vitoria/derrota como bonus/penalidade categorico fixo (100/35), nao
      // proporcional a margem - os outros componentes (kda/cs/dano/etc) ja
      // capturam a qualidade da partida; isso so marca o resultado bruto.
      (match.won ? 100 : 35) * 0.2 +
      normalizeRatio(match.csPerMinute, baseline.cs) * 0.15 +
      normalizeRatio(match.damagePerMinute, baseline.damage) * 0.15 +
      normalizeRatio(match.goldPerMinute, baseline.gold) * 0.1 +
      normalizeInverse(match.deaths, DEATHS_BAD_VALUE) * 0.1 +
      normalizeRatio(match.visionScorePerMinute, baseline.vision) * 0.05;
    const weight = recencyWeight(index, decayFactor);
    weightedTotal += matchScore * weight;
    weightSum += weight;
  });

  return clamp(weightedTotal / weightSum);
}

/**
 * Componentes cuja fonte pode simplesmente não existir pra aquele campeão.
 * Os demais (kda, cs, dano, ouro, mortes, visão, winrate, forma recente)
 * são derivados de campos que toda partida persistida tem.
 */
function buildComponents(stats: PlayerChampionStats): Record<string, number> {
  const kda = calculateKda(stats.kills, stats.deaths, stats.assists);
  const baseline = roleBaselines[stats.role];
  // `games` nunca é 0 aqui (agregação sem partida não produz stats), mas o
  // piso evita divisão por zero se um consumidor montar o objeto à mão -
  // NaN se propagaria por todo o score sem nenhum sinal de erro.
  const safeGames = Math.max(1, stats.games);

  const components: Record<string, number> = {
    kda: normalizeRatio(kda, baseline.kda),
    winrate: clamp((stats.wins / safeGames) * 100),
    cs: normalizeRatio(stats.csPerMinute, baseline.cs),
    damage: normalizeRatio(stats.damagePerMinute, baseline.damage),
    gold: normalizeRatio(stats.goldPerMinute, baseline.gold),
    deaths: normalizeInverse(stats.deaths / safeGames, DEATHS_BAD_VALUE),
    vision: normalizeRatio(stats.visionScorePerMinute, baseline.vision),
    recent: calculateRecentForm(stats.recentMatches)
  };

  // Só entram quando há valor medido. `0` aqui é participação zero de
  // verdade e continua entrando normalmente; ausência não vira componente.
  if (stats.killParticipation !== null) {
    components.kp = normalizeRatio(stats.killParticipation, baseline.kp);
  }
  if (stats.objectiveParticipation !== null) {
    components.objective = normalizeRatio(stats.objectiveParticipation, baseline.objective);
  }

  return components;
}

export function scoreChampionPerformance(stats: PlayerChampionStats): ChampionPerformanceScore {
  const games = stats.games;
  const eligible = games >= MIN_GAMES_FOR_RANKING;
  const components = buildComponents(stats);

  // Componente sem dado sai do cálculo e seu peso é redistribuído entre os
  // que têm - mesma regra do motor de draft (Etapa 3), mesma função. Antes
  // da Etapa 4, `objective` valia 0 pra todo mundo (o Sparta nunca extraiu
  // esse dado), o que derrubava 15% do score de JUNGLE e SUPPORT como se
  // fosse desempenho medido.
  const { normalizedWeights, dataCoverage } = normalizeWeightsByAvailability(
    weights[stats.role],
    (key) => components[key] !== undefined
  );

  const rawScore = Object.entries(normalizedWeights).reduce(
    (sum, [key, weight]) => sum + (components[key] ?? 0) * weight,
    0
  );

  return {
    championId: stats.championId,
    championName: stats.championName,
    role: stats.role,
    score: eligible ? round(clamp(rawScore)) : 0,
    confidence: confidenceFromGames(games),
    eligible,
    games,
    components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(value)])),
    // Sem `round`: `round` arredonda pra 1 casa (escala 0-100 dos
    // scores) e esmagaria uma cobertura de 0.85 pra 0.8.
    dataCoverage
  };
}

export function rankChampionPool(stats: PlayerChampionStats[]): ChampionPerformanceScore[] {
  return stats
    .map(scoreChampionPerformance)
    .filter((score) => score.eligible)
    .sort((a, b) => b.score - a.score);
}

export function confidenceFromGames(games: number): Confidence {
  if (games >= HIGH_CONFIDENCE_GAMES) return "high";
  if (games >= MEDIUM_CONFIDENCE_GAMES) return "medium";
  return "low";
}

/**
 * Razao valor/esperado escalada por 75 (nao 100): estar exatamente na
 * baseline (`roleBaselines`) rende 75/100, nao 100 - deixa margem acima de
 * "no esperado" pra recompensar quem supera a expectativa, em vez de já
 * cravar o teto so por atingir a media do role.
 */
function normalizeRatio(value: number, expected: number): number {
  if (expected <= 0) return 50;
  return clamp((value / expected) * 75);
}

export function normalizeInverse(value: number, badValue: number): number {
  return clamp(100 - (value / badValue) * 100);
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
