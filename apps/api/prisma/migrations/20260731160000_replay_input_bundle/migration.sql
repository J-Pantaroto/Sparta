-- Captura prospectiva dos inputs de derivacao (Etapa 26b).
-- Tabela nova e isolada, um-para-um com RecommendationSnapshot.
-- Snapshots anteriores ficam sem bundle de proposito: nao ha backfill.

CREATE TABLE "ReplayInputBundleRecord" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "contentBytes" INTEGER NOT NULL,
    "algorithmVersions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerification" JSONB,

    CONSTRAINT "ReplayInputBundleRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReplayInputBundleRecord_snapshotId_key"
    ON "ReplayInputBundleRecord"("snapshotId");
CREATE INDEX "ReplayInputBundleRecord_contentHash_idx"
    ON "ReplayInputBundleRecord"("contentHash");

ALTER TABLE "ReplayInputBundleRecord"
    ADD CONSTRAINT "ReplayInputBundleRecord_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "RecommendationSnapshot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
