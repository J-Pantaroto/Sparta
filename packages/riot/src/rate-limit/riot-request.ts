import { RiotApiError } from "../errors/riot-api-error.js";

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

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
  options: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url, { headers: { "X-Riot-Token": apiKey } });
    if (response.ok) {
      return (await response.json()) as T;
    }

    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
    const error = new RiotApiError(`Riot API request failed with ${response.status}`, response.status, retryAfterSeconds);

    const isRetryable = RETRYABLE_STATUSES.has(response.status);
    if (!isRetryable || attempt === retries) {
      throw error;
    }

    const delayMs = retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : baseDelayMs * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new RiotApiError(`Riot API request failed after ${retries} retries`, 0);
}
