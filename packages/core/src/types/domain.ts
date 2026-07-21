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
}

export interface MatchSummary {
  matchId: string;
  puuid: string;
  championId: number;
  championName: string;
  role: Role;
  won: boolean;
  durationSeconds: number;
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
}

export interface PlayerStrength {
  code: string;
  label: string;
  detail: string;
}

export interface ReplayImportJob {
  id: string;
  fileName: string;
  status: "queued" | "not_implemented" | "experimental" | "failed";
  createdAt: string;
}
