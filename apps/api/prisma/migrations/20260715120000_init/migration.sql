-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiotAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "puuid" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "tagLine" TEXT NOT NULL,
    "platformRegion" TEXT NOT NULL,
    "regionalRouting" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiotAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerProfile" (
    "id" TEXT NOT NULL,
    "riotAccountId" TEXT NOT NULL,
    "preferredRoles" TEXT[],
    "strengthsJson" JSONB NOT NULL DEFAULT '[]',
    "weaknessesJson" JSONB NOT NULL DEFAULT '[]',
    "recentFormJson" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Champion" (
    "id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "roles" TEXT[],
    "version" TEXT,

    CONSTRAINT "Champion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChampionTag" (
    "id" TEXT NOT NULL,
    "championId" INTEGER NOT NULL,
    "damageProfile" TEXT NOT NULL,
    "tags" TEXT[],
    "blindSafety" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "engage" DOUBLE PRECISION NOT NULL,
    "peel" DOUBLE PRECISION NOT NULL,
    "frontline" DOUBLE PRECISION NOT NULL,
    "pickoff" DOUBLE PRECISION NOT NULL,
    "waveclear" DOUBLE PRECISION NOT NULL,
    "scaling" DOUBLE PRECISION NOT NULL,
    "earlyPressure" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ChampionTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "patch" TEXT,
    "durationSeconds" INTEGER,
    "startedAt" TIMESTAMP(3),
    "rawJson" JSONB,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "riotAccountId" TEXT,
    "puuid" TEXT NOT NULL,
    "championId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "won" BOOLEAN NOT NULL,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "csPerMinute" DOUBLE PRECISION NOT NULL,
    "goldPerMinute" DOUBLE PRECISION NOT NULL,
    "damagePerMinute" DOUBLE PRECISION NOT NULL,
    "visionScorePerMinute" DOUBLE PRECISION NOT NULL,
    "killParticipation" DOUBLE PRECISION NOT NULL,
    "objectiveParticipation" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchTimeline" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "deathsBefore10" INTEGER NOT NULL DEFAULT 0,
    "deathsBefore15" INTEGER NOT NULL DEFAULT 0,
    "csAt10" DOUBLE PRECISION,
    "csAt15" DOUBLE PRECISION,
    "goldDiffAt15" DOUBLE PRECISION,
    "eventsJson" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "MatchTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerChampionStats" (
    "id" TEXT NOT NULL,
    "playerProfileId" TEXT NOT NULL,
    "championId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "games" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "csPerMinute" DOUBLE PRECISION NOT NULL,
    "goldPerMinute" DOUBLE PRECISION NOT NULL,
    "damagePerMinute" DOUBLE PRECISION NOT NULL,
    "visionScorePerMinute" DOUBLE PRECISION NOT NULL,
    "killParticipation" DOUBLE PRECISION NOT NULL,
    "objectiveParticipation" DOUBLE PRECISION NOT NULL,
    "recentMatchesJson" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerChampionStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftSession" (
    "id" TEXT NOT NULL,
    "puuid" TEXT NOT NULL,
    "patch" TEXT,
    "playerRole" TEXT NOT NULL,
    "pickOrder" INTEGER NOT NULL,
    "draftStateJson" JSONB NOT NULL,
    "selectedChampionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickRecommendation" (
    "id" TEXT NOT NULL,
    "draftSessionId" TEXT NOT NULL,
    "championId" INTEGER NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "confidence" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostgameReport" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "puuid" TEXT NOT NULL,
    "draftSessionId" TEXT,
    "reportJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostgameReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplayImportJob" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplayImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCacheEntry" (
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCacheEntry_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RiotAccount_puuid_key" ON "RiotAccount"("puuid");

-- CreateIndex
CREATE INDEX "RiotAccount_puuid_idx" ON "RiotAccount"("puuid");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_riotAccountId_key" ON "PlayerProfile"("riotAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Champion_key_key" ON "Champion"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ChampionTag_championId_key" ON "ChampionTag"("championId");

-- CreateIndex
CREATE INDEX "ChampionTag_championId_idx" ON "ChampionTag"("championId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_matchId_key" ON "Match"("matchId");

-- CreateIndex
CREATE INDEX "Match_matchId_idx" ON "Match"("matchId");

-- CreateIndex
CREATE INDEX "MatchParticipant_puuid_idx" ON "MatchParticipant"("puuid");

-- CreateIndex
CREATE INDEX "MatchParticipant_championId_idx" ON "MatchParticipant"("championId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchTimeline_matchId_key" ON "MatchTimeline"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerChampionStats_playerProfileId_championId_role_key" ON "PlayerChampionStats"("playerProfileId", "championId", "role");

-- CreateIndex
CREATE INDEX "PlayerChampionStats_championId_idx" ON "PlayerChampionStats"("championId");

-- CreateIndex
CREATE INDEX "DraftSession_puuid_idx" ON "DraftSession"("puuid");

-- CreateIndex
CREATE INDEX "PickRecommendation_championId_idx" ON "PickRecommendation"("championId");

-- CreateIndex
CREATE INDEX "PostgameReport_puuid_idx" ON "PostgameReport"("puuid");

-- AddForeignKey
ALTER TABLE "RiotAccount" ADD CONSTRAINT "RiotAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_riotAccountId_fkey" FOREIGN KEY ("riotAccountId") REFERENCES "RiotAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChampionTag" ADD CONSTRAINT "ChampionTag_championId_fkey" FOREIGN KEY ("championId") REFERENCES "Champion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_riotAccountId_fkey" FOREIGN KEY ("riotAccountId") REFERENCES "RiotAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_championId_fkey" FOREIGN KEY ("championId") REFERENCES "Champion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTimeline" ADD CONSTRAINT "MatchTimeline_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerChampionStats" ADD CONSTRAINT "PlayerChampionStats_playerProfileId_fkey" FOREIGN KEY ("playerProfileId") REFERENCES "PlayerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerChampionStats" ADD CONSTRAINT "PlayerChampionStats_championId_fkey" FOREIGN KEY ("championId") REFERENCES "Champion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickRecommendation" ADD CONSTRAINT "PickRecommendation_draftSessionId_fkey" FOREIGN KEY ("draftSessionId") REFERENCES "DraftSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostgameReport" ADD CONSTRAINT "PostgameReport_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
