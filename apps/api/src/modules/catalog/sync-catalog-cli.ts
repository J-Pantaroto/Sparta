import { syncChampionCatalog } from "./champion-repository";
import { prisma } from "../../db/prisma";

syncChampionCatalog()
  .then(({ version, count }) => {
    console.log(`Catalogo de campeoes sincronizado: versao ${version}, ${count} campeoes.`);
  })
  .catch((error) => {
    console.error("Falha ao sincronizar catalogo de campeoes:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
