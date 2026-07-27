import {
  ExternalServiceError,
  fetchDataDragonChampions,
  fetchDataDragonVersions,
  type DataDragonChampion
} from "@sparta/riot";
import {
  CHAMPION_TAG_DIMENSIONS,
  CHAMPION_TAG_SOURCE_ID,
  deriveReviewState,
  type ChampionTag,
  type ChampionTagDimension,
  type ChampionTagProvenance,
  type CacheMetadata,
  type DataProvenance,
  type DamageProfile,
  type Role
} from "@sparta/core";
import { prisma } from "../../db/prisma.js";
import { readCache, setCached } from "../../db/api-cache.js";

const DATA_DRAGON_LOCALE = "pt_BR";
const VERSIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHAMPIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DATA_DRAGON_STALE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CachedResource<T> {
  data: T;
  cache: CacheMetadata;
}

async function getLatestVersion(): Promise<CachedResource<string>> {
  const cacheKey = "ddragon:versions";
  const cached = await readCache<string[]>(cacheKey, DATA_DRAGON_STALE_TTL_MS);
  if (cached.metadata.state === "FRESH" && cached.value?.[0]) {
    return { data: cached.value[0], cache: cached.metadata };
  }
  let versions: string[];
  try {
    versions = await fetchDataDragonVersions();
  } catch (error) {
    if (cached.metadata.state === "STALE" && cached.value?.[0]) {
      return {
        data: cached.value[0],
        cache: {
          ...cached.metadata,
          servedAsFallback: true,
          fallbackReason: error instanceof ExternalServiceError ? error.code : "UPSTREAM_UNAVAILABLE"
        }
      };
    }
    throw error;
  }
  await setCached(cacheKey, versions, VERSIONS_TTL_MS);
  const collectedAt = new Date();
  return {
    data: versions[0],
    cache: {
      state: "FRESH",
      collectedAt: collectedAt.toISOString(),
      freshUntil: new Date(collectedAt.getTime() + VERSIONS_TTL_MS).toISOString(),
      staleUntil: new Date(collectedAt.getTime() + VERSIONS_TTL_MS + DATA_DRAGON_STALE_TTL_MS).toISOString(),
      ageMs: 0,
      servedAsFallback: false
    }
  };
}

async function getChampionsForVersion(version: string): Promise<CachedResource<DataDragonChampion[]>> {
  const cacheKey = `ddragon:champions:${version}:${DATA_DRAGON_LOCALE}`;
  const cached = await readCache<DataDragonChampion[]>(cacheKey, DATA_DRAGON_STALE_TTL_MS);
  if (cached.metadata.state === "FRESH" && cached.value) return { data: cached.value, cache: cached.metadata };
  let champions: DataDragonChampion[];
  try {
    champions = await fetchDataDragonChampions(version, DATA_DRAGON_LOCALE);
  } catch (error) {
    if (cached.metadata.state === "STALE" && cached.value) {
      return {
        data: cached.value,
        cache: {
          ...cached.metadata,
          servedAsFallback: true,
          fallbackReason: error instanceof ExternalServiceError ? error.code : "UPSTREAM_UNAVAILABLE"
        }
      };
    }
    throw error;
  }
  await setCached(cacheKey, champions, CHAMPIONS_TTL_MS);
  const collectedAt = new Date();
  return {
    data: champions,
    cache: {
      state: "FRESH",
      collectedAt: collectedAt.toISOString(),
      freshUntil: new Date(collectedAt.getTime() + CHAMPIONS_TTL_MS).toISOString(),
      staleUntil: new Date(collectedAt.getTime() + CHAMPIONS_TTL_MS + DATA_DRAGON_STALE_TTL_MS).toISOString(),
      ageMs: 0,
      servedAsFallback: false
    }
  };
}

export interface CatalogSyncResult {
  version: string;
  count: number;
  source: DataProvenance;
}

/**
 * Sincroniza o catalogo de campeoes (`Champion`) a partir do Data Dragon.
 * Nao popula `ChampionTag` — os atributos de gameplay do Sparta (engage,
 * frontline, peel, etc.) nao existem no Data Dragon, entao continuam vindo
 * so do seed manual (`data/seeds/champion-tags.json`).
 */
export async function syncChampionCatalog(): Promise<CatalogSyncResult> {
  const versionResource = await getLatestVersion();
  const championsResource = await getChampionsForVersion(versionResource.data);
  const version = versionResource.data;
  const champions = championsResource.data;

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

  const cache =
    versionResource.cache.state === "STALE" ? versionResource.cache : championsResource.cache;
  return {
    version,
    count: champions.length,
    source: {
      sourceType: "OFFICIAL",
      sourceId: "riot-data-dragon",
      resource: "versions.json + champion.json",
      patch: version,
      locale: DATA_DRAGON_LOCALE,
      collectedAt: cache.collectedAt,
      status: cache.state === "STALE" ? "STALE" : "AVAILABLE",
      cache
    }
  };
}

/**
 * Colunas de proveniencia -> contrato do dominio.
 *
 * Devolve `undefined` quando `reviewState` esta nulo: e assim que uma linha
 * gravada antes da Etapa 8 se apresenta. Ausencia significa **origem nao
 * informada** - deliberadamente diferente de `UNREVIEWED`, que afirma que
 * ninguem revisou. Nenhuma coluna nula vira default aqui.
 */
function toChampionTagProvenance(row: {
  dataDragonVersion: string | null;
  locale: string | null;
  sourceResource: string | null;
  algorithmVersion: string | null;
  generatedAt: Date | null;
  reviewState: string | null;
  reviewedDimensions: string[];
}): ChampionTagProvenance | undefined {
  if (row.reviewState === null) return undefined;

  const reviewedDimensions = row.reviewedDimensions.filter((dimension): dimension is ChampionTagDimension =>
    (CHAMPION_TAG_DIMENSIONS as readonly string[]).includes(dimension)
  );

  return {
    source: {
      // Nunca OFFICIAL: a Riot publica classe e notas, nao estas dimensoes.
      sourceType: "DERIVED",
      sourceId: CHAMPION_TAG_SOURCE_ID,
      resource: row.sourceResource ?? undefined,
      patch: row.dataDragonVersion ?? undefined,
      locale: row.locale ?? undefined,
      algorithmVersion: row.algorithmVersion ?? undefined,
      collectedAt: row.generatedAt?.toISOString(),
      status: "AVAILABLE"
    },
    // Derivado da lista persistida, nao lido da coluna: assim os dois nunca
    // divergem, mesma regra do arquivo versionado.
    reviewState: deriveReviewState(reviewedDimensions),
    reviewedDimensions
  };
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
    provenance: toChampionTagProvenance(row),
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
