export const ACCOUNT_ONBOARDING_STATES = [
  "EMAIL_UNVERIFIED",
  "EMAIL_VERIFIED_RIOT_UNLINKED",
  "RIOT_LINK_PENDING",
  "RIOT_LINK_REQUIRES_REAUTHENTICATION",
  "READY"
] as const;

export type AccountOnboardingState = (typeof ACCOUNT_ONBOARDING_STATES)[number];
export type AccountOnboardingRequiredStep = "EMAIL_VERIFICATION" | "RIOT_LINK" | null;

export interface AccountOnboardingFacts {
  accountActive: boolean;
  emailVerified: boolean;
  riotLinkStatus?: string | null;
  riotLinkAccepted: boolean;
}

export interface AccountOnboardingStatus {
  state: AccountOnboardingState;
  requiredStep: AccountOnboardingRequiredStep;
  accountActive: boolean;
  email: {
    masked: string;
    verified: boolean;
    verifiedAt: string | null;
  };
  riot: {
    linked: boolean;
    linkStatus: string | null;
    acceptedForCurrentEnvironment: boolean;
    rsoEnabled: boolean;
    localControlledMode: boolean;
    localRiotLinkEnabled: boolean;
    riotId?: string;
  };
}

export function deriveAccountOnboardingState(
  facts: AccountOnboardingFacts
): AccountOnboardingState {
  if (!facts.accountActive || !facts.emailVerified) return "EMAIL_UNVERIFIED";
  if (facts.riotLinkStatus === "PENDING_VERIFICATION") return "RIOT_LINK_PENDING";
  if (facts.riotLinkStatus === "REQUIRES_REAUTHENTICATION" || facts.riotLinkStatus === "REVOKED") {
    return "RIOT_LINK_REQUIRES_REAUTHENTICATION";
  }
  if (!facts.riotLinkStatus || !facts.riotLinkAccepted) {
    return "EMAIL_VERIFIED_RIOT_UNLINKED";
  }
  return "READY";
}

export function requiredStepForOnboarding(
  state: AccountOnboardingState
): AccountOnboardingRequiredStep {
  if (state === "EMAIL_UNVERIFIED") return "EMAIL_VERIFICATION";
  if (state === "READY") return null;
  return "RIOT_LINK";
}
