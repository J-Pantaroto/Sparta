import { prisma } from "../../db/prisma.js";
import { backfillMatchObservations } from "./backfill-match-observations.js";

backfillMatchObservations()
  .then((summary) => {
    console.log(`Partidas processadas:   ${summary.matchesProcessed}`);
    console.log(`Partidas atualizadas:   ${summary.matchesUpdated}`);
    console.log(`Partidas indisponíveis: ${summary.matchesUnavailable}`);
    console.log(`Partidas com erro:      ${summary.matchesWithErrors}`);
    console.log(`Participantes gravados: ${summary.participantsUpdated}`);
    if (summary.errors.length > 0) {
      console.error(summary.errors);
      process.exitCode = 1;
    }
  })
  .catch(() => {
    console.error("Falha ao executar o backfill de observações.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
