import { prisma } from "./prisma";

/**
 * Cache generico sobre `ApiCacheEntry`, usado para respostas de APIs externas
 * que nao mudam a cada requisicao (ex.: catalogo de campeoes do Data Dragon,
 * lookup de conta da Riot). Nao serve para partidas (`Match`/`MatchParticipant`),
 * que ja tem a propria tabela como fonte definitiva assim que persistidas.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const entry = await prisma.apiCacheEntry.findUnique({ where: { key } });
  if (!entry || entry.expiresAt < new Date()) return null;
  return entry.valueJson as T;
}

export async function setCached<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.apiCacheEntry.upsert({
    where: { key },
    update: { valueJson: value as object, expiresAt },
    create: { key, valueJson: value as object, expiresAt }
  });
}
