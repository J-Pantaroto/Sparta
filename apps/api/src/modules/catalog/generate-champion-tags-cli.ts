import { deriveChampionTag, mergeChampionTags, type ChampionClassProfile, type ChampionTag } from "@sparta/core";
import { fetchDataDragonChampions, fetchDataDragonVersions } from "@sparta/riot";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regenera `data/seeds/champion-tags.json` cobrindo todos os campeoes,
 * derivando os atributos de gameplay das tags/notas da Data Dragon
 * (`deriveChampionTag`, em @sparta/core).
 *
 * O arquivo continua versionado no git de proposito: assim o resultado da
 * derivacao e revisavel num diff, e nao um efeito colateral invisivel de
 * rodar o seed.
 *
 * Entradas marcadas com `"source": "manual"` sao PRESERVADAS - regenerar
 * nunca apaga curadoria. `source` existe so no JSON (nao e coluna do
 * banco); serve pra separar o que foi lido de classe do que alguem
 * revisou campeao a campeao.
 *
 *   pnpm --filter @sparta/api champion-tags:generate
 */

type Source = "manual" | "derived";
type SeedEntry = ChampionTag & { source: Source };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/src/modules/catalog -> ... -> raiz do repo
const SEED_FILE = path.join(__dirname, "..", "..", "..", "..", "..", "data", "seeds", "champion-tags.json");

async function readExistingSeed(): Promise<SeedEntry[]> {
  try {
    return JSON.parse(await readFile(SEED_FILE, "utf-8")) as SeedEntry[];
  } catch {
    return [];
  }
}

async function main() {
  const [version] = await fetchDataDragonVersions();
  const champions = await fetchDataDragonChampions(version, "pt_BR");

  const profiles: ChampionClassProfile[] = champions
    // Sem `info` nao ha o que derivar: melhor deixar o campeao de fora (o
    // motor ja trata ausencia de tag) do que gravar um perfil chutado.
    .filter((champion) => champion.info !== undefined)
    .map((champion) => ({
      championId: Number(champion.key),
      championName: champion.name,
      tags: champion.tags,
      attack: champion.info!.attack,
      defense: champion.info!.defense,
      magic: champion.info!.magic,
      difficulty: champion.info!.difficulty
    }));

  const existing = await readExistingSeed();
  const curated = existing.filter((entry) => entry.source === "manual");
  const derived = profiles.map(deriveChampionTag);

  const merged = mergeChampionTags(derived, curated);
  const curatedIds = new Set(curated.map((entry) => entry.championId));
  const output: SeedEntry[] = merged.map((tag) => ({
    ...tag,
    source: curatedIds.has(tag.championId ?? -1) ? "manual" : "derived"
  }));

  await writeFile(SEED_FILE, `${JSON.stringify(output, null, 2)}\n`, "utf-8");

  console.log(
    `champion-tags.json regenerado a partir da versao ${version}: ` +
      `${output.length} campeoes (${curated.length} curados a mao preservados, ` +
      `${output.length - curated.length} derivados).`
  );
  if (champions.length !== profiles.length) {
    console.warn(`${champions.length - profiles.length} campeoes ficaram de fora por nao trazerem "info".`);
  }
}

main().catch((error) => {
  console.error("Falha ao gerar champion-tags.json:", error);
  process.exitCode = 1;
});
