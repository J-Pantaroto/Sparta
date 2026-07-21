-- killParticipation e objectiveParticipation vem do objeto "challenges" do
-- Match-V5, ausente em patches antigos da Riot. Antes eram NOT NULL, o que
-- forcaria a persistir 0.0 (dado inventado) quando a Riot nao fornece o
-- valor real. Tornando nullable para refletir a ausencia honestamente.
ALTER TABLE "MatchParticipant" ALTER COLUMN "killParticipation" DROP NOT NULL;
ALTER TABLE "MatchParticipant" ALTER COLUMN "objectiveParticipation" DROP NOT NULL;
