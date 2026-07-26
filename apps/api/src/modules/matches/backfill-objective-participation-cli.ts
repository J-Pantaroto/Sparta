import { backfillObjectiveParticipation } from "./backfill-objective-participation.js";
import { prisma } from "../../db/prisma.js";

/**
 * Recalcula a participação em objetivos das partidas já persistidas.
 * Só lê `Match.rawJson` local - nenhuma chamada à Riot API. Idempotente:
 * rodar de novo não altera nada se a metodologia não mudou.
 *
 * O resumo é só de contagens; nenhum puuid ou payload é impresso.
 */
backfillObjectiveParticipation()
  .then((summary) => {
    console.log(`Partidas analisadas:              ${summary.matchesAnalyzed}`);
    console.log(`Partidas sem rawJson (ignoradas): ${summary.matchesWithoutRawJson}`);
    console.log(`Participantes atualizados:        ${summary.participantsUpdated}`);
    console.log(`Participantes sem dado suficiente:${summary.participantsWithoutData}`);
    console.log(`Participantes inconsistentes:     ${summary.participantsInconsistent}`);
    console.log(`Contas com agregado recalculado:  ${summary.accountsRecomputed}`);
    if (summary.errors.length > 0) {
      console.error(`${summary.errors.length} partidas com erro:`);
      console.error(summary.errors);
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error("Falha ao rodar o backfill de participacao em objetivos:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
