import { RiotApiClient } from "@sparta/riot";
import { loadEnv } from "../../config/env";

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
    throw new Error("RIOT_API_KEY nao configurada. Defina a variavel de ambiente para usar integracoes reais da Riot API.");
  }

  cachedClient = new RiotApiClient({
    apiKey: env.RIOT_API_KEY,
    platformRegion: env.RIOT_PLATFORM_REGION,
    regionalRouting: env.RIOT_REGIONAL_ROUTING
  });
  return cachedClient;
}
