import { MEDIUM_CONFIDENCE_GAMES, scoreChampionPerformance } from "../scoring/champion-performance.js";
import type {
  ChampionTag,
  CompositionRules,
  DraftState,
  MatchupData,
  PatchMetaData,
  PickRecommendation,
  PlayerChampionStats,
  PlayerProfile,
  RecommendationReason,
  TeamComposition
} from "../types/domain.js";

export function recommendPicks(input: {
  draft: DraftState;
  player: PlayerProfile;
  championStats: PlayerChampionStats[];
  championTags: ChampionTag[];
  matchups: MatchupData[];
  compositionRules: CompositionRules;
  patchMeta: PatchMetaData | null;
  limit?: number;
}): PickRecommendation[] {
  const weights = selectWeights(input.draft);
  const banned = new Set(input.draft.bannedChampionIds);
  const picked = new Set([...input.draft.allies, ...input.draft.enemies].map((pick) => pick.championId));
  const enemyLaneChampionId = input.draft.enemyLaneChampionId;

  return input.championStats
    .filter((stats) => stats.role === input.draft.playerRole)
    .filter((stats) => !banned.has(stats.championId) && !picked.has(stats.championId))
    .map((stats) => {
      const personal = scoreChampionPerformance(stats);
      const tag = input.championTags.find(
        (candidate) => candidate.championId === stats.championId || candidate.championName === stats.championName
      );
      const matchup = findMatchupScore(stats.championId, enemyLaneChampionId, input.matchups);
      const composition = analyzeTeamComposition(input.draft, input.championTags, tag);
      const allySynergy = calculateAllySynergy(tag, composition);
      const enemyAnswer = calculateEnemyAnswer(tag, input.draft, input.championTags);
      const meta = input.patchMeta?.championScores[stats.championId] ?? 50;
      const blindSafety = (tag?.blindSafety ?? 0.5) * 100;
      const recentForm = personal.components.recent ?? 50;
      const compositionFit = calculateCompositionFit(tag, composition, input.compositionRules);

      const metrics = {
        personalPerformance: personal.score,
        recentForm,
        matchup,
        blindSafety,
        allySynergy,
        enemyDraftAnswer: enemyAnswer,
        compositionFit,
        meta
      };

      const totalScore = round(
        metrics.personalPerformance * weights.personalPerformance +
          metrics.recentForm * weights.recentForm +
          metrics.matchup * weights.matchup +
          metrics.blindSafety * weights.blindSafety +
          metrics.allySynergy * weights.allySynergy +
          metrics.enemyDraftAnswer * weights.enemyDraftAnswer +
          metrics.compositionFit * weights.compositionFit +
          metrics.meta * weights.meta
      );

      const reasons = buildReasons(stats, metrics, composition);
      const warnings = buildWarnings(stats, metrics, composition);

      return {
        championId: stats.championId,
        championName: stats.championName,
        role: stats.role,
        totalScore,
        confidence: personal.confidence,
        category: selectCategory(input.draft, metrics),
        reasons,
        warnings,
        metrics
      } satisfies PickRecommendation;
    })
    .filter((recommendation) => recommendation.metrics.personalPerformance > 0)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, input.limit ?? 5);
}

export function analyzeTeamComposition(
  draft: DraftState,
  championTags: ChampionTag[],
  candidate?: ChampionTag
): TeamComposition {
  const allyNames = draft.allies.map((pick) => pick.championName);
  const tags = championTags.filter((tag) => allyNames.includes(tag.championName));
  if (candidate) tags.push(candidate);

  const average = (key: keyof ChampionTag) =>
    tags.length === 0
      ? 0
      : tags.reduce((sum, tag) => sum + Number(tag[key] ?? 0), 0) / Math.max(1, tags.length);
  const ad = tags.filter((tag) => tag.damageProfile === "AD").length;
  const ap = tags.filter((tag) => tag.damageProfile === "AP").length;
  const damageBalance =
    ad >= 4 ? "AD_HEAVY" : ap >= 4 ? "AP_HEAVY" : ad + ap <= 1 ? "LOW_DAMAGE" : "BALANCED";

  const composition: TeamComposition = {
    damageBalance,
    frontline: average("frontline") * 100,
    engage: average("engage") * 100,
    peel: average("peel") * 100,
    waveclear: average("waveclear") * 100,
    scaling: average("scaling") * 100,
    earlyPressure: average("earlyPressure") * 100,
    risks: [],
    strengths: []
  };

  if (composition.frontline < 35) composition.risks.push("Pouca linha de frente");
  if (composition.engage < 35) composition.risks.push("Engage limitado");
  if (composition.waveclear < 35) composition.risks.push("Wave clear baixo");
  if (composition.damageBalance !== "BALANCED") composition.risks.push("Dano pouco balanceado");
  if (composition.scaling >= 65) composition.strengths.push("Bom scaling");
  if (composition.earlyPressure >= 60) composition.strengths.push("Boa pressão inicial");
  if (composition.peel >= 60) composition.strengths.push("Boa proteção para carregadores");

  return composition;
}

