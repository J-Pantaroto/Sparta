import { createHmac, timingSafeEqual } from "node:crypto";

export interface TokenPayload {
  sub: string;
  exp: number;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

/**
 * Token de sessao assinado com HMAC-SHA256 (sem dependencia de JWT externo).
 * Formato: "<payload-base64url>.<assinatura-base64url>".
 */
export function signToken(userId: string, secret: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const payload: TokenPayload = { sub: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(payloadPart).digest("base64url");
  return `${payloadPart}.${signature}`;
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  const [payloadPart, signature] = token.split(".");
  if (!payloadPart || !signature) return null;

  const expectedSignature = createHmac("sha256", secret).update(payloadPart).digest("base64url");
  const expectedBuffer = Buffer.from(expectedSignature);
  const givenBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== givenBuffer.length || !timingSafeEqual(expectedBuffer, givenBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf-8")) as TokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
