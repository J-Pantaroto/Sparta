import { fetchDataDragonChampions, fetchDataDragonVersions, type DataDragonChampion } from "@sparta/riot";
import { prisma } from "../../db/prisma";
import { getCached, setCached } from "../../db/api-cache";

const DATA_DRAGON_LOCALE = "pt_BR";
const VERSIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHAMPIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function getLatestVersion(): Promise<string> {
  const cacheKey = "ddragon:versions";
  const cached = await getCached<string[]>(cacheKey);
  if (cached?.[0]) return cached[0];

  const versions = await fetchDataDragonVersions();
  await setCached(cacheKey, versions, VERSIONS_TTL_MS);
  return versions[0];
}

async function getChampionsForVersion(version: string): Promise<DataDragonChampion[]> {
  const cacheKey = `ddragon:champions:${version}:${DATA_DRAGON_LOCALE}`;
  const cached = await getCached<DataDragonChampion[]>(cacheKey);
  if (cached) return cached;

  const champions = await fetchDataDragonChampions(version, DATA_DRAGON_LOCALE);
  await setCached(cacheKey, champions, CHAMPIONS_TTL_MS);
  return champions;
}

/**
 * Sincroniza o catalogo de campeoes (`Champion`) a partir do Data Dragon.
 * Nao popula `ChampionTag` — os atributos de gameplay do Sparta (engage,
 * frontline, peel, etc.) nao existem no Data Dragon, entao continuam vindo
 * so do seed manual (`data/seeds/champion-tags.json`).
 */
export async function syncChampionCatalog(): Promise<{ version: string; count: number }> {
  const version = await getLatestVersion();
  const champions = await getChampionsForVersion(version);

  for (const champion of champions) {
    await prisma.champion.upsert({
      where: { id: Number(champion.key) },
      update: {
        key: champion.id,
        name: champion.name,
        title: champion.title,
        version
      },
      create: {
        id: Number(champion.key),
        key: champion.id,
        name: champion.name,
        title: champion.title,
        roles: [],
        version
      }
    });
  }

  return { version, count: champions.length };
}
