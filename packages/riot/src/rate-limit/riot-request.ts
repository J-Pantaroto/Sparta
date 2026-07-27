import { RiotApiError } from "../errors/riot-api-error.js";
import {
  ExternalServiceError,
  HTTP_TIMEOUTS,
  RIOT_GET_RETRY_POLICY,
  requestJson,
  type RetryPolicy
} from "../http/index.js";

/**
 * Requisicao HTTP para a Riot API com tratamento real de rate limit: so
 * retenta 429/502/503/504, espera o tempo exato do header Retry-After quando
 * presente (senao cai no backoff exponencial), e propaga qualquer outro erro
 * (401/403/404 etc.) imediatamente, sem retry - ao contrario do
 * `retryWithBackoff` generico usado pelo Data Dragon, que retentava tudo
 * (inclusive um 404 de Riot ID inexistente, gastando 3 tentativas a toa).
 */
export async function requestWithRiotRateLimit<T>(
  url: string,
  apiKey: string,
  options: {
    retries?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
    validate?: (payload: unknown) => payload is T;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
  } = {}
): Promise<T> {
  const retryPolicy: RetryPolicy = {
    ...RIOT_GET_RETRY_POLICY,
    maxAttempts: (options.retries ?? RIOT_GET_RETRY_POLICY.maxAttempts - 1) + 1,
    baseDelayMs: options.baseDelayMs ?? RIOT_GET_RETRY_POLICY.baseDelayMs
  };
  try {
    return await requestJson<T>(url, {
      integration: "RIOT_API",
      timeoutMs: options.timeoutMs ?? HTTP_TIMEOUTS.riotApiMs,
      retryPolicy,
      idempotent: true,
      request: { method: "GET", headers: { "X-Riot-Token": apiKey } },
      validate: options.validate,
      fetchImpl: options.fetchImpl,
      sleep: options.sleep,
      random: options.random
    });
  } catch (error) {
    if (error instanceof ExternalServiceError && error.status !== undefined && error.status >= 400) {
      throw new RiotApiError(
        error.message,
        error.status,
        error.retryAfterMs === undefined ? undefined : error.retryAfterMs / 1_000
      );
    }
    throw error;
  }
}
