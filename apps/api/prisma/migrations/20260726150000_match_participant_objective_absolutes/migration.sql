-- Valores absolutos por tras da participacao em objetivos.
--
-- `objectiveParticipation` ja e nullable desde 20260726120000 e continua
-- sendo a razao. Estas duas colunas guardam o numerador e o denominador que
-- a produziram, pra o pos-game poder mostrar "3 de 4 objetivos" em vez de so
-- um percentual, e pra a razao ser auditavel sem reabrir o rawJson.
--
-- Ambas nullable e sem default: partida cujo payload nao sustenta a razao
-- (sem `challenges`, sem os objetivos do time) fica com NULL nas tres
-- colunas. NULL aqui significa "nao observado", nunca zero.
--
-- Nenhum dado existente e alterado. As linhas ja gravadas ficam com NULL ate
-- o backfill (`objectives:backfill`) recalcular a partir do Match.rawJson.
-- Rollback: DROP das duas colunas; a razao continua funcionando sem elas.
ALTER TABLE "MatchParticipant" ADD COLUMN "objectiveTakedowns" INTEGER;
ALTER TABLE "MatchParticipant" ADD COLUMN "teamObjectiveKills" INTEGER;
