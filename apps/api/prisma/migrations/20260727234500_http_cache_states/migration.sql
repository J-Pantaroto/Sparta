-- Nullable by design: old entries have no trustworthy collection timestamp.
ALTER TABLE "ApiCacheEntry" ADD COLUMN "collectedAt" DATETIME;
