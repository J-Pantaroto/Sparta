import { ensureRecommendationMetrics, unavailableCoverage, unknownCoverage } from "@sparta/core";
import {
  ExternalServiceError,
  HTTP_TIMEOUTS,
  fetchWithPolicy,
  publicMessageForExternalError
} from "@sparta/riot/http";
import type {
  ChampionPerformanceScore,
  DraftState,
  GrowthJourney,
  MatchLoadoutObservation,
  PickRecommendation,
  PlayerChampionStats,
  PlayerStrength,
  PlayerWeakness,
  PostGameAnalysis,
  PreGameAnalysis,
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
    public readonly status: number,
    /** Corpo da resposta, pra quem precisa do `code` estruturado do 422. */
    public readonly payload?: unknown,
    public readonly code?: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithPolicy(`${API_BASE_URL}${path}`, {
    integration: "SPARTA_API",
    timeoutMs: HTTP_TIMEOUTS.spartaApiMs,
    idempotent: (options.method ?? "GET").toUpperCase() === "GET",
    throwOnHttpError: false,
    request: {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    }
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new ExternalServiceError({
      code: "UPSTREAM_INVALID_RESPONSE",
      integration: "SPARTA_API",
      message: publicMessageForExternalError("UPSTREAM_INVALID_RESPONSE"),
      status: response.status,
      temporary: false,
      retryable: false,
      cause
    });
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : body && typeof body === "object" && "message" in body
          ? String((body as { message: unknown }).message)
          : "Falha na requisicao.";
    const code =
      body && typeof body === "object" && "code" in body && typeof (body as { code?: unknown }).code === "string"
        ? (body as { code: string }).code
        : undefined;
    throw new ApiError(message, response.status, body, code);
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

/**
 * Erro de campeão não confirmado. Mesmo motivo do anterior: "você ainda não
 * confirmou um campeão" é estado natural do draft, não falha técnica.
 */
export class SelectedChampionUnavailableError extends Error {
  readonly code = "SELECTED_CHAMPION_UNAVAILABLE";
  constructor(message = "Nenhum campeão foi confirmado para esta partida.") {
    super(message);
  }
}

/**
 * Resposta anterior à Etapa 7: quatro listas de frases fixas, iguais em toda
 * partida. Reconhecida **só** pra ser recusada - apresentá-la seria mostrar
 * texto genérico como se fosse análise do draft atual.
 */
function isLegacyPreGameResponse(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return true;
  const candidate = payload as Partial<PreGameAnalysis> & { winCondition?: unknown };
  return candidate.algorithmVersion === undefined || candidate.summary === undefined;
}

export class PreGameAnalysisIncompatibleError extends Error {
  readonly code = "PRE_GAME_ANALYSIS_INCOMPATIBLE";
  constructor() {
    super("Análise contextual indisponível nesta versão da API.");
  }
}

export async function fetchPreGameAnalysis(token: string, draft: DraftState) {
  // Mesma proteção dupla das recomendações: os pré-requisitos são checados
  // antes de sair a requisição, e a API os recusa de novo com 422.
  if (!draft.playerRole) throw new PlayerRoleUnavailableError();
  if (draft.selectedChampionId === undefined) throw new SelectedChampionUnavailableError();

  let payload: unknown;
  try {
    payload = await request<unknown>("/drafts/pre-game-analysis", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ draft })
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      const code = (error.payload as { code?: string } | undefined)?.code;
      if (code === "PLAYER_ROLE_UNAVAILABLE") throw new PlayerRoleUnavailableError();
      if (code === "SELECTED_CHAMPION_UNAVAILABLE") {
        throw new SelectedChampionUnavailableError((error.payload as { message?: string } | undefined)?.message);
      }
    }
    throw error;
  }

  if (isLegacyPreGameResponse(payload)) throw new PreGameAnalysisIncompatibleError();
  return payload as PreGameAnalysis;
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

export function fetchMatchObservation(token: string, matchId: string) {
  return request<MatchLoadoutObservation>(`/matches/${encodeURIComponent(matchId)}/observation`, {
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
