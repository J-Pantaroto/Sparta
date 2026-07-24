/**
 * Helpers de Data Dragon usados so no renderer (browser context). Ficam
 * separados de `@sparta/riot` porque aquele pacote tambem exporta o
 * cliente LCU, que usa modulos nativos do Node ("node:fs", "node:https")
 * incompativeis com o bundle do renderer (contextIsolation, sem
 * nodeIntegration). Mantenha os valores em sincronia manualmente se o
 * pacote compartilhado mudar.
 */

import type { ChampionClassProfile, ItemSummary } from "@sparta/core";

export const FALLBACK_DATA_DRAGON_VERSION = "14.14.1";

export async function fetchLatestDataDragonVersion(): Promise<string> {
  try {
    const response = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
    if (!response.ok) return FALLBACK_DATA_DRAGON_VERSION;
    const versions = (await response.json()) as string[];
    return versions[0] ?? FALLBACK_DATA_DRAGON_VERSION;
  } catch {
    return FALLBACK_DATA_DRAGON_VERSION;
  }
}

export function championSquareUrl(championKey: string, version = FALLBACK_DATA_DRAGON_VERSION): string {
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
    cached = fetch(`${COMMUNITY_DRAGON_BASE}/v1/champions/${championId}.json`)
      .then((response) => (response.ok ? (response.json() as Promise<CommunityDragonChampion>) : null))
      .catch(() => null);
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
export async function fetchAllChampions(version = FALLBACK_DATA_DRAGON_VERSION): Promise<DataDragonChampionSummary[]> {
  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/champion.json`);
  if (!response.ok) return [];
  // A Data Dragon inverte o nome dos campos: "id" e a string usada nas URLs
  // (ex. "Aatrox"), "key" e o id numerico como string (ex. "266").
  const payload = (await response.json()) as { data: Record<string, { id: string; key: string; name: string }> };
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
export async function fetchChampionClassProfiles(version = FALLBACK_DATA_DRAGON_VERSION): Promise<ChampionClassProfile[]> {
  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/champion.json`);
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    data: Record<string, { key: string; name: string; tags: string[]; info: { attack: number; defense: number; magic: number; difficulty: number } }>;
  };
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
export async function fetchItemCatalog(version = FALLBACK_DATA_DRAGON_VERSION): Promise<ItemSummary[]> {
  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/item.json`);
  if (!response.ok) return [];
  const payload = (await response.json()) as {
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
  };
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

export function itemIconUrl(itemId: number, version = FALLBACK_DATA_DRAGON_VERSION): string {
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
export async function fetchChampionSkins(championKey: string, version = FALLBACK_DATA_DRAGON_VERSION): Promise<DataDragonSkin[]> {
  const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/pt_BR/champion/${championKey}.json`);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data: Record<string, { skins: DataDragonSkin[] }> };
  return payload.data[championKey]?.skins ?? [];
}
