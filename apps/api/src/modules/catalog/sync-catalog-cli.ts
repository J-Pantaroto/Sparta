import { syncChampionCatalog } from "./champion-repository.js";
import { prisma } from "../../db/prisma.js";

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
