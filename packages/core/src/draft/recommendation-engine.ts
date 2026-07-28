import { MEDIUM_CONFIDENCE_GAMES, scoreChampionPerformance } from "../scoring/champion-performance.js";
import { toRecommendationMetrics } from "./recommendation-metrics.js";
import {
  assessExecutionRisk,
  type ExecutionRiskAssessment
} from "./execution-risk.js";
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
import type {
  DraftRecommendationResponse,
  PlayerChampionPoolCandidate,
  RankedPoolRecommendation
} from "../types/player-champion-pool.js";

type MetricKey = keyof PickRecommendation["metrics"];
export type RecommendationWeights = Record<MetricKey, number>;
export type MetricAvailability = Record<MetricKey, boolean>;

/**
 * Remove do score apenas os sinais sem dados e redistribui o peso original
 * entre os sinais restantes. `dataCoverage` continua registrando quanto do
 * modelo previsto realmente participou; normalizar o score não finge que a
 * recomendação teve a mesma evidência.
 */
export function normalizeAvailableWeights(
  weights: RecommendationWeights,
  availability: MetricAvailability
): { normalizedWeights: RecommendationWeights; dataCoverage: number } {
  const dataCoverage = (Object.keys(weights) as MetricKey[]).reduce(
    (sum, key) => sum + (weights[key] > 0 && availability[key] ? weights[key] : 0),
    0
  );

  const normalizedWeights = (Object.keys(weights) as MetricKey[]).reduce((result, key) => {
    result[key] = weights[key] > 0 && availability[key] && dataCoverage > 0 ? weights[key] / dataCoverage : 0;
    return result;
  }, {} as RecommendationWeights);

  return { normalizedWeights, dataCoverage };
}

export function recommendPicks(input: {
  draft: DraftState;
  player: PlayerProfile;
  championStats: PlayerChampionStats[];
  championTags: ChampionTag[];
  matchups: MatchupData[];
  compositionRules: CompositionRules;
  patchMeta: PatchMetaData | null;
  limit?: number;
  evaluatedAt?: string;
}): PickRecommendation[] {
  // Sem posição não há pool, tabela de pesos nem confronto de rota que
  // façam sentido. O motor devolve vazio em vez de escolher um papel: a
  // rota `/drafts/recommendations` barra antes disso com
  // `PLAYER_ROLE_UNAVAILABLE`, e esta guarda garante que nenhum outro
  // chamador consiga rodar o motor com posição ausente.
  const playerRole = input.draft.playerRole;
  if (!playerRole) return [];

  const weights = selectWeights(input.draft);
  const banned = new Set(input.draft.bannedChampionIds);
  const picked = new Set([...input.draft.allies, ...input.draft.enemies].map((pick) => pick.championId));
  const enemyLaneChampionId = input.draft.enemyLaneChampionId;

  return input.championStats
    .filter((stats) => stats.role === playerRole)
    .filter((stats) => !banned.has(stats.championId) && !picked.has(stats.championId))
    .map((stats) => {
      const personal = scoreChampionPerformance(stats);
      const tag = input.championTags.find(
        (candidate) => candidate.championId === stats.championId || candidate.championName === stats.championName
      );
      const personalMatchup = findPersonalMatchup(
        stats.championId,
        enemyLaneChampionId,
        playerRole,
        input.matchups
      );
      const composition = analyzeTeamComposition(input.draft, input.championTags, tag);
      const allySynergy = calculateAllySynergy(tag, composition, input.draft);
      const enemyAnswer = calculateEnemyAnswer(tag, input.draft, input.championTags);
      // PatchMeta ainda não é Meta Intelligence: enquanto não houver fonte
      // estatística observada, a ausência fica null, nunca 50 artificial.
      const meta = null;
      const blindSafety = (tag?.blindSafety ?? 0.5) * 100;
      const recentForm = personal.components.recent ?? 50;
      const compositionFit = calculateCompositionFit(tag, composition, input.compositionRules);
      const executionRisk = assessExecutionRisk({
        difficulty: tag?.officialDifficulty,
        stats,
        role: playerRole,
        evaluatedAt: input.evaluatedAt
      });

      const metrics = {
        personalPerformance: personal.score,
        recentForm,
        matchup: personalMatchup?.score ?? null,
        blindSafety,
        allySynergy,
        enemyDraftAnswer: enemyAnswer,
        compositionFit,
        meta
      };

      const { normalizedWeights, dataCoverage } = normalizeAvailableWeights(weights, {
        personalPerformance: true,
        recentForm: true,
        matchup: personalMatchup !== undefined,
        blindSafety: true,
        allySynergy: true,
        enemyDraftAnswer: true,
        compositionFit: true,
        meta: false
      });
      const baseScore = round(
        (Object.keys(normalizedWeights) as MetricKey[]).reduce(
          (score, key) => score + (metrics[key] ?? 0) * normalizedWeights[key],
          0
        )
      );
      const totalScore = round(clamp(baseScore - executionRisk.scorePenalty));

      const reasons = buildReasons(stats, metrics, composition);
      const warnings = [
        ...buildWarnings(stats, metrics, composition),
        ...buildExecutionRiskWarnings(executionRisk)
      ];

      return {
        championId: stats.championId,
        championName: stats.championName,
        role: stats.role,
        totalScore,
        confidence: personal.confidence,
        dataCoverage,
        category: selectCategory(input.draft, metrics),
        reasons,
        warnings,
        metrics,
        metricDetails: toRecommendationMetrics(metrics, personal.confidence, {
          personalMatchup,
          playerRole,
          enemyLaneKnown: enemyLaneChampionId !== undefined,
          executionRisk
        })
      } satisfies PickRecommendation;
    })
    .filter(
      (recommendation) =>
        recommendation.metrics.personalPerformance !== null &&
        recommendation.metrics.personalPerformance > 0
    )
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, input.limit ?? 5);
}

