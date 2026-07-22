import type {
  ChampionPerformanceScore,
  DraftState,
  GrowthJourney,
  PickRecommendation,
  PlayerChampionStats,
  PlayerStrength,
  PlayerWeakness,
  PostGameAnalysis,
  RecentChampionMatch,
  RecentForm,
  Role
} from "@sparta/core";

export const SESSION_TOKEN_KEY = "sparta:token";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export interface SessionUser {
  id: string;
  email: string | null;
  displayName: string | null;
}

export interface PlayerProfileResponse {
  id: string;
  account: RiotAccountSummary;
  preferredRoles: Role[];
  championStats: PlayerChampionStats[];
  strengths: PlayerStrength[];
  weaknesses: PlayerWeakness[];
  recentForm: RecentForm;
}

export interface RiotAccountSummary {
  puuid: string;
  gameName: string;
  tagLine: string;
  platformRegion: string;
  regionalRouting: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? String(body.error) : "Falha na requisicao.";
    throw new ApiError(message, response.status);
  }

  return body as T;
}

export function register(input: { email: string; password: string; displayName?: string }) {
  return request<{ token: string; user: SessionUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function login(input: { email: string; password: string }) {
  return request<{ token: string; user: SessionUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function fetchSession(token: string) {
  return request<{ user: SessionUser; riotAccounts: RiotAccountSummary[] }>("/auth/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function linkRiotAccount(
  token: string,
  input: { gameName: string; tagLine: string; platformRegion?: string; regionalRouting?: string }
) {
  return request<{ riotAccount: RiotAccountSummary }>("/players/link-riot-account", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
  });
}

export function fetchPlayerProfile(gameName: string, tagLine: string) {
  return request<PlayerProfileResponse>(`/players/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}/profile`);
}

export function fetchChampionPerformance(puuid: string) {
  return request<{ puuid: string; champions: ChampionPerformanceScore[] }>(
    `/players/${encodeURIComponent(puuid)}/champion-performance`
  );
}

export function fetchRecentMatches(puuid: string, limit = 10) {
  return request<{ puuid: string; matches: RecentChampionMatch[] }>(
    `/players/${encodeURIComponent(puuid)}/recent-matches?limit=${limit}`
  );
}

export function fetchGrowthJourney(puuid: string) {
  return request<{ puuid: string } & GrowthJourney>(`/players/${encodeURIComponent(puuid)}/growth-journey`);
}

export function fetchDraftRecommendations(token: string, draft: DraftState) {
  return request<{ recommendations: PickRecommendation[] }>("/drafts/recommendations", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ draft })
  });
}

export function analyzePostgame(token: string, matchId: string) {
  return request<PostGameAnalysis>("/postgame/analyze", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ matchId })
  });
}

export function fetchPostgameReport(token: string, matchId: string) {
  return request<PostGameAnalysis>(`/postgame/${encodeURIComponent(matchId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}
