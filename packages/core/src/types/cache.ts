export type CacheState = "MISS" | "FRESH" | "STALE" | "EXPIRED";

/**
 * Estado de uma cópia local sem apagar a origem do dado. A fonte continua
 * sendo Riot/Data Dragon/etc.; este bloco descreve apenas como a cópia foi
 * usada.
 */
export interface CacheMetadata {
  state: CacheState;
  collectedAt?: string;
  freshUntil?: string;
  staleUntil?: string;
  ageMs?: number;
  servedAsFallback: boolean;
  fallbackReason?: string;
}
