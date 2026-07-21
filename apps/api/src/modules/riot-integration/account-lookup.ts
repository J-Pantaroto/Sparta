import { getCached, setCached } from "../../db/api-cache";
import { getRiotApiClient } from "./client-factory";

const ACCOUNT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface RiotAccountInfo {
  puuid: string;
  gameName: string;
  tagLine: string;
}

/**
 * Busca puuid/gameName/tagLine reais via Account-V1, cacheando por 24h - o
 * Riot ID pode mudar (rename), mas nao a cada minuto, e evita bater na Riot
 * toda vez que o usuario reabre a tela de vinculo de conta.
 */
export async function lookupRiotAccount(gameName: string, tagLine: string): Promise<RiotAccountInfo> {
  const cacheKey = `riot-account:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`;
  const cached = await getCached<RiotAccountInfo>(cacheKey);
  if (cached) return cached;

  const client = getRiotApiClient();
  const info = await client.getAccountByRiotId(gameName, tagLine);
  await setCached(cacheKey, info, ACCOUNT_CACHE_TTL_MS);
  return info;
}
