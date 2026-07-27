import {
  ExternalServiceError,
  publicMessageForExternalError,
  type ExternalErrorCode
} from "../http/external-service-error.js";

function codeForStatus(status: number): ExternalErrorCode {
  if (status === 401 || status === 403) return "RIOT_CREDENTIAL_INVALID";
  if (status === 429) return "RIOT_RATE_LIMITED";
  if (status === 404) return "UPSTREAM_NOT_FOUND";
  return "UPSTREAM_UNAVAILABLE";
}

/** Compatibilidade nominal para consumidores existentes da API Riot. */
export class RiotApiError extends ExternalServiceError {
  readonly retryAfterSeconds?: number;

  constructor(_message: string, status: number, retryAfterSeconds?: number) {
    const code = codeForStatus(status);
    super({
      code,
      integration: "RIOT_API",
      message: publicMessageForExternalError(code),
      status,
      retryAfterMs: retryAfterSeconds === undefined ? undefined : retryAfterSeconds * 1_000,
      temporary: status === 429 || status === 502 || status === 503 || status === 504,
      retryable: status === 429 || status === 502 || status === 503 || status === 504
    });
    this.name = "RiotApiError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
