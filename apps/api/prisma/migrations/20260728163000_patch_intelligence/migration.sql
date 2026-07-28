CREATE TABLE "PatchRelease" (
    "id" TEXT NOT NULL,
    "patch" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatchRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatchReleaseRevision" (
    "id" TEXT NOT NULL,
    "patchReleaseId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "changesJson" JSONB NOT NULL,
    "provenanceJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatchReleaseRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatchImportAttempt" (
    "id" TEXT NOT NULL,
    "patchReleaseId" TEXT,
    "patch" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "cacheState" TEXT,

    CONSTRAINT "PatchImportAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatchRelease_patch_locale_sourceUrl_key"
ON "PatchRelease"("patch", "locale", "sourceUrl");

CREATE INDEX "PatchRelease_patch_locale_idx" ON "PatchRelease"("patch", "locale");
CREATE UNIQUE INDEX "PatchReleaseRevision_patchReleaseId_revision_key"
ON "PatchReleaseRevision"("patchReleaseId", "revision");
CREATE UNIQUE INDEX "PatchReleaseRevision_patchReleaseId_sourceHash_key"
ON "PatchReleaseRevision"("patchReleaseId", "sourceHash");
CREATE INDEX "PatchReleaseRevision_sourceHash_idx" ON "PatchReleaseRevision"("sourceHash");
CREATE INDEX "PatchImportAttempt_patch_locale_attemptedAt_idx"
ON "PatchImportAttempt"("patch", "locale", "attemptedAt");
CREATE INDEX "PatchImportAttempt_patchReleaseId_attemptedAt_idx"
ON "PatchImportAttempt"("patchReleaseId", "attemptedAt");

ALTER TABLE "PatchReleaseRevision"
ADD CONSTRAINT "PatchReleaseRevision_patchReleaseId_fkey"
FOREIGN KEY ("patchReleaseId") REFERENCES "PatchRelease"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PatchImportAttempt"
ADD CONSTRAINT "PatchImportAttempt_patchReleaseId_fkey"
FOREIGN KEY ("patchReleaseId") REFERENCES "PatchRelease"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
