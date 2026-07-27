-- Proveniencia das ChampionTag (Etapa 8).
--
-- Todas as colunas sao NULLABLE de proposito: as 173 linhas que ja existem
-- foram gravadas sem nenhum registro de origem, e nao ha como determinar
-- retroativamente de que versao da Data Dragon ou de que versao do algoritmo
-- vieram. Preencher com um default classificaria automaticamente registro
-- historico como derivado (ou pior, como revisado) - ausencia e a unica
-- resposta honesta ate o proximo seed a partir do arquivo versionado.
--
-- "reviewedDimensions" tem default de array vazio porque o Postgres exige um
-- valor para coluna de array NOT NULL; a distincao "nao informado" fica em
-- "reviewState" IS NULL, que e o campo consultado.
ALTER TABLE "ChampionTag" ADD COLUMN "dataDragonVersion" TEXT;
ALTER TABLE "ChampionTag" ADD COLUMN "locale" TEXT;
ALTER TABLE "ChampionTag" ADD COLUMN "sourceResource" TEXT;
ALTER TABLE "ChampionTag" ADD COLUMN "algorithmVersion" TEXT;
ALTER TABLE "ChampionTag" ADD COLUMN "generatedAt" TIMESTAMP(3);
ALTER TABLE "ChampionTag" ADD COLUMN "reviewState" TEXT;
ALTER TABLE "ChampionTag" ADD COLUMN "reviewedDimensions" TEXT[] DEFAULT ARRAY[]::TEXT[];
