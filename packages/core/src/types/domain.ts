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
  killParticipation: number;
  objectiveParticipation: number;
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
  killParticipation: number;
  objectiveParticipation: number;
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
  deathsBefore10: number;
  deathsBefore15: number;
  csAt10: number;
  csAt15: number;
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
  metrics: {
    personalPerformance: number;
    recentForm: number;
    matchup: number;
    blindSafety: number;
    allySynergy: number;
    enemyDraftAnswer: number;
    compositionFit: number;
    meta: number;
  };
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
