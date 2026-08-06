import { describe, expect, it } from "vitest";
import { accessRouteForOnboarding } from "./session-routing";

describe("gate central do desktop", () => {
  it("nao deixa email pendente chegar ao shell", () => {
    expect(accessRouteForOnboarding("EMAIL_UNVERIFIED")).toBe("email-verification");
  });

  it.each([
    "EMAIL_VERIFIED_RIOT_UNLINKED",
    "RIOT_LINK_PENDING",
    "RIOT_LINK_REQUIRES_REAUTHENTICATION"
  ] as const)("mantem %s na etapa Riot", (state) => {
    expect(accessRouteForOnboarding(state)).toBe("link-account");
  });

  it("so libera o shell para READY", () => {
    expect(accessRouteForOnboarding("READY")).toBe("ready");
  });
});
