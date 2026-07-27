/**
 * Helpers de Data Dragon usados so no renderer (browser context). Ficam
 * separados de `@sparta/riot` porque aquele pacote tambem exporta o
 * cliente LCU, que usa modulos nativos do Node ("node:fs", "node:https")
 * incompativeis com o bundle do renderer (contextIsolation, sem
 * nodeIntegration). Mantenha os valores em sincronia manualmente se o
 * pacote compartilhado mudar.
 */

import type { CacheMetadata, ChampionClassProfile, ItemSummary } from "@sparta/core";
import { ExternalServiceError, HTTP_TIMEOUTS, requestJson } from "@sparta/riot/http";

const CACHE_FRESH_MS = 7 * 24 * 60 * 60 * 1_000;
const CACHE_STALE_MS = 30 * 24 * 60 * 60 * 1_000;

interface StoredResource {
  payload: unknown;
  collectedAt: string;
  freshUntil: string;
  staleUntil: string;
}

export const DATA_DRAGON_CACHE_EVENT = "sparta:data-dragon-cache";
const cacheMetadataByResource = new Map<string, CacheMetadata>();

function aggregateCacheMetadata(): CacheMetadata {
  const states = [...cacheMetadataByResource.values()];
  return (
    states.find((metadata) => metadata.state === "STALE") ??
    states.find((metadata) => metadata.state === "EXPIRED") ??
    states.find((metadata) => metadata.state === "MISS") ??
    states[0] ?? { state: "MISS", servedAsFallback: false }
  );
}

function recordCacheMetadata(cacheKey: string, metadata: CacheMetadata) {
  cacheMetadataByResource.set(cacheKey, metadata);
  globalThis.dispatchEvent?.(
    new globalThis.CustomEvent<CacheMetadata>(DATA_DRAGON_CACHE_EVENT, { detail: aggregateCacheMetadata() })
  );
}

export function getLastDataDragonCacheMetadata(): CacheMetadata {
  return aggregateCacheMetadata();
}

interface CacheStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function safeStorage(): CacheStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

async function cachedDataDragonJson<T>(
  cacheKey: string,
  url: string,
  validate: (payload: unknown) => payload is T
): Promise<T> {
  const now = new Date();
  const storage = safeStorage();
  let stored: StoredResource | undefined;
  try {
    const raw = storage?.getItem(`sparta:http-cache:${cacheKey}`);
    stored = raw ? (JSON.parse(raw) as StoredResource) : undefined;
    if (
      stored &&
      validate(stored.payload) &&
      Date.parse(stored.freshUntil) > now.getTime()
    ) {
      recordCacheMetadata(cacheKey, {
        state: "FRESH",
        collectedAt: stored.collectedAt,
        freshUntil: stored.freshUntil,
        staleUntil: stored.staleUntil,
        ageMs: Math.max(0, now.getTime() - Date.parse(stored.collectedAt)),
        servedAsFallback: false
      });
      return stored.payload;
    }
  } catch {
    stored = undefined;
  }

  try {
    const payload = await requestJson<T>(url, {
      integration: "DATA_DRAGON",
      timeoutMs: HTTP_TIMEOUTS.dataDragonMs,
      validate
    });
    const collectedAt = new Date();
    const entry: StoredResource = {
      payload,
      collectedAt: collectedAt.toISOString(),
      freshUntil: new Date(collectedAt.getTime() + CACHE_FRESH_MS).toISOString(),
      staleUntil: new Date(collectedAt.getTime() + CACHE_FRESH_MS + CACHE_STALE_MS).toISOString()
    };
    try {
      storage?.setItem(`sparta:http-cache:${cacheKey}`, JSON.stringify(entry));
    } catch {
      // Falha do armazenamento local não invalida o payload recém-validado.
    }
    recordCacheMetadata(cacheKey, {
      state: "FRESH",
      collectedAt: entry.collectedAt,
      freshUntil: entry.freshUntil,
      staleUntil: entry.staleUntil,
      ageMs: 0,
      servedAsFallback: false
    });
    return payload;
  } catch (error) {
    if (stored && validate(stored.payload) && Date.parse(stored.staleUntil) > now.getTime()) {
      recordCacheMetadata(cacheKey, {
        state: "STALE",
        collectedAt: stored.collectedAt,
        freshUntil: stored.freshUntil,
        staleUntil: stored.staleUntil,
        ageMs: Math.max(0, now.getTime() - Date.parse(stored.collectedAt)),
        servedAsFallback: true,
        fallbackReason: error instanceof ExternalServiceError ? error.code : "NETWORK_UNAVAILABLE"
      });
      return stored.payload;
    }
    recordCacheMetadata(cacheKey, {
      state: stored ? "EXPIRED" : "MISS",
      servedAsFallback: false
    });
    throw error;
  }
}

