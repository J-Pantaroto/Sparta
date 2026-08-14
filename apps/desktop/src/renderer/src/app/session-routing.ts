import type { AccountOnboardingState } from "@sparta/core";
import { ExternalServiceError } from "@sparta/riot/http";
import { ApiError, type SessionUser, type RiotAccountSummary } from "../services/api-client";

export type AccessRoute = "email-verification" | "link-account" | "ready";

/** Fonte unica do gate do renderer; o estado em si sempre vem do backend. */
export function accessRouteForOnboarding(state: AccountOnboardingState): AccessRoute {
  if (state === "EMAIL_UNVERIFIED") return "email-verification";
  if (state === "READY") return "ready";
  return "link-account";
}

export type SessionRestoreFailure =
  | "AUTHENTICATION_REJECTED"
  | "SERVER_UNAVAILABLE"
  | "REQUEST_TIMEOUT"
  | "NETWORK_UNAVAILABLE"
  | "TEMPORARILY_UNAVAILABLE";

export interface VerifiedSession {
  user: SessionUser;
  onboarding: import("@sparta/core").AccountOnboardingStatus;
  riotAccounts: RiotAccountSummary[];
}

export type SessionRestoreResult =
  | { state: "AUTHENTICATED"; session: VerifiedSession }
  | { state: "INVALID"; failure: "AUTHENTICATION_REJECTED" }
  | {
      state: "OFFLINE";
      failure: Exclude<SessionRestoreFailure, "AUTHENTICATION_REJECTED">;
      message: string;
    };

/**
 * Somente uma rejeição HTTP 401 vinda da própria API é evidência autoritativa
 * de que o bearer deixou de ser válido. Todos os demais erros preservam o
 * token cifrado e mantêm o shell bloqueado até uma verificação posterior.
 */
export function classifySessionRestoreFailure(error: unknown): SessionRestoreFailure {
  if (error instanceof ApiError) {
    if (error.status === 401) return "AUTHENTICATION_REJECTED";
    if (error.status >= 500) return "SERVER_UNAVAILABLE";
    return "TEMPORARILY_UNAVAILABLE";
  }
  if (error instanceof ExternalServiceError) {
    if (error.code === "REQUEST_TIMEOUT") return "REQUEST_TIMEOUT";
    if (error.code === "NETWORK_UNAVAILABLE") return "NETWORK_UNAVAILABLE";
    if (error.code === "UPSTREAM_UNAVAILABLE") return "SERVER_UNAVAILABLE";
  }
  return "TEMPORARILY_UNAVAILABLE";
}

export async function restorePersistedSession(
  token: string,
  verify: (token: string) => Promise<VerifiedSession>,
  clearPersistedSession: () => Promise<void>
): Promise<SessionRestoreResult> {
  try {
    return { state: "AUTHENTICATED", session: await verify(token) };
  } catch (error) {
    const failure = classifySessionRestoreFailure(error);
    if (failure === "AUTHENTICATION_REJECTED") {
      await clearPersistedSession();
      return { state: "INVALID", failure };
    }
    return {
      state: "OFFLINE",
      failure,
      message:
        error instanceof Error
          ? error.message
          : "A API do Sparta está temporariamente indisponível."
    };
  }
}
