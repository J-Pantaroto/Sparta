import type { AvailabilityStatus } from "./provenance.js";
import type { RecommendationMetric } from "./recommendation-metric.js";

export type Role = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";
export type Confidence = "low" | "medium" | "high";
export type DamageProfile = "AD" | "AP" | "MIXED" | "UTILITY";

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
  platformRegion: string;
  regionalRouting: string;
}

export interface PlayerProfile {
  id: string;
  account: RiotAccount;
  preferredRoles: Role[];
  championStats: PlayerChampionStats[];
  strengths: PlayerStrength[];
  weaknesses: PlayerWeakness[];
  recentForm: RecentForm;
}

export interface Champion {
  id: number;
  key: string;
  name: string;
  roles: Role[];
}

export interface ChampionTag {
  championId?: number;
  championName: string;
  roles: Role[];
  damageProfile: DamageProfile;
  tags: string[];
  blindSafety: number;
  difficulty: number;
  engage: number;
  peel: number;
  frontline: number;
  pickoff: number;
  waveclear: number;
  scaling: number;
  earlyPressure: number;
}

/**
 * Cobertura de um campo agregado que pode faltar em parte das partidas.
 *
 * Existe porque "média 0,42 sobre 12 partidas" e "média 0,42 sobre 3 das 12"
 * não são a mesma afirmação, e até a Etapa 4 as duas saíam idênticas. Usa o
 * mesmo `AvailabilityStatus` do contrato da Etapa 2 - não é um segundo
 * mecanismo de disponibilidade, é o mesmo aplicado a agregação.
 */
export interface StatCoverage {
  /** Partidas consideradas no contexto da agregação. */
  sampleSize: number;
  /**
   * Partidas que realmente tinham o dado. `null` significa cobertura
   * desconhecida - linha gravada antes desta contagem existir, não zero.
   */
  availableSampleSize: number | null;
  status: AvailabilityStatus;
  /** Por que está indisponível ou parcial. Ausente quando é AVAILABLE. */
  reason?: string;
}

export interface PlayerChampionStats {
  championId: number;
  championName: string;
  role: Role;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  csPerMinute: number;
  goldPerMinute: number;
  damagePerMinute: number;
  visionScorePerMinute: number;
  /**
   * Média sobre as partidas que **tinham** o dado (`challenges` da Riot,
   * ausente em patches antigos). `null` quando nenhuma tinha - `0` aqui
   * significa participação zero de verdade, medida.
   */
  killParticipation: number | null;
  /**
   * Sempre `null` hoje: o Sparta não extrai participação em objetivos de
   * nenhuma fonte (o mapper do Match-V5 nunca preencheu o campo). Antes da
   * Etapa 4 isso virava `0` e entrava no score de JUNGLE/SUPPORT como se
   * o jogador não tivesse participado de objetivo nenhum.
   */
  objectiveParticipation: number | null;
  /** Cobertura dos dois campos acima. */
  coverage: {
    killParticipation: StatCoverage;
    objectiveParticipation: StatCoverage;
  };
  recentMatches: RecentChampionMatch[];
}

export interface RecentChampionMatch {
  matchId: string;
  championId: number;
  role: Role;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  csPerMinute: number;
  goldPerMinute: number;
  damagePerMinute: number;
  visionScorePerMinute: number;
  /** `null` quando a partida não trouxe o dado - nunca coagido pra 0. */
  killParticipation: number | null;
  objectiveParticipation: number | null;
}

export interface RecentForm {
  last10Score: number;
  last20Score: number;
  last50Score: number;
  trend: "improving" | "stable" | "declining";
  confidence: Confidence;
}

export interface MatchSummary {
  matchId: string;
  puuid: string;
  championId: number;
  championName: string;
  role: Role;
  won: boolean;
  durationSeconds: number;
  // Epoch ms de inicio da partida (Riot gameStartTimestamp) - usado pra
  // ordenar por recencia (forma recente depende de saber qual partida e
  // mais nova).
  startedAt: number;
  patch: string;
  metrics: MatchPerformanceMetrics;
}

export interface MatchPerformanceMetrics {
  kills: number;
  deaths: number;
  assists: number;
  csPerMinute: number;
  goldPerMinute: number;
  damagePerMinute: number;
  visionScorePerMinute: number;
  // Vem do objeto "challenges" do Match-V5, ausente em patches antigos -
  // fica undefined em vez de inventar um valor quando a Riot nao fornece.
  killParticipation?: number;
  objectiveParticipation?: number;
  deathsBefore10?: number;
  deathsBefore15?: number;
  csAt10?: number;
  csAt15?: number;
}

export interface MatchTimelineSummary {
  matchId: string;
  /**
   * Contagem direta de eventos da timeline: `0` significa "não morreu", e é
   * sempre calculável quando a timeline existe.
   */
  deathsBefore10: number;
  deathsBefore15: number;
  /**
   * CS no minuto correspondente. Ausente quando a partida não chegou nesse
   * minuto ou o frame não traz o participante - antes da Etapa 4 esse caso
   * virava `0`, indistinguível de "não farmou nada".
   */
  csAt10?: number;
  csAt15?: number;
  goldDiffAt15?: number;
  objectiveEvents: string[];
}

