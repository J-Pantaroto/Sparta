import { createHash, randomBytes } from "node:crypto";
import { URL } from "node:url";

export const RIOT_ACCOUNT_LINK_STATUSES = [
  "UNVERIFIED_LEGACY",
  "PENDING_VERIFICATION",
  "VERIFIED_BY_RSO",
  "REVOKED",
  "REQUIRES_REAUTHENTICATION"
] as const;

export type RiotAccountLinkStatus = (typeof RIOT_ACCOUNT_LINK_STATUSES)[number];

export function isRiotAccountAccessAllowed(
  linkStatus: string | undefined,
  identityMode: "LOCAL_CONTROLLED" | "TEST" | "RSO_REQUIRED"
): boolean {
  return (
    linkStatus === "VERIFIED_BY_RSO" ||
    (identityMode !== "RSO_REQUIRED" &&
      (linkStatus === "UNVERIFIED_LEGACY" ||
        // Compatibilidade exclusiva de testes com fixtures anteriores a
        // migration. Em producao a coluna NOT NULL impede este estado.
        linkStatus === undefined))
  );
}

export type RiotIdentityClaim = {
  puuid: string;
  gameName: string;
  tagLine: string;
  platformRegion: string;
  regionalRouting: string;
};

/**
 * Fronteira do provedor oficial. A implementacao futura troca o code no
 * backend e consulta Account-V1 `/riot/account/v1/accounts/me`. Nenhum token
 * faz parte do retorno e nenhum detalhe do provedor vaza para renderer/log.
 */
export interface RiotIdentityProvider {
  readonly name: "RIOT_RSO";
  isConfigured(): boolean;
  exchangeCodeForOwnIdentity(input: {
    code: string;
    redirectUri: string;
  }): Promise<RiotIdentityClaim>;
}

export const unavailableRiotIdentityProvider: RiotIdentityProvider = {
  name: "RIOT_RSO",
  isConfigured: () => false,
  async exchangeCodeForOwnIdentity() {
    throw new Error("RSO_PROVIDER_NOT_CONFIGURED");
  }
};

export function createAuthorizationState(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAuthorizationState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function verificationEvidenceHash(claim: RiotIdentityClaim): string {
  return createHash("sha256")
    .update(`RIOT_RSO\0${claim.platformRegion}\0${claim.puuid}`, "utf8")
    .digest("hex");
}

export function buildRsoAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://auth.riotgames.com/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid offline_access");
  url.searchParams.set("state", input.state);
  return url.toString();
}
