-- Persistencia e operacao segura de releases (Etapa 27b).
-- Tres tabelas novas e isoladas, mais o eco (nullable) da configuracao
-- efetiva em RecommendationSnapshot. Nenhuma tabela existente perde dado, e
-- nenhum snapshot anterior recebe dado retroativo.

ALTER TABLE "RecommendationSnapshot"
    ADD COLUMN "configurationSource" TEXT,
    ADD COLUMN "configurationReleaseId" TEXT,
    ADD COLUMN "configurationVersion" TEXT,
    ADD COLUMN "configHash" TEXT,
    ADD COLUMN "effectiveConfigurationJson" JSONB;

CREATE TABLE "RecommendationEngineRelease" (
    "id" TEXT NOT NULL,
    "riotAccountId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "candidateRevisionId" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "releaseVersion" TEXT NOT NULL,
    "baselineVersion" TEXT NOT NULL,
    "candidateVersion" TEXT NOT NULL,
    "artifactSchemaVersion" TEXT NOT NULL,
    "artifactJson" JSONB NOT NULL,
    "artifactHash" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "validationJson" JSONB,
    "validatedArtifactHash" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedBy" TEXT,
    "activatedAt" TIMESTAMP(3),
    "previousReleaseId" TEXT,
    "rolledBackBy" TEXT,
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackReason" TEXT,

    CONSTRAINT "RecommendationEngineRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecommendationEngineRelease_riotAccountId_artifactHash_key"
    ON "RecommendationEngineRelease"("riotAccountId", "artifactHash");
CREATE INDEX "RecommendationEngineRelease_riotAccountId_status_idx"
    ON "RecommendationEngineRelease"("riotAccountId", "status");
CREATE INDEX "RecommendationEngineRelease_riotAccountId_candidateId_idx"
    ON "RecommendationEngineRelease"("riotAccountId", "candidateId");

ALTER TABLE "RecommendationEngineRelease"
    ADD CONSTRAINT "RecommendationEngineRelease_candidateRevisionId_fkey"
    FOREIGN KEY ("candidateRevisionId") REFERENCES "CalibrationCandidateConfig"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RecommendationEngineActivePointer" (
    "riotAccountId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "RecommendationEngineActivePointer_pkey" PRIMARY KEY ("riotAccountId")
);

CREATE TABLE "RecommendationEngineReleaseEvent" (
    "id" TEXT NOT NULL,
    "riotAccountId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actor" TEXT,
    "reason" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationEngineReleaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecommendationEngineReleaseEvent_riotAccountId_createdAt_idx"
    ON "RecommendationEngineReleaseEvent"("riotAccountId", "createdAt");
CREATE INDEX "RecommendationEngineReleaseEvent_releaseId_createdAt_idx"
    ON "RecommendationEngineReleaseEvent"("releaseId", "createdAt");

ALTER TABLE "RecommendationEngineReleaseEvent"
    ADD CONSTRAINT "RecommendationEngineReleaseEvent_releaseId_fkey"
    FOREIGN KEY ("releaseId") REFERENCES "RecommendationEngineRelease"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
