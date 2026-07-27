import { ExternalServiceError, RiotApiClient, publicMessageForExternalError } from "@sparta/riot";
import { loadEnv } from "../../config/env.js";

let cachedClient: RiotApiClient | null = null;

/**
 * Fabrica singleton do RiotApiClient a partir das env vars. Lanca erro claro
 * se RIOT_API_KEY nao estiver configurada, em vez de deixar a chamada falhar
 * silenciosamente na Riot com um 401/403 dificil de diagnosticar.
 */
export function getRiotApiClient(): RiotApiClient {
  if (cachedClient) return cachedClient;

  const env = loadEnv();
  if (!env.RIOT_API_KEY) {
    throw new ExternalServiceError({
      code: "INTEGRATION_NOT_CONFIGURED",
      integration: "RIOT_API",
      message: publicMessageForExternalError("INTEGRATION_NOT_CONFIGURED"),
      temporary: false,
      retryable: false
    });
  }

  cachedClient = new RiotApiClient({
    apiKey: env.RIOT_API_KEY,
    platformRegion: env.RIOT_PLATFORM_REGION,
    regionalRouting: env.RIOT_REGIONAL_ROUTING
  });
  return cachedClient;
}
