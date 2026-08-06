import { describe, expect, it } from "vitest";
import { deriveAccountOnboardingState, requiredStepForOnboarding } from "./account-onboarding.js";

describe("account onboarding", () => {
  it("only reaches READY with an active account, verified email and accepted Riot link", () => {
    expect(
      deriveAccountOnboardingState({
        accountActive: true,
        emailVerified: true,
        riotLinkStatus: "VERIFIED_BY_RSO",
        riotLinkAccepted: true
      })
    ).toBe("READY");
    expect(
      deriveAccountOnboardingState({
        accountActive: false,
        emailVerified: true,
        riotLinkStatus: "VERIFIED_BY_RSO",
        riotLinkAccepted: true
      })
    ).not.toBe("READY");
  });

  it("keeps email, pending and reauthentication states distinct", () => {
    expect(
      deriveAccountOnboardingState({
        accountActive: true,
        emailVerified: false,
        riotLinkStatus: "VERIFIED_BY_RSO",
        riotLinkAccepted: true
      })
    ).toBe("EMAIL_UNVERIFIED");
    expect(
      deriveAccountOnboardingState({
        accountActive: true,
        emailVerified: true,
        riotLinkStatus: "PENDING_VERIFICATION",
        riotLinkAccepted: true
      })
    ).toBe("RIOT_LINK_PENDING");
    expect(
      deriveAccountOnboardingState({
        accountActive: true,
        emailVerified: true,
        riotLinkStatus: "REVOKED",
        riotLinkAccepted: false
      })
    ).toBe("RIOT_LINK_REQUIRES_REAUTHENTICATION");
  });

  it("does not accept a legacy link when the environment rejects it", () => {
    const state = deriveAccountOnboardingState({
      accountActive: true,
      emailVerified: true,
      riotLinkStatus: "UNVERIFIED_LEGACY",
      riotLinkAccepted: false
    });
    expect(state).toBe("EMAIL_VERIFIED_RIOT_UNLINKED");
    expect(requiredStepForOnboarding(state)).toBe("RIOT_LINK");
  });
});
