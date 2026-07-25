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
  /** Só existe no JSON, não é coluna: separa curadoria manual de derivação. */
  source?: "manual" | "derived";
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/prisma -> apps/api -> apps -> raiz do repo.
const SEED_FILE = path.join(__dirname, "..", "..", "..", "data", "seeds", "champion-tags.json");

/**
 * Le data/seeds/champion-tags.json e faz upsert de cada entrada. O arquivo
 * e gerado por `pnpm --filter @sparta/api champion-tags:generate` (deriva
 * os atributos das tags/notas da Data Dragon) e pode ser editado a mao -
 * entradas com `"source": "manual"` sobrevivem a regeneracao.
 *
 * O upsert ATUALIZA de verdade: a versao anterior passava `update: {}`, o
 * que fazia rodar o seed de novo nao ter efeito nenhum sobre um campeao ja
 * gravado - regenerar o JSON nao chegaria ao banco.
 *
 * Garante que o `Champion` correspondente existe antes do `ChampionTag`
 * (a FK exige). O nome/`key` so sao definidos na criacao: quando o campeao
 * ja veio do `catalog:sync`, os dados de la (nome real, key da Data Dragon,
 * versao) sao melhores e nao devem ser sobrescritos pelo seed. `roles` e
 * atualizado apenas quando a entrada de fato traz rotas - a derivacao
 * automatica deixa o campo vazio de proposito (a Data Dragon nao publica
 * rota), e sobrescrever com `[]` apagaria curadoria existente.
 */
async function main() {
  const raw = await readFile(SEED_FILE, "utf-8");
  const entries = JSON.parse(raw) as ChampionTagSeedEntry[];

  for (const entry of entries) {
    await prisma.champion.upsert({
      where: { id: entry.championId },
      update: entry.roles.length > 0 ? { roles: entry.roles } : {},
      create: {
        id: entry.championId,
        key: entry.championName,
        name: entry.championName,
        roles: entry.roles,
        version: "seed"
      }
    });

    const tag = {
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
    };

    await prisma.championTag.upsert({
      where: { championId: entry.championId },
      update: tag,
      create: { championId: entry.championId, ...tag }
    });
  }

  const manuais = entries.filter((entry) => entry.source === "manual").length;
  console.log(
    `Seed de ChampionTag concluido: ${entries.length} campeoes processados ` +
      `(${manuais} curados a mao, ${entries.length - manuais} derivados).`
  );
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
