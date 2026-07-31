-- Laboratorio offline de calibracao (Etapa 25b).
-- Tabelas novas e isoladas: nenhuma tabela existente e alterada, e nenhuma
-- linha daqui e lida pelo motor de recomendacao.

CREATE TABLE "CalibrationCandidateConfig" (
    "id" TEXT NOT NULL,
    "riotAccountId" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baselineAggregationVersion" TEXT NOT NULL,
    "candidateVersion" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "configHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "laboratoryVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "decisionBy" TEXT,
    "decisionAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "decisionExperimentId" TEXT,

    CONSTRAINT "CalibrationCandidateConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalibrationCandidateConfig_lineageId_revision_key"
    ON "CalibrationCandidateConfig"("lineageId", "revision");
CREATE INDEX "CalibrationCandidateConfig_riotAccountId_lineageId_idx"
    ON "CalibrationCandidateConfig"("riotAccountId", "lineageId");
CREATE INDEX "CalibrationCandidateConfig_riotAccountId_createdAt_idx"
    ON "CalibrationCandidateConfig"("riotAccountId", "createdAt");

CREATE TABLE "CalibrationExperiment" (
    "id" TEXT NOT NULL,
    "riotAccountId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "filtersJson" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "laboratoryVersion" TEXT NOT NULL,
    "snapshotIdsJson" JSONB NOT NULL,
    "totalCases" INTEGER NOT NULL DEFAULT 0,
    "exactReplayCases" INTEGER NOT NULL DEFAULT 0,
    "integrityFailedCases" INTEGER NOT NULL DEFAULT 0,
    "unsupportedCases" INTEGER NOT NULL DEFAULT 0,
    "missingInputCases" INTEGER NOT NULL DEFAULT 0,
    "excludedCases" INTEGER NOT NULL DEFAULT 0,
    "reportJson" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CalibrationExperiment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalibrationExperiment_riotAccountId_inputHash_key"
    ON "CalibrationExperiment"("riotAccountId", "inputHash");
CREATE INDEX "CalibrationExperiment_riotAccountId_createdAt_idx"
    ON "CalibrationExperiment"("riotAccountId", "createdAt");
CREATE INDEX "CalibrationExperiment_candidateId_idx"
    ON "CalibrationExperiment"("candidateId");

CREATE TABLE "CalibrationExperimentCase" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "draftSessionId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "replayStatus" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "patch" TEXT,
    "comparisonJson" JSONB NOT NULL,

    CONSTRAINT "CalibrationExperimentCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalibrationExperimentCase_experimentId_snapshotId_key"
    ON "CalibrationExperimentCase"("experimentId", "snapshotId");
CREATE INDEX "CalibrationExperimentCase_experimentId_replayStatus_idx"
    ON "CalibrationExperimentCase"("experimentId", "replayStatus");

ALTER TABLE "CalibrationExperiment"
    ADD CONSTRAINT "CalibrationExperiment_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "CalibrationCandidateConfig"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalibrationExperimentCase"
    ADD CONSTRAINT "CalibrationExperimentCase_experimentId_fkey"
    FOREIGN KEY ("experimentId") REFERENCES "CalibrationExperiment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
