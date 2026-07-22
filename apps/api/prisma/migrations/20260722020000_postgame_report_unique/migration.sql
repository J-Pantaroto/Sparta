-- Fase 4 (Post-Game Coach): PostgameReport nunca foi escrito por nenhum
-- codigo ate agora (tabela vazia), entao esta migracao nao precisa de
-- backfill, diferente da de MatchParticipant na Fase 3.

-- updatedAt pra saber quando um relatorio foi reanalisado (POST
-- /postgame/analyze faz upsert, nao so insert-se-ausente).
ALTER TABLE "PostgameReport" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Necessario pra upsert idempotente por (matchId, puuid) - reanalisar a
-- mesma partida do mesmo jogador atualiza a linha em vez de duplicar.
ALTER TABLE "PostgameReport" ADD CONSTRAINT "PostgameReport_matchId_puuid_key" UNIQUE ("matchId", "puuid");
