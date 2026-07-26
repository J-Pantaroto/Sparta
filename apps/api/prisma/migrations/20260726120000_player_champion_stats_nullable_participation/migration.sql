-- Participacao em abates/objetivos passa a poder ser honestamente ausente.
--
-- Ate aqui as colunas eram NOT NULL, entao a agregacao era obrigada a
-- gravar 0 quando nenhuma partida trazia o dado - indistinguivel de
-- participacao zero real.
--
-- Os valores ja gravados NAO sao convertidos para NULL: de dentro do
-- agregado nao da pra provar que um 0 historico e artificial (poderia ser
-- participacao zero medida). Como estas linhas sao inteiramente recalculadas
-- a cada sync a partir de MatchParticipant, elas se corrigem sozinhas na
-- proxima sincronizacao. Ver docs/data-provenance.md.
ALTER TABLE "PlayerChampionStats" ALTER COLUMN "killParticipation" DROP NOT NULL;
ALTER TABLE "PlayerChampionStats" ALTER COLUMN "objectiveParticipation" DROP NOT NULL;

-- Quantas partidas do agregado realmente tinham cada dado. NULL significa
-- "cobertura desconhecida" (linha gravada antes desta migration), que e
-- diferente de 0 = "nenhuma partida tinha".
ALTER TABLE "PlayerChampionStats" ADD COLUMN "killParticipationSamples" INTEGER;
ALTER TABLE "PlayerChampionStats" ADD COLUMN "objectiveParticipationSamples" INTEGER;