/**
 * Avalia a união explícita do pool observado/manual. Candidato sem amostra
 * pessoal continua no ranking, mas seus três sinais pessoais ficam ausentes
 * e os pesos restantes são normalizados só para ele.
 */
export function recommendFromPersonalPool(input: {
  draft: DraftState;
  candidates: PlayerChampionPoolCandidate[];
  championStats: PlayerChampionStats[];
  championTags: ChampionTag[];
  matchups: MatchupData[];
  compositionRules: CompositionRules;
  patchMeta: PatchMetaData | null;
  evaluatedAt?: string;
}): DraftRecommendationResponse {
  const role = input.draft.playerRole;
  if (!role) return emptyPoolResponse(0, "A posição do jogador ainda não foi identificada.");

  const deduplicated = new Map<number, PlayerChampionPoolCandidate>();
  for (const candidate of input.candidates) {
    if (!candidate.enabled || candidate.role !== role) continue;
    const current = deduplicated.get(candidate.championId);
    if (!current || candidate.source === "PERSONAL_OBSERVED") {
      deduplicated.set(candidate.championId, { ...candidate });
    }
  }

  const pool = [...deduplicated.values()];
  const banned = new Set(input.draft.bannedChampionIds);
  const picked = new Set(
    [...input.draft.allies, ...input.draft.enemies].map((pick) => pick.championId)
  );
  const evaluable = pool.filter(
    (candidate) => !banned.has(candidate.championId) && !picked.has(candidate.championId)
  );
  const weights = selectWeights(input.draft);
  const enemyLaneChampionId = input.draft.enemyLaneChampionId;

  const ranked = evaluable
    .map((candidate) => {
      const stats = input.championStats.find(
        (entry) => entry.championId === candidate.championId && entry.role === role
      );
      const personal = stats ? scoreChampionPerformance(stats) : undefined;
      const hasPersonalPerformance = personal?.eligible === true;
      const tag = input.championTags.find(
        (entry) =>
          entry.championId === candidate.championId ||
          entry.championName === candidate.championName
      );
      const personalMatchup = stats
        ? findPersonalMatchup(candidate.championId, enemyLaneChampionId, role, input.matchups)
        : undefined;
      const composition = analyzeTeamComposition(input.draft, input.championTags, tag);
      const metrics: PickRecommendation["metrics"] = {
        personalPerformance: hasPersonalPerformance ? personal.score : null,
        recentForm: hasPersonalPerformance ? (personal.components.recent ?? null) : null,
        matchup: personalMatchup?.score ?? null,
        blindSafety: tag ? tag.blindSafety * 100 : null,
        allySynergy: tag ? calculateAllySynergy(tag, composition, input.draft) : null,
        enemyDraftAnswer: tag
          ? calculateEnemyAnswer(tag, input.draft, input.championTags)
          : null,
        compositionFit: tag
          ? calculateCompositionFit(tag, composition, input.compositionRules)
          : null,
        meta: null
      };
      const executionRisk = assessExecutionRisk({
        difficulty: tag?.officialDifficulty,
        stats,
        role,
        evaluatedAt: input.evaluatedAt
      });
      const availability: MetricAvailability = {
        personalPerformance: metrics.personalPerformance !== null,
        recentForm: metrics.recentForm !== null,
        matchup: personalMatchup !== undefined,
        blindSafety: metrics.blindSafety !== null,
        allySynergy: metrics.allySynergy !== null,
        enemyDraftAnswer: metrics.enemyDraftAnswer !== null,
        compositionFit: metrics.compositionFit !== null,
        meta: false
      };
      const { normalizedWeights, dataCoverage } = normalizeAvailableWeights(weights, availability);
      const baseScore = round(
        (Object.keys(normalizedWeights) as MetricKey[]).reduce(
          (score, key) => score + (metrics[key] ?? 0) * normalizedWeights[key],
          0
        )
      );
      const totalScore = round(clamp(baseScore - executionRisk.scorePenalty));
      const personalGames = stats?.games ?? 0;
      const limitations = buildPoolLimitations(
        candidate,
        personalGames,
        hasPersonalPerformance,
        tag !== undefined
      );
      const confidence =
        hasPersonalPerformance && personal ? personal.confidence : undefined;

      return {
        championId: candidate.championId,
        championName: candidate.championName,
        role,
        totalScore,
        confidence,
        dataCoverage,
        category: selectCategory(input.draft, metrics, hasPersonalPerformance),
        reasons: buildPoolReasons(candidate, stats, metrics, composition),
        warnings: [
          ...buildPoolWarnings(limitations, metrics, composition),
          ...buildExecutionRiskWarnings(executionRisk)
        ],
        metrics,
        metricDetails: toRecommendationMetrics(metrics, confidence, {
          personalMatchup,
          playerRole: role,
          enemyLaneKnown: enemyLaneChampionId !== undefined,
          executionRisk
        }),
        rank: 0,
        poolSource: candidate.source,
        poolProvenance: {
          sourceType: candidate.source === "PERSONAL_OBSERVED" ? "OBSERVED" : "USER_PROVIDED",
          sourceId:
            candidate.source === "PERSONAL_OBSERVED" ? "riot-match-v5" : "sparta-user-pool",
          resource:
            candidate.source === "PERSONAL_OBSERVED"
              ? "MatchObservation"
              : "PlayerChampionPoolEntry",
          position: role,
          sampleSize: personalGames,
          status: "AVAILABLE"
        },
        personalGames,
        limitations
      } satisfies RankedPoolRecommendation;
    })
    .sort((left, right) => right.totalScore - left.totalScore || left.championId - right.championId)
    .map((recommendation, index) => ({ ...recommendation, rank: index + 1 }));

  const primaryRecommendations = ranked.slice(0, 5);
  const alternatives = ranked.slice(5, 8);
  const shortage = ranked.length < 5 ? 5 - ranked.length : 0;
  const roleName: Record<NonNullable<DraftState["playerRole"]>, string> = {
    TOP: "Top",
    JUNGLE: "Jungle",
    MID: "Mid",
    ADC: "ADC",
    SUPPORT: "Suporte"
  };
  return {
    primaryRecommendations,
    alternatives,
    poolSummary: {
      totalCandidates: pool.length,
      evaluatedCandidates: ranked.length,
      primaryCount: primaryRecommendations.length,
      alternativeCount: alternatives.length,
      status: ranked.length === 0 ? "UNAVAILABLE" : shortage > 0 ? "PARTIAL" : "AVAILABLE",
      ...(shortage > 0
        ? {
            shortageReason: `Seu pool de ${roleName[role]} possui ${ranked.length} candidato(s) disponível(is). Adicione pelo menos mais ${shortage} para receber cinco recomendações.`
          }
        : {})
    }
  };
}

