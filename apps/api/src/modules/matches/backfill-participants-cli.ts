import { backfillMatchParticipantsFromRawJson } from "./backfill-participants.js";
import { prisma } from "../../db/prisma.js";

backfillMatchParticipantsFromRawJson()
  .then((summary) => {
    console.log(
      `Backfill concluido: ${summary.matchesProcessed} partidas processadas, ${summary.participantsInserted} participantes inseridos.`
    );
    if (summary.skippedParticipants.length > 0) {
      console.log(`${summary.skippedParticipants.length} participantes pulados (campeao fora do catalogo):`);
      console.log(summary.skippedParticipants);
    }
    if (summary.matchesWithErrors.length > 0) {
      console.error(`${summary.matchesWithErrors.length} partidas com erro:`);
      console.error(summary.matchesWithErrors);
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error("Falha ao rodar o backfill de participantes:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
