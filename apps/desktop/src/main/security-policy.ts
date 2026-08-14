import { basename } from "node:path";
import { URL } from "node:url";

const RIOT_AUTH_HOST = "auth.riotgames.com";
const SKIN_HOSTS = new Set(["ddragon.leagueoflegends.com", "raw.communitydragon.org"]);
const SAFE_SKIN_FILE = /^[A-Za-z0-9._-]{1,128}$/;

export function isExpectedRendererUrl(candidate: string, expected: string): boolean {
  try {
    const candidateUrl = new URL(candidate);
    const expectedUrl = new URL(expected);
    if (expectedUrl.protocol === "file:") return candidateUrl.href === expectedUrl.href;
    return (
      candidateUrl.protocol === expectedUrl.protocol &&
      candidateUrl.origin === expectedUrl.origin &&
      candidateUrl.pathname === expectedUrl.pathname
    );
  } catch {
    return false;
  }
}

export interface IpcSenderLike {
  senderFrame?: { url: string } | null;
  sender: { mainFrame?: unknown };
}

export function isTrustedIpcSender(event: IpcSenderLike, expectedRendererUrl: string): boolean {
  return Boolean(
    event.senderFrame &&
    event.senderFrame === event.sender.mainFrame &&
    isExpectedRendererUrl(event.senderFrame.url, expectedRendererUrl)
  );
}

export function assertTrustedIpcSender(event: IpcSenderLike, expectedRendererUrl: string): void {
  if (!isTrustedIpcSender(event, expectedRendererUrl)) {
    throw new Error("Origem IPC não autorizada.");
  }
}

export function windowOpenPolicy(): { action: "deny" } {
  return { action: "deny" };
}

export function isValidSessionToken(token: unknown): token is string {
  return typeof token === "string" && token.length > 0 && token.length <= 8_192;
}

export function allowedRiotAuthorizationUrl(target: unknown): URL | null {
  if (typeof target !== "string" || target.length > 4_096) return null;
  try {
    const url = new URL(target);
    return url.protocol === "https:" && url.hostname === RIOT_AUTH_HOST ? url : null;
  } catch {
    return null;
  }
}

export function allowedSkinDownload(
  target: unknown,
  fileName: unknown
): { url: URL; safeName: string } | null {
  if (typeof target !== "string" || target.length > 4_096 || typeof fileName !== "string") {
    return null;
  }
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || !SKIN_HOSTS.has(url.hostname)) return null;
    const safeName = basename(fileName);
    if (safeName !== fileName || !SAFE_SKIN_FILE.test(safeName)) return null;
    return { url, safeName };
  } catch {
    return null;
  }
}
