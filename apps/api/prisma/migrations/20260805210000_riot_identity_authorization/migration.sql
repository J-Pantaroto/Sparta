-- ETAPA 31C: nenhum vinculo preexistente e promovido a verificado.
ALTER TABLE "RiotAccount"
  ADD COLUMN "linkStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED_LEGACY',
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verificationMethod" TEXT,
  ADD COLUMN "verificationEvidenceHash" TEXT,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "reauthenticationRequiredAt" TIMESTAMP(3);

-- Uma identidade Sparta possui no maximo um vinculo Riot. PostgreSQL aceita
-- multiplos NULLs, preservando contas tecnicas ainda nao associadas.
CREATE UNIQUE INDEX "RiotAccount_userId_key" ON "RiotAccount"("userId");

CREATE TABLE "RsoAuthorizationTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "redirectUri" TEXT NOT NULL,
  "riotAccountId" TEXT,
  "previousLinkStatus" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RsoAuthorizationTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RsoAuthorizationTransaction_stateHash_key"
  ON "RsoAuthorizationTransaction"("stateHash");
CREATE INDEX "RsoAuthorizationTransaction_userId_status_expiresAt_idx"
  ON "RsoAuthorizationTransaction"("userId", "status", "expiresAt");
ALTER TABLE "RsoAuthorizationTransaction"
  ADD CONSTRAINT "RsoAuthorizationTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
