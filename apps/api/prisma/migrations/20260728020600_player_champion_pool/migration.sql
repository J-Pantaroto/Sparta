CREATE TABLE "PlayerChampionPoolEntry" (
    "id" TEXT NOT NULL,
    "riotAccountId" TEXT NOT NULL,
    "championId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerChampionPoolEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerChampionPoolEntry_riotAccountId_championId_role_key"
ON "PlayerChampionPoolEntry"("riotAccountId", "championId", "role");

CREATE INDEX "PlayerChampionPoolEntry_riotAccountId_role_enabled_idx"
ON "PlayerChampionPoolEntry"("riotAccountId", "role", "enabled");

CREATE INDEX "PlayerChampionPoolEntry_championId_idx"
ON "PlayerChampionPoolEntry"("championId");

ALTER TABLE "PlayerChampionPoolEntry"
ADD CONSTRAINT "PlayerChampionPoolEntry_riotAccountId_fkey"
FOREIGN KEY ("riotAccountId") REFERENCES "RiotAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerChampionPoolEntry"
ADD CONSTRAINT "PlayerChampionPoolEntry_championId_fkey"
FOREIGN KEY ("championId") REFERENCES "Champion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
