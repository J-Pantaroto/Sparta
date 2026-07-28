import type { PickRecommendation, Role } from "./domain.js";
import type { AvailabilityStatus, DataProvenance } from "./provenance.js";

export type PlayerChampionPoolSource = "PERSONAL_OBSERVED" | "USER_PROVIDED";

export interface PlayerChampionPoolEntry {
  playerId: string;
  championId: number;
  championName: string;
  role: Role;
  source: PlayerChampionPoolSource;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  provenance: DataProvenance;
}

export interface PlayerChampionPoolCandidate {
  championId: number;
  championName: string;
  role: Role;
  source: PlayerChampionPoolSource;
  enabled: boolean;
}

export interface RankedPoolRecommendation extends PickRecommendation {
  rank: number;
  poolSource: PlayerChampionPoolSource;
  poolProvenance: DataProvenance;
  personalGames: number;
  limitations: string[];
  /**
   * Pesos depois da normalização por disponibilidade, exatamente os que
   * produziram `totalScore`. Exposto na Etapa 16 para o snapshot poder
   * preservar como a nota foi formada - **nenhum cálculo mudou**, o valor já
   * existia dentro do motor e só não saía.
   */
  effectiveWeights: Record<string, number>;
}

export interface RecommendationPoolSummary {
  totalCandidates: number;
  evaluatedCandidates: number;
  primaryCount: number;
  alternativeCount: number;
  status: AvailabilityStatus;
  shortageReason?: string;
}

export interface DraftRecommendationResponse {
  primaryRecommendations: RankedPoolRecommendation[];
  alternatives: RankedPoolRecommendation[];
  poolSummary: RecommendationPoolSummary;
}

export interface PlayerChampionPoolRoleSummary {
  role: Role;
  enabledCandidates: number;
  observedCandidates: number;
  userProvidedCandidates: number;
}
