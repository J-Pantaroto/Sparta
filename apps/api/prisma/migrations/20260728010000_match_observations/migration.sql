ALTER TABLE "Match"
  ADD COLUMN "gameVersion" TEXT,
  ADD COLUMN "queueId" INTEGER,
  ADD COLUMN "gameMode" TEXT,
  ADD COLUMN "gameType" TEXT;

ALTER TABLE "MatchParticipant" ALTER COLUMN "role" DROP NOT NULL;

CREATE TABLE "MatchObservation" (
  "id" TEXT NOT NULL,
  "matchParticipantId" TEXT NOT NULL,
  "extractorVersion" TEXT NOT NULL,
  "teamPosition" TEXT,
  "individualPosition" TEXT,
  "positionAssignedByMatchmaking" TEXT,
  "normalizedRole" TEXT,
  "normalizedRoleSource" TEXT,
  "assignedRole" TEXT,
  "positionDiverged" BOOLEAN NOT NULL,
  "positionStatus" TEXT NOT NULL,
  "runesStatus" TEXT NOT NULL,
  "primaryStyleId" INTEGER,
  "secondaryStyleId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatchObservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchItemSlot" (
  "id" TEXT NOT NULL,
  "matchObservationId" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "state" TEXT NOT NULL,
  "itemId" INTEGER,
  "itemName" TEXT,
  "asset" TEXT,
  "catalogVersion" TEXT,
  "catalogStatus" TEXT NOT NULL,
  CONSTRAINT "MatchItemSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchRuneSelection" (
  "id" TEXT NOT NULL,
  "matchObservationId" TEXT NOT NULL,
  "tree" TEXT NOT NULL,
  "slotOrder" INTEGER NOT NULL,
  "perkId" INTEGER NOT NULL,
  "perkName" TEXT,
  "isKeystone" BOOLEAN NOT NULL,
  "catalogVersion" TEXT,
  "catalogStatus" TEXT NOT NULL,
  CONSTRAINT "MatchRuneSelection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchRuneFragment" (
  "id" TEXT NOT NULL,
  "matchObservationId" TEXT NOT NULL,
  "slot" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "fragmentId" INTEGER,
  "fragmentName" TEXT,
  "catalogVersion" TEXT,
  "catalogStatus" TEXT NOT NULL,
  CONSTRAINT "MatchRuneFragment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchSummonerSpellSlot" (
  "id" TEXT NOT NULL,
  "matchObservationId" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "state" TEXT NOT NULL,
  "spellId" INTEGER,
  "spellName" TEXT,
  "asset" TEXT,
  "catalogVersion" TEXT,
  "catalogStatus" TEXT NOT NULL,
  CONSTRAINT "MatchSummonerSpellSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchObservation_matchParticipantId_key" ON "MatchObservation"("matchParticipantId");
CREATE INDEX "MatchObservation_normalizedRole_idx" ON "MatchObservation"("normalizedRole");
CREATE INDEX "MatchObservation_extractorVersion_idx" ON "MatchObservation"("extractorVersion");
CREATE UNIQUE INDEX "MatchItemSlot_matchObservationId_slot_key" ON "MatchItemSlot"("matchObservationId", "slot");
CREATE INDEX "MatchItemSlot_itemId_idx" ON "MatchItemSlot"("itemId");
CREATE UNIQUE INDEX "MatchRuneSelection_matchObservationId_tree_slotOrder_key" ON "MatchRuneSelection"("matchObservationId", "tree", "slotOrder");
CREATE INDEX "MatchRuneSelection_perkId_idx" ON "MatchRuneSelection"("perkId");
CREATE UNIQUE INDEX "MatchRuneFragment_matchObservationId_slot_key" ON "MatchRuneFragment"("matchObservationId", "slot");
CREATE INDEX "MatchRuneFragment_fragmentId_idx" ON "MatchRuneFragment"("fragmentId");
CREATE UNIQUE INDEX "MatchSummonerSpellSlot_matchObservationId_slot_key" ON "MatchSummonerSpellSlot"("matchObservationId", "slot");
CREATE INDEX "MatchSummonerSpellSlot_spellId_idx" ON "MatchSummonerSpellSlot"("spellId");

ALTER TABLE "MatchObservation" ADD CONSTRAINT "MatchObservation_matchParticipantId_fkey"
  FOREIGN KEY ("matchParticipantId") REFERENCES "MatchParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchItemSlot" ADD CONSTRAINT "MatchItemSlot_matchObservationId_fkey"
  FOREIGN KEY ("matchObservationId") REFERENCES "MatchObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchRuneSelection" ADD CONSTRAINT "MatchRuneSelection_matchObservationId_fkey"
  FOREIGN KEY ("matchObservationId") REFERENCES "MatchObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchRuneFragment" ADD CONSTRAINT "MatchRuneFragment_matchObservationId_fkey"
  FOREIGN KEY ("matchObservationId") REFERENCES "MatchObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchSummonerSpellSlot" ADD CONSTRAINT "MatchSummonerSpellSlot_matchObservationId_fkey"
  FOREIGN KEY ("matchObservationId") REFERENCES "MatchObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
