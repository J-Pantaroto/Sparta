ALTER TABLE "Match" ADD COLUMN "gameId" TEXT;

UPDATE "Match"
SET "gameId" = COALESCE(
  "rawJson" #>> '{info,gameId}',
  substring("matchId" from '_([0-9]+)$')
)
WHERE "gameId" IS NULL;

CREATE UNIQUE INDEX "Match_platform_gameId_key" ON "Match"("platform", "gameId");

ALTER TABLE "DraftSession"
  ADD COLUMN "externalGameId" TEXT,
  ADD COLUMN "externalGameIdSource" TEXT,
  ADD COLUMN "externalGameIdObservedAt" TIMESTAMP(3),
  ADD COLUMN "matchLinkStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "matchLinkStrategy" TEXT,
  ADD COLUMN "matchLinkAlgorithmVersion" TEXT,
  ADD COLUMN "matchLinkEvidenceJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "matchLinkCandidateCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "matchLinkReason" TEXT,
  ADD COLUMN "matchLinkDecidedAt" TIMESTAMP(3),
  ADD COLUMN "legacyLinkedMatchId" TEXT;

-- Antes desta etapa o desktop podia fornecer `linkedMatchId` diretamente.
-- O valor não satisfaz o novo contrato de confiança: é preservado para
-- diagnóstico, mas deixa de ser um vínculo ativo antes da criação da FK.
UPDATE "DraftSession"
SET
  "legacyLinkedMatchId" = "linkedMatchId",
  "linkedMatchId" = NULL,
  "matchLinkStatus" = 'UNLINKABLE',
  "matchLinkReason" = 'Vínculo legado informado pelo cliente; requer reconciliação pela Etapa 21.',
  "matchLinkDecidedAt" = CURRENT_TIMESTAMP,
  "status" = CASE WHEN "status" = 'COMPLETED' THEN 'IN_GAME' ELSE "status" END,
  "completedAt" = CASE WHEN "status" = 'COMPLETED' THEN NULL ELSE "completedAt" END
WHERE "linkedMatchId" IS NOT NULL;

CREATE TABLE "DraftMatchLinkRevision" (
  "id" TEXT NOT NULL,
  "draftSessionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "strategy" TEXT,
  "matchId" TEXT,
  "externalGameId" TEXT,
  "evidenceJson" JSONB NOT NULL DEFAULT '[]',
  "candidateCount" INTEGER NOT NULL DEFAULT 0,
  "algorithmVersion" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DraftMatchLinkRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftSession_riotAccountId_linkedMatchId_key"
  ON "DraftSession"("riotAccountId", "linkedMatchId");
CREATE INDEX "DraftSession_riotAccountId_matchLinkStatus_idx"
  ON "DraftSession"("riotAccountId", "matchLinkStatus");
CREATE INDEX "DraftSession_externalGameId_idx" ON "DraftSession"("externalGameId");
CREATE UNIQUE INDEX "DraftMatchLinkRevision_draftSessionId_revision_key"
  ON "DraftMatchLinkRevision"("draftSessionId", "revision");
CREATE INDEX "DraftMatchLinkRevision_draftSessionId_decidedAt_idx"
  ON "DraftMatchLinkRevision"("draftSessionId", "decidedAt");
CREATE INDEX "DraftMatchLinkRevision_matchId_idx" ON "DraftMatchLinkRevision"("matchId");

ALTER TABLE "DraftSession"
  ADD CONSTRAINT "DraftSession_linkedMatchId_fkey"
  FOREIGN KEY ("linkedMatchId") REFERENCES "Match"("matchId")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DraftMatchLinkRevision"
  ADD CONSTRAINT "DraftMatchLinkRevision_draftSessionId_fkey"
  FOREIGN KEY ("draftSessionId") REFERENCES "DraftSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