function emptyPoolResponse(totalCandidates: number, shortageReason: string): DraftRecommendationResponse {
  return {
    primaryRecommendations: [],
    alternatives: [],
    poolSummary: {
      totalCandidates,
      evaluatedCandidates: 0,
      primaryCount: 0,
      alternativeCount: 0,
      status: "UNAVAILABLE",
      shortageReason
    }
  };
}

function buildPoolReasons(
  candidate: PlayerChampionPoolCandidate,
  stats: PlayerChampionStats | undefined,
  metrics: PickRecommendation["metrics"],
  composition: TeamComposition
): RecommendationReason[] {
  const reasons: RecommendationReason[] = [
    candidate.source === "PERSONAL_OBSERVED"
      ? {
          code: "pool_observed",
          label: "Experiência observada",
          detail: `${stats?.games ?? 0} partida(s) observadas nesta posição.`,
          impact: stats?.games ?? 0
        }
      : {
          code: "pool_user_provided",
          label: "Adicionado ao pool",
          detail: "Adicionado manualmente ao seu pool.",
          impact: 0
        }
  ];
  if (metrics.personalPerformance !== null && stats) {
    reasons.push({
      code: "personal_performance",
      label: "Desempenho pessoal",
      detail: `${stats.championName} tem score pessoal ${round(metrics.personalPerformance)} com ${stats.games} partidas válidas.`,
      impact: metrics.personalPerformance
    });
  }
  if (metrics.blindSafety !== null && metrics.blindSafety >= 70) {
    reasons.push({
      code: "blind_safety",
      label: "Seguro para blind pick",
      detail: "O perfil derivado indica boa segurança para blind pick.",
      impact: metrics.blindSafety
    });
  }
  if (metrics.matchup !== null && metrics.matchup >= 60) {
    reasons.push({
      code: "matchup",
      label: "Boa matchup pessoal",
      detail: "O histórico pessoal indica resposta positiva para a lane revelada.",
      impact: metrics.matchup
    });
  }
  if (metrics.compositionFit !== null && composition.strengths.length > 0) {
    reasons.push({
      code: "composition",
      label: "Encaixe de composição",
      detail: `Combina com: ${composition.strengths.join(", ")}.`,
      impact: metrics.compositionFit
    });
  }
  return reasons;
}

