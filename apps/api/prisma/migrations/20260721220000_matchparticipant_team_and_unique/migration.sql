-- Fase 3 (Draft Intelligence): persistir os 10 participantes por partida
-- exige saber de que time (100/blue ou 200/red) cada linha e, pra parear
-- laners opostos do mesmo role em times diferentes. Nullable porque as
-- linhas ja existentes (Fase 1/2, so o jogador rastreado) nao tem esse dado
-- ainda - o script de backfill preenche em seguida.
ALTER TABLE "MatchParticipant" ADD COLUMN "teamId" INTEGER;

-- Grava-los-10-participantes precisa gravar varias linhas por partida numa
-- unica operacao idempotente (createMany + skipDuplicates); sem essa
-- constraint, reprocessar a mesma partida (novo sync ou backfill) duplicaria
-- participantes.
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_puuid_key" UNIQUE ("matchId", "puuid");
