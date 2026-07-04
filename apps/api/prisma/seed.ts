import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.champion.upsert({
    where: { id: 61 },
    update: {},
    create: {
      id: 61,
      key: "Orianna",
      name: "Orianna",
      title: "a Donzela Mecânica",
      roles: ["MID"],
      version: "seed"
    }
  });

  await prisma.championTag.upsert({
    where: { championId: 61 },
    update: {},
    create: {
      championId: 61,
      damageProfile: "AP",
      tags: ["control_mage", "teamfight", "scaling", "waveclear"],
      blindSafety: 0.82,
      difficulty: 0.7,
      engage: 0.4,
      peel: 0.6,
      frontline: 0.1,
      pickoff: 0.5,
      waveclear: 0.9,
      scaling: 0.85,
      earlyPressure: 0.45
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
