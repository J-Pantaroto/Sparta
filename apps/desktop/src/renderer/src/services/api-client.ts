import {
  ensureRecommendationMetrics,
  unavailableCoverage,
  unavailablePersonalLoadoutEvidence,
  unknownCoverage
} from "@sparta/core";
import {
  ExternalServiceError,
  HTTP_TIMEOUTS,
  fetchWithPolicy,
  publicMessageForExternalError
} from "@sparta/riot/http";
import type {
  ChampionPerformanceScore,
  AccountOnboardingStatus,
  DraftState,
  DraftRecommendationResponse,
  DraftPostGameComparison,
  GlobalChampionRoleEligibility,
  GrowthJourney,
  MatchLoadoutObservation,
  MatchParticipantsOverview,
  LongitudinalRecommendationReport,
  LongitudinalReportFilters,
  PatchRelease,
  PatchReleaseSummary,
  PersonalLoadoutEvidence,
  PickRecommendation,
  PlayerProfileOverview,
  ProfileRecentMatch,
  PlayerChampionPoolEntry,
  PlayerChampionPoolRoleSummary,
  PlayerChampionRoleEvidence,
  PlayerChampionStats,
  PlayerStrength,
  PlayerWeakness,
  PostGameAnalysis,
  PreGameAnalysis,
  RecentChampionMatch,
  RecentForm,
  Role,
  TheoreticalPatchImpactCollection
} from "@sparta/core";

export const SESSION_EXPIRED_EVENT = "sparta:session-expired";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export interface SessionUser {
  id: string;
  email: string | null;
  displayName: string | null;
  emailVerifiedAt: string | null;
  isActive: boolean;
}

export interface PlayerProfileResponse {
  id: string;
  account: RiotAccountSummary;
  preferredRoles: Role[];
  observedRoles?: Role[];
  championStats: PlayerChampionStats[];
  strengths: PlayerStrength[];
  weaknesses: PlayerWeakness[];
  recentForm: RecentForm;
}

export interface ChampionRoleEvidenceResponse {
  personalRoleEvidence: PlayerChampionRoleEvidence;
  globalRoleEligibility: GlobalChampionRoleEligibility;
  scope: {
    patches?: string[];
    queueIds?: number[];
    playedAtFrom?: string;
    playedAtTo?: string;
    gameModes?: string[];
    gameTypes?: string[];
  };
}

export interface RiotAccountSummary {
  puuid: string;
  gameName: string;
  tagLine: string;
  platformRegion: string;
  regionalRouting: string;
  linkStatus: string;
  verifiedAt: string | null;
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
  // `Content-Type: application/json` só quando existe corpo de fato.
  //
  // Anunciar JSON sem enviar nada faz o Fastify recusar a requisição com
  // `FST_ERR_CTP_EMPTY_JSON_BODY` (400) **antes** de a rota rodar — o
  // content-type é uma descrição do corpo, e sem corpo não há o que
  // descrever. Esse defeito já apareceu três vezes neste cliente
  // (`verifySnapshotReplay` na Etapa 26b, `validateRelease` na 27c, e as
  // duas ocorrências restantes corrigidas aqui); tratá-lo no ponto central
  // elimina a classe inteira em vez de cada caso.
  const hasBody = options.body !== undefined && options.body !== null;
  const response = await fetchWithPolicy(`${API_BASE_URL}${path}`, {
    integration: "SPARTA_API",
    timeoutMs: HTTP_TIMEOUTS.spartaApiMs,
    idempotent: (options.method ?? "GET").toUpperCase() === "GET",
    throwOnHttpError: false,
    request: {
      ...options,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    }
  });
  let body: unknown;
  try {
    body = response.status === 204 ? undefined : await response.json();
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
    if (response.status === 401 && new globalThis.Headers(options.headers).has("Authorization")) {
      globalThis.dispatchEvent(new globalThis.Event(SESSION_EXPIRED_EVENT));
    }
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : body && typeof body === "object" && "message" in body
          ? String((body as { message: unknown }).message)
          : "Falha na requisicao.";
    const code =
      body &&
      typeof body === "object" &&
      "code" in body &&
      typeof (body as { code?: unknown }).code === "string"
        ? (body as { code: string }).code
        : undefined;
    throw new ApiError(message, response.status, body, code);
  }

  return body as T;
}

