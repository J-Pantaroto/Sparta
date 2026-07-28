-- Persistencia de drafts e recomendacoes (Etapa 16).
--
-- `DraftSession` e `PickRecommendation` existiam no schema desde o inicio do
-- projeto e nunca tiveram uma linha de codigo que lesse ou escrevesse nelas -
-- confirmado por busca no repositorio e por contagem no banco real (0 linhas
-- nas duas, 0 PostgameReport apontando pra sessao). As formas antigas nao
-- sustentam esta etapa: `DraftSession` guardava um `draftStateJson` sem
-- contrato e nao tinha ciclo de vida, origem, origem da posicao, vinculo com
-- partida nem `updatedAt`; `PickRecommendation` nao tinha ranking, grupo,
-- cobertura, pesos efetivos nem `inputHash`, e pendurava as recomendacoes
-- direto na sessao - nao existia o conceito de execucao imutavel entre as
-- duas. Por isso sao substituidas em vez de estendidas.
--
-- Nao ha migracao de dados porque nao ha dado: as duas tabelas estao vazias.
DROP TABLE IF EXISTS "PickRecommendation";
DROP TABLE IF EXISTS "DraftSession";

CREATE TABLE "DraftSession" (
    "id" TEXT NOT NULL,
    "riotAccountId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "roleSource" TEXT NOT NULL,
    "queueId" INTEGER,
    "gameVersion" TEXT,
    "patch" TEXT,
    "selectedChampionId" INTEGER,
    "knownDraftJson" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lockedInAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "externalSessionId" TEXT,
    "linkedMatchId" TEXT,
    CONSTRAINT "DraftSession_pkey" PRIMARY KEY ("id")
);

-- Uma chave de sessao por conta: uma nova entrada no champion select gera
-- outra chave e portanto outra sessao, nunca reaproveita a anterior.
CREATE UNIQUE INDEX "DraftSession_riotAccountId_externalSessionId_key"
    ON "DraftSession"("riotAccountId", "externalSessionId");
CREATE INDEX "DraftSession_riotAccountId_status_idx" ON "DraftSession"("riotAccountId", "status");
CREATE INDEX "DraftSession_linkedMatchId_idx" ON "DraftSession"("linkedMatchId");

ALTER TABLE "DraftSession" ADD CONSTRAINT "DraftSession_riotAccountId_fkey"
    FOREIGN KEY ("riotAccountId") REFERENCES "RiotAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RecommendationSnapshot" (
    "id" TEXT NOT NULL,
    "draftSessionId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "canonicalInputJson" JSONB NOT NULL,
    "algorithmVersionsJson" JSONB NOT NULL,
    "dataCoverage" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    CONSTRAINT "RecommendationSnapshot_pkey" PRIMARY KEY ("id")
);

-- O mesmo input na mesma sessao nao pode virar dois snapshots. E a garantia
-- final contra duplicacao por tick, alem da checagem em memoria.
CREATE UNIQUE INDEX "RecommendationSnapshot_draftSessionId_inputHash_key"
    ON "RecommendationSnapshot"("draftSessionId", "inputHash");
CREATE INDEX "RecommendationSnapshot_draftSessionId_createdAt_idx"
    ON "RecommendationSnapshot"("draftSessionId", "createdAt");

ALTER TABLE "RecommendationSnapshot" ADD CONSTRAINT "RecommendationSnapshot_draftSessionId_fkey"
    FOREIGN KEY ("draftSessionId") REFERENCES "DraftSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PersistedRecommendation" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "championId" INTEGER NOT NULL,
    "championName" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "recGroup" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "dataCoverage" DOUBLE PRECISION NOT NULL,
    "poolSource" TEXT NOT NULL,
    "personalGames" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "confidence" TEXT,
    "detailJson" JSONB NOT NULL,
    CONSTRAINT "PersistedRecommendation_pkey" PRIMARY KEY ("id")
);

-- Um candidato entra uma unica vez por snapshot.
CREATE UNIQUE INDEX "PersistedRecommendation_snapshotId_championId_key"
    ON "PersistedRecommendation"("snapshotId", "championId");
CREATE INDEX "PersistedRecommendation_championId_idx" ON "PersistedRecommendation"("championId");

ALTER TABLE "PersistedRecommendation" ADD CONSTRAINT "PersistedRecommendation_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "RecommendationSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