function isStringArray(payload: unknown): payload is string[] {
  return Array.isArray(payload) && payload.length > 0 && payload.every((value) => typeof value === "string");
}

export async function fetchLatestDataDragonVersion(): Promise<string> {
  const versions = await cachedDataDragonJson(
    "versions",
    "https://ddragon.leagueoflegends.com/api/versions.json",
    isStringArray
  );
  return versions[0];
}

export function championSquareUrl(championKey: string, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championKey}.png`;
}

/**
 * Splash art oficial da Data Dragon. A extensao e `.jpg` - a CDN devolve
 * 403 (nao 404) pra `.png`, entao usar a extensao errada quebra tanto a
 * previa quanto o download de tema pra TODO campeao/skin (bug real, achado
 * testando as duas extensoes contra a CDN).
 */
export function championSplashUrl(championKey: string, skinIndex = 0): string {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championKey}_${skinIndex}.jpg`;
}

const COMMUNITY_DRAGON_BASE =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default";

interface CommunityDragonChampion {
  skins?: { id: number; splashPath?: string }[];
}

// Cache por championId - o JSON de um campeao lista todas as skins dele,
// entao uma busca serve pra qualquer skin do mesmo campeao.
const communityDragonCache = new Map<number, Promise<CommunityDragonChampion | null>>();

function loadCommunityDragonChampion(championId: number): Promise<CommunityDragonChampion | null> {
  let cached = communityDragonCache.get(championId);
  if (!cached) {
    cached = requestJson(`${COMMUNITY_DRAGON_BASE}/v1/champions/${championId}.json`, {
      integration: "COMMUNITY_DRAGON",
      timeoutMs: HTTP_TIMEOUTS.remoteAssetMs,
      validate: (payload): payload is CommunityDragonChampion => {
        if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
        const skins = (payload as CommunityDragonChampion).skins;
        return (
          skins === undefined ||
          (Array.isArray(skins) &&
            skins.every(
              (skin) =>
                typeof skin.id === "number" &&
                (skin.splashPath === undefined || typeof skin.splashPath === "string")
            ))
        );
      }
    }).catch(() => {
      communityDragonCache.delete(championId);
      return null;
    });
    communityDragonCache.set(championId, cached);
  }
  return cached;
}

/**
 * Fallback de splash art pela Community Dragon (espelho publico dos assets
 * da Riot), usado quando a Data Dragon nao tem a arte daquela skin ou esta
 * indisponivel. Indexa por championId numerico + numero da skin, nunca por
 * nome - o `splashPath` vem no JSON do campeao como um caminho absoluto do
 * jogo (`/lol-game-data/assets/...`) que vira URL da CDN removendo esse
 * prefixo e passando pra minuscula. Retorna `undefined` (nunca chuta uma
 * URL) quando o campeao/skin nao existe la ou a requisicao falha.
 */
export async function communityDragonSplashUrl(championId: number, skinNum: number): Promise<string | undefined> {
  const champion = await loadCommunityDragonChampion(championId);
  const skin = champion?.skins?.find((candidate) => candidate.id === championId * 1000 + skinNum);
  if (!skin?.splashPath) return undefined;
  const assetPath = skin.splashPath.replace(/^\/lol-game-data\/assets/, "").toLowerCase();
  return `${COMMUNITY_DRAGON_BASE}${assetPath}`;
}

