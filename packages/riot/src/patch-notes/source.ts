import { URL } from "node:url";
import { HTTP_TIMEOUTS, RIOT_GET_RETRY_POLICY, fetchWithPolicy } from "../http/policy.js";

const OFFICIAL_PATCH_HOSTS = new Set(["www.leagueoflegends.com", "leagueoflegends.com"]);
const LOCALE_PATHS: Readonly<Record<string, string>> = {
  en_US: "en-us",
  pt_BR: "pt-br"
};

export class UnsupportedPatchNotesSourceError extends Error {
  readonly code = "PATCH_SOURCE_NOT_ALLOWED";
}

export function officialPatchNotesUrl(patch: string, locale: string): string {
  const localePath = LOCALE_PATHS[locale];
  if (!localePath) throw new UnsupportedPatchNotesSourceError(`Locale não suportado: ${locale}`);
  if (!/^\d{1,2}\.\d{1,2}$/.test(patch)) {
    throw new UnsupportedPatchNotesSourceError("Patch deve usar o formato principal.secundário.");
  }
  const major = Number(patch.split(".")[0]);
  const slug =
    major >= 26
      ? `league-of-legends-patch-${patch.replace(".", "-")}-notes`
      : `patch-${patch.replace(".", "-")}-notes`;
  return `https://www.leagueoflegends.com/${localePath}/news/game-updates/${slug}/`;
}

export function assertOfficialPatchNotesUrl(sourceUrl: string): URL {
  const url = new URL(sourceUrl);
  const pathParts = url.pathname.toLowerCase().split("/").filter(Boolean);
  if (
    url.protocol !== "https:" ||
    !OFFICIAL_PATCH_HOSTS.has(url.hostname.toLowerCase()) ||
    pathParts[1] !== "news" ||
    pathParts[2] !== "game-updates" ||
    !pathParts[3]?.endsWith("-notes")
  ) {
    throw new UnsupportedPatchNotesSourceError(
      "A fonte precisa ser uma página oficial de patch notes da Riot."
    );
  }
  return url;
}

export interface CollectedPatchNotesPage {
  html: string;
  sourceUrl: string;
  collectedAt: string;
}

export async function collectOfficialPatchNotesPage(
  sourceUrl: string,
  options: { now?: () => Date; fetchImpl?: typeof fetch } = {}
): Promise<CollectedPatchNotesPage> {
  const url = assertOfficialPatchNotesUrl(sourceUrl);
  const response = await fetchWithPolicy(url.toString(), {
    integration: "RIOT_API",
    timeoutMs: HTTP_TIMEOUTS.remoteAssetMs,
    retryPolicy: RIOT_GET_RETRY_POLICY,
    idempotent: true,
    fetchImpl: options.fetchImpl
  });
  const html = await response.text();
  return {
    html,
    sourceUrl: url.toString(),
    collectedAt: (options.now?.() ?? new Date()).toISOString()
  };
}
