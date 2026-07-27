import { prisma } from "./prisma.js";
import type { CacheMetadata, CacheState } from "@sparta/core";

export interface CacheRead<T> {
  value: T | null;
  metadata: CacheMetadata;
}

function iso(date: Date | null | undefined): string | undefined {
  return date?.toISOString();
}

export async function readCache<T>(key: string, staleTtlMs: number, now = new Date()): Promise<CacheRead<T>> {
  const entry = await prisma.apiCacheEntry.findUnique({ where: { key } });
  if (!entry) return { value: null, metadata: { state: "MISS", servedAsFallback: false } };

  const staleUntil = new Date(entry.expiresAt.getTime() + Math.max(0, staleTtlMs));
  const state: CacheState = now < entry.expiresAt ? "FRESH" : now < staleUntil ? "STALE" : "EXPIRED";
  const collectedAt = entry.collectedAt ?? undefined;
  return {
    value: state === "EXPIRED" ? null : (entry.valueJson as T),
    metadata: {
      state,
      collectedAt: iso(collectedAt),
      freshUntil: iso(entry.expiresAt),
      staleUntil: iso(staleUntil),
      ageMs: collectedAt ? Math.max(0, now.getTime() - collectedAt.getTime()) : undefined,
      servedAsFallback: false
    }
  };
}

/**
 * Cache generico sobre `ApiCacheEntry`, usado para respostas de APIs externas
 * que nao mudam a cada requisicao (ex.: catalogo de campeoes do Data Dragon,
 * lookup de conta da Riot). Nao serve para partidas (`Match`/`MatchParticipant`),
 * que ja tem a propria tabela como fonte definitiva assim que persistidas.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const result = await readCache<T>(key, 0);
  return result.metadata.state === "FRESH" ? result.value : null;
}

export async function setCached<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const collectedAt = new Date();
  const expiresAt = new Date(collectedAt.getTime() + ttlMs);
  await prisma.apiCacheEntry.upsert({
    where: { key },
    update: { valueJson: value as object, expiresAt, collectedAt },
    create: { key, valueJson: value as object, expiresAt, collectedAt }
  });
}
