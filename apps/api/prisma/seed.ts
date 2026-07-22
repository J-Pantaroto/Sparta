import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const prisma = new PrismaClient();

interface ChampionTagSeedEntry {
  championName: string;
  championId: number;
  roles: string[];
  damageProfile: string;
  tags: string[];
  blindSafety: number;
  difficulty: number;
  engage: number;
  peel: number;
  frontline: number;
  pickoff: number;
  waveclear: number;
  scaling: number;
  earlyPressure: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/prisma -> apps/api -> apps -> raiz do repo.
const SEED_FILE = path.join(__dirname, "..", "..", "..", "data", "seeds", "champion-tags.json");

/**
 * Le data/seeds/champion-tags.json e faz upsert de cada entrada (antes esse
 * arquivo so era referenciado num comentario obsoleto - o seed real
 * hardcodava so a Orianna em TypeScript, entao a Ahri nunca chegava no
 * Postgres apesar de estar no JSON). Garante que o Champion correspondente
 * existe (create-if-missing, nunca sobrescreve o que catalog:sync ja
 * populou) antes do ChampionTag, ja que a FK exige isso. Adicionar mais
 * campeoes agora e so editar o JSON.
 */
async function main() {
  const raw = await readFile(SEED_FILE, "utf-8");
  const entries = JSON.parse(raw) as ChampionTagSeedEntry[];

  for (const entry of entries) {
    await prisma.champion.upsert({
      where: { id: entry.championId },
      update: {},
      create: {
        id: entry.championId,
        key: entry.championName,
        name: entry.championName,
        roles: entry.roles,
        version: "seed"
      }
    });

    await prisma.championTag.upsert({
      where: { championId: entry.championId },
      update: {},
      create: {
        championId: entry.championId,
        damageProfile: entry.damageProfile,
        tags: entry.tags,
        blindSafety: entry.blindSafety,
        difficulty: entry.difficulty,
        engage: entry.engage,
        peel: entry.peel,
        frontline: entry.frontline,
        pickoff: entry.pickoff,
        waveclear: entry.waveclear,
        scaling: entry.scaling,
        earlyPressure: entry.earlyPressure
      }
    });
  }

  console.log(`Seed de ChampionTag concluido: ${entries.length} campeoes processados.`);
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