/**
 * Conjunto dos numeros de skin "de verdade" de um campeao, pra separar skins
 * de chromas.
 *
 * O campo `chromas` da Data Dragon NAO serve pra isso: ele significa "esta
 * skin *tem* chromas", nao "isto e um chroma". Os chromas vem como entradas
 * irmas, com `chromas: false` e o nome entre parenteses - filtrar por aquele
 * campo nao separaria nada (medido no Zed: 71 entradas na Data Dragon vs 15
 * skins reais).
 *
 * A Community Dragon ja separa isso na estrutura: `skins[]` no topo tem so
 * as skins reais, com os chromas aninhados dentro de cada uma. O `id` de
 * cada skin e `championId * 1000 + num`, entao da pra derivar os `num`
 * validos. Retorna `undefined` (nao um Set vazio) quando a Community Dragon
 * falha - o chamador precisa distinguir "nao deu pra saber" de "nenhuma
 * skin" pra nao esconder skins de verdade por causa de uma CDN fora do ar.
 */
export async function fetchRealSkinNums(championId: number): Promise<Set<number> | undefined> {
  const champion = await loadCommunityDragonChampion(championId);
  if (!champion?.skins?.length) return undefined;
  return new Set(champion.skins.map((skin) => skin.id % 1000));
}

export interface DataDragonChampionSummary {
  key: string;
  id: number;
  name: string;
}

/**
 * Lista completa de campeoes (nao so os que o jogador ja jogou) - usada pro
 * primeiro passo do seletor de tema (escolher qualquer campeao). Vem direto
 * do resumo publico da Data Dragon, sem passar pelo backend Sparta.
 */
export async function fetchAllChampions(version: string): Promise<DataDragonChampionSummary[]> {
  const payload = await loadChampionCatalog(version);
  return Object.values(payload.data).map((champion) => ({
    key: champion.id,
    id: Number(champion.key),
    name: champion.name
  }));
}

/**
 * Perfil de classe direto da Data Dragon (tags/info do champion.json) -
 * usado pelo motor de build (`@sparta/core`, `recommendBuild`) em vez da
 * tabela curada `ChampionTag` (so 2 campeoes seedados hoje). Real, publico,
 * cobre os ~170 campeoes.
 */
export async function fetchChampionClassProfiles(version: string): Promise<ChampionClassProfile[]> {
  const payload = await loadChampionCatalog(version);
  return Object.values(payload.data).map((champion) => ({
    championId: Number(champion.key),
    championName: champion.name,
    tags: champion.tags,
    attack: champion.info.attack,
    defense: champion.info.defense,
    magic: champion.info.magic,
    difficulty: champion.info.difficulty
  }));
}

const ITEM_MAP_SUMMONERS_RIFT = "11";

/**
 * Catalogo de itens compraveis na Summoner's Rift, direto do item.json da
 * Data Dragon - mesmo padrao client-side sem rota nova no backend usado
 * pelos campeoes/skins (Fase 6a). Descarta consumiveis/trinkets/itens de
 * outros modos de jogo.
 */
export async function fetchItemCatalog(version: string): Promise<ItemSummary[]> {
  const payload = await cachedDataDragonJson(`items:${version}:pt_BR`, `https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/item.json`, isItemCatalog);
  return Object.entries(payload.data)
    .filter(([, item]) => item.gold.purchasable && item.maps[ITEM_MAP_SUMMONERS_RIFT])
    .map(([itemId, item]) => ({
      itemId: Number(itemId),
      name: item.name,
      tags: item.tags ?? [],
      goldTotal: item.gold.total,
      depth: item.depth,
      into: item.into
    }));
}

interface ItemCatalogPayload {
    data: Record<
      string,
      {
        name: string;
        tags?: string[];
        gold: { total: number; purchasable: boolean };
        maps: Record<string, boolean>;
        depth?: number;
        into?: string[];
      }
    >;
}

