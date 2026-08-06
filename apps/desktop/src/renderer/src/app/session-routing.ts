import type { AccountOnboardingState } from "@sparta/core";

export type AccessRoute = "email-verification" | "link-account" | "ready";

/** Fonte unica do gate do renderer; o estado em si sempre vem do backend. */
export function accessRouteForOnboarding(state: AccountOnboardingState): AccessRoute {
  if (state === "EMAIL_UNVERIFIED") return "email-verification";
  if (state === "READY") return "ready";
  return "link-account";
}
