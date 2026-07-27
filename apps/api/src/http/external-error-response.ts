import type { FastifyReply } from "fastify";
import { ExternalServiceError, externalErrorPayload } from "@sparta/riot";

export function statusForExternalError(error: ExternalServiceError): number {
  switch (error.code) {
    case "UPSTREAM_NOT_FOUND":
      return 404;
    case "RIOT_RATE_LIMITED":
      return 429;
    case "REQUEST_TIMEOUT":
      return 504;
    case "REQUEST_CANCELLED":
      return 408;
    case "RIOT_CREDENTIAL_INVALID":
    case "INTEGRATION_NOT_CONFIGURED":
      return 503;
    default:
      return 502;
  }
}

export function sendExternalError(reply: FastifyReply, error: ExternalServiceError) {
  return reply.code(statusForExternalError(error)).send(externalErrorPayload(error));
}

/** Campos deliberadamente limitados: sem URL, headers, payload, PUUID ou stack. */
export function safeExternalErrorLog(error: unknown) {
  if (!(error instanceof ExternalServiceError)) return { code: "UNEXPECTED_EXTERNAL_ERROR" };
  return {
    code: error.code,
    integration: error.integration,
    status: error.status,
    retryAfterMs: error.retryAfterMs,
    causeName: error.sanitizedCause?.name,
    causeCode: error.sanitizedCause?.code
  };
}