function buildPoolLimitations(
  candidate: PlayerChampionPoolCandidate,
  personalGames: number,
  hasPersonalPerformance: boolean,
  hasStrategicProfile: boolean
): string[] {
  const limitations: string[] = [];
  if (!hasPersonalPerformance && personalGames === 0) {
    limitations.push(
      candidate.source === "USER_PROVIDED"
        ? "Sem histórico pessoal nesta posição; candidato adicionado manualmente."
        : "Sem amostra pessoal suficiente para calcular desempenho nesta posição."
    );
  } else if (!hasPersonalPerformance) {
    limitations.push(
      `${personalGames} partida(s) observada(s); amostra insuficiente para calcular desempenho pessoal.`
    );
  }
  if (!hasStrategicProfile) {
    limitations.push(
      "Perfil estratégico do campeão indisponível; sinais de composição não foram calculados."
    );
  }
  return limitations;
}

function buildPoolWarnings(
  limitations: string[],
  metrics: PickRecommendation["metrics"],
  composition: TeamComposition
): RecommendationReason[] {
  const warnings = limitations.map((detail) => ({
    code: "personal_coverage",
    label: "Análise pessoal limitada",
    detail,
    impact: 0
  }));
  if (metrics.recentForm !== null && metrics.recentForm < 45) {
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

function buildExecutionRiskWarnings(
  assessment: ExecutionRiskAssessment
): RecommendationReason[] {
  if (
    assessment.scorePenalty <= 0 ||
    assessment.riskMetric.value === null ||
    !assessment.riskMetric.explanation
  ) {
    return [];
  }
  return [
    {
      code: "execution_risk",
      label: "Risco pessoal estimado",
      detail: assessment.riskMetric.explanation,
      impact: -assessment.scorePenalty
    }
  ];
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

  // Rotulos de risco/forca sao afirmacoes sobre o TIME. Sem nenhum aliado
  // escolhido, `tags` tem so o proprio candidato - dizer "pouca linha de
  // frente" ali seria descrever o campeao e apresentar como leitura de
  // composicao. Os numeros continuam calculados (compositionFit usa), mas
  // as frases so aparecem quando existe composicao pra ler.
  if (draft.allies.length > 0) {
    if (composition.frontline < 35) composition.risks.push("Pouca linha de frente");
    if (composition.engage < 35) composition.risks.push("Engage limitado");
    if (composition.waveclear < 35) composition.risks.push("Wave clear baixo");
    if (composition.damageBalance !== "BALANCED") composition.risks.push("Dano pouco balanceado");
    if (composition.scaling >= 65) composition.strengths.push("Bom scaling");
    if (composition.earlyPressure >= 60) composition.strengths.push("Boa pressão inicial");
    if (composition.peel >= 60) composition.strengths.push("Boa proteção para carregadores");
  }

  return composition;
}

/**
 * 3 tabelas de peso por cenario de draft, cada uma somando 1.0 (testado em
 * recommendation-engine.test.ts) - nao calibradas estatisticamente ainda,
 * julgamento de design sobre o que mais importa em cada situacao (mesma
 * ressalva de `roleBaselines`/`weights` em champion-performance.ts).
 */
export function selectWeights(draft: DraftState): RecommendationWeights {
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

function findPersonalMatchup(
  championId: number,
  enemyChampionId: number | undefined,
  role: DraftState["playerRole"],
  matchups: MatchupData[]
): MatchupData | undefined {
  if (!enemyChampionId) return undefined;
  return matchups.find(
    (matchup) =>
      matchup.championId === championId && matchup.enemyChampionId === enemyChampionId && matchup.role === role
  );
}

/**
 * Encaixe do campeao COM OS ALIADOS ja escolhidos: media simples (pesos
 * iguais 1/3) de engage/peel/waveclear contra os mesmos eixos do time.
 *
 * Sem nenhum aliado conhecido devolve o neutro 50, mesma convencao de
 * `calculateEnemyAnswer` com o time inimigo vazio. Sem essa guarda o
 * calculo degenera: `analyzeTeamComposition` passa a descrever so o
 * proprio candidato, e a formula vira `100*(e² + p² + w²)/3`, que nunca
 * passa de 33 - ou seja, TODO first pick levaria uma penalidade que nao
 * diz nada sobre o campeao. Isso ficou invisivel enquanto quase nenhum
 * campeao tinha `ChampionTag` (sem tag a funcao ja retornava 50); passou a
 * valer pra todo mundo quando a tabela cobriu o roster inteiro.
 */
function calculateAllySynergy(
  tag: ChampionTag | undefined,
  composition: TeamComposition,
  draft: DraftState
): number {
  if (!tag || draft.allies.length === 0) return 50;
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
  const reasons: RecommendationReason[] = [];
  if (metrics.personalPerformance !== null) {
    reasons.push({
      code: "personal_performance",
      label: "Desempenho pessoal",
      detail: `${stats.championName} tem score pessoal ${round(metrics.personalPerformance)} com ${stats.games} partidas válidas.`,
      impact: metrics.personalPerformance
    });
  }
  // 70/60: thresholds "bem acima do neutro 50" pra virar reason exibida ao
  // jogador - texto positivo so aparece quando o sinal e forte o bastante
  // pra valer a pena destacar, nao em qualquer valor acima da media.
  if (metrics.blindSafety !== null && metrics.blindSafety >= 70) {
    reasons.push({
      code: "blind_safety",
      label: "Seguro para blind pick",
      detail: "O campeão tende a funcionar sem depender de matchup revelada.",
      impact: metrics.blindSafety
    });
  }
  if (metrics.matchup !== null && metrics.matchup >= 60) {
    reasons.push({
      code: "matchup",
      label: "Boa matchup",
      detail: "Os dados iniciais indicam resposta positiva para a lane revelada.",
      impact: metrics.matchup
    });
  }
  if (metrics.compositionFit !== null && composition.strengths.length > 0) {
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
  if (metrics.recentForm !== null && metrics.recentForm < 45) {
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
  metrics: PickRecommendation["metrics"],
  hasPersonalPerformance = true
): PickRecommendation["category"] {
  if (
    draft.pickOrder <= 1 &&
    metrics.blindSafety !== null &&
    metrics.blindSafety >= 70
  ) {
    return "best_blind";
  }
  if (draft.enemyLaneChampionId && metrics.matchup !== null && metrics.matchup >= 60) return "best_matchup";
  if (metrics.allySynergy !== null && metrics.allySynergy >= 60) {
    return "best_teamfit";
  }
  if (metrics.blindSafety !== null && metrics.blindSafety >= 65) {
    return "safe_pick";
  }
  return hasPersonalPerformance ? "comfort_pick" : "strategic_option";
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