export function register(input: { email: string; password: string; displayName?: string }) {
  return request<{
    status: "VERIFICATION_REQUIRED";
    message: string;
    nextAllowedAt: string;
    localPreviewToken?: string;
    localPreviewOnly?: true;
  }>("/auth/register", {
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
  return request<{
    user: SessionUser;
    onboarding: AccountOnboardingStatus;
    riotAccounts: RiotAccountSummary[];
  }>("/auth/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function resendEmailVerification(email: string) {
  return request<{
    status: "VERIFICATION_REQUIRED";
    message: string;
    nextAllowedAt: string;
    localPreviewToken?: string;
    localPreviewOnly?: true;
  }>("/auth/email-verification/resend", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export function confirmEmailVerification(token: string) {
  return request<{ status: "EMAIL_VERIFIED" }>("/auth/email-verification/confirm", {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

export function fetchOnboardingStatus(token: string) {
  return request<AccountOnboardingStatus>("/auth/onboarding-status", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function logout(token: string) {
  return request<void>("/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function startRiotRsoLink(token: string) {
  return request<{ status: string; authorizationUrl: string; expiresInSeconds: number }>(
    "/auth/riot/rso/start",
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
}

export function revokeRiotLink(token: string) {
  return request<{ status: "REVOKED" }>("/auth/riot/revoke", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function changeAccountEmail(
  token: string,
  input: { email: string; currentPassword: string }
) {
  return request<{
    token: string;
    user: SessionUser;
    onboarding: AccountOnboardingStatus;
    localPreviewToken?: string;
    localPreviewOnly?: true;
  }>("/auth/account/email", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input)
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
    stats.objectiveParticipation === 0 ||
    stats.objectiveParticipation === null ||
    stats.objectiveParticipation === undefined;

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
  return {
    ...profile,
    championStats: (profile.championStats ?? []).map(ensureChampionStatsCoverage)
  };
}

/** Perfil analítico do proprietário da sessão; não aceita identidade arbitrária. */
export function fetchMyPlayerProfile(token: string) {
  return request<PlayerProfileOverview>("/me/player-profile", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export interface PlayerSyncResult {
  requested: number;
  imported: number;
  skippedExisting: number;
  failed: Array<{ matchId: string; reason: string }>;
  skippedParticipants: Array<{ matchId: string; puuid: string }>;
  stoppedEarly?: "rate_limited" | "max_reached";
}

/** Sincroniza somente a conta vinculada ao bearer; nenhum identificador vem do renderer. */
export function syncMyPlayerData(token: string) {
  return request<PlayerSyncResult>("/players/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

/**
 * `champion-performance`/`recent-matches`/`growth-journey` viraram
 * `OWN_RESOURCE` na Etapa 31C (identidade deriva do bearer, não do puuid da
 * URL) - as três nunca receberam o header aqui, e caíram em 401 em silêncio.
 * Achado real durante a validação real do Electron na Etapa 31H.
 */
export function fetchChampionPerformance(token: string, puuid: string) {
  return request<{ puuid: string; champions: ChampionPerformanceScore[] }>(
    `/players/${encodeURIComponent(puuid)}/champion-performance`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export function fetchRecentMatches(token: string, puuid: string, limit = 10) {
  return request<{ puuid: string; matches: RecentChampionMatch[] }>(
    `/players/${encodeURIComponent(puuid)}/recent-matches?limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export function fetchGrowthJourney(token: string, puuid: string) {
  return request<{ puuid: string } & GrowthJourney>(
    `/players/${encodeURIComponent(puuid)}/growth-journey`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export function fetchRecommendationObservability(
  token: string,
  playerId: string,
  filters: Omit<LongitudinalReportFilters, "playerId"> = {}
) {
  const query = new globalThis.URLSearchParams();
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.patches?.length) query.set("patch", filters.patches.join(","));
  if (filters.queueIds?.length) query.set("queueId", filters.queueIds.join(","));
  if (filters.roles?.length) query.set("role", filters.roles.join(","));
  if (filters.championIds?.length) query.set("championId", filters.championIds.join(","));
  if (filters.selectionGroups?.length) query.set("group", filters.selectionGroups.join(","));
  for (const [dimension, versions] of Object.entries(filters.algorithmVersions ?? {})) {
    if (versions.length === 0) continue;
    query.set("algorithmDimension", dimension);
    query.set("algorithmVersion", versions.join(","));
    break;
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return request<LongitudinalRecommendationReport>(
    `/players/${encodeURIComponent(playerId)}/recommendation-observability${suffix}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
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

/**
 * Identidade da sessão de draft (Etapa 16). A chave é gerada pelo cliente ao
 * **entrar** no champion select e descartada ao sair - não deriva de campeão
 * nem de horário, então uma entrada nova nunca reaproveita a sessão anterior.
 */
export interface DraftSessionIdentity {
  sessionKey: string;
  source: "LCU" | "USER";
  gameId?: string;
}

export type DraftPersistenceStatus = "SAVED" | "UNCHANGED" | "NOT_TRACKED" | "FAILED";

export interface DraftPersistenceInfo {
  status: DraftPersistenceStatus;
  sessionId?: string;
  snapshotId?: string;
}

export async function fetchDraftRecommendations(
  token: string,
  draft: DraftState,
  session?: DraftSessionIdentity,
  signal?: AbortSignal
) {
  // Proteção central: a requisição não sai sem posição. A API também recusa
  // (422 `PLAYER_ROLE_UNAVAILABLE`), mas uma API anterior a esta etapa
  // aceitaria e usaria MID internamente - barrar aqui não depende de as duas
  // versões andarem juntas.
  if (!draft.playerRole) {
    throw new PlayerRoleUnavailableError();
  }

  const result = await request<
    Partial<DraftRecommendationResponse> & {
      recommendations?: PickRecommendation[];
      persistence?: DraftPersistenceInfo;
    }
  >("/drafts/recommendations", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    // Sem `session` a análise roda igual e nada é gravado: a persistência
    // nunca é pré-requisito da recomendação.
    body: JSON.stringify(session ? { draft, session } : { draft }),
    signal
  });

  const normalize = (recommendations: PickRecommendation[]) =>
    recommendations.map((recommendation) => ({
      ...recommendation,
      metricDetails: ensureRecommendationMetrics(recommendation)
    }));
  if (Array.isArray(result.primaryRecommendations)) {
    return {
      persistence: result.persistence ?? { status: "NOT_TRACKED" as const },
      primaryRecommendations: normalize(result.primaryRecommendations),
      alternatives: normalize(result.alternatives ?? []),
      poolSummary: result.poolSummary ?? {
        totalCandidates: result.primaryRecommendations.length,
        evaluatedCandidates: result.primaryRecommendations.length,
        primaryCount: result.primaryRecommendations.length,
        alternativeCount: 0,
        status: result.primaryRecommendations.length > 0 ? "PARTIAL" : "UNAVAILABLE"
      }
    } as DraftRecommendationResponse & { persistence: DraftPersistenceInfo };
  }

  const legacy = normalize(result.recommendations ?? []);
  return {
    // API anterior à Etapa 16 não persiste nada - e dizer isso é honesto.
    persistence: { status: "NOT_TRACKED" as const },
    primaryRecommendations: legacy,
    alternatives: [],
    poolSummary: {
      totalCandidates: legacy.length,
      evaluatedCandidates: legacy.length,
      primaryCount: legacy.length,
      alternativeCount: 0,
      status: legacy.length >= 5 ? "AVAILABLE" : legacy.length > 0 ? "PARTIAL" : "UNAVAILABLE",
      ...(legacy.length < 5
        ? { shortageReason: "A resposta anterior da API não informa a cobertura completa do pool." }
        : {})
    }
  } as unknown as DraftRecommendationResponse;
}

export function fetchPlayerPool(token: string, role?: Role) {
  const query = role ? `?role=${role}` : "";
  return request<{
    entries: PlayerChampionPoolEntry[];
    roleSummaries: PlayerChampionPoolRoleSummary[];
  }>(`/players/pool${query}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function addPlayerPoolEntry(token: string, championId: number, role: Role) {
  return request<{ entry: PlayerChampionPoolEntry }>("/players/pool", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ championId, role })
  });
}

export function disablePlayerPoolEntry(token: string, championId: number, role: Role) {
  return request<{ entry: PlayerChampionPoolEntry }>(`/players/pool/${championId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role, enabled: false })
  });
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

export async function fetchPreGameAnalysis(token: string, draft: DraftState, signal?: AbortSignal) {
  // Mesma proteção dupla das recomendações: os pré-requisitos são checados
  // antes de sair a requisição, e a API os recusa de novo com 422.
  if (!draft.playerRole) throw new PlayerRoleUnavailableError();
  if (draft.selectedChampionId === undefined) throw new SelectedChampionUnavailableError();

  let payload: unknown;
  try {
    payload = await request<unknown>("/drafts/pre-game-analysis", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ draft }),
      signal
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      const code = (error.payload as { code?: string } | undefined)?.code;
      if (code === "PLAYER_ROLE_UNAVAILABLE") throw new PlayerRoleUnavailableError();
      if (code === "SELECTED_CHAMPION_UNAVAILABLE") {
        throw new SelectedChampionUnavailableError(
          (error.payload as { message?: string } | undefined)?.message
        );
      }
    }
    throw error;
  }

  if (isLegacyPreGameResponse(payload)) throw new PreGameAnalysisIncompatibleError();
  return payload as PreGameAnalysis;
}

export function analyzePostgame(token: string, matchId: string, signal?: AbortSignal) {
  return request<PostGameAnalysis>("/postgame/analyze", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ matchId }),
    signal
  });
}

export function fetchPostgameReport(token: string, matchId: string, signal?: AbortSignal) {
  return request<PostGameAnalysis>(`/postgame/${encodeURIComponent(matchId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal
  });
}

export type DraftComparisonState =
  | "AVAILABLE"
  | "PARTIAL"
  | "MATCH_NOT_LINKED"
  | "SNAPSHOT_MISSING"
  | "TIMELINE_UNAVAILABLE"
  | "NOT_GENERATED";

export interface DraftComparisonResponse {
  state: DraftComparisonState;
  draftSessionId?: string;
  report: DraftPostGameComparison | null;
  reason?: string;
}

export function fetchDraftComparison(token: string, matchId: string, signal?: AbortSignal) {
  return request<DraftComparisonResponse>(
    `/matches/${encodeURIComponent(matchId)}/draft-comparison`,
    { headers: { Authorization: `Bearer ${token}` }, signal }
  );
}

export function generateDraftComparison(token: string, sessionId: string, signal?: AbortSignal) {
  return request<{ created: boolean; report: DraftPostGameComparison }>(
    `/draft-sessions/${encodeURIComponent(sessionId)}/post-game-comparison/generate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal
    }
  );
}

export function fetchMatchObservation(token: string, matchId: string, signal?: AbortSignal) {
  return request<MatchLoadoutObservation>(`/matches/${encodeURIComponent(matchId)}/observation`, {
    headers: { Authorization: `Bearer ${token}` },
    signal
  });
}

export function fetchMatchParticipants(token: string, matchId: string, signal?: AbortSignal) {
  return request<MatchParticipantsOverview>(
    `/matches/${encodeURIComponent(matchId)}/participants`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal
    }
  );
}

export interface MatchHistoryFilters {
  role?: Role;
  won?: boolean;
  queueId?: number;
  championId?: number;
  periodDays?: 7 | 14 | 30;
  limit?: number;
  offset?: number;
}

export interface MatchHistoryPage {
  puuid: string;
  matches: ProfileRecentMatch[];
  total: number;
  limit: number;
  offset: number;
}

export function fetchMatchHistory(token: string, puuid: string, filters: MatchHistoryFilters = {}) {
  const query = new URLSearchParams();
  if (filters.role) query.set("role", filters.role);
  if (filters.won !== undefined) query.set("won", String(filters.won));
  if (filters.queueId !== undefined) query.set("queueId", String(filters.queueId));
  if (filters.championId !== undefined) query.set("championId", String(filters.championId));
  if (filters.periodDays !== undefined) query.set("periodDays", String(filters.periodDays));
  query.set("limit", String(filters.limit ?? 20));
  query.set("offset", String(filters.offset ?? 0));
  return request<MatchHistoryPage>(
    `/players/${encodeURIComponent(puuid)}/match-history?${query.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export function fetchChampionRoleEvidence(
  token: string,
  puuid: string,
  championId: number,
  role: Role,
  signal?: AbortSignal
) {
  return request<ChampionRoleEvidenceResponse>(
    `/players/${encodeURIComponent(puuid)}/champions/${championId}/role-evidence?role=${role}`,
    { headers: { Authorization: `Bearer ${token}` }, signal }
  );
}

export async function fetchPersonalLoadoutEvidence(
  token: string,
  playerId: string,
  championId: number,
  role: Role,
  filters: {
    patch?: string;
    queueIds?: number[];
    playedAtFrom?: string;
    playedAtTo?: string;
    recentMatches?: number;
  } = {}
) {
  const query: string[] = [];
  if (filters.patch) query.push(`patch=${encodeURIComponent(filters.patch)}`);
  if (filters.queueIds?.length) query.push(`queueId=${filters.queueIds.join(",")}`);
  if (filters.playedAtFrom) query.push(`from=${encodeURIComponent(filters.playedAtFrom)}`);
  if (filters.playedAtTo) query.push(`to=${encodeURIComponent(filters.playedAtTo)}`);
  if (filters.recentMatches !== undefined) {
    query.push(`recentMatches=${filters.recentMatches}`);
  }
  const suffix = query.length > 0 ? `?${query.join("&")}` : "";
  try {
    const result = await request<PersonalLoadoutEvidence>(
      `/players/${encodeURIComponent(playerId)}/champions/${championId}` +
        `/roles/${role}/loadout-evidence${suffix}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!result || result.algorithmVersion === undefined || result.parts === undefined) {
      return unavailablePersonalLoadoutEvidence(
        championId,
        role,
        "A resposta da API não traz a análise pessoal agregada."
      );
    }
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.code === undefined) {
      return unavailablePersonalLoadoutEvidence(
        championId,
        role,
        "Histórico pessoal indisponível nesta versão da API."
      );
    }
    throw error;
  }
}

export function fetchSettings(token: string) {
  return request<{ matchAnalysisLimit: number }>("/players/settings", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function fetchPatchRelease(patch?: string, locale = "pt_BR") {
  const path = patch ? `/patches/${encodeURIComponent(patch)}` : "/patches/current";
  return request<PatchRelease>(`${path}?locale=${encodeURIComponent(locale)}`);
}

export function fetchPatchReleases(locale = "pt_BR") {
  return request<{
    status: "AVAILABLE" | "UNAVAILABLE";
    locale: string;
    releases: PatchReleaseSummary[];
    unavailableReason?: string;
  }>(`/patches?locale=${encodeURIComponent(locale)}`);
}

export function fetchTheoreticalPatchImpacts(patch: string, locale = "pt_BR") {
  return request<TheoreticalPatchImpactCollection>(
    `/patches/${encodeURIComponent(patch)}/impacts?locale=${encodeURIComponent(locale)}`
  );
}

export function updateSettings(token: string, matchAnalysisLimit: number) {
  return request<{ matchAnalysisLimit: number }>("/players/settings", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ matchAnalysisLimit })
  });
}

/** Sessão de draft persistida, como a API a devolve. */
export interface DraftSessionSummary {
  id: string;
  source: "LCU" | "USER";
  status: "ACTIVE" | "LOCKED_IN" | "IN_GAME" | "COMPLETED" | "ABANDONED";
  role: Role;
  roleSource: "LCU" | "USER";
  selectedChampionId: number | null;
  /** Já vinha na resposta desde sempre; só faltava no tipo (Etapa 31I). */
  queueId: number | null;
  patch: string | null;
  gameVersion: string | null;
  startedAt: string;
  updatedAt: string;
  lockedInAt: string | null;
  completedAt: string | null;
  linkedMatchId: string | null;
  externalGameId: string | null;
  matchLinkStatus: "PENDING" | "LINKED" | "AMBIGUOUS" | "UNLINKABLE" | "NOT_APPLICABLE";
  knownDraft: {
    allies: { championId: number; championName: string; role?: Role }[];
    enemies: { championId: number; championName: string; role?: Role }[];
    bannedChampionIds: number[];
    banSideKnown: boolean;
    directOpponentChampionId?: number;
    unknownAllyPicks: number;
    unknownEnemyPicks: number;
  };
}

/** Release referenciada por um snapshot, projeção leve (Etapa 31I). */
export interface SnapshotReleaseSummary {
  id: string;
  releaseVersion: string;
  artifactHash: string;
  status: string;
  currentlyActive: boolean;
}

export interface PersistedSnapshot {
  id: string;
  inputHash: string;
  dataCoverage: number;
  algorithmVersions: Record<string, string>;
  createdAt: string;
  supersededAt: string | null;
  recommendations: {
    championId: number;
    championName: string;
    rank: number;
    group: "PRIMARY" | "ALTERNATIVE";
    totalScore: number;
    dataCoverage: number;
    poolSource: string;
    personalGames: number;
    category: string;
    confidence?: string;
    /** Já vinha na resposta desde sempre; só faltava no tipo (Etapa 31I). */
    reasons: { code: string; label: string; detail: string; impact: number }[];
    warnings: { code: string; label: string; detail: string; impact: number }[];
  }[];
  /** Eco da configuração efetiva (Etapa 27b), exposto na API desde a 31I. */
  configurationSource: "BUILT_IN_BASELINE" | "RELEASE" | null;
  configurationVersion: string | null;
  configHash: string | null;
  release: SnapshotReleaseSummary | null;
}

export interface DraftSessionDetail {
  session: DraftSessionSummary;
  latestSnapshot: PersistedSnapshot | null;
  selectedChampion: {
    championId: number;
    state: "RANKED" | "NOT_IN_SNAPSHOT" | "NO_SNAPSHOT";
    rank?: number;
    group?: "PRIMARY" | "ALTERNATIVE";
  } | null;
  matchLink: {
    status: "PENDING" | "LINKED" | "AMBIGUOUS" | "UNLINKABLE" | "NOT_APPLICABLE";
    strategy: "EXACT_GAME_ID" | "STRONG_EVIDENCE" | null;
    matchId: string | null;
    externalGameId: string | null;
    algorithmVersion: string | null;
    candidateCount: number;
    reason: string | null;
    decidedAt: string | null;
    evidence: {
      signal: string;
      expected?: string | number | string[] | number[];
      observed?: string | number | string[] | number[];
      matched: boolean;
      source: string;
    }[];
    revisions: {
      revision: number;
      status: string;
      strategy: string | null;
      matchId: string | null;
      externalGameId: string | null;
      candidateCount: number;
      algorithmVersion: string;
      reason: string;
      decidedAt: string;
    }[];
  };
}

export function fetchDraftSessions(token: string, limit = 20) {
  return request<{ sessions: DraftSessionSummary[] }>(`/drafts/sessions?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function fetchDraftSessionDetail(token: string, sessionId: string) {
  return request<DraftSessionDetail>(`/drafts/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

/* ── Capacidade de replay do ReplayInputBundle (Etapa 26b) ──────────────── */

export type ReplayCapability =
  | "REWEIGHT_ONLY"
  | "FULL_DERIVATION_REPLAY_AVAILABLE"
  | "FULL_DERIVATION_REPLAY_UNAVAILABLE"
  | "FULL_DERIVATION_REPLAY_INVALID"
  | "FULL_DERIVATION_REPLAY_UNSUPPORTED_VERSION";

export interface ReplayCapabilityReport {
  capability: ReplayCapability;
  reason: string;
  reweightAvailable: boolean;
  bundleSchemaVersion?: string;
  contentHash?: string;
  capturedAt?: string;
  algorithmVersions?: Record<string, string>;
  verificationStatus?: string;
  missingDependencies: { metric: string; reason: string }[];
}

export interface SessionReplayCapability extends ReplayCapabilityReport {
  sessionId: string;
  snapshotId: string | null;
}

/**
 * Identidade da configuração do snapshot (Etapa 27c). Só o que identifica —
 * a API não devolve pesos nem regras para esta superfície.
 */
export interface ReplayConfigurationIdentity {
  source: "BUILT_IN_BASELINE" | "RELEASE";
  releaseId: string | null;
  version: string | null;
  configHash: string | null;
  embeddedInBundle: boolean;
}

export interface ReplayBundleSummary extends ReplayCapabilityReport {
  snapshotId: string;
  hasBundle: boolean;
  contentBytes?: number;
  evaluatedAt?: string;
  createdAt?: string;
  lastVerification?: { status: string; verifiedAt: string } | null;
  configuration?: ReplayConfigurationIdentity;
}

export interface ReplayVerificationResponse {
  snapshotId: string;
  status: string;
  divergences: {
    championId?: number;
    field: string;
    expected: number | string | null;
    reconstructed: number | string | null;
    delta?: number;
  }[];
  missingDependencies: { metric: string; reason: string }[];
  replayImplementation?: string;
  capability: ReplayCapability;
  reason: string;
  reweightAvailable: boolean;
}

/** Capacidade de replay do snapshot mais recente de uma sessão. */
export function fetchSessionReplayCapability(token: string, sessionId: string) {
  return request<SessionReplayCapability>(
    `/draft-sessions/${encodeURIComponent(sessionId)}/replay-capability`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

/** Resumo do bundle de um snapshot, sem o conteúdo funcional completo. */
export function fetchReplayBundleSummary(token: string, snapshotId: string) {
  return request<ReplayBundleSummary>(
    `/recommendation-snapshots/${encodeURIComponent(snapshotId)}/replay-bundle-summary`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

/** Roda a verificação offline de fato — reconstrói o motor a partir do bundle. */
export function verifySnapshotReplay(token: string, snapshotId: string) {
  return request<ReplayVerificationResponse>(
    `/recommendation-snapshots/${encodeURIComponent(snapshotId)}/verify-replay`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    }
  );
}

/** Registra o campeão confirmado na sessão. Não emite julgamento nenhum. */
export function lockInDraftSession(token: string, sessionId: string, championId: number) {
  return request<{
    session: DraftSessionSummary;
    selectedChampion: DraftSessionDetail["selectedChampion"];
  }>(`/drafts/sessions/${encodeURIComponent(sessionId)}/lock-in`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ championId })
  });
}

export function observeDraftSessionGame(token: string, sessionId: string, gameId: string) {
  return request<{ session: DraftSessionSummary }>(
    `/drafts/sessions/${encodeURIComponent(sessionId)}/observed-game`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ gameId })
    }
  );
}

export function transitionDraftSessionStatus(
  token: string,
  sessionId: string,
  status: "IN_GAME" | "ABANDONED"
) {
  return request<{ session: DraftSessionSummary }>(
    `/drafts/sessions/${encodeURIComponent(sessionId)}/status`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    }
  );
}

/* ── Revisão humana do motor (Etapa 24) ───────────────────────────────── */

export type ReviewRatingValue =
  "STRONG" | "ADEQUATE" | "WEAK" | "INSUFFICIENT_DATA" | "NOT_APPLICABLE";

export interface DraftReviewSummaryResponse {
  reviewsConsidered: number;
  completed: { count: number; total: number };
  blind: { count: number; total: number };
  needsInvestigation: { count: number; total: number };
  withInsufficientData: { count: number; total: number };
  issueTagFrequencies: { tag: string; count: number; total: number }[];
  algorithmVersions: { version: string; reviews: number }[];
  formVersions: { version: string; reviews: number }[];
  summaryVersion: string;
}

export interface DraftReviewRecord {
  id: string;
  draftSessionId: string;
  snapshotId: string | null;
  matchId: string | null;
  status: "IN_PROGRESS" | "PRE_MATCH_REVIEWED" | "COMPLETED" | "NEEDS_INVESTIGATION";
  resultRevealedAt: string | null;
  createdAt: string;
  completedAt: string | null;
  reviewVersion: string;
  supersedesReviewId: string | null;
  correctionReason?: string;
}

/**
 * Contexto da fase cega. **Não tem campo de resultado** - o backend não
 * envia partida, KDA nem estatística enquanto a revisão está cega, e o tipo
 * reflete isso: para exibir resultado alguém teria que mudá-lo.
 */
export interface BlindReviewContextResponse {
  draftSessionId: string;
  snapshotId: string | null;
  role: string;
  roleSource: string;
  source: string;
  lockedInAt: string | null;
  selectedChampionId: number | null;
  knownDraft: unknown;
  snapshot: {
    id: string;
    createdAt: string;
    dataCoverage: number;
    recommendations: unknown[];
  } | null;
  algorithmVersions: Record<string, string>;
  hasLinkedMatch: boolean;
}

export function fetchDraftReviewForm(token: string) {
  return request<{
    reviewRatings: Record<string, string>;
    preMatchDimensions: Record<string, string>;
    postMatchDimensions: Record<string, string>;
    issueTags: Record<string, string>;
  }>("/draft-reviews/form", { headers: { Authorization: `Bearer ${token}` } });
}

export function openDraftReview(
  token: string,
  sessionId: string,
  correction?: { supersedesReviewId: string; correctionReason?: string }
) {
  return request<{ review: DraftReviewRecord; context: BlindReviewContextResponse }>(
    `/draft-sessions/${encodeURIComponent(sessionId)}/reviews`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(correction ?? {})
    }
  );
}

export function fetchDraftReviews(token: string, sessionId: string) {
  return request<{ reviews: DraftReviewRecord[] }>(
    `/draft-sessions/${encodeURIComponent(sessionId)}/reviews`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

export function submitPreMatchReview(
  token: string,
  reviewId: string,
  assessment: Record<string, unknown>
) {
  return request<{ review: DraftReviewRecord }>(
    `/draft-reviews/${encodeURIComponent(reviewId)}/pre-match`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(assessment)
    }
  );
}

/** Ação explícita. Só depois dela a partida entra na resposta. */
export function revealDraftReviewResult(token: string, reviewId: string) {
  return request<{
    review: DraftReviewRecord;
    match: { matchId: string; postgameReport: unknown | null } | null;
    matchUnavailableReason?: string;
  }>(`/draft-reviews/${encodeURIComponent(reviewId)}/reveal-result`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export function submitPostMatchReview(
  token: string,
  reviewId: string,
  assessment: Record<string, unknown>
) {
  return request<{ review: DraftReviewRecord }>(
    `/draft-reviews/${encodeURIComponent(reviewId)}/post-match`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(assessment)
    }
  );
}

export function fetchDraftReviewSummary(token: string) {
  return request<{ summary: DraftReviewSummaryResponse }>("/players/draft-review-summary", {
    headers: { Authorization: `Bearer ${token}` }
  });
}

/* Laboratório offline de calibração do motor (Etapa 25b). */

export interface CalibrationParameterEntry {
  parameter: string;
  capability:
    | "EXACT_REWEIGHT"
    | "EXACT_POST_AGGREGATION"
    | "REQUIRES_HISTORICAL_DERIVATION_INPUT"
    | "UNSUPPORTED";
  description: string;
  missingHistoricalInputs?: string[];
  range?: { min: number; max: number };
}

export interface CalibrationParameterCatalog {
  laboratoryVersion: string;
  maxPromotionStatus: string;
  weightableMetrics: string[];
  postAggregationThresholds: CalibrationParameterEntry[];
  registry: CalibrationParameterEntry[];
}

export interface CalibrationCandidateRow {
  id: string;
  lineageId: string;
  revision: number;
  name: string;
  description?: string;
  status: string;
  configHash: string;
  laboratoryVersion: string;
  candidate: {
    metricWeights: Record<string, number>;
    disabledMetrics?: string[];
    postAggregationThresholds?: Record<string, number>;
    baselineAggregationVersion: string;
    candidateVersion: string;
  };
  createdAt: string;
  supersededAt?: string;
  decision?: { by: string; at: string; note?: string; experimentId?: string };
}

/** Distribuição por segmento (posição, patch, fila...) - nunca veredito, só deslocamento. */
export interface CalibrationSegmentSummary {
  dimension: string;
  value: string;
  cases: number;
  topOnePreservedCases: number;
  averageRankDisplacement: number | null;
  medianRankDisplacement: number | null;
  averageRecommendedSetStability: number | null;
}

/** Caso excluído da comparação e por quê - nunca contado como falha do modelo. */
export interface CalibrationExclusionSummary {
  code: string;
  cases: number;
  missingHistoricalInputs: string[];
}

/** Contagens de revisão humana pré-resultado - contagem, nunca nota agregada. */
export interface CalibrationHumanReviewSummary {
  casesWithReview: number;
  casesWithoutReview: number;
  strongCasesPreserved: number;
  strongCasesAltered: number;
  weakCasesPreserved: number;
  weakCasesAltered: number;
  issueTagsAffected: { tag: string; casesAltered: number; casesTotal: number }[];
}

export interface CalibrationExperimentReport {
  labVersion: string;
  candidateId: string;
  candidateVersion: string;
  candidateStatus: string;
  totalCases: number;
  replayedCases: number;
  excludedCases: number;
  nonReproducibleCases: number;
  topOnePreservedCases: number;
  averageTopFiveOverlap: number | null;
  averageRankDisplacement: number | null;
  medianRankDisplacement: number | null;
  averageRecommendedSetStability: number | null;
  totalPromoted: number;
  totalDemoted: number;
  totalEnteredPrimary: number;
  totalLeftPrimary: number;
  totalPrimaryToAlternative: number;
  totalAlternativeToPrimary: number;
  totalComfortStrategicInversions: number;
  chosenChampionEnteredPrimary: number;
  chosenChampionLeftPrimary: number;
  segments: CalibrationSegmentSummary[];
  exclusions: CalibrationExclusionSummary[];
  humanReview: CalibrationHumanReviewSummary;
}

export interface CalibrationExperimentRow {
  id: string;
  candidateId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  filters: Record<string, unknown>;
  inputHash: string;
  laboratoryVersion: string;
  totalCases: number;
  exactReplayCases: number;
  integrityFailedCases: number;
  unsupportedCases: number;
  missingInputCases: number;
  excludedCases: number;
  report?: CalibrationExperimentReport;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}

export interface CalibrationRankingEntry {
  championId: number;
  championName: string;
  rank: number;
  group: "PRIMARY" | "ALTERNATIVE" | "NOT_RECOMMENDED";
  score: number;
  dataCoverage: number;
}

export interface CalibrationRanking {
  entries: CalibrationRankingEntry[];
  primaryChampionIds: number[];
  alternativeChampionIds: number[];
}

export interface CalibrationReweightedCandidate {
  championId: number;
  championName: string;
  category: string;
  baselineRank: number;
  baselineGroup: "PRIMARY" | "ALTERNATIVE";
  baselineScore: number;
  reconstructedScore: number;
  baselineDataCoverage: number;
  candidateScore: number;
  candidateBaseScore: number;
  candidatePenalty: number;
  candidateDataCoverage: number;
  differenceReasons: string[];
}

export interface CalibrationCaseComparison {
  draftSessionId: string;
  snapshotId: string;
  role: Role;
  patch?: string;
  queue?: string;
  replayStatus: string;
  exclusionReasons: { code: string; missingHistoricalInputs: string[] }[];
  baseline: CalibrationRanking;
  candidate: CalibrationRanking | null;
  topOnePreserved: boolean | null;
  topFiveOverlap: number | null;
  averageRankDisplacement: number | null;
  medianRankDisplacement: number | null;
  maxRankDisplacement: number | null;
  recommendedSetStability: number | null;
  promotedChampionIds: number[];
  demotedChampionIds: number[];
  enteredPrimaryChampionIds: number[];
  leftPrimaryChampionIds: number[];
  primaryToAlternativeChampionIds: number[];
  alternativeToPrimaryChampionIds: number[];
  comfortStrategicInversions: number | null;
  candidates: CalibrationReweightedCandidate[];
  algorithmVersions: Record<string, string>;
}

export interface CalibrationCandidateInput {
  name: string;
  description?: string;
  baselineAggregationVersion: string;
  candidateVersion: string;
  metricWeights: Record<string, number>;
  disabledMetrics?: string[];
  postAggregationThresholds?: Record<string, number>;
  status: "DRAFT" | "READY";
}

export interface CalibrationValidationResult {
  valid: boolean;
  rejections: {
    code: string;
    parameter: string;
    reason: string;
    missingHistoricalInputs?: string[];
  }[];
  accepted: { parameter: string; capability: string }[];
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export function fetchCalibrationParameters(token: string) {
  return request<CalibrationParameterCatalog>("/calibration/parameters", { headers: auth(token) });
}

export function validateCalibrationCandidateRemote(
  token: string,
  candidate: CalibrationCandidateInput
) {
  return request<CalibrationValidationResult>("/calibration/candidates/validate", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(candidate)
  });
}

export function listCalibrationCandidates(token: string) {
  return request<{ candidates: CalibrationCandidateRow[] }>("/calibration/candidates", {
    headers: auth(token)
  });
}

export function createCalibrationCandidate(token: string, candidate: CalibrationCandidateInput) {
  return request<CalibrationCandidateRow>("/calibration/candidates", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(candidate)
  });
}

export function createCalibrationRevision(
  token: string,
  candidateId: string,
  candidate: CalibrationCandidateInput
) {
  return request<CalibrationCandidateRow>(
    `/calibration/candidates/${encodeURIComponent(candidateId)}/revisions`,
    { method: "POST", headers: auth(token), body: JSON.stringify(candidate) }
  );
}

export function runCalibrationExperiment(
  token: string,
  candidateId: string,
  filters: Record<string, unknown>
) {
  return request<{ experiment: CalibrationExperimentRow; reused: boolean }>(
    "/calibration/experiments",
    { method: "POST", headers: auth(token), body: JSON.stringify({ candidateId, filters }) }
  );
}

export function listCalibrationExperiments(token: string, candidateId?: string) {
  const query = candidateId ? `?candidateId=${encodeURIComponent(candidateId)}` : "";
  return request<{ experiments: CalibrationExperimentRow[] }>(`/calibration/experiments${query}`, {
    headers: auth(token)
  });
}

export function fetchCalibrationExperimentCases(
  token: string,
  experimentId: string,
  options: { limit?: number; offset?: number; replayStatus?: string } = {}
) {
  const params: string[] = [];
  if (options.limit) params.push(`limit=${options.limit}`);
  if (options.offset) params.push(`offset=${options.offset}`);
  if (options.replayStatus) params.push(`replayStatus=${encodeURIComponent(options.replayStatus)}`);
  const query = params.length ? `?${params.join("&")}` : "";
  return request<{
    total: number;
    limit: number;
    offset: number;
    cases: CalibrationCaseComparison[];
  }>(`/calibration/experiments/${encodeURIComponent(experimentId)}/cases${query}`, {
    headers: auth(token)
  });
}

export function decideCalibrationCandidate(
  token: string,
  candidateId: string,
  decision: "reject" | "approve-for-future-release",
  body: { experimentId?: string; note?: string } = {}
) {
  return request<CalibrationCandidateRow & { activation?: string }>(
    `/calibration/candidates/${encodeURIComponent(candidateId)}/${decision}`,
    { method: "POST", headers: auth(token), body: JSON.stringify(body) }
  );
}

/* Persistência e operação segura de releases (Etapa 27b). */

export interface EffectiveConfigurationView {
  version: string;
  configHash: string;
  metricWeights: Record<string, number>;
  disabledMetrics: string[];
  postAggregationRules: Record<string, number>;
  source: { type: "BUILT_IN_BASELINE" } | { type: "RELEASE"; releaseId: string };
}

export interface ReleaseValidationView {
  status: string;
  reason: string;
  laboratoryEquivalence?: {
    status: string;
    caseResults: { snapshotId: string; status: string; divergences: unknown[] }[];
  };
}

export interface ReleaseRow {
  id: string;
  riotAccountId: string;
  candidateId: string;
  candidateRevisionId: string;
  experimentId: string;
  releaseVersion: string;
  baselineVersion: string;
  candidateVersion: string;
  status:
    | "DRAFT"
    | "VALIDATING"
    | "VALIDATION_FAILED"
    | "READY_FOR_ACTIVATION"
    | "ACTIVE"
    | "ROLLED_BACK"
    | "REJECTED";
  artifact: {
    configuration: EffectiveConfigurationView;
    experimentEvidence: {
      knownLimitations: string[];
      sampleSize: number;
      exactReplayCases: number;
    };
  };
  artifactHash: string;
  configHash: string;
  validation?: ReleaseValidationView;
  validatedArtifactHash?: string;
  validatedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activatedBy?: string;
  activatedAt?: string;
  previousReleaseId?: string;
  rolledBackBy?: string;
  rolledBackAt?: string;
  rolledBackReason?: string;
  currentlyActive: boolean;
}

export interface ActiveReleaseResponse {
  source: "RELEASE" | "BUILT_IN_BASELINE";
  release?: ReleaseRow;
  note?: string;
  scenarios?: { label: string; configuration: EffectiveConfigurationView }[];
}

export function createRelease(token: string, candidateId: string, releaseVersion: string) {
  return request<ReleaseRow>(
    `/calibration/candidates/${encodeURIComponent(candidateId)}/releases`,
    {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ releaseVersion })
    }
  );
}

export function listReleases(token: string) {
  return request<{ releases: ReleaseRow[] }>("/calibration/releases", { headers: auth(token) });
}

export function fetchRelease(token: string, releaseId: string) {
  return request<ReleaseRow & { events: Record<string, unknown>[] }>(
    `/calibration/releases/${encodeURIComponent(releaseId)}`,
    { headers: auth(token) }
  );
}

export function validateRelease(token: string, releaseId: string) {
  return request<ReleaseRow>(`/calibration/releases/${encodeURIComponent(releaseId)}/validate`, {
    method: "POST",
    headers: auth(token)
  });
}

export function activateRelease(token: string, releaseId: string, reason?: string) {
  return request<ReleaseRow>(`/calibration/releases/${encodeURIComponent(releaseId)}/activate`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(reason ? { reason } : {})
  });
}

export function rollbackRelease(token: string, releaseId: string, reason?: string) {
  return request<ReleaseRow>(`/calibration/releases/${encodeURIComponent(releaseId)}/rollback`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(reason ? { reason } : {})
  });
}

export function fetchActiveRelease(token: string) {
  return request<ActiveReleaseResponse>("/recommendation-engine/active-release", {
    headers: auth(token)
  });
}
