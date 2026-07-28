CREATE TABLE "DraftPostGameComparisonRevision" (
    "id" TEXT NOT NULL,
    "draftSessionId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "postgameReportId" TEXT,
    "riotAccountId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "inputHash" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "sourceVersionsJson" JSONB NOT NULL,
    "snapshotSignalIdsJson" JSONB NOT NULL DEFAULT '[]',
    "coverage" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "unavailableReasonsJson" JSONB NOT NULL DEFAULT '[]',
    "reportJson" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftPostGameComparisonRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftPostGameComparisonRevision_draftSessionId_revision_key"
ON "DraftPostGameComparisonRevision"("draftSessionId", "revision");

CREATE UNIQUE INDEX "DraftPostGameComparisonRevision_draftSessionId_inputHash_algorithmVersion_key"
ON "DraftPostGameComparisonRevision"("draftSessionId", "inputHash", "algorithmVersion");

CREATE INDEX "DraftPostGameComparisonRevision_matchId_riotAccountId_generatedAt_idx"
ON "DraftPostGameComparisonRevision"("matchId", "riotAccountId", "generatedAt");

CREATE INDEX "DraftPostGameComparisonRevision_snapshotId_idx"
ON "DraftPostGameComparisonRevision"("snapshotId");

CREATE INDEX "DraftPostGameComparisonRevision_postgameReportId_idx"
ON "DraftPostGameComparisonRevision"("postgameReportId");

ALTER TABLE "DraftPostGameComparisonRevision"
ADD CONSTRAINT "DraftPostGameComparisonRevision_draftSessionId_fkey"
FOREIGN KEY ("draftSessionId") REFERENCES "DraftSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftPostGameComparisonRevision"
ADD CONSTRAINT "DraftPostGameComparisonRevision_matchId_fkey"
FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftPostGameComparisonRevision"
ADD CONSTRAINT "DraftPostGameComparisonRevision_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "RecommendationSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DraftPostGameComparisonRevision"
ADD CONSTRAINT "DraftPostGameComparisonRevision_postgameReportId_fkey"
FOREIGN KEY ("postgameReportId") REFERENCES "PostgameReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DraftPostGameComparisonRevision"
ADD CONSTRAINT "DraftPostGameComparisonRevision_riotAccountId_fkey"
FOREIGN KEY ("riotAccountId") REFERENCES "RiotAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