/**
 * 3 tabelas de peso por cenario de draft, cada uma somando 1.0 (testado em
 * recommendation-engine.test.ts) - nao calibradas estatisticamente ainda,
 * julgamento de design sobre o que mais importa em cada situacao (mesma
 * ressalva de `roleBaselines`/`weights` em champion-performance.ts).
 */
export function selectWeights(draft: DraftState): Record<string, number> {
  if (draft.pickOrder <= 1) {
    // Blind pick / first pick: nao ha lane inimiga revelada nem composicao
    // aliada formada ainda, entao matchup/enemyDraftAnswer nao fazem sentido
    // (peso 0). personalPerformance domina (0.45) e blindSafety (0.2) ganha
    // peso alto porque "funciona sem depender do que o inimigo faz" e
    // literalmente a definicao de seguranca em blind.
    return {
      personalPerformance: 0.45,
      blindSafety: 0.2,
      compositionFit: 0.15,
      recentForm: 0.1,
      meta: 0.05,
      allySynergy: 0.05,
      matchup: 0,
      enemyDraftAnswer: 0
    };
  }

  if (draft.enemyLaneChampionId) {
    // Lane inimiga ja revelada: matchup passa a valer (0.25, a segunda maior
    // fatia) porque agora ha dado concreto de "essa campeao vs aquele
    // campeao" pra usar. blindSafety/compositionFit zeram - a composicao
    // ainda pode nao estar formada o suficiente, e "seguranca as cegas" nao
    // e mais o problema relevante quando ja se sabe contra quem se joga.
    return {
      personalPerformance: 0.35,
      matchup: 0.25,
      recentForm: 0.15,
      allySynergy: 0.1,
      enemyDraftAnswer: 0.1,
      meta: 0.05,
      blindSafety: 0,
      compositionFit: 0
    };
  }

  // Nem blind pick nem lane inimiga revelada (ex.: pick do meio do draft sem
  // matchup direto conhecido): enemyDraftAnswer/allySynergy ganham peso
  // (0.2 cada) porque a composicao de ambos os times ja tem mais picks pra
  // reagir/encaixar: o que da pra avaliar aqui e resposta ao draft inimigo
  // como um todo e sinergia com o time aliado, nao mais so seguranca solo.
  return {
    personalPerformance: 0.3,
    enemyDraftAnswer: 0.2,
    allySynergy: 0.2,
    matchup: 0.15,
    recentForm: 0.1,
    meta: 0.05,
    blindSafety: 0,
    compositionFit: 0
  };
}

function findMatchupScore(championId: number, enemyChampionId: number | undefined, matchups: MatchupData[]): number {
  if (!enemyChampionId) return 50;
  return matchups.find((matchup) => matchup.championId === championId && matchup.enemyChampionId === enemyChampionId)?.score ?? 50;
}

// Media simples (pesos iguais 1/3) de engage/peel/waveclear - as 3 tags mais
// diretamente ligadas a "encaixar bem com o time aliado formado ate agora"
// (recommendPicks nao distingue qual delas importa mais em qual composicao).
function calculateAllySynergy(tag: ChampionTag | undefined, composition: TeamComposition): number {
  if (!tag) return 50;
  return round((tag.engage * composition.engage + tag.peel * composition.peel + tag.waveclear * composition.waveclear) / 3);
}

/**
 * pickoff (45) pesa mais que engage (30) e scaling (25) porque "conseguir
 * isolar/eliminar um alvo" e o jeito mais direto de responder a um draft
 * inimigo fragil, enquanto engage/scaling ajudam mas dependem mais do resto
 * do time. O piso `Math.max(0.8, enemyFragility)` evita que o enemyAnswer
 * despenque a quase 0 quando o time inimigo esta bem formado (frontline
 * alto) - mesmo contra um time solido, um pick de resposta ainda tem algum
 * valor, so nao o valor maximo.
 */
function calculateEnemyAnswer(tag: ChampionTag | undefined, draft: DraftState, championTags: ChampionTag[]): number {
  if (!tag || draft.enemies.length === 0) return 50;
  const enemyNames = draft.enemies.map((pick) => pick.championName);
  const enemies = championTags.filter((candidate) => enemyNames.includes(candidate.championName));
  const enemyFragility = enemies.reduce((sum, enemy) => sum + (1 - enemy.frontline), 0) / Math.max(1, enemies.length);
  return round((tag.pickoff * 45 + tag.engage * 30 + tag.scaling * 25) * Math.max(0.8, enemyFragility));
}

