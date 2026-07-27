import { ensureRecommendationMetrics, unavailableCoverage, unknownCoverage } from "@sparta/core";
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


/**
 * Normaliza estatisticas de campeao vindas de uma API anterior a Etapa 4.
 *
 * Regra deliberadamente estreita: so `objectiveParticipation` e convertido.
 * Ali o `0` **e provadamente artificial** - o mapper do Match-V5 nunca
 * preencheu esse campo, entao nenhuma partida jamais teve o dado e a
 * agregacao antiga era obrigada a gravar 0 (medido: 0 de 220 participantes
 * no banco real).
 *
 * `killParticipation: 0` NAO e tocado: ali o zero pode ser participacao zero
 * medida (time com abates, jogador sem participar de nenhum), e nao da pra
 * distinguir os dois casos de fora. Limitacao registrada em
 * `docs/data-provenance.md`.
 *
 * Respostas novas ja trazem `coverage` e passam intactas.
 */
export function ensureChampionStatsCoverage(stats: PlayerChampionStats): PlayerChampionStats {
  if (stats.coverage) return stats;

  const objectiveUnavailable =
    stats.objectiveParticipation === 0 || stats.objectiveParticipation === null || stats.objectiveParticipation === undefined;

  return {
    ...stats,
    killParticipation: stats.killParticipation ?? null,
    objectiveParticipation: objectiveUnavailable ? null : stats.objectiveParticipation,
    coverage: {
      killParticipation:
        stats.killParticipation === null || stats.killParticipation === undefined
          ? unavailableCoverage(stats.games, "A resposta da API não traz participação em abates.")
          : unknownCoverage(stats.games),
      objectiveParticipation: unavailableCoverage(
        stats.games,
        "O Sparta ainda não extrai participação em objetivos de nenhuma fonte."
      )
    }
  };
}

export async function fetchPlayerProfile(gameName: string, tagLine: string) {
  const profile = await request<PlayerProfileResponse>(
    `/players/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}/profile`
  );
  return { ...profile, championStats: (profile.championStats ?? []).map(ensureChampionStatsCoverage) };
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

/**
 * Normaliza a resposta num unico lugar: desktop e API sao implantados
 * separadamente, entao um backend mais antigo pode devolver recomendacao sem
 * `metricDetails`. Sem esta normalizacao a tela quebra (medido durante a
 * Etapa 2). Nenhum componente precisa se defender disso por conta propria.
 */
/**
 * Erro de posição ausente. Existe como classe pra a tela distinguir isto de
 * uma falha de rede - "ainda não sabemos sua posição" não é um erro técnico.
 */
export class PlayerRoleUnavailableError extends Error {
  readonly code = "PLAYER_ROLE_UNAVAILABLE";
  constructor() {
    super("A posição do jogador ainda não foi identificada.");
  }
}

export async function fetchDraftRecommendations(token: string, draft: DraftState) {
  // Proteção central: a requisição não sai sem posição. A API também recusa
  // (422 `PLAYER_ROLE_UNAVAILABLE`), mas uma API anterior a esta etapa
  // aceitaria e usaria MID internamente - barrar aqui não depende de as duas
  // versões andarem juntas.
  if (!draft.playerRole) {
    throw new PlayerRoleUnavailableError();
  }

  const result = await request<{ recommendations: PickRecommendation[] }>("/drafts/recommendations", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ draft })
  });

  return {
    ...result,
    recommendations: (result.recommendations ?? []).map((recommendation) => ({
      ...recommendation,
      metricDetails: ensureRecommendationMetrics(recommendation)
    }))
  };
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

export function fetchSettings(token: string) {
  return request<{ matchAnalysisLimit: number }>("/players/settings", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function updateSettings(token: string, matchAnalysisLimit: number) {
  return request<{ matchAnalysisLimit: number }>("/players/settings", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ matchAnalysisLimit })
  });
}