export interface DraftPick {
  championId: number;
  championName: string;
  role: Role;
  team: "ally" | "enemy";
  isPlayer?: boolean;
}

export interface DraftState {
  playerRole: Role;
  pickOrder: number;
  allies: DraftPick[];
  enemies: DraftPick[];
  bannedChampionIds: number[];
  enemyLaneChampionId?: number;
  selectedChampionId?: number;
  patch?: string;
}

export interface TeamComposition {
  damageBalance: "AD_HEAVY" | "AP_HEAVY" | "BALANCED" | "LOW_DAMAGE";
  frontline: number;
  engage: number;
  peel: number;
  waveclear: number;
  scaling: number;
  earlyPressure: number;
  risks: string[];
  strengths: string[];
}

export interface MatchupData {
  championId: number;
  enemyChampionId: number;
  role: Role;
  score: number;
  sampleSize?: number;
  confidence: Confidence;
}

export interface CompositionRules {
  minimumFrontline: number;
  minimumEngage: number;
  minimumWaveclear: number;
  preferDamageBalance: boolean;
}

export interface PatchMetaData {
  patch: string;
  championScores: Record<number, number>;
}

export interface RecommendationReason {
  code: string;
  label: string;
  detail: string;
  impact: number;
}

export interface PickRecommendation {
  championId: number;
  championName: string;
  role: Role;
  totalScore: number;
  confidence: Confidence;
  category: "best_blind" | "best_matchup" | "best_teamfit" | "safe_pick" | "comfort_pick";
  reasons: RecommendationReason[];
  warnings: RecommendationReason[];
  /**
   * Fração (0-1) dos pesos originalmente ativos que tinha dados para este
   * candidato. É cobertura do modelo, não confiança estatística.
   */
  dataCoverage: number;
  /**
   * Entrada numérica do `totalScore`. Continua sendo o que os pesos
   * multiplicam - **não** é o que a interface deve exibir, porque um número
   * aqui não distingue "calculou neutro" de "não temos o dado". Use
   * `metricDetails` pra apresentar.
   */
  metrics: {
    personalPerformance: number;
    recentForm: number;
    matchup: number | null;
    blindSafety: number;
    allySynergy: number;
    enemyDraftAnswer: number;
    compositionFit: number;
    meta: number | null;
  };
  /**
   * Métricas estruturadas **deste candidato**: cada uma com a própria
   * disponibilidade, confiança e proveniência. É o contrato que a interface
   * consome, e é por candidato de propósito - dois campeões podem ter
   * disponibilidades diferentes pra mesma métrica.
   */
  metricDetails: RecommendationMetric[];
}

export interface PostGameAnalysis {
  matchId: string;
  expectedPlan: string;
  executionSummary: string;
  pickAssessment: string;
  strengths: PlayerStrength[];
  weaknesses: PlayerWeakness[];
  tips: string[];
  metrics: MatchPerformanceMetrics;
}

export interface PlayerWeakness {
  code: string;
  label: string;
  detail: string;
  severity: "low" | "medium" | "high";
  confidence: Confidence;
}

export interface PlayerStrength {
  code: string;
  label: string;
  detail: string;
  confidence: Confidence;
}

export interface ReplayImportJob {
  id: string;
  fileName: string;
  status: "queued" | "not_implemented" | "experimental" | "failed";
  createdAt: string;
}

export interface WeaknessTrend {
  code: string;
  label: string;
  recentRate: number;
  previousRate: number;
  trend: "improving" | "worsening" | "stable" | "new" | "resolved";
  confidence: Confidence;
  // false quando ainda nao existe um segundo bloco de partidas antigas
  // suficiente pra comparar (blockB abaixo do piso minimo) - nesse caso
  // `trend` fica forcado em "stable" mas isso significa "ainda nao da pra
  // saber", nao "sem mudanca" - o consumidor deve tratar esses dois casos
  // de forma diferente em vez de mostrar "estavel" como se fosse um
  // veredito real.
  hasComparison: boolean;
}

export interface GrowthJourney {
  weaknessTrends: WeaknessTrend[];
  matchesAnalyzed: number;
}

/**
 * Perfil de classe de um campeao vindo direto da Data Dragon (`tags`/`info`
 * do `champion.json`) - dado real da Riot, disponivel pros ~170 campeoes,
 * usado pelo motor de build (Fase 8) em vez da tabela curada `ChampionTag`
 * (que so tem 2 campeoes seedados hoje e nao cobriria um time inimigo
 * inteiro de campeoes quaisquer).
 */
export interface ChampionClassProfile {
  championId: number;
  championName: string;
  tags: string[];
  attack: number;
  defense: number;
  magic: number;
  difficulty: number;
}

export interface ItemSummary {
  itemId: number;
  name: string;
  tags: string[];
  goldTotal: number;
  depth?: number;
  /** IDs dos itens em que este evolui - ausente/vazio significa "item final", sinal usado pra priorizar itens completos na build. */
  into?: string[];
}

export interface RecommendedItem {
  itemId: number;
  name: string;
  reason: string;
}

export interface BuildRecommendation {
  boots: RecommendedItem | undefined;
  coreItems: RecommendedItem[];
  situationalItems: RecommendedItem[];
  reasons: RecommendationReason[];
  warnings: RecommendationReason[];
}
