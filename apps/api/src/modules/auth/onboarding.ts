import {
  deriveAccountOnboardingState,
  requiredStepForOnboarding,
  type AccountOnboardingStatus
} from "@sparta/core";
import type { ResolvedEnv } from "../../config/env.js";
import { maskEmail } from "./email-verification.js";
import { isRiotAccountAccessAllowed } from "./riot-identity.js";

interface OnboardingUser {
  email: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
}

interface OnboardingRiotAccount {
  gameName: string;
  tagLine: string;
  linkStatus: string;
}

export function buildAccountOnboardingStatus(input: {
  user: OnboardingUser;
  riotAccount: OnboardingRiotAccount | null;
  env: ResolvedEnv;
}): AccountOnboardingStatus {
  const linkAccepted = isRiotAccountAccessAllowed(
    input.riotAccount?.linkStatus,
    input.env.IDENTITY_MODE
  );
  const state = deriveAccountOnboardingState({
    accountActive: input.user.isActive,
    emailVerified: input.user.emailVerifiedAt !== null,
    riotLinkStatus: input.riotAccount?.linkStatus,
    riotLinkAccepted: linkAccepted
  });
  return {
    state,
    requiredStep: requiredStepForOnboarding(state),
    accountActive: input.user.isActive,
    email: {
      masked: maskEmail(input.user.email),
      verified: input.user.emailVerifiedAt !== null,
      verifiedAt: input.user.emailVerifiedAt?.toISOString() ?? null
    },
    riot: {
      linked: input.riotAccount !== null,
      linkStatus: input.riotAccount?.linkStatus ?? null,
      acceptedForCurrentEnvironment: linkAccepted,
      rsoEnabled: input.env.RSO_ENABLED,
      localControlledMode: input.env.IDENTITY_MODE !== "RSO_REQUIRED",
      localRiotLinkEnabled:
        input.env.IDENTITY_MODE !== "RSO_REQUIRED" && input.env.LOCAL_RIOT_LINK_ENABLED,
      ...(input.riotAccount
        ? { riotId: `${input.riotAccount.gameName}#${input.riotAccount.tagLine}` }
        : {})
    }
  };
}
