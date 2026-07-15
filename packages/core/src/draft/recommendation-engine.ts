import { scoreChampionPerformance } from "../scoring/champion-performance.js";
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

function selectWeights(draft: DraftState): Record<string, number> {
  if (draft.pickOrder <= 1) {
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

function calculateAllySynergy(tag: ChampionTag | undefined, composition: TeamComposition): number {
  if (!tag) return 50;
  return round((tag.engage * composition.engage + tag.peel * composition.peel + tag.waveclear * composition.waveclear) / 3);
}

function calculateEnemyAnswer(tag: ChampionTag | undefined, draft: DraftState, championTags: ChampionTag[]): number {
  if (!tag || draft.enemies.length === 0) return 50;
  const enemyNames = draft.enemies.map((pick) => pick.championName);
  const enemies = championTags.filter((candidate) => enemyNames.includes(candidate.championName));
  const enemyFragility = enemies.reduce((sum, enemy) => sum + (1 - enemy.frontline), 0) / Math.max(1, enemies.length);
  return round((tag.pickoff * 45 + tag.engage * 30 + tag.scaling * 25) * Math.max(0.8, enemyFragility));
}

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
  if (stats.games < 8) {
    warnings.push({
      code: "sample_size",
      label: "Amostra pequena",
      detail: "O campeão passou do mínimo de 5 partidas, mas a confiança estatística ainda é baixa.",
      impact: 40
    });
  }
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
