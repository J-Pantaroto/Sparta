import { describe, expect, it } from "vitest";
import { ExternalServiceError } from "@sparta/riot/http";
import { ApiError } from "../services/api-client";
import {
  accessRouteForOnboarding,
  classifySessionRestoreFailure,
  restorePersistedSession,
  type VerifiedSession
} from "./session-routing";

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

const verifiedSession: VerifiedSession = {
  user: {
    id: "user-1",
    email: "jogador@example.com",
    displayName: "Jogador",
    emailVerifiedAt: "2026-08-14T00:00:00.000Z",
    isActive: true
  },
  onboarding: {
    state: "READY",
    requiredStep: null,
    accountActive: true,
    email: {
      masked: "j***@example.com",
      verified: true,
      verifiedAt: "2026-08-14T00:00:00.000Z"
    },
    riot: {
      linked: true,
      linkStatus: "VERIFIED",
      acceptedForCurrentEnvironment: true,
      rsoEnabled: true,
      localControlledMode: false,
      localRiotLinkEnabled: false
    }
  },
  riotAccounts: []
};

describe("restauração segura da sessão", () => {
  it.each([
    [
      "API offline",
      new ExternalServiceError({
        code: "NETWORK_UNAVAILABLE",
        integration: "SPARTA_API",
        message: "Rede indisponível.",
        temporary: true,
        retryable: true
      }),
      "NETWORK_UNAVAILABLE"
    ],
    [
      "timeout",
      new ExternalServiceError({
        code: "REQUEST_TIMEOUT",
        integration: "SPARTA_API",
        message: "Tempo esgotado.",
        temporary: true,
        retryable: true
      }),
      "REQUEST_TIMEOUT"
    ],
    ["resposta 5xx", new ApiError("API indisponível.", 503), "SERVER_UNAVAILABLE"]
  ] as const)("preserva o token em %s", async (_label, error, expectedFailure) => {
    let clearCount = 0;
    const result = await restorePersistedSession(
      "token-cifrado",
      async () => Promise.reject(error),
      async () => {
        clearCount += 1;
      }
    );

    expect(result).toMatchObject({ state: "OFFLINE", failure: expectedFailure });
    expect(clearCount).toBe(0);
  });

  it("limpa somente quando a API confirma 401", async () => {
    let clearCount = 0;
    const result = await restorePersistedSession(
      "token-inválido",
      async () => Promise.reject(new ApiError("Sessão inválida.", 401)),
      async () => {
        clearCount += 1;
      }
    );

    expect(result).toEqual({ state: "INVALID", failure: "AUTHENTICATION_REJECTED" });
    expect(clearCount).toBe(1);
  });

  it("recupera a mesma sessão quando a rede retorna", async () => {
    let attempts = 0;
    let clearCount = 0;
    const verify = async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new ExternalServiceError({
          code: "NETWORK_UNAVAILABLE",
          integration: "SPARTA_API",
          message: "Rede indisponível.",
          temporary: true,
          retryable: true
        });
      }
      return verifiedSession;
    };
    const clear = async () => {
      clearCount += 1;
    };

    expect(await restorePersistedSession("mesmo-token", verify, clear)).toMatchObject({
      state: "OFFLINE"
    });
    expect(await restorePersistedSession("mesmo-token", verify, clear)).toEqual({
      state: "AUTHENTICATED",
      session: verifiedSession
    });
    expect(clearCount).toBe(0);
  });

  it("classifica falha desconhecida como transitória, nunca como logout", () => {
    expect(classifySessionRestoreFailure(new Error("falha local"))).toBe("TEMPORARILY_UNAVAILABLE");
  });
});