function isItemCatalog(payload: unknown): payload is ItemCatalogPayload {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
  const data = (payload as { data?: unknown }).data;
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    Object.values(data).length > 0 &&
    Object.values(data).every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { name?: unknown }).name === "string" &&
        typeof (item as { gold?: { total?: unknown; purchasable?: unknown } }).gold?.total === "number" &&
        typeof (item as { gold?: { total?: unknown; purchasable?: unknown } }).gold?.purchasable === "boolean" &&
        typeof (item as { maps?: unknown }).maps === "object" &&
        (item as { maps?: unknown }).maps !== null
    )
  );
}

export function itemIconUrl(itemId: number, version: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}

export interface DataDragonSkin {
  num: number;
  name: string;
  chromas: boolean;
}

/**
 * Skins de um campeao especifico - endpoint de detalhe por campeao da Data
 * Dragon, nao usado em lugar nenhum do desktop ate agora (so o resumo
 * champion.json, sem skins). `num: 0` e sempre a skin padrao/base.
 */
export async function fetchChampionSkins(
  championKey: string,
  version: string,
  championId?: number
): Promise<DataDragonSkin[]> {
  const payload = await cachedDataDragonJson(
    `skins:${version}:pt_BR:${championKey}`,
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/champion/${championKey}.json`,
    isSkinCatalog
  );
  const champion = payload.data[championKey];
  if (!champion) {
    throw new ExternalServiceError({
      code: "UPSTREAM_INVALID_RESPONSE",
      integration: "DATA_DRAGON",
      message: "O catálogo não contém o campeão solicitado.",
      temporary: false,
      retryable: false
    });
  }
  const skins = champion.skins;
  if (championId === undefined) return skins;

  // Mantem os nomes em pt_BR da Data Dragon, mas usa a Community Dragon so
  // pra saber quais entradas sao skins de verdade (o resto e chroma). Sem
  // esse conjunto (CDragon fora do ar), devolve a lista inteira - melhor
  // mostrar chroma a mais do que esconder skin de verdade.
  const realSkinNums = await fetchRealSkinNums(championId);
  if (!realSkinNums) return skins;
  return skins.filter((skin) => realSkinNums.has(skin.num));
}

interface ChampionCatalogPayload {
  data: Record<
    string,
    {
      id: string;
      key: string;
      name: string;
      tags: string[];
      info: { attack: number; defense: number; magic: number; difficulty: number };
    }
  >;
}

function isChampionCatalog(payload: unknown): payload is ChampionCatalogPayload {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  const values = Object.values(data);
  return (
    values.length > 0 &&
    values.every(
      (champion) =>
        typeof champion === "object" &&
        champion !== null &&
        typeof (champion as { id?: unknown }).id === "string" &&
        typeof (champion as { key?: unknown }).key === "string" &&
        typeof (champion as { name?: unknown }).name === "string" &&
        Array.isArray((champion as { tags?: unknown }).tags) &&
        typeof (champion as { info?: unknown }).info === "object" &&
        (champion as { info?: unknown }).info !== null &&
        ["attack", "defense", "magic", "difficulty"].every(
          (key) =>
            typeof ((champion as { info: Record<string, unknown> }).info)[key] === "number"
        )
    )
  );
}

function loadChampionCatalog(version: string): Promise<ChampionCatalogPayload> {
  return cachedDataDragonJson(
    `champions:${version}:pt_BR`,
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/champion.json`,
    isChampionCatalog
  );
}

function isSkinCatalog(payload: unknown): payload is { data: Record<string, { skins: DataDragonSkin[] }> } {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false;
  const data = (payload as { data?: unknown }).data;
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    Object.values(data).every(
      (champion) =>
        typeof champion === "object" &&
        champion !== null &&
        Array.isArray((champion as { skins?: unknown }).skins) &&
        (champion as { skins: unknown[] }).skins.every(
          (skin) =>
            typeof skin === "object" &&
            skin !== null &&
            typeof (skin as { num?: unknown }).num === "number" &&
            typeof (skin as { name?: unknown }).name === "string" &&
            typeof (skin as { chromas?: unknown }).chromas === "boolean"
        )
    )
  );
}
