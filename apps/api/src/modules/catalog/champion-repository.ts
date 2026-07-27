import { fetchDataDragonChampions, fetchDataDragonVersions, type DataDragonChampion } from "@sparta/riot";
import type { ChampionTag, DamageProfile, Role } from "@sparta/core";
import { prisma } from "../../db/prisma.js";
import { getCached, setCached } from "../../db/api-cache.js";

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

/**
 * Nomes reais do catalogo para os ids pedidos. Campeao que nao existe no
 * catalogo simplesmente nao aparece no Map - o chamador precisa distinguir
 * "id desconhecido" de "id valido", e um nome inventado (`Campeao #64`)
 * apagaria essa diferenca.
 */
export async function findChampionNamesByIds(ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const rows = await prisma.champion.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true }
  });

  return new Map(rows.map((row) => [row.id, row.name]));
}

/**
 * Todos os ChampionTag persistidos (join com Champion pro nome/roles reais
 * do catalogo). Hoje so cobre os campeoes do seed manual
 * (data/seeds/champion-tags.json) - o motor de recomendacao ja tolera
 * campeoes sem tag (fica com valores neutros).
 */
export async function findAllChampionTags(): Promise<ChampionTag[]> {
  const rows = await prisma.championTag.findMany({ include: { champion: true } });

  return rows.map((row) => ({
    championId: row.championId,
    championName: row.champion.name,
    roles: row.champion.roles as Role[],
    damageProfile: row.damageProfile as DamageProfile,
    tags: row.tags,
    blindSafety: row.blindSafety,
    difficulty: row.difficulty,
    engage: row.engage,
    peel: row.peel,
    frontline: row.frontline,
    pickoff: row.pickoff,
    waveclear: row.waveclear,
    scaling: row.scaling,
    earlyPressure: row.earlyPressure
  }));
}
