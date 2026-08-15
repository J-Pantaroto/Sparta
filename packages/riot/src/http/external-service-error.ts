import type { CacheState } from "@sparta/core";

export type ExternalErrorCode =
  | "REQUEST_TIMEOUT"
  | "NETWORK_UNAVAILABLE"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_INVALID_RESPONSE"
  | "UPSTREAM_NOT_FOUND"
  | "RIOT_CREDENTIAL_INVALID"
  | "RIOT_RATE_LIMITED"
  | "REQUEST_CANCELLED"
  | "INTEGRATION_NOT_CONFIGURED";

export type IntegrationId =
  | "RIOT_API"
  | "DATA_DRAGON"
  | "COMMUNITY_DRAGON"
  | "REMOTE_ASSET"
  | "SPARTA_API"
  | "LCU"
  | "TRANSACTIONAL_EMAIL";

export interface ExternalErrorDetails {
  code: ExternalErrorCode;
  integration: IntegrationId;
  message: string;
  status?: number;
  retryAfterMs?: number;
  temporary: boolean;
  retryable: boolean;
  cacheState?: CacheState;
  cause?: unknown;
}

function sanitizedCause(cause: unknown): { name: string; code?: string } | undefined {
  if (!(cause instanceof Error)) return undefined;
  const nodeCode = (cause as Error & { code?: unknown }).code;
  return {
    name: cause.name || "Error",
    ...(typeof nodeCode === "string" ? { code: nodeCode } : {})
  };
}

/**
 * Erro único das integrações. Mensagens são controladas pelo Sparta e a
 * causa retém somente nome/código técnico: URL, headers, payload e segredos
 * nunca entram no objeto público.
 */
export class ExternalServiceError extends Error {
  readonly code: ExternalErrorCode;
  readonly integration: IntegrationId;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly temporary: boolean;
  readonly retryable: boolean;
  readonly cacheState?: CacheState;
  readonly sanitizedCause?: { name: string; code?: string };

  constructor(details: ExternalErrorDetails) {
    super(details.message);
    this.name = "ExternalServiceError";
    this.code = details.code;
    this.integration = details.integration;
    this.status = details.status;
    this.retryAfterMs = details.retryAfterMs;
    this.temporary = details.temporary;
    this.retryable = details.retryable;
    this.cacheState = details.cacheState;
    this.sanitizedCause = sanitizedCause(details.cause);
  }
}

export function publicMessageForExternalError(code: ExternalErrorCode): string {
  switch (code) {
    case "REQUEST_TIMEOUT":
      return "O serviço demorou demais para responder.";
    case "NETWORK_UNAVAILABLE":
      return "Não foi possível acessar o serviço pela rede.";
    case "UPSTREAM_UNAVAILABLE":
      return "O serviço externo está temporariamente indisponível.";
    case "UPSTREAM_INVALID_RESPONSE":
      return "O serviço externo respondeu em um formato inválido.";
    case "UPSTREAM_NOT_FOUND":
      return "O recurso solicitado não foi encontrado.";
    case "RIOT_CREDENTIAL_INVALID":
      return "A credencial da Riot está inválida ou expirou.";
    case "RIOT_RATE_LIMITED":
      return "O limite de requisições da Riot foi atingido.";
    case "REQUEST_CANCELLED":
      return "A requisição foi cancelada.";
    case "INTEGRATION_NOT_CONFIGURED":
      return "A integração externa não está configurada.";
  }
}

export function externalErrorPayload(error: ExternalServiceError) {
  return {
    code: error.code,
    message: publicMessageForExternalError(error.code),
    integration: error.integration,
    ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {})
  };
}