/**
 * Base 55 (levemente acima do neutro 50) representa "nenhum problema de
 * composicao a resolver" - ja e um encaixe ok por padrao. Os bonus so se
 * aplicam quando a composicao aliada esta abaixo do minimo de uma regra
 * (`CompositionRules`), e a ordem dos bonus (+25 frontline > +20 engage >
 * +15 waveclear) reflete que frontline ausente e o risco mais critico de
 * composicao (time inteiro fica vulneravel), seguido de engage (sem isso,
 * dificil forcar teamfight) e so depois waveclear (perde-se pra push, mas
 * raramente perde-se o jogo so por isso). +10 fixo de dano balanceado é o
 * bonus mais fraco por ser preferencia de time, nao ausencia critica.
 */
function calculateCompositionFit(
  tag: ChampionTag | undefined,
  composition: TeamComposition,
  rules: CompositionRules
): number {
  if (!tag) return 50;
  let score = 55;
  if (composition.frontline < rules.minimumFrontline) score += tag.frontline * 25;
  if (composition.engage < rules.minimumEngage) score += tag.engage * 20;
  if (composition.waveclear < rules.minimumWaveclear) score += tag.waveclear * 15;
  if (rules.preferDamageBalance && composition.damageBalance !== "BALANCED") score += 10;
  return clamp(score);
}

function buildReasons(
  stats: PlayerChampionStats,
  metrics: PickRecommendation["metrics"],
  composition: TeamComposition
): RecommendationReason[] {
  const reasons: RecommendationReason[] = [
    {
      code: "personal_performance",
      label: "Desempenho pessoal",
      detail: `${stats.championName} tem score pessoal ${round(metrics.personalPerformance)} com ${stats.games} partidas válidas.`,
      impact: metrics.personalPerformance
    }
  ];
  // 70/60: thresholds "bem acima do neutro 50" pra virar reason exibida ao
  // jogador - texto positivo so aparece quando o sinal e forte o bastante
  // pra valer a pena destacar, nao em qualquer valor acima da media.
  if (metrics.blindSafety >= 70) {
    reasons.push({
      code: "blind_safety",
      label: "Seguro para blind pick",
      detail: "O campeão tende a funcionar sem depender de matchup revelada.",
      impact: metrics.blindSafety
    });
  }
  if (metrics.matchup >= 60) {
    reasons.push({
      code: "matchup",
      label: "Boa matchup",
      detail: "Os dados iniciais indicam resposta positiva para a lane revelada.",
      impact: metrics.matchup
    });
  }
  if (composition.strengths.length > 0) {
    reasons.push({
      code: "composition",
      label: "Encaixe de composição",
      detail: `Combina com: ${composition.strengths.join(", ")}.`,
      impact: metrics.compositionFit
    });
  }
  return reasons;
}

function buildWarnings(
  stats: PlayerChampionStats,
  metrics: PickRecommendation["metrics"],
  composition: TeamComposition
): RecommendationReason[] {
  const warnings: RecommendationReason[] = [];
  // Reusa o mesmo piso de "confianca media" de confidenceFromGames (antes
  // desta revisao era um `8` solto duplicado aqui, sem ligacao com a
  // constante - se confidenceFromGames mudasse, esse literal ficaria
  // desalinhado silenciosamente).
  if (stats.games < MEDIUM_CONFIDENCE_GAMES) {
    warnings.push({
      code: "sample_size",
      label: "Amostra pequena",
      detail: "O campeão passou do mínimo de 5 partidas, mas a confiança estatística ainda é baixa.",
      impact: 40
    });
  }
  // 45: abaixo do neutro 50 mas nao tao extremo quanto os cortes de fraqueza
  // de dimension-signals.ts (35) - aqui e so um aviso brando de "forma
  // recente fraca", nao uma fraqueza estrutural do jogador no campeao.
  if (metrics.recentForm < 45) {
    warnings.push({
      code: "recent_form",
      label: "Forma recente fraca",
      detail: "As partidas mais recentes reduzem a segurança desta recomendação.",
      impact: metrics.recentForm
    });
  }
  if (composition.risks.length > 0) {
    warnings.push({
      code: "draft_risk",
      label: "Risco de composição",
      detail: composition.risks.join(", "),
      impact: 50
    });
  }
  return warnings;
}

// Mesmos cortes 70/60 de buildReasons pra best_blind/best_matchup/
// best_teamfit (consistencia: a categoria so reflete um sinal forte o
// bastante pra ja ter virado reason). safe_pick usa um corte mais brando
// (65) porque e a categoria "resultado padrao aceitavel", nao um destaque.
function selectCategory(
  draft: DraftState,
  metrics: PickRecommendation["metrics"]
): PickRecommendation["category"] {
  if (draft.pickOrder <= 1 && metrics.blindSafety >= 70) return "best_blind";
  if (draft.enemyLaneChampionId && metrics.matchup >= 60) return "best_matchup";
  if (metrics.allySynergy >= 60) return "best_teamfit";
  if (metrics.blindSafety >= 65) return "safe_pick";
  return "comfort_pick";
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
