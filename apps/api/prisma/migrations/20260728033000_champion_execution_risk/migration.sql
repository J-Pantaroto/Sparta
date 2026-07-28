-- Dificuldade oficial do catálogo separada do perfil estratégico (Etapa 13).
-- Tudo nullable: catálogo/linha anterior sem `info.difficulty` permanece
-- indisponível, sem valor médio ou neutro artificial.
ALTER TABLE "Champion"
  ADD COLUMN "dataDragonDifficulty" INTEGER,
  ADD COLUMN "difficultyNormalized" DOUBLE PRECISION,
  ADD COLUMN "difficultyNormalizationAlgorithmVersion" TEXT;
