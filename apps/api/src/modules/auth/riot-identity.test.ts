import { describe, expect, it } from "vitest";
import { URL } from "node:url";
import {
  buildRsoAuthorizationUrl,
  createAuthorizationState,
  hashAuthorizationState,
  verificationEvidenceHash
} from "./riot-identity.js";
import { isRiotAccountAccessAllowed } from "./authorization-policy.js";

describe("Riot identity boundary", () => {
  it("never promotes a legacy link to production access", () => {
    expect(isRiotAccountAccessAllowed("UNVERIFIED_LEGACY", "LOCAL_CONTROLLED")).toBe(true);
    expect(isRiotAccountAccessAllowed("UNVERIFIED_LEGACY", "TEST")).toBe(true);
    expect(isRiotAccountAccessAllowed("UNVERIFIED_LEGACY", "RSO_REQUIRED")).toBe(false);
    expect(isRiotAccountAccessAllowed("VERIFIED_BY_RSO", "RSO_REQUIRED")).toBe(true);
  });

  it("blocks revoked and reauthentication-required links in every mode", () => {
    for (const mode of ["LOCAL_CONTROLLED", "TEST", "RSO_REQUIRED"] as const) {
      expect(isRiotAccountAccessAllowed("REVOKED", mode)).toBe(false);
      expect(isRiotAccountAccessAllowed("REQUIRES_REAUTHENTICATION", mode)).toBe(false);
    }
  });

  it("keeps a pending link outside READY in every mode", () => {
    for (const mode of ["LOCAL_CONTROLLED", "TEST", "RSO_REQUIRED"] as const) {
      expect(isRiotAccountAccessAllowed("PENDING_VERIFICATION", mode)).toBe(false);
    }
  });

  it("persists only a one-way state hash and emits the documented RSO request", () => {
    const state = createAuthorizationState();
    expect(state.length).toBeGreaterThanOrEqual(32);
    expect(hashAuthorizationState(state)).not.toContain(state);
    expect(hashAuthorizationState(state)).toBe(hashAuthorizationState(state));

    const url = new URL(
      buildRsoAuthorizationUrl({
        clientId: "client-id",
        redirectUri: "https://api.example.test/auth/riot/rso/callback",
        state
      })
    );
    expect(url.origin).toBe("https://auth.riotgames.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid offline_access");
    expect(url.searchParams.get("state")).toBe(state);
  });

  it("creates stable evidence without returning the raw PUUID", () => {
    const hash = verificationEvidenceHash({
      puuid: "private-puuid",
      gameName: "Sparta",
      tagLine: "BR1",
      platformRegion: "br1",
      regionalRouting: "americas"
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("private-puuid");
  });
});
