-- Revisao humana auditavel do motor (Etapa 24).
--
-- Tabela SEPARADA de proposito: sessao, snapshot, ranking, metricas e
-- relatorio pos-game permanecem imutaveis. Nenhuma coluna daqui alimenta o
-- motor - a revisao e evidencia humana, nao entrada de calculo.
--
-- Correcao nao sobrescreve: cria outra linha com "supersedesReviewId" e
-- "correctionReason", e a anterior recebe "supersededAt". O agregado so conta
-- revisoes atuais, entao um caso corrigido nunca e contado duas vezes.
CREATE TABLE "DraftReview" (
    "id" TEXT NOT NULL,
    "riotAccountId" TEXT NOT NULL,
    "draftSessionId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "matchId" TEXT,
    "status" TEXT NOT NULL,
    "reviewVersion" TEXT NOT NULL,
    "preMatchJson" JSONB,
    "postMatchJson" JSONB,
    "resultRevealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "supersedesReviewId" TEXT,
    "correctionReason" TEXT,
    "supersededAt" TIMESTAMP(3),
    "issueTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "DraftReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DraftReview_riotAccountId_status_idx" ON "DraftReview"("riotAccountId", "status");
CREATE INDEX "DraftReview_draftSessionId_createdAt_idx" ON "DraftReview"("draftSessionId", "createdAt");

ALTER TABLE "DraftReview" ADD CONSTRAINT "DraftReview_draftSessionId_fkey"
    FOREIGN KEY ("draftSessionId") REFERENCES "DraftSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
